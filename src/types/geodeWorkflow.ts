// GEODE Chapter Workflow State Machine
// Defines the complete workflow for each chapter type

// ============================================
// WORKFLOW STEP DEFINITIONS
// ============================================

// Subsurface chapter has a unique workflow
export type SubsurfaceWorkflowStep =
  | 'not_started'
  | 'state_geologist_prework'      // Pre-work with state geologist
  | 'veit_summary_draft'           // Veit writes summary report
  | 'ghost_writer_draft'           // Ghost writer takes Veit's summary
  | 'trent_review_1'               // Trent approves ghost writer draft
  | 'maria_review_1'               // Maria approves
  | 'peer_review_state_geologist'  // Peer review with state geologist
  | 'veit_review_2'                // Veit reviews after peer review
  | 'trent_review_2'               // Trent reviews again
  | 'maria_review_2'               // Maria reviews again
  | 'done';                        // Complete

// Standard chapter workflow (Electricity, Direct Use, Heat Ownership, Policy, Stakeholders, Environment, Military)
export type StandardWorkflowStep =
  | 'not_started'
  | 'outreach_identify_authors'    // Conduct outreach to identify prospective authors
  | 'schedule_meeting'             // Schedule meeting with prospective author
  | 'explain_project'              // Meeting to explain the project
  | 'send_contract'                // Send contract to author
  | 'awaiting_contract_signature'  // Waiting for signed contract
  | 'awaiting_author_responses'    // Author answering question series
  | 'ai_deep_research_draft'       // AI creates first draft (incorporating author responses if available)
  | 'maria_initial_review'         // Maria reviews AI draft
  | 'content_approver_review_1'    // Content approver (Trent/Jackson/Smita/Ryan per Appendix 1)
  | 'drew_review'                  // Drew reviews (POLICY CHAPTER ONLY, optional for others)
  | 'author_approval_round_1'      // Author's first approval
  | 'content_approver_review_2'    // Content approver reviews author's edits
  | 'maria_edit_pass'              // Maria's editing/streamlining/consolidation pass
  | 'drew_content_approver_review' // Drew and/or content approver review Maria's edits
  | 'peer_review'                  // External peer review
  | 'author_approval_round_2'      // Author's second approval (if changes were made)
  | 'copywriter_pass'              // Copywriter for grammar/final polish
  | 'author_approval_round_3'      // Author's third/final approval of publication-ready draft
  | 'doe_ready'                    // Publication-ready draft sent to DOE
  | 'design_phase'                 // Maria's designers create designed version
  | 'done';                        // Complete

// The 101 chapter workflow (universal, already done for all 6 states)
export type Ch101WorkflowStep =
  | 'not_started'
  | 'drafting'
  | 'internal_review'
  | 'final_edit'
  | 'done';

// Union type for all workflow steps
export type WorkflowStep = SubsurfaceWorkflowStep | StandardWorkflowStep | Ch101WorkflowStep;

// ============================================
// WORKFLOW STEP METADATA
// ============================================

export interface WorkflowStepMeta {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  defaultOwner: string | null;  // Role or specific person
  typicalDurationDays: number;
  requiresApproval: boolean;
  canSkip: boolean;
  nextStep: string | null;
  previousStep: string | null;
}

