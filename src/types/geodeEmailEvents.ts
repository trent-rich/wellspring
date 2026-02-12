// GEODE Smart Email Event Detection
// Auto-parses emails to detect workflow-relevant events

import type { GeodeState, GeodeContentSection } from './geode';

// ============================================
// EMAIL EVENT TYPES
// ============================================

export type GeodeEmailEventType =
  | 'author_agreed'              // Author confirmed they'll write the chapter
  | 'author_declined'            // Author declined the invitation
  | 'author_requested_info'      // Author wants more information
  | 'contract_requested'         // Someone requested a contract be sent
  | 'contract_signed'            // e-Signature completed
  | 'draft_submitted'            // Author/writer submitted a draft
  | 'review_completed'           // Reviewer completed their review
  | 'revision_requested'         // Changes requested
  | 'question_answered'          // Author answered questions
  | 'meeting_confirmed'          // Meeting scheduled/confirmed
  | 'deadline_discussion'        // Discussion about deadlines
  | 'blocker_reported'           // Someone reported being blocked
  | 'unknown';                   // Couldn't classify

export type GeodeEmailPriority = 'urgent' | 'high' | 'normal' | 'low';

// ============================================
// EMAIL EVENT INTERFACE
// ============================================

export interface GeodeEmailEvent {
  id: string;

  // Source email details
  emailId: string;
  subject: string;
  fromEmail: string;
  fromName: string;
  toEmails: string[];
  ccEmails: string[];
  receivedAt: string;
  snippet: string;            // First ~200 chars of email body

  // AI-detected classification
  eventType: GeodeEmailEventType;
  confidence: number;         // 0-1 confidence score

  // Context extraction
  detectedState?: GeodeState;
  detectedChapter?: GeodeContentSection;
  detectedAuthorName?: string;
  detectedAuthorEmail?: string;
  extractedDetails?: Record<string, string>;

  // What the AI thinks should happen
  suggestedActions: GeodeSuggestedAction[];

  // Processing status
  status: 'pending' | 'confirmed' | 'dismissed' | 'actioned';
  confirmedAt?: string;
  confirmedBy?: string;

  // Task creation
  createdTaskId?: string;

  createdAt: string;
}

export interface GeodeSuggestedAction {
  id: string;
  actionType: string;           // Maps to GeodeActionType
  title: string;
  description: string;
  priority: GeodeEmailPriority;
  requiresConfirmation: boolean;
  autoExecutable: boolean;      // Can this be auto-executed?
  params: Record<string, string>;
}

// ============================================
// CONFIRMATION TASK
// ============================================

// A task created from an email event that needs user confirmation
export interface GeodeConfirmationTask {
  id: string;
  emailEventId: string;

  // Task display
  title: string;
  description: string;
  category: 'author_onboarding' | 'contract' | 'review' | 'communication' | 'other';
  priority: GeodeEmailPriority;

  // Context
  state?: GeodeState;
  chapterType?: GeodeContentSection;
  authorName?: string;
  authorEmail?: string;

  // Payment
  paymentAmount?: number;   // Total grant amount (defaults to 5000)

  // Contract attachment reference (from email sent to author)
  contractAttachment?: {
    sourceEmailId: string;      // Gmail message ID where contract was attached
    attachmentId: string;       // Gmail attachment ID
    filename: string;           // Original filename
    mimeType: string;           // e.g., 'application/pdf'
  };

  // What will happen when confirmed
  pendingActions: GeodeSuggestedAction[];

  // Status
  status: 'pending' | 'confirmed' | 'dismissed' | 'expired';
  createdAt: string;
  expiresAt?: string;          // Auto-dismiss after this time
  confirmedAt?: string;
  confirmedBy?: string;
  dismissedAt?: string;
  dismissedBy?: string;
  dismissReason?: string;

  // Link to main task store (for bridging/deduplication)
  linkedTaskId?: string;       // UUID from main tasks table
  linkedTaskShortId?: string;  // T-XXXX short ID from main tasks table
}

