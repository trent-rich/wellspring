// GEODE AI Action Types
// Defines the structure for AI-assisted workflow actions

import type { GeodeState, GeodeContentSection } from './geode';

// ============================================
// ACTION TYPES
// ============================================

export type GeodeActionType =
  | 'advance_step'           // Move to next workflow step
  | 'generate_contract'      // Generate PDF contract for author
  | 'send_contract'          // Send contract via email
  | 'send_reminder'          // Send reminder to current owner
  | 'request_review'         // Request review from specific person
  | 'schedule_meeting'       // Schedule meeting with stakeholder
  | 'generate_ai_draft'      // Generate AI draft for chapter
  | 'send_draft_for_review'  // Send draft for review
  | 'log_communication'      // Log an email/slack conversation
  | 'update_notes'           // Update chapter notes
  | 'mark_blocker'           // Mark/clear a blocker
  | 'custom';                // Custom AI action

export type GeodeActionStatus =
  | 'pending'      // Action queued but not started
  | 'in_progress'  // AI is working on it
  | 'awaiting_approval'  // Needs human approval before executing
  | 'completed'    // Successfully completed
  | 'failed'       // Action failed
  | 'cancelled';   // Cancelled by user

export type GeodeActionPriority = 'urgent' | 'high' | 'normal' | 'low';

// ============================================
// ACTION DEFINITIONS
// ============================================

export interface GeodeAction {
  id: string;
  chapterId: string;           // e.g., "oklahoma_ch7_stakeholders"
  reportState: GeodeState;
  chapterType: GeodeContentSection;

  // Action details
  actionType: GeodeActionType;
  title: string;               // Human-readable action title
  description: string;         // What the action will do
  prompt?: string;             // User's original prompt if custom

  // Status
  status: GeodeActionStatus;
  priority: GeodeActionPriority;

  // Execution details
  createdAt: string;
  createdBy: string;           // User who initiated
  startedAt?: string;
  completedAt?: string;

  // Results
  result?: GeodeActionResult;
  error?: string;

  // For actions requiring approval
  requiresApproval: boolean;
  approvedAt?: string;
  approvedBy?: string;
}

export interface GeodeActionResult {
  success: boolean;
  message: string;
  artifacts?: GeodeActionArtifact[];
  nextSteps?: string[];        // Suggested follow-up actions
}

export interface GeodeActionArtifact {
  type: 'pdf' | 'email' | 'document' | 'calendar_event' | 'slack_message';
  name: string;
  url?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

// ============================================
// ACTION TEMPLATES
// ============================================

export interface GeodeActionTemplate {
  id: string;
  actionType: GeodeActionType;
  name: string;
  description: string;
  icon: string;                // Lucide icon name

  // When this template is applicable
  applicableSteps?: string[];  // Only show for certain workflow steps
  applicableWorkflows?: ('standard' | 'subsurface' | 'ch101')[];

  // Parameters the action needs
  requiredParams: GeodeActionParam[];
  optionalParams: GeodeActionParam[];

  // Whether this requires human approval
  requiresApproval: boolean;