// Subsurface workflow steps metadata
export const SUBSURFACE_WORKFLOW: WorkflowStepMeta[] = [
  {
    id: 'not_started',
    label: 'Not Started',
    shortLabel: 'Not Started',
    description: 'Chapter work has not begun',
    defaultOwner: null,
    typicalDurationDays: 0,
    requiresApproval: false,
    canSkip: false,
    nextStep: 'state_geologist_prework',
    previousStep: null,
  },
  {
    id: 'state_geologist_prework',
    label: 'State Geologist Pre-work',
    shortLabel: 'State Geo',
    description: 'Pre-work coordination with the state geologist',
    defaultOwner: 'State Geologist',
    typicalDurationDays: 14,
    requiresApproval: false,
    canSkip: false,
    nextStep: 'veit_summary_draft',
    previousStep: 'not_started',
  },
  {
    id: 'veit_summary_draft',
    label: 'Veit Summary Draft',
    shortLabel: 'Veit Draft',
    description: 'Veit writes the summary report based on state geologist input',
    defaultOwner: 'Veit',
    typicalDurationDays: 7,
    requiresApproval: false,
    canSkip: false,
    nextStep: 'ghost_writer_draft',
    previousStep: 'state_geologist_prework',
  },
  {
    id: 'ghost_writer_draft',
    label: 'Ghost Writer Draft',
    shortLabel: 'Ghost Writer',
    description: 'Ghost writer develops Veit\'s summary into full chapter',
    defaultOwner: 'Ghost Writer',
    typicalDurationDays: 10,
    requiresApproval: false,
    canSkip: false,
    nextStep: 'trent_review_1',
    previousStep: 'veit_summary_draft',
  },
  {
    id: 'trent_review_1',
    label: 'Trent Review (Round 1)',
    shortLabel: 'Trent R1',
    description: 'Trent approves the ghost writer draft',
    defaultOwner: 'Trent',
    typicalDurationDays: 3,
    requiresApproval: true,
    canSkip: false,
    nextStep: 'maria_review_1',
    previousStep: 'ghost_writer_draft',
  },
  {
    id: 'maria_review_1',
    label: 'Maria Review (Round 1)',
    shortLabel: 'Maria R1',
    description: 'Maria reviews and approves',
    defaultOwner: 'Maria',
    typicalDurationDays: 3,
    requiresApproval: true,
    canSkip: false,
    nextStep: 'peer_review_state_geologist',
    previousStep: 'trent_review_1',
  },
  {
    id: 'peer_review_state_geologist',
    label: 'Peer Review (State Geologist)',
    shortLabel: 'Peer Review',
    description: 'State geologist conducts peer review',
    defaultOwner: 'State Geologist',
    typicalDurationDays: 7,
    requiresApproval: true,
    canSkip: false,
    nextStep: 'veit_review_2',
    previousStep: 'maria_review_1',
  },
  {
    id: 'veit_review_2',
    label: 'Veit Review (Round 2)',
    shortLabel: 'Veit R2',
    description: 'Veit reviews after peer review feedback',
    defaultOwner: 'Veit',
    typicalDurationDays: 3,
    requiresApproval: true,
    canSkip: false,
    nextStep: 'trent_review_2',
    previousStep: 'peer_review_state_geologist',
  },
  {
    id: 'trent_review_2',
    label: 'Trent Review (Round 2)',
    shortLabel: 'Trent R2',
    description: 'Trent final review',
    defaultOwner: 'Trent',
    typicalDurationDays: 2,
    requiresApproval: true,
    canSkip: false,
    nextStep: 'maria_review_2',
    previousStep: 'veit_review_2',
  },
  {
    id: 'maria_review_2',
    label: 'Maria Review (Round 2)',
    shortLabel: 'Maria R2',
    description: 'Maria final review',
    defaultOwner: 'Maria',
    typicalDurationDays: 2,
    requiresApproval: true,
    canSkip: false,
    nextStep: 'done',
    previousStep: 'trent_review_2',
  },
  {
    id: 'done',
    label: 'Complete',
    shortLabel: 'Done',
    description: 'Chapter is complete and ready for DOE',
    defaultOwner: null,
    typicalDurationDays: 0,
    requiresApproval: false,
    canSkip: false,
    nextStep: null,
    previousStep: 'maria_review_2',
  },
];

