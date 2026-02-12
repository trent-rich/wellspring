// GEODE Payments Board Sync Service
// Handles syncing payment milestones to Monday.com Payments: Report Contributors board
// Board ID: 5640622226

import { getMondayService } from './mondayService';
import {
  shouldSendPaymentEmail,
  generateAccountingSetupEmail,
  generateInvoiceReminderEmail,
  type AuthorInfo,
  type PaymentMilestoneDefinition,
} from './geodePaymentEmails';
import {
  generateInvoiceDocx,
  getMilestonePaymentAmount,
  getMilestoneLabel,
} from './invoiceGenerator';

// ============================================
// PAYMENTS BOARD STRUCTURE
// ============================================

// Board ID: 5640622226 (Payments: Report Contributors)
// Groups are organized by State Report (Arizona, Alaska, etc.)
// Each item represents a contributor (author) for a chapter

// Payment milestone columns (checkbox columns)
export interface PaymentMilestones {
  drafted: boolean;           // Contract drafted
  sentForReview: boolean;     // Sent to author for review
  draftApproved: boolean;     // Author approved the draft
  sentBoxSignature: boolean;  // Sent for e-signature
  distribution1: boolean;     // First distribution triggered
  payment1: boolean;          // Payment #1 processed
  processInvoice1: boolean;   // Invoice processing complete
  roughDraftDue?: string;     // Date when rough draft is due
  roughDraftReceived: boolean; // Author submitted rough draft
}

// Column IDs for the Payments board (need to be configured based on actual board)
export const PAYMENTS_COLUMN_IDS = {
  drafted: 'checkbox',           // Needs actual column ID
  sentForReview: 'checkbox__1',  // Needs actual column ID
  draftApproved: 'checkbox__2',  // Needs actual column ID
  sentBoxSignature: 'checkbox__3',
  distribution1: 'checkbox__4',
  payment1: 'checkbox__5',
  processInvoice1: 'checkbox__6',
  roughDraftDue: 'date',
  roughDraftReceived: 'checkbox__7',
  totalGrantAmount: 'numbers',
  status: 'status',
};

// ============================================
// WORKFLOW STEP TO PAYMENT MILESTONE MAPPING
// ============================================

// Maps chapter workflow steps to payment milestones that should be triggered
// These map to the COMPLETED step (i.e., the step that just finished when advancing)
export const WORKFLOW_TO_PAYMENT_MAP: Record<string, keyof PaymentMilestones | null> = {
  // Contract flow — track progress through these steps
  'send_contract': 'sentBoxSignature',

  // Payment 1 (37.5%): Triggered when awaiting_contract_signature COMPLETES
  'awaiting_contract_signature': 'distribution1',

  // Payment 2 (37.5%): Triggered when author_approval_round_1 COMPLETES
  'author_approval_round_1': 'roughDraftReceived',

  // Payment 3 (25%): Triggered when author_approval_round_3 COMPLETES
  'author_approval_round_3': null, // Tracked via PAYMENT_TRIGGERS, no checkbox column yet

  // Standard chapter workflow steps that don't trigger payments
  'not_started': null,
  'outreach_identify_authors': null,
  'schedule_meeting': null,
  'explain_project': null,
  'awaiting_author_responses': null,
  'ai_deep_research_draft': null,
  'maria_initial_review': null,
  'content_approver_review_1': null,
  'drew_review': null,
  'content_approver_review_2': null,
  'maria_edit_pass': null,
  'drew_content_approver_review': null,
  'peer_review': null,
  'author_approval_round_2': null,
  'copywriter_pass': null,
  'doe_ready': null,
  'design_phase': null,
  'done': null,
};

// Payment triggers based on workflow step COMPLETION
// When a step in the array COMPLETES (work moves to next step), the payment is triggered
export const PAYMENT_TRIGGERS = {
  // Payment #1 (37.5%): Triggered when awaiting_contract_signature completes
  // (author signed the contract, moves to awaiting_author_responses)
  payment1: ['awaiting_contract_signature'],

  // Payment #2 (37.5%): Triggered when author_approval_round_1 completes
  // (author finished reviewing first draft, moves to content_approver_review_2)
  payment2: ['author_approval_round_1'],

  // Payment #3 (25%): Triggered when author_approval_round_3 completes
  // (author gave final publication approval, moves to doe_ready)
  payment3: ['author_approval_round_3'],
};

// ============================================
// SYNC FUNCTIONS
// ============================================

/**
 * Update a payment milestone on the Payments board
 */
