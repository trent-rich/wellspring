// Watershed Command Center - Type Definitions
// Based on Supabase schema from spec

// ============================================
// ENUMS
// ============================================

export type TaskStatus = 'pending' | 'in_progress' | 'waiting' | 'completed' | 'snoozed' | 'blocked';

export type TaskStage = 'triage' | 'ripening' | 'routed' | 'in_execution' | 'blocked' | 'done';

export type TaskType =
  | 'action'
  | 'email_reply'
  | 'document_create'
  | 'meeting_schedule'
  | 'review'
  | 'decision'
  | 'idea_execution'
  | 'preread';

export type TaskSource = 'email' | 'slack' | 'monday' | 'idea_tracker' | 'meeting' | 'manual' | 'voice';

export type WorkMode = 'ralph' | 'gastown';

export type JudgmentType = 'classification' | 'routing' | 'decision' | 'review';

export type DecisionClass = 'none' | 'cell' | 'cross_cell' | 'hard_gate' | 'exec';

export type VisibilityLevel = 'private' | 'cell' | 'org' | 'public_record';

export type MessageType =
  | 'task'
  | 'handoff'
  | 'question'
  | 'decision_request'
  | 'decision'
  | 'interrupt'
  | 'gate_check'
  | 'ack'
  | 'note';

export type MessageSource = 'voice' | 'email' | 'slack' | 'monday' | 'ralph' | 'system';

export type ActorType = 'person' | 'cell' | 'role' | 'agent';

export type EventStatus = 'confirmed' | 'tentative' | 'cancelled';

export type MeetingIntent = 'decision' | 'working' | 'bonding' | 'hybrid' | 'presence_only';

export type MeetingModality = 'seated' | 'standing' | 'walking' | 'on_site' | 'hybrid';

export type ArtifactStatus = 'none' | 'pending' | 'ready' | 'failed';

export type ArtifactType = 'doc' | 'slides' | 'pdf' | 'other';

export type UserState = 'normal' | 'meeting_mode' | 'embodied' | 'settle' | 'focus';

export type RetentionPolicy = 'summary_only' | 'summary_plus_actions' | 'full_transcript';

export type CannotPrepareReason =
  | 'insufficient_time'
  | 'unclear'
  | 'wrong_attendee'
  | 'conflict'
  | 'emergency'
  | 'other';

export type SensitivityLevel = 'normal' | 'restricted';