  // Prompt template for AI
  promptTemplate: string;
}

export interface GeodeActionParam {
  key: string;
  label: string;
  type: 'string' | 'email' | 'date' | 'select' | 'multiselect' | 'textarea';
  options?: { value: string; label: string }[];
  defaultValue?: string;
  placeholder?: string;
  required: boolean;
}

// ============================================
// PRE-DEFINED ACTION TEMPLATES
// ============================================

export const GEODE_ACTION_TEMPLATES: GeodeActionTemplate[] = [
  {
    id: 'advance_to_next_step',
    actionType: 'advance_step',
    name: 'Advance to Next Step',
    description: 'Mark current step complete and move to the next workflow step',
    icon: 'ArrowRight',
    requiresApproval: false,
    requiredParams: [
      {
        key: 'notes',
        label: 'Completion Notes',
        type: 'textarea',
        placeholder: 'Any notes about completing this step...',
        required: false,
      },
    ],
    optionalParams: [
      {
        key: 'nextOwner',
        label: 'Next Owner',
        type: 'string',
        placeholder: 'Override default owner for next step',
        required: false,
      },
    ],
    promptTemplate: 'Advance chapter {{chapterName}} to the next workflow step. Current step: {{currentStep}}. Notes: {{notes}}',
  },
  {
    id: 'generate_author_contract',
    actionType: 'generate_contract',
    name: 'Generate Author Contract',
    description: 'Generate a PDF contract for the bylined author to sign',
    icon: 'FileSignature',
    applicableSteps: ['awaiting_contract_signature', 'send_contract'],
    applicableWorkflows: ['standard'],
    requiresApproval: true,
    requiredParams: [
      {
        key: 'authorName',
        label: 'Author Name',
        type: 'string',
        placeholder: 'Full name of the author',
        required: true,
      },
      {
        key: 'authorEmail',
        label: 'Author Email',
        type: 'email',
        placeholder: 'author@example.com',
        required: true,
      },
      {
        key: 'chapterTitle',
        label: 'Chapter Title',
        type: 'string',
        placeholder: 'Chapter title for contract',
        required: true,
      },
    ],
    optionalParams: [
      {
        key: 'deadline',
        label: 'Delivery Deadline',
        type: 'date',
        required: false,
      },
      {
        key: 'compensation',
        label: 'Compensation Details',
        type: 'textarea',
        placeholder: 'Payment terms...',
        required: false,
      },
    ],
    promptTemplate: 'Generate a bylined author contract for {{authorName}} ({{authorEmail}}) for chapter "{{chapterTitle}}" of the {{stateName}} GEODE report.',
  },
  {
    id: 'send_contract_email',
    actionType: 'send_contract',
    name: 'Send Contract for Signature',
    description: 'Email the contract PDF to the specified recipients',
    icon: 'Send',
    applicableSteps: ['awaiting_contract_signature', 'send_contract'],
    requiresApproval: true,
    requiredParams: [
      {
        key: 'toEmail',
        label: 'Send To',
        type: 'email',
        placeholder: 'Primary recipient email',
        required: true,
      },
      {
        key: 'toName',
        label: 'Recipient Name',
        type: 'string',
        placeholder: 'Dani',
        required: true,
      },
    ],
    optionalParams: [
      {
        key: 'ccEmails',
        label: 'CC',
        type: 'string',
        placeholder: 'Comma-separated emails to CC',
        required: false,
      },
      {
        key: 'customMessage',
        label: 'Custom Message',
        type: 'textarea',
        placeholder: 'Add a personal note to the email...',
        required: false,
      },
    ],
    promptTemplate: 'Send the contract to {{toName}} at {{toEmail}}{{#if ccEmails}}, CC: {{ccEmails}}{{/if}}. {{#if customMessage}}Include message: {{customMessage}}{{/if}}',
  },
  {
    id: 'send_status_reminder',
    actionType: 'send_reminder',
    name: 'Send Reminder',
    description: 'Send a friendly reminder to the current owner about this chapter',
    icon: 'Bell',
    requiresApproval: true,
    requiredParams: [
      {
        key: 'recipientName',
        label: 'Recipient',
        type: 'string',
        placeholder: 'Who to remind',
        required: true,
      },
      {
        key: 'channel',
        label: 'Channel',
        type: 'select',
        options: [
          { value: 'slack', label: 'Slack' },
          { value: 'email', label: 'Email' },
        ],
        required: true,
      },
    ],
    optionalParams: [
      {
        key: 'customMessage',
        label: 'Custom Message',
        type: 'textarea',
        placeholder: 'Custom reminder message...',
        required: false,
      },
      {
        key: 'urgency',
        label: 'Urgency',
        type: 'select',
        options: [
          { value: 'gentle', label: 'Gentle reminder' },
          { value: 'normal', label: 'Normal' },
          { value: 'urgent', label: 'Urgent - deadline approaching' },
        ],
        required: false,
      },
    ],
    promptTemplate: 'Send a {{urgency}} reminder to {{recipientName}} via {{channel}} about the {{chapterName}} chapter.',
  },
  {
    id: 'log_author_agreement',
    actionType: 'log_communication',
    name: 'Log Author Agreement',
    description: 'Record that an author has agreed to write a chapter',
    icon: 'UserCheck',
    applicableSteps: ['outreach_identify_authors', 'schedule_meeting', 'explain_project'],
    requiresApproval: false,
    requiredParams: [
      {
        key: 'authorName',
        label: 'Author Name',
        type: 'string',
        placeholder: 'Full name',
        required: true,
      },
      {
        key: 'authorEmail',
        label: 'Author Email',
        type: 'email',
        placeholder: 'author@example.com',
        required: true,
      },
      {
        key: 'agreementDate',
        label: 'Agreement Date',
        type: 'date',
        required: true,
      },
    ],
    optionalParams: [
      {
        key: 'notes',
        label: 'Notes',
        type: 'textarea',
        placeholder: 'Any notes about the conversation...',
        required: false,
      },
    ],
    promptTemplate: 'Log that {{authorName}} ({{authorEmail}}) agreed to be the bylined author on {{agreementDate}}. {{#if notes}}Notes: {{notes}}{{/if}}',
  },
  {
    id: 'custom_ai_action',
    actionType: 'custom',
    name: 'Custom AI Action',
    description: 'Describe what you want the AI to do in natural language',
    icon: 'Sparkles',
    requiresApproval: true,
    requiredParams: [
      {
        key: 'prompt',
        label: 'What should I do?',
        type: 'textarea',
        placeholder: 'Describe the action you want me to take. Be specific about who, what, and how.\n\nExample: "Generate a contract PDF for Jayesh Paudel and send it to Dani at dani@example.com, CC Karine at karine@example.com"',
        required: true,
      },
    ],
    optionalParams: [],
    promptTemplate: '{{prompt}}',
  },
];

// ============================================
// ACTION LOG ENTRY
// ============================================

export interface GeodeActionLogEntry {
  id: string;
  chapterId: string;
  actionId?: string;           // Reference to GeodeAction if applicable

