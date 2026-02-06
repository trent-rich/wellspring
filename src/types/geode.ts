// GEODE State Reports - Type Definitions
// Project management for DOE-funded state geothermal reports
// Deadline: April 30, 2026

// ============================================
// ENUMS
// ============================================

export type GeodeState = 'arizona' | 'oklahoma' | 'louisiana' | 'idaho' | 'alaska' | 'oregon';

export type GeodeReportStatus =
  | 'not_started'
  | 'research'
  | 'drafting'
  | 'internal_review'
  | 'peer_review'
  | 'editing'
  | 'design'
  | 'final_review'
  | 'published';

// Chapter types - based on Arizona report structure
export type GeodeContentSection =
  | 'ch1_101'              // The 101 (intro/overview)
  | 'ch2_subsurface'       // Subsurface
  | 'ch3_electricity'      // Electricity
  | 'ch4_direct_use'       // Direct Use
  | 'ch4_5_commercial_gshp' // RMI Commercial GSHP (AZ-specific?)
  | 'ch5_heat_ownership'   // Heat Ownership
  | 'ch6_policy'           // Policy
  | 'ch7_stakeholders'     // Stakeholders
  | 'ch8_environment'      // Environment
  | 'ch9_military'         // Military Installations (may vary by state)
  | 'executive_summary'    // Executive Summary (if separate)
  | 'recommendations';     // Recommendations (if separate)

export type GeodeStakeholderRole =
  | 'content_owner'
  | 'ghost_writer'
  | 'editor'
  | 'bylined_author'
  | 'peer_reviewer'
  | 'vp_programs'
  | 'copywriter'
  | 'graphic_designer'
  | 'project_manager';

export type GeodeDeliverableType =
  | 'research_brief'
  | 'first_draft'
  | 'internal_review_draft'
  | 'peer_review_draft'
  | 'copyedit_draft'
  | 'design_draft'
  | 'final_report'
  | 'press_release'
  | 'social_assets';

export type GeodeDeliverableStatus =
  | 'not_started'
  | 'in_progress'
  | 'submitted'
  | 'in_review'
  | 'needs_revision'
  | 'approved'
  | 'paid';

export type GeodeNudgeType =
  | 'deadline_approaching'
  | 'deliverable_overdue'
  | 'review_requested'
  | 'revision_needed'
  | 'approval_needed'
  | 'payment_pending'
  | 'milestone_reached'
  | 'blocker_detected';

export type GeodeNudgeChannel = 'slack' | 'email' | 'monday_comment' | 'in_app';

// ============================================
// CORE ENTITIES
// ============================================

export interface GeodeReport {
  id: string;
  state: GeodeState;
  title: string;
  description: string | null;
  status: GeodeReportStatus;
  monday_board_id: string | null;
  monday_item_id: string | null;

  // Timeline
  kick_off_date: string | null;
  target_publish_date: string; // April 30, 2026 for all
  actual_publish_date: string | null;

  // Progress tracking
  overall_progress_percent: number;
  sections_complete: number;
  sections_total: number;

  // Financial
  total_contract_value: number;
  amount_paid: number;
  amount_pending: number;

  // Metadata
  created_at: string;
  updated_at: string;
}

export interface GeodeSection {
  id: string;
  report_id: string;
  section_type: GeodeContentSection;
  title: string;
  status: GeodeReportStatus;
  monday_item_id: string | null;

  // Ownership
  content_owner_id: string | null;
  ghost_writer_id: string | null;
  bylined_author_id: string | null;

  // Timeline
  research_deadline: string | null;
  draft_deadline: string | null;
  review_deadline: string | null;
  final_deadline: string | null;

  // Progress
  word_count_target: number | null;
  word_count_current: number | null;
  progress_percent: number;

  // Notes
  notes: string | null;
  blockers: string | null;

  created_at: string;
  updated_at: string;
}

export interface GeodeStakeholder {
  id: string;
  user_id: string | null; // Links to watershed user if exists
  name: string;
  email: string;
  organization: string | null;
  role: GeodeStakeholderRole;

  // Communication preferences
  slack_user_id: string | null;
  monday_user_id: string | null;
  preferred_channel: GeodeNudgeChannel;