// ============================================
// DATABASE ENTITIES
// ============================================

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  cell_affiliation: string | null;
  role: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Actor {
  actor_id: string;
  actor_type: ActorType;
  display_name: string;
  description: string | null;
  authority_scope: string | null;
  default_visibility: VisibilityLevel;
  routing_rules: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  short_id: string;
  slug: string | null;
  owner_id: string | null;
  assigned_to: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  stage: TaskStage;
  task_type: TaskType;
  source: TaskSource;
  source_id: string | null;
  priority: number;
  due_date: string | null;
  completed_at: string | null;
  idea_id: string | null;
  cell_affiliation: string | null;
  work_mode: WorkMode;
  canonical_thread_id: string | null;
  judgment_required: boolean;
  judgment_type: JudgmentType | null;
  decision_class: DecisionClass;
  escalation_level: number;
  visibility: VisibilityLevel;
  sla_due_at: string | null;
  embodied_protected: boolean;
  cooling_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  thread_id: string;
  from_actor: string;
  to_actor: string;
  message_type: MessageType;
  body: string | null;
  source: MessageSource;
  task_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Idea {
  id: string;
  user_id: string;
  title: string;
  content: string | null;
  concept_tags: string[] | null;
  status: string;
  archived: boolean;
  notes: string | null;
  routing_destination: string[] | null;
  routed_to_spv: string[] | null;
  applies_to_spv: string[] | null;
  source_spv: string | null;
  attributed_to: string | null;
  containment_override: boolean;
  containment_rule: string | null;
  execution_blocked_until: string | null;
  ripeness_score: number;
  created_at: string;
  updated_at: string;
}

export interface CalendarEvent {
  id: string;
  user_id: string;
  gcal_event_id: string | null;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  location: string | null;
  meet_link: string | null;
  is_all_day: boolean;
  status: EventStatus;
  intent: MeetingIntent;
  modality: MeetingModality;
  embodied_flag: boolean;
  preread_required: boolean;
  preread_deadline_minutes: number | null;
  settle_buffer_minutes: number;
  attendees: Attendee[] | null;
  created_at: string;
  updated_at: string;
}

export interface Attendee {
  email: string;
  name?: string;
  response_status?: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  organizer?: boolean;
}

export interface Meeting {
  id: string;
  calendar_event_id: string;
  meet_space_id: string | null;
  host_user_id: string | null;
  opt_in: boolean;
  artifact_status: ArtifactStatus;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeetingPreread {
  id: string;
  meeting_id: string;
  artifact_uri: string;
  artifact_title: string | null;
  artifact_type: ArtifactType;
  version_hash: string | null;
  required: boolean;
  created_at: string;
}

export interface MeetingPrereadAck {
  id: string;
  meeting_id: string;
  user_id: string;
  acknowledged_at: string | null;
  cannot_prepare: boolean;
  cannot_prepare_reason: CannotPrepareReason | null;
  notes: string | null;
  created_at: string;
}

export interface MeetingOutput {
  id: string;
  meeting_id: string;
  summary: string | null;
  decisions: Decision[] | null;
  action_items: ActionItem[] | null;
  new_ideas: NewIdea[] | null;
  sensitivity: SensitivityLevel;
  organizer_approved: boolean;
  created_at: string;
  updated_at: string;
}

export interface Decision {
  text: string;
  made_by?: string;
  timestamp?: string;
}

export interface ActionItem {
  text: string;
  owner_suggested: string | null;
  due_suggested: string | null;
  confidence: number;
}

export interface NewIdea {
  text: string;
  suggested_tags?: string[];
  source_context?: string;
}

export interface UserStateRecord {
  user_id: string;
  state: UserState;
  state_until: string | null;
  current_event_id: string | null;
  updated_at: string;
}

export interface InterruptPolicy {
  id: string;
  user_id: string;
  meeting_interrupt_minutes: number;
  auto_enter_meeting_mode: boolean;
  suppress_interrupts_in_focus: boolean;
  embodied_default_settle_minutes: number;
  allow_meeting_monitoring: boolean;
  allow_auto_meeting_ingest_hosted: boolean;
  allow_auto_meeting_ingest_internal_only: boolean;
  retention_policy: RetentionPolicy;
  judgment_request_budget: number;
  created_at: string;
  updated_at: string;
}

export interface TaskDelegation {
  id: string;
  task_id: string;
  from_user_id: string | null;
  to_user_id: string | null;
  to_actor: string | null;
  reason: string | null;
  created_at: string;
}

export interface Escalation {
  id: string;
  task_id: string;
  thread_id: string | null;
  from_level: number;
  to_level: number;
  reason: string | null;
  escalated_by: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  notification_type: string;
  title: string;
  body: string | null;
  task_id: string | null;
  priority: number;
  urgent: boolean;
  scheduled_for: string;
  sent_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  thread_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface RoutingRule {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  conditions: Record<string, unknown>;
  target_actor: string;
  is_active: boolean;
  created_at: string;
}

// ============================================
// UI STATE TYPES
// ============================================

export interface TaskWithRelations extends Task {
  owner?: User;
  assignee?: User;
  idea?: Idea;
  messages?: Message[];
}

export interface CalendarEventWithMeeting extends CalendarEvent {
  meeting?: Meeting;
  prereads?: MeetingPreread[];
  preread_acks?: MeetingPrereadAck[];
}

export interface KPIData {
  open_tasks: number;
  due_today: number;
  completed_this_week: number;
  judgment_queue_size: number;
  judgment_median_age_hours: number;
  hard_gate_items_open: number;
  escalations_by_level: Record<number, number>;
  reality_check_breaches: number;
}

export interface VoiceCommand {
  intent: VoiceIntent;
  parameters: Record<string, string | number | boolean>;
  raw_transcript: string;
  confidence: number;
}

export type VoiceIntent =
  | 'open_task'
  | 'complete_task'
  | 'snooze_task'
  | 'assign_task'
  | 'create_task'
  | 'execute_geode'
  | 'whats_next'
  | 'join_meeting'
  | 'start_focus'
  | 'end_focus'
  | 'search'
  | 'navigate'
  | 'unknown';

export interface CommandPaletteAction {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  shortcut?: string;
  action: () => void | Promise<void>;
  category?: string;
}

// ============================================
// FORM/INPUT TYPES
// ============================================

export interface CreateTaskInput {
  title: string;
  description?: string;
  task_type?: TaskType;
  source?: TaskSource;
  priority?: number;
  due_date?: string;
  assigned_to?: string;
  cell_affiliation?: string;
  work_mode?: WorkMode;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  stage?: TaskStage;
  priority?: number;
  due_date?: string;
  assigned_to?: string;
  judgment_required?: boolean;
  judgment_type?: JudgmentType;
  decision_class?: DecisionClass;
  escalation_level?: number;
}

export interface CreateIdeaInput {
  title: string;
  content?: string;
  concept_tags?: string[];
  source_spv?: string;
  containment_override?: boolean;
}

export interface CreateMessageInput {
  thread_id: string;
  to_actor: string;
  message_type: MessageType;
  body?: string;
  task_id?: string;
  metadata?: Record<string, unknown>;
}

// ============================================
// POLICY/CONFIG TYPES
// ============================================

export interface ThrottleConfig {
  idea_execution_hours: number;
  meeting_cooling_minutes: number;
  external_commitment_delay_minutes: number;
  escalation_backoff_hours: number;
  notification_batch_interval_minutes: number;
  judgment_request_budget: number;
  decision_freeze_hours: number;
}

export const DEFAULT_THROTTLE_CONFIG: ThrottleConfig = {
  idea_execution_hours: 72,
  meeting_cooling_minutes: 45,
  external_commitment_delay_minutes: 10,
  escalation_backoff_hours: 4,
  notification_batch_interval_minutes: 60,
  judgment_request_budget: 5,
  decision_freeze_hours: 2,
};

export interface EmbodiedConfig {
  default_settle_minutes: number;
  preread_deadline_decision_minutes: number;
  preread_deadline_working_minutes: number;
  meeting_interrupt_lead_minutes: number;
}

export const DEFAULT_EMBODIED_CONFIG: EmbodiedConfig = {
  default_settle_minutes: 30,
  preread_deadline_decision_minutes: 15,
  preread_deadline_working_minutes: 30,
  meeting_interrupt_lead_minutes: 5,
};