export async function updatePaymentMilestone(
  contributorItemId: string,
  milestone: keyof PaymentMilestones,
  value: boolean | string
): Promise<boolean> {
  const mondayService = getMondayService();

  if (!mondayService) {
    console.warn('[GeodePaymentsSync] Monday.com service not initialized');
    return false;
  }

  try {
    const columnId = PAYMENTS_COLUMN_IDS[milestone];
    if (!columnId) {
      console.warn('[GeodePaymentsSync] Unknown milestone column:', milestone);
      return false;
    }

    // TODO: Once column IDs are configured from the actual Payments board,
    // uncomment this to update the checkbox/date columns directly:
    // const columnValue = typeof value === 'boolean'
    //   ? { [columnId]: { checked: value ? 'true' : 'false' } }
    //   : { [columnId]: { date: value } };
    // await mondayService.updateItem(PAYMENTS_BOARD_ID, contributorItemId, columnValue);

    // For now, add a comment to track the update (column updates pending board configuration)
    const comment = `[Wellspring] Payment milestone updated: ${milestone} = ${value}`;
    await mondayService.addComment(contributorItemId, comment);

    console.log('[GeodePaymentsSync] Updated milestone:', milestone, 'for item:', contributorItemId);
    return true;
  } catch (error) {
    console.error('[GeodePaymentsSync] Failed to update milestone:', error);
    return false;
  }
}

/**
 * Check if a workflow step should trigger a payment milestone update
 */
export function shouldTriggerPayment(workflowStep: string): keyof PaymentMilestones | null {
  return WORKFLOW_TO_PAYMENT_MAP[workflowStep] || null;
}

/**
 * Add a payment-related comment to a contributor item
 */
export async function addPaymentComment(
  contributorItemId: string,
  comment: string
): Promise<boolean> {
  const mondayService = getMondayService();

  if (!mondayService) {
    console.warn('[GeodePaymentsSync] Monday.com service not initialized');
    return false;
  }

  try {
    await mondayService.addComment(contributorItemId, comment);
    return true;
  } catch (error) {
    console.error('[GeodePaymentsSync] Failed to add comment:', error);
    return false;
  }
}

/**
 * Sync chapter workflow progress to payments board
 * Call this when a chapter advances to a payment-triggering step
 */
export async function syncChapterToPayments(
  contributorItemId: string,
  workflowStep: string,
  chapterTitle: string,
  authorName: string
): Promise<{ triggered: boolean; milestone?: string }> {
  const milestone = shouldTriggerPayment(workflowStep);

  if (!milestone) {
    return { triggered: false };
  }

  const success = await updatePaymentMilestone(contributorItemId, milestone, true);

  if (success) {
    // Add a detailed comment
    const comment = `[Wellspring] Chapter "${chapterTitle}" reached step: ${workflowStep}\n` +
      `Payment milestone triggered: ${milestone}\n` +
      `Author: ${authorName}`;
    await addPaymentComment(contributorItemId, comment);
  }

  return { triggered: success, milestone };
}

// ============================================
// EMAIL INTEGRATION
// ============================================

export interface PaymentEmailResult {
  emailType: 'accounting_setup' | 'invoice_reminder' | null;
  emailData: {
    to: string[];
    cc: string[];
    subject: string;
    body: string;
    attachment?: { filename: string; mimeType: string; content: string };
  } | null;
  milestone: PaymentMilestoneDefinition | null;
}

/**
 * Get the email that should be sent when a workflow step is completed.
 * For invoice milestones, generates a prefilled invoice DOCX and attaches it.
 * Returns the email data to be sent (actual sending is done by the caller).
 *
 * @param completedStep - The workflow step that just COMPLETED
 * @param authorInfo - Author information for the email
 * @param grantAmount - Total grant amount (default $5,000)
 * @param chapterNum - Chapter number for the invoice description
 */