  // Capacity
  max_concurrent_sections: number;
  current_assignments: number;

  // Contract info
  rate_type: 'hourly' | 'fixed' | 'milestone' | null;
  rate_amount: number | null;

  created_at: string;
  updated_at: string;
}

export interface GeodeAssignment {
  id: string;
  section_id: string;
  stakeholder_id: string;
  role: GeodeStakeholderRole;

  // Timeline
  assigned_at: string;
  due_date: string | null;
  completed_at: string | null;

  // Status
  status: 'assigned' | 'in_progress' | 'submitted' | 'approved' | 'rejected';

  // Deliverables
  deliverable_type: GeodeDeliverableType | null;
  deliverable_url: string | null;

  // Notes
  notes: string | null;
  feedback: string | null;

  created_at: string;
  updated_at: string;
}

export interface GeodeDeliverable {
  id: string;
  report_id: string;
  section_id: string | null;
  stakeholder_id: string;
  assignment_id: string | null;

  // Deliverable info
  deliverable_type: GeodeDeliverableType;
  title: string;
  description: string | null;

  // Status
  status: GeodeDeliverableStatus;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by_id: string | null;

  // Artifact
  file_url: string | null;
  file_name: string | null;
  version: number;

  // Contract/payment link
  contract_id: string | null;
  payment_amount: number | null;
  payment_status: 'not_due' | 'pending' | 'paid' | null;
  payment_date: string | null;

  // Monday.com sync
  monday_item_id: string | null;
  monday_update_id: string | null;

  created_at: string;
  updated_at: string;
}

export interface GeodeContract {
  id: string;
  stakeholder_id: string;
  report_id: string | null;

  // Contract details
  title: string;
  contract_number: string | null;
  total_value: number;

  // Timeline
  start_date: string;
  end_date: string;

  // Status
  status: 'draft' | 'pending_signature' | 'active' | 'completed' | 'terminated';
  signed_at: string | null;

  // Payment schedule
  payment_schedule: GeodePaymentMilestone[];

  // Documents
  contract_url: string | null;

  created_at: string;
  updated_at: string;
}

export interface GeodePaymentMilestone {
  id: string;
  description: string;
  amount: number;
  due_date: string;
  deliverable_type: GeodeDeliverableType | null;
  status: 'not_due' | 'pending' | 'paid';
  paid_at: string | null;
}

export interface GeodeNudge {
  id: string;
  report_id: string | null;
  section_id: string | null;
  assignment_id: string | null;
  stakeholder_id: string;

  // Nudge content
  nudge_type: GeodeNudgeType;
  title: string;
  message: string;
  priority: 1 | 2 | 3; // 1 = urgent, 3 = low

  // Delivery
  channel: GeodeNudgeChannel;
  scheduled_for: string;
  sent_at: string | null;

  // Response tracking
  acknowledged_at: string | null;
  response: string | null;

  // Auto-escalation
  escalate_after_hours: number | null;
  escalated_at: string | null;
  escalate_to_id: string | null;

  created_at: string;
}

// ============================================
// MONDAY.COM SYNC TYPES
// ============================================

export interface MondayBoard {
  id: string;
  name: string;
  workspace_id: string;
  columns: MondayColumn[];
}

export interface MondayColumn {
  id: string;
  title: string;
  type: string;
  settings_str: string;
}

export interface MondayItem {
  id: string;
  name: string;
  board_id: string;
  group_id: string;
  group?: { id: string };
  column_values: MondayColumnValue[];
  created_at: string;
  updated_at: string;
}

export interface MondayColumnValue {
  id: string;
  text: string | null;
  value: string | null;
}

export interface MondaySyncState {
  board_id: string;
  last_sync_at: string;
  items_synced: number;
  errors: string[];
}

// ============================================
// SLACK INTEGRATION TYPES
// ============================================

export interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  purpose: string | null;
}

export interface SlackMessage {
  channel_id: string;
  text: string;
  blocks?: SlackBlock[];
  thread_ts?: string;
  attachments?: SlackAttachment[];
}

export interface SlackBlock {
  type: 'section' | 'divider' | 'actions' | 'context' | 'header';
  text?: {
    type: 'plain_text' | 'mrkdwn';
    text: string;
  };
  accessory?: SlackAccessory;
  elements?: SlackElement[];
}