// ============================================
// EMAIL PARSING PATTERNS
// ============================================

// Keywords that indicate specific event types
export const EMAIL_EVENT_PATTERNS: Record<GeodeEmailEventType, {
  subjectKeywords: string[];
  bodyKeywords: string[];
  fromPatterns?: RegExp[];
  confidence: number;
}> = {
  author_agreed: {
    subjectKeywords: ['accept', 'agreed', 'yes', 'confirm', 'happy to', 'delighted to', 'would love to'],
    bodyKeywords: ['i will', "i'll", 'agree', 'accept', 'happy to help', 'sign me up', 'count me in', 'looking forward'],
    confidence: 0.85,
  },
  author_declined: {
    subjectKeywords: ['decline', 'cannot', 'unable', 'unfortunately'],
    bodyKeywords: ['decline', 'cannot', 'unable', 'regret', 'pass on', 'not able', "won't be able"],
    confidence: 0.9,
  },
  author_requested_info: {
    subjectKeywords: ['question', 'clarify', 'more info', 'details'],
    bodyKeywords: ['can you explain', 'what is', 'how does', 'more information', 'could you clarify'],
    confidence: 0.7,
  },
  contract_requested: {
    subjectKeywords: ['contract', 'agreement', 'signature'],
    bodyKeywords: ['send contract', 'need contract', 'ready to sign', 'send the agreement'],
    confidence: 0.8,
  },
  contract_signed: {
    subjectKeywords: ['signed', 'signature complete', 'executed'],
    bodyKeywords: ['signed the contract', 'executed agreement', 'signature attached'],
    fromPatterns: [/docusign/i, /hellosign/i, /adobe.*sign/i, /pandadoc/i],
    confidence: 0.95,
  },
  draft_submitted: {
    subjectKeywords: ['draft', 'submission', 'attached', 'review'],
    bodyKeywords: ['please find attached', 'draft attached', 'here is my draft', 'submitted'],
    confidence: 0.75,
  },
  review_completed: {
    subjectKeywords: ['review complete', 'reviewed', 'feedback', 'comments'],
    bodyKeywords: ['completed my review', 'here are my comments', 'feedback attached', 'looks good'],
    confidence: 0.7,
  },
  revision_requested: {
    subjectKeywords: ['revision', 'changes', 'update needed'],
    bodyKeywords: ['please revise', 'needs changes', 'update the section', 'corrections needed'],
    confidence: 0.75,
  },
  question_answered: {
    subjectKeywords: ['answers', 'response', 're: questions'],
    bodyKeywords: ['here are my answers', 'responses below', 'to answer your questions'],
    confidence: 0.7,
  },
  meeting_confirmed: {
    subjectKeywords: ['meeting confirmed', 'calendar invite', 'scheduled'],
    bodyKeywords: ['meeting is scheduled', 'see you on', 'confirmed for'],
    fromPatterns: [/calendar/i, /invite/i],
    confidence: 0.85,
  },
  deadline_discussion: {
    subjectKeywords: ['deadline', 'timeline', 'extension'],
    bodyKeywords: ['deadline', 'extension', 'more time', 'delay'],
    confidence: 0.65,
  },
  blocker_reported: {
    subjectKeywords: ['blocked', 'stuck', 'issue', 'problem'],
    bodyKeywords: ['blocked on', 'stuck', 'cannot proceed', 'issue with'],
    confidence: 0.7,
  },
  unknown: {
    subjectKeywords: [],
    bodyKeywords: [],
    confidence: 0,
  },
};

// ============================================
// GEODE WORKFLOW TYPES
// ============================================

export type GeodeWorkflowType = 'author_outreach' | 'author_agreement' | 'contract_signed';

// ============================================
// AUTHOR OUTREACH FLOW (Pre-Agreement)
// ============================================