// Standard chapter workflow steps metadata
export const STANDARD_WORKFLOW: WorkflowStepMeta[] = [
  {
    id: 'not_started',
    label: 'Not Started',
    shortLabel: 'Not Started',
    description: 'Chapter work has not begun',
    defaultOwner: null,
    typicalDurationDays: 0,
    requiresApproval: false,
    canSkip: false,
    nextStep: 'outreach_identify_authors',
    previousStep: null,
  },
  {
    id: 'outreach_identify_authors',
    label: 'Outreach - Identify Authors',
    shortLabel: 'Outreach',
    description: 'Conduct outreach to identify prospective authors',
    defaultOwner: 'Content Owner',
    typicalDurationDays: 14,
    requiresApproval: false,
    canSkip: false,
    nextStep: 'schedule_meeting',
    previousStep: 'not_started',
  },
  {
    id: 'schedule_meeting',
    label: 'Schedule Meeting',
    shortLabel: 'Schedule',
    description: 'Schedule introductory meeting with prospective author',
    defaultOwner: 'Content Owner',
    typicalDurationDays: 7,
    requiresApproval: false,
    canSkip: false,
    nextStep: 'explain_project',
    previousStep: 'outreach_identify_authors',
  },
  {
    id: 'explain_project',
    label: 'Explain Project',
    shortLabel: 'Meeting',
    description: 'Meet with author to explain the project',
    defaultOwner: 'Content Owner',
    typicalDurationDays: 1,
    requiresApproval: false,
    canSkip: false,
    nextStep: 'send_contract',
    previousStep: 'schedule_meeting',
  },
  {
    id: 'send_contract',
    label: 'Send Contract',
    shortLabel: 'Send Contract',
    description: 'Send contract to author for signature',
    defaultOwner: 'Content Owner',
    typicalDurationDays: 1,
    requiresApproval: false,
    canSkip: false,
    nextStep: 'awaiting_contract_signature',
    previousStep: 'explain_project',
  },
  {
    id: 'awaiting_contract_signature',
    label: 'Awaiting Contract Signature',
    shortLabel: 'Await Sign',
    description: 'Waiting for author to sign and return contract',
    defaultOwner: 'Author',
    typicalDurationDays: 7,
    requiresApproval: true,
    canSkip: false,
    nextStep: 'awaiting_author_responses',
    previousStep: 'send_contract',
  },
  {
    id: 'awaiting_author_responses',
    label: 'Awaiting Author Responses',
    shortLabel: 'Await Responses',
    description: 'Author answering series of questions',
    defaultOwner: 'Author',
    typicalDurationDays: 14,
    requiresApproval: false,
    canSkip: false,
    nextStep: 'ai_deep_research_draft',
    previousStep: 'awaiting_contract_signature',
  },
  {
    id: 'ai_deep_research_draft',
    label: 'AI Deep Research Draft',
    shortLabel: 'AI Draft',
    description: 'AI creates first draft (incorporating author responses if available)',
    defaultOwner: 'Deep Research AI',
    typicalDurationDays: 2,
    requiresApproval: false,
    canSkip: false,
    nextStep: 'maria_initial_review',
    previousStep: 'awaiting_author_responses',
  },
  {
    id: 'maria_initial_review',
    label: 'Maria Initial Review',
    shortLabel: 'Maria Init',
    description: 'Maria reviews AI draft',
    defaultOwner: 'Maria',
    typicalDurationDays: 3,
    requiresApproval: true,
    canSkip: false,
    nextStep: 'content_approver_review_1',
    previousStep: 'ai_deep_research_draft',
  },
  {
    id: 'content_approver_review_1',
    label: 'Content Approver Review (Round 1)',
    shortLabel: 'Approver R1',
    description: 'Content approver (per Appendix 1) reviews draft',
    defaultOwner: 'Content Approver',
    typicalDurationDays: 5,
    requiresApproval: true,
    canSkip: false,
    nextStep: 'drew_review',
    previousStep: 'maria_initial_review',
  },
  {
    id: 'drew_review',
    label: 'Drew Review',
    shortLabel: 'Drew',
    description: 'Drew reviews (required for Policy, optional for others)',
    defaultOwner: 'Drew',
    typicalDurationDays: 5,
    requiresApproval: true,
    canSkip: true, // Can skip for non-Policy chapters if Drew opts out
    nextStep: 'author_approval_round_1',
    previousStep: 'content_approver_review_1',
  },
  {
    id: 'author_approval_round_1',
    label: 'Author Approval (Round 1)',
    shortLabel: 'Author R1',
    description: 'Author\'s first approval of the draft',
    defaultOwner: 'Author',
    typicalDurationDays: 7,
    requiresApproval: true,
    canSkip: false,
    nextStep: 'content_approver_review_2',
    previousStep: 'drew_review',
  },
  {
    id: 'content_approver_review_2',
    label: 'Content Approver Review (Round 2)',
    shortLabel: 'Approver R2',
    description: 'Content approver reviews author\'s edits',
    defaultOwner: 'Content Approver',
    typicalDurationDays: 3,
    requiresApproval: true,
    canSkip: false,
    nextStep: 'maria_edit_pass',
    previousStep: 'author_approval_round_1',
  },
  {
    id: 'maria_edit_pass',
    label: 'Maria Edit Pass',
    shortLabel: 'Maria Edit',
    description: 'Maria\'s editing, streamlining, and consolidation pass',
    defaultOwner: 'Maria',
    typicalDurationDays: 5,
    requiresApproval: false,
    canSkip: false,
    nextStep: 'drew_content_approver_review',
    previousStep: 'content_approver_review_2',
  },
  {
    id: 'drew_content_approver_review',
    label: 'Drew/Content Approver Review',
    shortLabel: 'Drew/Approver',
    description: 'Drew and/or content approver review Maria\'s edits',
    defaultOwner: 'Content Approver',
    typicalDurationDays: 3,
    requiresApproval: true,
    canSkip: true, // Drew can opt out
    nextStep: 'peer_review',
    previousStep: 'maria_edit_pass',
  },
  {
    id: 'peer_review',
    label: 'Peer Review',
    shortLabel: 'Peer Review',
    description: 'External peer review of the chapter',
    defaultOwner: 'External Reviewer',
    typicalDurationDays: 7,
    requiresApproval: true,
    canSkip: false,
    nextStep: 'author_approval_round_2',
    previousStep: 'drew_content_approver_review',
  },
  {
    id: 'author_approval_round_2',
    label: 'Author Approval (Round 2)',
    shortLabel: 'Author R2',
    description: 'Author\'s second approval (if changes were made)',
    defaultOwner: 'Author',
    typicalDurationDays: 5,
    requiresApproval: true,
    canSkip: true, // Can skip if no substantive changes
    nextStep: 'copywriter_pass',
    previousStep: 'peer_review',
  },
  {
    id: 'copywriter_pass',
    label: 'Copywriter Pass',
    shortLabel: 'Copywriter',
    description: 'Copywriter reviews for grammar and final polish',
    defaultOwner: 'Copywriter',
    typicalDurationDays: 3,
    requiresApproval: false,
    canSkip: false,
    nextStep: 'author_approval_round_3',
    previousStep: 'author_approval_round_2',
  },
  {
    id: 'author_approval_round_3',
    label: 'Author Approval (Round 3)',
    shortLabel: 'Author R3',
    description: 'Author\'s final approval of publication-ready draft',
    defaultOwner: 'Author',
    typicalDurationDays: 3,
    requiresApproval: true,
    canSkip: false,
    nextStep: 'doe_ready',
    previousStep: 'copywriter_pass',
  },
  {
    id: 'doe_ready',
    label: 'DOE Ready',
    shortLabel: 'DOE Ready',
    description: 'Publication-ready draft submitted to DOE',
    defaultOwner: null,
    typicalDurationDays: 0,
    requiresApproval: false,
    canSkip: false,
    nextStep: 'design_phase',
    previousStep: 'author_approval_round_3',
  },
  {
    id: 'design_phase',
    label: 'Design Phase',
    shortLabel: 'Design',
    description: 'Maria\'s designers create designed version (not required for DOE)',
    defaultOwner: 'Designers',
    typicalDurationDays: 14,
    requiresApproval: false,
    canSkip: true, // Not required for DOE deadline
    nextStep: 'done',
    previousStep: 'doe_ready',
  },
  {
    id: 'done',
    label: 'Complete',
    shortLabel: 'Done',
    description: 'Chapter is fully complete including design',
    defaultOwner: null,
    typicalDurationDays: 0,
    requiresApproval: false,
    canSkip: false,
    nextStep: null,
    previousStep: 'design_phase',
  },
];

