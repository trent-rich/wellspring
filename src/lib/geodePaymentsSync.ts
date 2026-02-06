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
export const WORKFLOW_TO_PAYMENT_MAP: Record<string, keyof PaymentMilestones | null> = {
  // Contract signing workflow
  'contract_drafted': 'drafted',
  'contract_sent_for_review': 'sentForReview',
  'contract_approved': 'draftApproved',
  'contract_signed': 'sentBoxSignature',

  // After contract is signed, first payment is triggered
  'author_onboarded': 'distribution1',

  // Draft submission triggers milestone
  'author_draft_submitted': 'roughDraftReceived',

  // Standard chapter workflow steps that don't trigger payments
  'not_started': null,
  'drafting': null,
  'internal_review': null,
  'content_approver_review_1': null,
  'drew_review': null,
  'maria_review_1': null,
  'maria_edit_pass': null,
  'author_approval_round_1': null,  // Author reviewing, no payment yet
  'peer_review': null,
  'copywriter_pass': null,
  'final_review': null,
  'done': null,
};

// Payment triggers based on workflow completion
export const PAYMENT_TRIGGERS = {
  // Payment #1: Triggered when contract is signed
  payment1: ['contract_signed', 'author_onboarded'],

  // Payment #2 (if applicable): Triggered when author completes first draft
  payment2: ['author_draft_submitted', 'author_approval_round_1'],

  // Final Payment: Triggered when chapter is complete
  finalPayment: ['done'],
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
  emailData: ReturnType<typeof generateAccountingSetupEmail> | ReturnType<typeof generateInvoiceReminderEmail> | null;
  milestone: PaymentMilestoneDefinition | null;
}

/**
 * Get the email that should be sent when a workflow step is reached
 * Returns the email data to be sent (actual sending is done by the caller/Ralph)
 */
export function getPaymentEmailForStep(
  workflowStep: string,
  authorInfo: AuthorInfo
): PaymentEmailResult {
  const { sendInvoiceReminder, sendAccountingSetup, milestone } = shouldSendPaymentEmail(workflowStep);

  if (sendAccountingSetup && milestone) {
    // Contract sent for signature - email accounting
    return {
      emailType: 'accounting_setup',
      emailData: generateAccountingSetupEmail({
        authorInfo,
        // Contract URL would be added by Ralph from Box/DocuSign
      }),
      milestone,
    };
  }

  if (sendInvoiceReminder && milestone) {
    // Payment milestone triggered - remind author to submit invoice
    return {
      emailType: 'invoice_reminder',
      emailData: generateInvoiceReminderEmail({
        authorInfo,
        milestone: milestone.workflowStep,
        milestoneLabel: milestone.milestoneLabel,
        paymentNumber: milestone.paymentNumber,
      }),
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
 */
export async function syncChapterToPaymentsWithEmail(
  contributorItemId: string,
  workflowStep: string,
  chapterTitle: string,
  authorInfo: AuthorInfo
): Promise<{
  mondayUpdated: boolean;
  milestone?: string;
  email: PaymentEmailResult;
}> {
  // Get any emails that should be sent
  const email = getPaymentEmailForStep(workflowStep, authorInfo);

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