// When reaching out to a prospective author - BEFORE they've agreed
// AI generates contract document in Google Drive, then creates email draft
export const AUTHOR_OUTREACH_ACTIONS: GeodeSuggestedAction[] = [
  {
    id: 'generate_outreach_contract',
    actionType: 'generate_outreach_contract',
    title: 'Generate Contract Document',
    description: 'AI creates/edits contributor agreement in Google Drive with author and chapter details',
    priority: 'high',
    requiresConfirmation: true,
    autoExecutable: false,
    params: {
      templateType: 'contributor_agreement',
    },
  },
  {
    id: 'send_outreach_email',
    actionType: 'send_outreach_email',
    title: 'Send Contract to Prospective Author',
    description: 'Create Gmail draft to prospective author with contract attached',
    priority: 'high',
    requiresConfirmation: true,
    autoExecutable: false,
    params: {},
  },
  {
    id: 'add_to_monday_payments',
    actionType: 'add_to_monday_payments',
    title: 'Add Author to Payments Board',
    description: 'Add author to Monday.com GEODE Payments board under state group (skips if already exists)',
    priority: 'normal',
    requiresConfirmation: false,
    autoExecutable: true,
    params: {},
  },
  {
    id: 'update_chapter_status_outreach',
    actionType: 'advance_step',
    title: 'Update Chapter Status',
    description: 'Advance chapter to "Author Outreach" step',
    priority: 'normal',
    requiresConfirmation: false,
    autoExecutable: true,
    params: {
      newStep: 'author_outreach',
    },
  },
  {
    id: 'log_outreach',
    actionType: 'log_communication',
    title: 'Log Outreach Attempt',
    description: 'Record that outreach was sent to prospective author',
    priority: 'normal',
    requiresConfirmation: false,
    autoExecutable: true,
    params: {
      communicationType: 'outreach_sent',
    },
  },
];

// ============================================
// AUTHOR AGREEMENT FLOW (Post-Agreement)
// ============================================

// When an author agrees, these are the automatic next steps
export const AUTHOR_AGREEMENT_ACTIONS: GeodeSuggestedAction[] = [
  {
    id: 'generate_contract',
    actionType: 'generate_contract',
    title: 'Generate Author Contract',
    description: 'Create PDF contract for e-signature',
    priority: 'high',
    requiresConfirmation: true,
    autoExecutable: false,
    params: {},
  },
  {
    id: 'send_to_dani',
    actionType: 'send_contract',
    title: 'Send Contract to Dani for Processing',
    description: 'Email contract PDF to Dani for e-signature setup, CC Karine',
    priority: 'high',
    requiresConfirmation: true,
    autoExecutable: false,
    params: {
      toEmail: 'dani@projectinnerspace.org',
      toName: 'Dani',
      ccEmails: 'karine@projectinnerspace.org',
    },
  },
  {
    id: 'update_chapter_status',
    actionType: 'advance_step',
    title: 'Update Chapter Status',
    description: 'Advance chapter to "Send Contract" step',
    priority: 'normal',
    requiresConfirmation: false,
    autoExecutable: true,
    params: {
      newStep: 'send_contract',
    },
  },
  {
    id: 'log_author_info',
    actionType: 'log_communication',
    title: 'Log Author Information',
    description: 'Record author name and email in chapter record',
    priority: 'normal',
    requiresConfirmation: false,
    autoExecutable: true,
    params: {},
  },
];

// ============================================
// CONTRACT SIGNED FLOW
// ============================================