// Ch 101 workflow (already done for all states)
export const CH101_WORKFLOW: WorkflowStepMeta[] = [
  {
    id: 'not_started',
    label: 'Not Started',
    shortLabel: 'Not Started',
    description: 'Chapter work has not begun',
    defaultOwner: null,
    typicalDurationDays: 0,
    requiresApproval: false,
    canSkip: false,
    nextStep: 'drafting',
    previousStep: null,
  },
  {
    id: 'drafting',
    label: 'Drafting',
    shortLabel: 'Drafting',
    description: 'Initial draft being written',
    defaultOwner: 'Drew, Dani, Maria, Trent',
    typicalDurationDays: 14,
    requiresApproval: false,
    canSkip: false,
    nextStep: 'internal_review',
    previousStep: 'not_started',
  },
  {
    id: 'internal_review',
    label: 'Internal Review',
    shortLabel: 'Review',
    description: 'Internal team review',
    defaultOwner: 'Trent',
    typicalDurationDays: 7,
    requiresApproval: true,
    canSkip: false,
    nextStep: 'final_edit',
    previousStep: 'drafting',
  },
  {
    id: 'final_edit',
    label: 'Final Edit',
    shortLabel: 'Final Edit',
    description: 'Final editing pass',
    defaultOwner: 'Maria',
    typicalDurationDays: 3,
    requiresApproval: false,
    canSkip: false,
    nextStep: 'done',
    previousStep: 'internal_review',
  },
  {
    id: 'done',
    label: 'Complete',
    shortLabel: 'Done',
    description: 'Chapter is complete',
    defaultOwner: null,
    typicalDurationDays: 0,
    requiresApproval: false,
    canSkip: false,
    nextStep: null,
    previousStep: 'final_edit',
  },
];