  // What happened
  type: 'step_change' | 'action_executed' | 'manual_update' | 'communication' | 'note';
  title: string;
  description: string;

  // Who and when
  timestamp: string;
  performedBy: string;         // 'AI' or user name

  // Additional context
  metadata?: Record<string, unknown>;
}

// ============================================
// QUICK ACTIONS
// ============================================

// Quick actions shown as buttons based on current step
export interface GeodeQuickAction {
  templateId: string;
  label: string;
  variant: 'primary' | 'secondary' | 'warning';
  prefillData?: Record<string, string>;
}

// Map of current step -> suggested quick actions
export const STEP_QUICK_ACTIONS: Record<string, GeodeQuickAction[]> = {
  outreach_identify_authors: [
    { templateId: 'log_author_agreement', label: 'Author Agreed', variant: 'primary' },
    { templateId: 'send_status_reminder', label: 'Send Reminder', variant: 'secondary' },
  ],
  schedule_meeting: [
    { templateId: 'log_author_agreement', label: 'Author Agreed', variant: 'primary' },
    { templateId: 'advance_to_next_step', label: 'Meeting Scheduled', variant: 'secondary' },
  ],
  explain_project: [
    { templateId: 'log_author_agreement', label: 'Author Agreed', variant: 'primary' },
    { templateId: 'advance_to_next_step', label: 'Project Explained', variant: 'secondary' },
  ],
  send_contract: [
    { templateId: 'generate_author_contract', label: 'Generate Contract', variant: 'primary' },
    { templateId: 'send_contract_email', label: 'Send Contract', variant: 'primary' },
  ],
  awaiting_contract_signature: [
    { templateId: 'send_status_reminder', label: 'Remind Author', variant: 'secondary' },
    { templateId: 'advance_to_next_step', label: 'Contract Signed', variant: 'primary' },
  ],
  content_approver_review_1: [
    { templateId: 'advance_to_next_step', label: 'Approve & Advance', variant: 'primary' },
    { templateId: 'send_status_reminder', label: 'Request Changes', variant: 'warning' },
  ],
  author_approval_round_1: [
    { templateId: 'send_status_reminder', label: 'Remind Author', variant: 'secondary' },
    { templateId: 'advance_to_next_step', label: 'Author Approved', variant: 'primary' },
  ],
  copywriter_pass: [
    { templateId: 'advance_to_next_step', label: 'Copyedit Complete', variant: 'primary' },
  ],
};

// Default quick actions for any step
export const DEFAULT_QUICK_ACTIONS: GeodeQuickAction[] = [
  { templateId: 'advance_to_next_step', label: 'Advance Step', variant: 'primary' },
  { templateId: 'custom_ai_action', label: 'AI Action', variant: 'secondary' },
];