// When a contract is signed, these are the automatic next steps
// Per SOP: Contract signed → Upload to Monday.com → Accounting sets up in Gusto
export const CONTRACT_SIGNED_ACTIONS: GeodeSuggestedAction[] = [
  {
    id: 'notify_accounting',
    actionType: 'notify_accounting',
    title: 'Notify Accounting Team',
    description: 'Email accounting to setup contractor in Gusto for payment processing',
    priority: 'high',
    requiresConfirmation: true,
    autoExecutable: false,
    params: {
      toEmail: 'accounting@projectinnerspace.org',
      toName: 'Accounting Team',
      ccEmails: 'dani@projectinnerspace.org',
    },
  },
  {
    id: 'upload_to_monday',
    actionType: 'upload_contract_monday',
    title: 'Upload Contract to Monday.com',
    description: 'Add signed contract to Monday.com Contractors board',
    priority: 'high',
    requiresConfirmation: true,
    autoExecutable: false,
    params: {
      boardUrl: 'https://projectinnerspace.monday.com/boards/7798265162',
    },
  },
  {
    id: 'update_chapter_status_signed',
    actionType: 'advance_step',
    title: 'Update Chapter Status',
    description: 'Advance chapter to "Contract Signed" step',
    priority: 'normal',
    requiresConfirmation: false,
    autoExecutable: true,
    params: {
      newStep: 'contract_signed',
    },
  },
  {
    id: 'send_welcome_email',
    actionType: 'send_welcome_email',
    title: 'Send Welcome Email to Author',
    description: 'Email author with next steps and Gusto onboarding info',
    priority: 'normal',
    requiresConfirmation: true,
    autoExecutable: false,
    params: {},
  },
];

// ============================================
// MOCK EMAIL EVENTS (for demonstration)
// ============================================

export const MOCK_EMAIL_EVENTS: GeodeEmailEvent[] = [
  {
    id: 'email_001',
    emailId: 'gmail_abc123',
    subject: 'Re: GEODE Oklahoma Stakeholders Chapter - Author Invitation',
    fromEmail: 'jayash.paudel@ou.edu',
    fromName: 'Jayash Paudel',
    toEmails: ['trent@projectinnerspace.org'],
    ccEmails: [],
    receivedAt: '2026-02-04T08:42:00Z',
    snippet: "Thank you for reaching out. I would be happy to contribute to the Oklahoma Stakeholders chapter. Please send me the signature document whenever you're ready...",
    eventType: 'author_agreed',
    confidence: 0.92,
    detectedState: 'oklahoma',
    detectedChapter: 'ch7_stakeholders',
    detectedAuthorName: 'Jayash Paudel',
    detectedAuthorEmail: 'jayash.paudel@ou.edu',
    extractedDetails: {
      organization: 'University of Oklahoma',
      requestedDocument: 'signature document',
    },
    suggestedActions: AUTHOR_AGREEMENT_ACTIONS,
    status: 'pending',
    createdAt: '2026-02-04T08:42:30Z',
  },
];

// ============================================
// WORKFLOW INFERENCE
// ============================================

/**
 * Infer which GEODE workflow to execute based on task context
 * Returns 'author_outreach' for prospective authors, 'author_agreement' for confirmed authors
 */
export function inferGeodeWorkflowType(context: {
  taskTitle?: string;
  taskDescription?: string;
  hasAuthorConfirmation?: boolean;
  chapterStatus?: string;
}): GeodeWorkflowType {
  const { taskTitle = '', taskDescription = '', hasAuthorConfirmation, chapterStatus } = context;

  const titleLower = taskTitle.toLowerCase();
  const descLower = taskDescription.toLowerCase();
  const combined = `${titleLower} ${descLower}`;

  // Check for explicit agreement indicators
  const agreementKeywords = [
    'agreed', 'confirmed', 'accepted', 'signed', 'process',
    'send to dani', 'dani', 'e-signature', 'esignature',
    'contract signed', 'signature complete'
  ];

  const hasAgreementKeyword = agreementKeywords.some(kw => combined.includes(kw));

  // Check for outreach indicators
  const outreachKeywords = [
    'outreach', 'prospective', 'invite', 'invitation', 'reach out',
    'send contract to', 'contact', 'initial', 'introduce',
    'potential author', 'candidate'
  ];

  const hasOutreachKeyword = outreachKeywords.some(kw => combined.includes(kw));

  // Check chapter status if available
  const outreachStatuses = ['not_started', 'identify_author', 'author_outreach'];
  const agreementStatuses = ['author_agreed', 'send_contract', 'contract_pending'];

  if (chapterStatus) {
    if (outreachStatuses.includes(chapterStatus)) return 'author_outreach';
    if (agreementStatuses.includes(chapterStatus)) return 'author_agreement';
  }

  // Explicit confirmation flag takes precedence
  if (hasAuthorConfirmation === true) return 'author_agreement';
  if (hasAuthorConfirmation === false) return 'author_outreach';

  // Keyword-based inference
  if (hasAgreementKeyword && !hasOutreachKeyword) return 'author_agreement';
  if (hasOutreachKeyword && !hasAgreementKeyword) return 'author_outreach';

  // Default: If task mentions "execute geode" without clear context,
  // assume outreach since that comes first in the workflow
  if (combined.includes('execute') && (combined.includes('geode') || combined.includes('contract'))) {
    // Check if it mentions sending TO an author (outreach) vs sending to Dani (agreement)
    if (combined.includes('to dani') || combined.includes('for dani')) {
      return 'author_agreement';
    }
    // Default to outreach - the more common first step
    return 'author_outreach';
  }

  // Final fallback: outreach (first step in process)
  return 'author_outreach';
}