export interface SlackAccessory {
  type: 'button' | 'overflow' | 'datepicker' | 'static_select';
  action_id: string;
  text?: {
    type: 'plain_text';
    text: string;
  };
  value?: string;
  url?: string;
}

export interface SlackElement {
  type: string;
  text?: string | { type: 'plain_text' | 'mrkdwn'; text: string };
  action_id?: string;
  value?: string;
  url?: string;
}

export interface SlackAttachment {
  color?: string;
  fallback?: string;
  title?: string;
  text?: string;
  fields?: {
    title: string;
    value: string;
    short?: boolean;
  }[];
}

// ============================================
// UI/DASHBOARD TYPES
// ============================================

export interface GeodeReportSummary {
  report: GeodeReport;
  sections: GeodeSection[];
  stakeholders: GeodeStakeholder[];
  upcoming_deadlines: GeodeDeadline[];
  overdue_items: GeodeOverdueItem[];
  pending_payments: GeodePaymentMilestone[];
  blockers: string[];
}

export interface GeodeDeadline {
  id: string;
  report_id: string;
  section_id: string | null;
  stakeholder_id: string | null;
  stakeholder_name: string | null;
  title: string;
  due_date: string;
  days_until: number;
  type: 'section' | 'deliverable' | 'review' | 'payment';
}

export interface GeodeOverdueItem {
  id: string;
  report_id: string;
  section_id: string | null;
  assignment_id: string | null;
  stakeholder_id: string;
  stakeholder_name: string;
  title: string;
  due_date: string;
  days_overdue: number;
  type: 'section' | 'deliverable' | 'review';
  last_nudge_at: string | null;
}

export interface GeodeDashboardKPIs {
  reports_total: number;
  reports_on_track: number;
  reports_at_risk: number;
  reports_behind: number;

  sections_total: number;
  sections_complete: number;
  sections_in_progress: number;
  sections_not_started: number;

  deliverables_pending: number;
  deliverables_overdue: number;

  payments_pending_amount: number;
  payments_overdue_amount: number;

  days_until_deadline: number; // Days until April 30

  stakeholders_active: number;
  blockers_count: number;
}

export interface GeodeTimeline {
  state: GeodeState;
  milestones: GeodeTimelineMilestone[];
}

export interface GeodeTimelineMilestone {
  id: string;
  title: string;
  date: string;
  status: 'completed' | 'in_progress' | 'upcoming' | 'overdue';
  type: 'kickoff' | 'research' | 'draft' | 'review' | 'design' | 'publish';
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

export interface CreateGeodeReportInput {
  state: GeodeState;
  title: string;
  description?: string;
  kick_off_date?: string;
  target_publish_date?: string;
}

export interface CreateGeodeSectionInput {
  report_id: string;
  section_type: GeodeContentSection;
  title: string;
  content_owner_id?: string;
  research_deadline?: string;
  draft_deadline?: string;
  word_count_target?: number;
}

export interface CreateGeodeAssignmentInput {
  section_id: string;
  stakeholder_id: string;
  role: GeodeStakeholderRole;
  due_date?: string;
  deliverable_type?: GeodeDeliverableType;
}

export interface CreateGeodeNudgeInput {
  stakeholder_id: string;
  report_id?: string;
  section_id?: string;
  assignment_id?: string;
  nudge_type: GeodeNudgeType;
  title: string;
  message: string;
  priority?: 1 | 2 | 3;
  channel?: GeodeNudgeChannel;
  scheduled_for?: string;
  escalate_after_hours?: number;
  escalate_to_id?: string;
}

export interface CreateGeodeAIDraftInput {
  report_id: string;
  section_id: string;
  prompt_used?: string;
  research_sources?: string[];
  draft_content: string;
  word_count: number;
}

export interface AssignGhostWriterInput {
  ai_draft_id: string;
  ghost_writer_id: string;
  assignment_method: GeodeDraftAssignmentMethod;
  due_date: string;
  source_email_id?: string;
  source_slack_message_ts?: string;
}

// ============================================
// WORKFLOW TYPES
// ============================================

// Deep Research AI creates first drafts, then Maria assigns to ghost writers
export type GeodeDraftSource = 'deep_research_ai' | 'manual' | 'content_owner';

export type GeodeDraftAssignmentMethod =
  | 'maria_email_forward'  // Maria forwards email to assign
  | 'maria_slack'          // Maria assigns via Slack
  | 'auto_assigned'        // System auto-assigns based on availability
  | 'direct_assignment';   // Direct assignment in Command Center

export interface GeodeAIDraft {
  id: string;
  report_id: string;
  section_id: string;

