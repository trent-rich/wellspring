// Sequencing types for CERA Week Invitation Cascade

export type InvitationPhase = 0 | 1 | 2 | 3 | 4

export type PhaseLabel =
  | 'Jamie Approval'
  | 'Anchors'
  | 'Demand Signal'
  | 'Civic + Infrastructure + International'
  | 'Final Seats + Alternates'

export type InvitationStatus =
  | 'not_started'
  | 'pre_warming'
  | 'draft_pending'
  | 'draft_ready'
  | 'approved'
  | 'sent'
  | 'confirmed'
  | 'declined'
  | 'more_info'
  | 'meeting_requested'
  | 'follow_up_draft'
  | 'follow_up_sent'

export type ResponseClassification =
  | 'confirmed'
  | 'declined'
  | 'more_info'
  | 'meeting_requested'
  | 'unclear'

export type NetworkOwner = 'trent' | 'jamie' | 'drew'

export type ConfidenceLevel = 'HIGH' | 'MEDIUM-HIGH' | 'MEDIUM' | 'LOW-MEDIUM' | 'JAMIE ONLY'

export interface Invitee {
  id: string
  name: string
  organization: string
  title?: string
  email?: string
  panel: string
  panelRole?: string
  phase: InvitationPhase
  phaseOrder: string
  status: InvitationStatus
  invitedBy: NetworkOwner
  confidence: ConfidenceLevel
  leverageScript?: string
  leverageNames?: string[]
  dependencies: string[]
  notes?: string
  emailThreadId?: string
  lastResponseAt?: string
  lastResponseClassification?: ResponseClassification
  lastResponseSnippet?: string
  draftContent?: string
  followUpDraftContent?: string
  created_at: string
  updated_at: string
}

export interface Phase {
  number: InvitationPhase
  label: PhaseLabel
  description: string
  timeline: string
  goal: string
  invitees: Invitee[]
}

export interface AutomationEvent {
  id: string
  inviteeId: string
  inviteeName: string
  type:
    | 'response_detected'
    | 'follow_up_generated'
    | 'status_changed'
    | 'dependency_unlocked'
    | 'draft_generated'
  description: string
  timestamp: string
  requiresAction: boolean
  actionLabel?: string
}

export interface DraftRequest {
  inviteeId: string
  inviteeName: string
  organization: string
  panel: string
  leverageScript?: string
  leverageNames?: string[]
  confirmedNames: string[]
  isFollowUp: boolean
  responseContext?: string
}

export interface EmailThread {
  threadId: string
  inviteeId: string
  messages: SequencingEmailMessage[]
}

export interface SequencingEmailMessage {
  id: string
  from: string
  to: string
  subject: string
  snippet: string
  body: string
  date: string
  isInbound: boolean
}