/**
 * Get the appropriate actions for a workflow type
 */
export function getActionsForWorkflow(workflowType: GeodeWorkflowType): GeodeSuggestedAction[] {
  switch (workflowType) {
    case 'author_outreach':
      return AUTHOR_OUTREACH_ACTIONS;
    case 'author_agreement':
      return AUTHOR_AGREEMENT_ACTIONS;
    case 'contract_signed':
      return CONTRACT_SIGNED_ACTIONS;
    default:
      return AUTHOR_OUTREACH_ACTIONS;
  }
}

// ============================================
// CONFIRMATION TASK FACTORY
// ============================================

export function createConfirmationTask(emailEvent: GeodeEmailEvent): GeodeConfirmationTask {
  const baseTask: GeodeConfirmationTask = {
    id: `task_${emailEvent.id}`,
    emailEventId: emailEvent.id,
    title: '',
    description: '',
    category: 'other',
    priority: 'normal',
    state: emailEvent.detectedState,
    chapterType: emailEvent.detectedChapter,
    authorName: emailEvent.detectedAuthorName,
    authorEmail: emailEvent.detectedAuthorEmail,
    paymentAmount: emailEvent.extractedDetails?.paymentAmount
      ? Number(emailEvent.extractedDetails.paymentAmount)
      : undefined,
    pendingActions: emailEvent.suggestedActions,
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
  };

  // Customize based on event type
  switch (emailEvent.eventType) {
    case 'author_agreed':
      return {
        ...baseTask,
        title: `${emailEvent.detectedAuthorName} agreed to author ${emailEvent.detectedChapter?.replace('ch', 'Ch ').replace('_', ' ')}`,
        description: `Professor ${emailEvent.detectedAuthorName} has agreed to be the bylined author. Generate contract and send to Dani (CC Karine) for e-signature processing.`,
        category: 'author_onboarding',
        priority: 'high',
      };
    case 'contract_signed':
      return {
        ...baseTask,
        title: `Contract signed: ${emailEvent.detectedAuthorName}`,
        description: `E-signature completed. Per SOP: Upload to Monday.com → Accounting sets up in Gusto → Send welcome email.`,
        category: 'contract',
        pendingActions: CONTRACT_SIGNED_ACTIONS,
        priority: 'high',
      };
    case 'author_declined':
      return {
        ...baseTask,
        title: `Author declined: ${emailEvent.detectedAuthorName}`,
        description: `${emailEvent.detectedAuthorName} has declined the invitation. Resume author outreach for this chapter.`,
        category: 'author_onboarding',
        priority: 'normal',
      };
    default:
      return {
        ...baseTask,
        title: `Review email: ${emailEvent.subject}`,
        description: `Email from ${emailEvent.fromName} may require action.`,
      };
  }
}