  // AI Generation
  generated_at: string;
  generated_by: 'deep_research_ai';
  prompt_used: string | null;
  research_sources: string[];

  // Content
  draft_content: string;
  word_count: number;

  // Google Drive location
  google_drive_file_id: string | null;
  google_drive_url: string | null;

  // Assignment workflow
  sent_to_maria_at: string | null;
  assignment_method: GeodeDraftAssignmentMethod | null;
  assigned_ghost_writer_id: string | null;
  assigned_at: string | null;

  // Status
  status: 'generated' | 'sent_to_maria' | 'assigned' | 'in_revision' | 'approved';

  created_at: string;
  updated_at: string;
}

export interface GeodeGhostWriterAssignment {
  id: string;
  ai_draft_id: string;
  ghost_writer_id: string;

  // Assignment details
  assigned_by: 'maria' | 'system';
  assignment_method: GeodeDraftAssignmentMethod;
  assigned_at: string;
  due_date: string;

  // Source tracking (for Maria's manual assignments)
  source_email_id: string | null;      // If assigned via email forward
  source_slack_message_ts: string | null; // If assigned via Slack

  // Deliverable
  revised_draft_url: string | null;
  submitted_at: string | null;

  // Feedback loop
  revision_count: number;
  feedback_notes: string | null;

  status: 'assigned' | 'in_progress' | 'submitted' | 'needs_revision' | 'approved';