export async function getPaymentEmailForStep(
  completedStep: string,
  authorInfo: AuthorInfo,
  grantAmount: number = 5000,
  chapterNum?: string
): Promise<PaymentEmailResult> {
  const { sendInvoiceReminder, sendAccountingSetup, milestone } = shouldSendPaymentEmail(completedStep);

  if (sendAccountingSetup && milestone) {
    // Contract sent for signature - email accounting
    return {
      emailType: 'accounting_setup',
      emailData: generateAccountingSetupEmail({
        authorInfo,
        paymentAmount: `$${grantAmount.toLocaleString()}`,
        paymentSchedule: '37.5% / 37.5% / 25% across 3 milestones',
      }),
      milestone,
    };
  }

  if (sendInvoiceReminder && milestone) {
    // Payment milestone triggered — generate prefilled invoice
    const paymentNumber = milestone.paymentNumber;
    const paymentAmount = getMilestonePaymentAmount(grantAmount, paymentNumber);
    const milestoneLabel = getMilestoneLabel(paymentNumber);

    let invoiceAttachment: { filename: string; mimeType: string; base64: string } | undefined;

    try {
      const invoice = await generateInvoiceDocx({
        authorName: authorInfo.name,
        authorEmail: authorInfo.email,
        state: authorInfo.state.toLowerCase().replace(/\s+/g, '_'),
        stateName: authorInfo.state,
        chapterTitle: authorInfo.chapterTitle,
        chapterNum: chapterNum || authorInfo.chapter,
        paymentNumber,
        paymentAmount,
        totalGrantAmount: grantAmount,
        milestoneLabel,
      });

      invoiceAttachment = {
        filename: invoice.filename,
        mimeType: invoice.mimeType,
        base64: invoice.base64,
      };

      console.log('[PaymentsSync] Generated prefilled invoice:', invoice.filename);
    } catch (error) {
      console.error('[PaymentsSync] Failed to generate invoice:', error);
      // Continue without attachment — email will instruct author to use template
    }

    const emailData = generateInvoiceReminderEmail({
      authorInfo,
      milestone: milestone.workflowStep,
      milestoneLabel,
      paymentNumber,
      paymentAmount: `$${paymentAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      invoiceAttachment,
    });

    return {
      emailType: 'invoice_reminder',
      emailData,
      milestone,
    };
  }

  return {
    emailType: null,
    emailData: null,
    milestone: null,
  };
}

/**
 * Full payment sync with email generation
 * Returns both Monday.com update status and any email that should be sent
 *
 * @param grantAmount - Total grant amount for invoice generation (default $5,000)
 * @param chapterNum - Chapter number for the invoice description
 */
export async function syncChapterToPaymentsWithEmail(
  contributorItemId: string,
  workflowStep: string,
  chapterTitle: string,
  authorInfo: AuthorInfo,
  grantAmount: number = 5000,
  chapterNum?: string
): Promise<{
  mondayUpdated: boolean;
  milestone?: string;
  email: PaymentEmailResult;
}> {
  // Get any emails that should be sent (now async — generates invoice if needed)
  const email = await getPaymentEmailForStep(workflowStep, authorInfo, grantAmount, chapterNum);

  // Sync to Monday.com
  const { triggered, milestone } = await syncChapterToPayments(
    contributorItemId,
    workflowStep,
    chapterTitle,
    authorInfo.name
  );

  // If there's an email to send, add a note to Monday.com
  if (email.emailType && email.emailData) {
    const emailNote = email.emailType === 'accounting_setup'
      ? `[Wellspring] Accounting setup email generated for ${authorInfo.name}`
      : `[Wellspring] Invoice reminder email generated for ${authorInfo.name} - Payment #${email.milestone?.paymentNumber}`;

    await addPaymentComment(contributorItemId, emailNote);
  }

  return {
    mondayUpdated: triggered,
    milestone,
    email,
  };
}

// ============================================
// CONTRIBUTOR ITEM ID MAPPING
// ============================================

// Maps chapter (state + chapterType + authorName) to Payments board item ID
// This would be populated from the board or configured
export interface ContributorMapping {
  reportState: string;
  chapterType: string;
  authorName: string;
  authorEmail?: string;
  mondayItemId: string;
  grantAmount?: number;
}

// Example Arizona contributors (need to be populated from actual board)
export const ARIZONA_CONTRIBUTORS: ContributorMapping[] = [
  // These would be populated from the Monday.com board
  // Example:
  // {
  //   reportState: 'arizona',
  //   chapterType: 'ch3_electricity',
  //   authorName: 'Alexander Hill',
  //   authorEmail: 'ahill@asu.edu',
  //   mondayItemId: '1234567890',
  //   grantAmount: 3000,
  // },
];

/**
 * Get the Payments board item ID for a contributor
 */
export function getContributorItemId(
  reportState: string,
  chapterType: string,
  authorName?: string
): string | null {
  const contributor = ARIZONA_CONTRIBUTORS.find(c =>
    c.reportState === reportState &&
    c.chapterType === chapterType &&
    (!authorName || c.authorName.toLowerCase().includes(authorName.toLowerCase()))
  );

  return contributor?.mondayItemId || null;
}

// ============================================
// PAYMENT STATUS HELPERS
// ============================================

export type PaymentStatus =
  | 'not_started'      // No contract yet
  | 'contract_pending' // Contract being drafted
  | 'awaiting_signature' // Contract sent for signature
  | 'payment_1_pending' // Signed, awaiting first payment
  | 'payment_1_complete' // First payment made
  | 'in_progress'      // Work in progress
  | 'payment_2_pending' // Awaiting second payment
  | 'payment_2_complete' // Second payment made
  | 'complete';        // All payments complete

/**
 * Determine payment status based on milestones
 */
export function getPaymentStatus(milestones: PaymentMilestones): PaymentStatus {
  if (!milestones.drafted) return 'not_started';
  if (!milestones.sentBoxSignature) return 'contract_pending';
  if (!milestones.distribution1) return 'awaiting_signature';
  if (!milestones.payment1) return 'payment_1_pending';
  if (!milestones.roughDraftReceived) return 'payment_1_complete';
  // Add more logic as needed
  return 'in_progress';
}

/**
 * Get display label for payment status
 */
export function getPaymentStatusLabel(status: PaymentStatus): string {
  const labels: Record<PaymentStatus, string> = {
    not_started: 'Not Started',
    contract_pending: 'Contract Pending',
    awaiting_signature: 'Awaiting Signature',
    payment_1_pending: 'Payment #1 Pending',
    payment_1_complete: 'Payment #1 Complete',
    in_progress: 'In Progress',
    payment_2_pending: 'Payment #2 Pending',
    payment_2_complete: 'Payment #2 Complete',
    complete: 'Complete',
  };
  return labels[status];
}