// ============================================
// CHAPTER WORKFLOW HISTORY
// ============================================

export interface WorkflowHistoryEntry {
  stepId: string;
  startedAt: string;
  completedAt: string | null;
  owner: string;
  notes: string | null;
  durationDays: number | null;  // Calculated when completed
}

export interface ChapterWorkflowState {
  chapterId: string;
  reportState: string;  // arizona, louisiana, etc.
  chapterType: string;  // ch1_101, ch2_subsurface, etc.
  workflowType: 'subsurface' | 'standard' | 'ch101';
  currentStep: string;
  currentStepStartedAt: string;
  currentOwner: string;
  history: WorkflowHistoryEntry[];
  contractDeadlines: Record<string, string>;  // stepId -> deadline date
  notes: string | null;
  blockers: string | null;
  googleDocUrl: string | null;
  authorName: string | null;
  authorEmail: string | null;
  contractSigned: boolean;
  contractSignedDate: string | null;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

export function getWorkflowForChapter(chapterType: string): WorkflowStepMeta[] {
  if (chapterType === 'ch1_101') {
    return CH101_WORKFLOW;
  }
  if (chapterType === 'ch2_subsurface') {
    return SUBSURFACE_WORKFLOW;
  }
  return STANDARD_WORKFLOW;
}

export function getWorkflowType(chapterType: string): 'subsurface' | 'standard' | 'ch101' {
  if (chapterType === 'ch1_101') return 'ch101';
  if (chapterType === 'ch2_subsurface') return 'subsurface';
  return 'standard';
}

export function getStepMeta(workflowType: 'subsurface' | 'standard' | 'ch101', stepId: string): WorkflowStepMeta | undefined {
  const workflow = workflowType === 'ch101' ? CH101_WORKFLOW :
                   workflowType === 'subsurface' ? SUBSURFACE_WORKFLOW :
                   STANDARD_WORKFLOW;
  return workflow.find(s => s.id === stepId);
}

export function getStepIndex(workflowType: 'subsurface' | 'standard' | 'ch101', stepId: string): number {
  const workflow = workflowType === 'ch101' ? CH101_WORKFLOW :
                   workflowType === 'subsurface' ? SUBSURFACE_WORKFLOW :
                   STANDARD_WORKFLOW;
  return workflow.findIndex(s => s.id === stepId);
}

export function calculateDaysOnStep(startedAt: string): number {
  const start = new Date(startedAt);
  const now = new Date();
  return Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export function isStepOverdue(startedAt: string, typicalDurationDays: number): boolean {
  return calculateDaysOnStep(startedAt) > typicalDurationDays;
}

export function getNextOwner(
  workflowType: 'subsurface' | 'standard' | 'ch101',
  currentStepId: string,
  contentApprover: string
): string {
  const stepMeta = getStepMeta(workflowType, currentStepId);
  if (!stepMeta?.nextStep) return '';

  const nextStepMeta = getStepMeta(workflowType, stepMeta.nextStep);
  if (!nextStepMeta) return '';

  // Replace generic "Content Approver" with actual person
  if (nextStepMeta.defaultOwner === 'Content Approver') {
    return contentApprover;
  }

  return nextStepMeta.defaultOwner || '';
}

// Calculate progress percentage through workflow
export function calculateWorkflowProgress(
  workflowType: 'subsurface' | 'standard' | 'ch101',
  currentStepId: string
): number {
  const workflow = workflowType === 'ch101' ? CH101_WORKFLOW :
                   workflowType === 'subsurface' ? SUBSURFACE_WORKFLOW :
                   STANDARD_WORKFLOW;

  const currentIndex = workflow.findIndex(s => s.id === currentStepId);
  if (currentIndex === -1) return 0;

  // Don't count 'not_started' and 'done' in the progress calculation
  const totalSteps = workflow.length - 2;
  const completedSteps = currentIndex - 1; // -1 for 'not_started'

  if (currentStepId === 'done') return 100;
  if (currentStepId === 'not_started') return 0;

  return Math.round((completedSteps / totalSteps) * 100);
}