  created_at: string;
  updated_at: string;
}

// Google Drive repository for all GEODE docs
export const GEODE_GOOGLE_DRIVE_FOLDER = 'https://drive.google.com/drive/folders/1Vi_kODp_LeLryiPh7cSMshIqAbiuk4Xd';
export const GEODE_GOOGLE_DRIVE_FOLDER_ID = '1Vi_kODp_LeLryiPh7cSMshIqAbiuk4Xd';

// ============================================
// CONSTANTS
// ============================================

// DOE Final Draft Deadlines by state
export const GEODE_DOE_DEADLINES: Record<GeodeState, { date: string; label: string }> = {
  arizona: { date: '2026-02-15', label: 'Mid-February' },
  louisiana: { date: '2026-02-28', label: 'End February' },
  oklahoma: { date: '2026-03-15', label: 'Mid-March' },
  alaska: { date: '2026-03-25', label: 'Late March' },
  idaho: { date: '2026-04-30', label: 'End April' },
  oregon: { date: '2026-04-30', label: 'End April' },
};

export const GEODE_STATES: { value: GeodeState; label: string; abbreviation: string; doeDeadline: string }[] = [
  { value: 'arizona', label: 'Arizona', abbreviation: 'AZ', doeDeadline: '2026-02-15' },
  { value: 'louisiana', label: 'Louisiana', abbreviation: 'LA', doeDeadline: '2026-02-28' },
  { value: 'oklahoma', label: 'Oklahoma', abbreviation: 'OK', doeDeadline: '2026-03-15' },
  { value: 'alaska', label: 'Alaska', abbreviation: 'AK', doeDeadline: '2026-03-25' },
  { value: 'idaho', label: 'Idaho', abbreviation: 'ID', doeDeadline: '2026-04-30' },
  { value: 'oregon', label: 'Oregon', abbreviation: 'OR', doeDeadline: '2026-04-30' },
];

export const GEODE_FINAL_DEADLINE = new Date('2026-04-30');

// Chapter types based on Arizona report structure
export const GEODE_CHAPTER_TYPES: { value: GeodeContentSection; label: string; chapterNum: string }[] = [
  { value: 'ch1_101', label: 'The 101', chapterNum: '1' },
  { value: 'ch2_subsurface', label: 'Subsurface', chapterNum: '2' },
  { value: 'ch3_electricity', label: 'Electricity', chapterNum: '3' },
  { value: 'ch4_direct_use', label: 'Direct Use', chapterNum: '4' },
  { value: 'ch4_5_commercial_gshp', label: 'RMI Commercial GSHP', chapterNum: '4.5' },
  { value: 'ch5_heat_ownership', label: 'Heat Ownership', chapterNum: '5' },
  { value: 'ch6_policy', label: 'Policy', chapterNum: '6' },
  { value: 'ch7_stakeholders', label: 'Stakeholders', chapterNum: '7' },
  { value: 'ch8_environment', label: 'Environment', chapterNum: '8' },
  { value: 'ch9_military', label: 'Military Installations', chapterNum: '9' },
];

// Legacy alias for backwards compatibility
export const GEODE_SECTION_TYPES = GEODE_CHAPTER_TYPES;
export const GEODE_DEADLINE = GEODE_FINAL_DEADLINE;

// Chapter workflow status - matches your Slack update format
export type GeodeChapterWorkflowStatus =
  | 'not_started'
  | 'with_author'           // "with author" - author is working on it
  | 'with_trent'            // "w/ TRENT" - Trent is working on it
  | 'with_ryan'             // "w/ RYAN" - Ryan is working on it
  | 'with_maria'            // "w/ Maria" - Maria is working on it
  | 'with_wendy'            // "with Wendy" - Wendy is proofing
  | 'internal_review'       // Internal review
  | 'author_review'         // Back with author for review
  | 'final_proof'           // Final proofing
  | 'done';                 // Done!!!!

export interface GeodeChapterStatus {
  chapter: GeodeContentSection;
  status: GeodeChapterWorkflowStatus;
  currentOwner: string;           // Name of person currently responsible
  currentOwnerRole: GeodeStakeholderRole;
  notes: string | null;           // e.g., "Have to add/compile data for 2050 projections"
  blockers: string | null;
  googleDocUrl: string | null;
  lastUpdated: string;
}

// Chapter Leads / Content Owners by State (from Appendix 1)
// Key people: Trent, Ryan, Drew, Jackson, Maria, Smita, Dani
export const GEODE_CHAPTER_LEADS: Record<GeodeState, Record<string, string>> = {
  arizona: {
    fob: 'Trent',
    exec_summary: 'Trent',
    ch1_101: 'Drew, Dani, Maria, Trent',
    ch2_subsurface: 'Trent',
    ch3_electricity: 'Trent',
    ch4_direct_use: 'Trent',
    ch5_heat_ownership: 'Trent',
    ch6_policy: 'Trent',
    ch7_stakeholders: 'Trent',
    ch8_environment: 'Trent',
    ch9_military: 'Trent',
  },
  louisiana: {
    fob: 'Ryan',
    exec_summary: 'Ryan',
    ch1_101: 'Drew, Dani, Maria, Trent', // Same team for 101 across states
    ch2_subsurface: 'Ryan',
    ch3_electricity: 'Ryan',
    ch4_direct_use: 'Jackson',
    ch5_heat_ownership: 'Ryan',
    ch6_policy: 'Ryan',
    ch7_stakeholders: 'Ryan',
    ch8_environment: 'Ryan',
    ch9_military: 'Ryan',
  },
  alaska: {
    fob: 'Ryan',
    exec_summary: 'Drew',
    ch1_101: 'Drew, Dani, Maria, Trent',
    ch2_subsurface: 'Trent',
    ch3_electricity: 'Ryan',
    ch4_direct_use: 'Ryan',
    ch5_heat_ownership: 'Smita/Maria',
    ch6_policy: 'Trent',
    ch7_stakeholders: 'Jackson',
    ch8_environment: 'Smita',
    ch9_military: 'Ryan',
  },
  oklahoma: {
    fob: 'Trent',
    exec_summary: 'Drew',
    ch1_101: 'Drew, Dani, Maria, Trent',
    ch2_subsurface: 'Trent',
    ch3_electricity: 'Ryan',
    ch4_direct_use: 'Jackson',
    ch5_heat_ownership: 'Smita/Maria',
    ch6_policy: 'Trent',
    ch7_stakeholders: 'Jackson',
    ch8_environment: 'Smita',
    ch9_military: 'Ryan',
  },
  idaho: {
    fob: 'Trent',
    exec_summary: 'Drew',
    ch1_101: 'Drew, Dani, Maria, Trent',
    ch2_subsurface: 'Trent',
    ch3_electricity: 'Ryan',
    ch4_direct_use: 'Jackson',
    ch5_heat_ownership: 'Smita/Maria',
    ch6_policy: 'Trent',
    ch7_stakeholders: 'Jackson',
    ch8_environment: 'Smita',
    ch9_military: 'Ryan',
  },
  oregon: {
    fob: 'Ryan',
    exec_summary: 'Drew',
    ch1_101: 'Drew, Dani, Maria, Trent',
    ch2_subsurface: 'Trent',
    ch3_electricity: 'Ryan',
    ch4_direct_use: 'Jackson',
    ch5_heat_ownership: 'Smita/Maria',
    ch6_policy: 'Trent',
    ch7_stakeholders: 'Jackson',
    ch8_environment: 'Smita',
    ch9_military: 'Ryan',
  },
};

// Team member communication preferences
export const GEODE_TEAM_CONTACTS: Record<string, { name: string; preferredChannel: 'slack' | 'email'; role: string }> = {
  trent: { name: 'Trent', preferredChannel: 'slack', role: 'Project Lead / Content Owner' },
  ryan: { name: 'Ryan', preferredChannel: 'slack', role: 'Content Owner' },
  drew: { name: 'Drew', preferredChannel: 'email', role: 'Bylined Author' },
  jackson: { name: 'Jackson', preferredChannel: 'email', role: 'Content Owner' },
  maria: { name: 'Maria', preferredChannel: 'slack', role: 'Copywriter/Designer Manager' },
  smita: { name: 'Smita', preferredChannel: 'email', role: 'Content Owner' },
  dani: { name: 'Dani', preferredChannel: 'email', role: 'Content Owner' },
  wendy: { name: 'Wendy', preferredChannel: 'email', role: 'Editor/Proofreader' },
};

export const GEODE_ROLES: { value: GeodeStakeholderRole; label: string; color: string }[] = [
  { value: 'content_owner', label: 'Content Owner', color: 'blue' },
  { value: 'ghost_writer', label: 'Ghost Writer', color: 'purple' },
  { value: 'editor', label: 'Editor', color: 'green' },
  { value: 'bylined_author', label: 'Bylined Author', color: 'indigo' },
  { value: 'peer_reviewer', label: 'Peer Reviewer', color: 'amber' },
  { value: 'vp_programs', label: 'VP of Programs', color: 'red' },
  { value: 'copywriter', label: 'Copywriter', color: 'teal' },
  { value: 'graphic_designer', label: 'Graphic Designer', color: 'pink' },
  { value: 'project_manager', label: 'Project Manager', color: 'gray' },
];

export const GEODE_NUDGE_TEMPLATES: Record<GeodeNudgeType, { title: string; message: string }> = {
  deadline_approaching: {
    title: 'Deadline Approaching',
    message: 'Your deliverable for {{section}} is due in {{days}} days ({{date}}). Please ensure you\'re on track.',
  },
  deliverable_overdue: {
    title: 'Deliverable Overdue',
    message: 'Your deliverable for {{section}} was due on {{date}} ({{days}} days ago). Please submit as soon as possible or let us know if you\'re blocked.',
  },
  review_requested: {
    title: 'Review Requested',
    message: 'A draft of {{section}} is ready for your review. Please complete your review by {{date}}.',
  },
  revision_needed: {
    title: 'Revision Needed',
    message: 'Your submission for {{section}} requires revisions. Please address the feedback and resubmit by {{date}}.',
  },
  approval_needed: {
    title: 'Approval Needed',
    message: '{{section}} is ready for your approval. Please review and approve by {{date}}.',
  },
  payment_pending: {
    title: 'Payment Processing',
    message: 'Your payment of ${{amount}} for {{deliverable}} is being processed.',
  },
  milestone_reached: {
    title: 'Milestone Reached',
    message: 'Congratulations! {{milestone}} has been completed for the {{state}} report.',
  },
  blocker_detected: {
    title: 'Blocker Detected',
    message: 'A potential blocker has been detected for {{section}}. Please address or escalate: {{blocker}}',
  },
};
