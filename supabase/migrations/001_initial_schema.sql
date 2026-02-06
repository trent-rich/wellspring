-- Watershed Command Center - Initial Schema
-- Based on Watershed_Command_Center_Spec.md v1

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE task_status AS ENUM (
  'pending',
  'in_progress',
  'waiting',
  'completed',
  'snoozed',
  'blocked'
);

CREATE TYPE task_stage AS ENUM (
  'triage',
  'ripening',
  'routed',
  'in_execution',
  'blocked',
  'done'
);

CREATE TYPE task_type AS ENUM (
  'action',
  'email_reply',
  'document_create',
  'meeting_schedule',
  'review',
  'decision',
  'idea_execution',
  'preread'
);

CREATE TYPE task_source AS ENUM (
  'email',
  'slack',
  'monday',
  'idea_tracker',
  'meeting',
  'manual',
  'voice'
);

CREATE TYPE work_mode AS ENUM (
  'ralph',
  'gastown'
);

CREATE TYPE judgment_type AS ENUM (
  'classification',
  'routing',
  'decision',
  'review'
);

CREATE TYPE decision_class AS ENUM (
  'none',
  'cell',
  'cross_cell',
  'hard_gate',
  'exec'
);

CREATE TYPE visibility_level AS ENUM (
  'private',
  'cell',
  'org',
  'public_record'
);

CREATE TYPE message_type AS ENUM (
  'task',
  'handoff',
  'question',
  'decision_request',
  'decision',
  'interrupt',
  'gate_check',
  'ack',
  'note'
);

CREATE TYPE message_source AS ENUM (
  'voice',
  'email',
  'slack',
  'monday',
  'ralph',
  'system'
);

CREATE TYPE actor_type AS ENUM (
  'person',
  'cell',
  'role',
  'agent'
);

CREATE TYPE event_status AS ENUM (
  'confirmed',
  'tentative',
  'cancelled'
);

CREATE TYPE meeting_intent AS ENUM (
  'decision',
  'working',
  'bonding',
  'hybrid',
  'presence_only'
);

CREATE TYPE meeting_modality AS ENUM (
  'seated',
  'standing',
  'walking',
  'on_site',
  'hybrid'
);

CREATE TYPE artifact_status AS ENUM (
  'none',
  'pending',
  'ready',
  'failed'
);

CREATE TYPE artifact_type AS ENUM (
  'doc',
  'slides',
  'pdf',
  'other'
);

CREATE TYPE user_state AS ENUM (
  'normal',
  'meeting_mode',
  'embodied',
  'settle',
  'focus'
);

CREATE TYPE retention_policy AS ENUM (
  'summary_only',
  'summary_plus_actions',
  'full_transcript'
);

CREATE TYPE cannot_prepare_reason AS ENUM (
  'insufficient_time',
  'unclear',
  'wrong_attendee',
  'conflict',
  'emergency',
  'other'
);

CREATE TYPE sensitivity_level AS ENUM (
  'normal',
  'restricted'
);

-- ============================================
-- USERS TABLE (extends Supabase auth.users)
-- ============================================

CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  cell_affiliation TEXT,
  role TEXT DEFAULT 'collaborator',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ACTORS TABLE (GasTown backbone)
-- ============================================

CREATE TABLE actors (
  actor_id TEXT PRIMARY KEY,
  actor_type actor_type NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  authority_scope TEXT,
  default_visibility visibility_level DEFAULT 'cell',
  routing_rules JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TASKS TABLE (central unified task table)
-- ============================================

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  short_id TEXT UNIQUE,
  slug TEXT,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status task_status DEFAULT 'pending',
  stage task_stage DEFAULT 'triage',
  task_type task_type DEFAULT 'action',
  source task_source DEFAULT 'manual',
  source_id TEXT,
  priority INT DEFAULT 50 CHECK (priority >= 0 AND priority <= 100),
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  idea_id UUID,
  cell_affiliation TEXT,
  work_mode work_mode DEFAULT 'ralph',
  canonical_thread_id TEXT,
  judgment_required BOOLEAN DEFAULT FALSE,
  judgment_type judgment_type,
  decision_class decision_class DEFAULT 'none',
  escalation_level INT DEFAULT 0,
  visibility visibility_level DEFAULT 'cell',
  sla_due_at TIMESTAMPTZ,
  embodied_protected BOOLEAN DEFAULT FALSE,
  cooling_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function to generate short_id
CREATE OR REPLACE FUNCTION generate_task_short_id()
RETURNS TRIGGER AS $$
DECLARE
  next_num INT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(short_id FROM 3) AS INT)), 0) + 1
  INTO next_num
  FROM tasks
  WHERE short_id LIKE 'T-%';

  NEW.short_id := 'T-' || LPAD(next_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_task_short_id
BEFORE INSERT ON tasks
FOR EACH ROW
WHEN (NEW.short_id IS NULL)
EXECUTE FUNCTION generate_task_short_id();

-- ============================================
-- MESSAGES TABLE (GasTown backbone)
-- ============================================

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id TEXT NOT NULL,
  from_actor TEXT NOT NULL REFERENCES actors(actor_id),
  to_actor TEXT NOT NULL REFERENCES actors(actor_id),
  message_type message_type NOT NULL,
  body TEXT,
  source message_source DEFAULT 'system',
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- IDEAS TABLE (from idea tracker, extended)
-- ============================================

CREATE TABLE ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  concept_tags TEXT[],
  status TEXT DEFAULT 'active',
  archived BOOLEAN DEFAULT FALSE,
  notes TEXT,
  routing_destination TEXT[],
  routed_to_spv TEXT[],
  applies_to_spv TEXT[],
  source_spv TEXT,
  attributed_to TEXT,
  containment_override BOOLEAN DEFAULT FALSE,
  containment_rule TEXT,
  execution_blocked_until TIMESTAMPTZ,
  ripeness_score INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function to set 72-hour execution block
CREATE OR REPLACE FUNCTION set_idea_execution_block()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.execution_blocked_until IS NULL AND NEW.containment_override = FALSE THEN
    NEW.execution_blocked_until := NEW.created_at + INTERVAL '72 hours';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER idea_execution_block
BEFORE INSERT ON ideas
FOR EACH ROW
EXECUTE FUNCTION set_idea_execution_block();

-- ============================================
-- CALENDAR EVENTS TABLE
-- ============================================

CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  gcal_event_id TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  location TEXT,
  meet_link TEXT,
  is_all_day BOOLEAN DEFAULT FALSE,
  status event_status DEFAULT 'confirmed',
  intent meeting_intent DEFAULT 'working',
  modality meeting_modality DEFAULT 'seated',
  embodied_flag BOOLEAN DEFAULT FALSE,
  preread_required BOOLEAN DEFAULT FALSE,
  preread_deadline_minutes INT,
  settle_buffer_minutes INT DEFAULT 30,
  attendees JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MEETINGS TABLE
-- ============================================

CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
  meet_space_id TEXT,
  host_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  opt_in BOOLEAN DEFAULT FALSE,
  artifact_status artifact_status DEFAULT 'none',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MEETING PREREADS TABLE
-- ============================================

CREATE TABLE meeting_prereads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
  artifact_uri TEXT NOT NULL,
  artifact_title TEXT,
  artifact_type artifact_type DEFAULT 'doc',
  version_hash TEXT,
  required BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MEETING PREREAD ACKNOWLEDGMENTS
-- ============================================

CREATE TABLE meeting_preread_ack (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ,
  cannot_prepare BOOLEAN DEFAULT FALSE,
  cannot_prepare_reason cannot_prepare_reason,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(meeting_id, user_id)
);

-- ============================================
-- MEETING OUTPUTS TABLE
-- ============================================

CREATE TABLE meeting_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID UNIQUE REFERENCES meetings(id) ON DELETE CASCADE,
  summary TEXT,
  decisions JSONB,
  action_items JSONB,
  new_ideas JSONB,
  sensitivity sensitivity_level DEFAULT 'normal',
  organizer_approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- USER STATES TABLE (embodiment tracking)
-- ============================================

CREATE TABLE user_states (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state user_state DEFAULT 'normal',
  state_until TIMESTAMPTZ,
  current_event_id UUID REFERENCES calendar_events(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INTERRUPT POLICIES TABLE
-- ============================================

CREATE TABLE interrupt_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  meeting_interrupt_minutes INT DEFAULT 5,
  auto_enter_meeting_mode BOOLEAN DEFAULT TRUE,
  suppress_interrupts_in_focus BOOLEAN DEFAULT TRUE,
  embodied_default_settle_minutes INT DEFAULT 30,
  allow_meeting_monitoring BOOLEAN DEFAULT FALSE,
  allow_auto_meeting_ingest_hosted BOOLEAN DEFAULT FALSE,
  allow_auto_meeting_ingest_internal_only BOOLEAN DEFAULT FALSE,
  retention_policy retention_policy DEFAULT 'summary_plus_actions',
  judgment_request_budget INT DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TASK DELEGATIONS TABLE
-- ============================================

CREATE TABLE task_delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  from_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  to_actor TEXT REFERENCES actors(actor_id),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ESCALATIONS TABLE
-- ============================================

CREATE TABLE escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  thread_id TEXT,
  from_level INT DEFAULT 0,
  to_level INT DEFAULT 1,
  reason TEXT,
  escalated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Escalation rate limiting function
CREATE OR REPLACE FUNCTION check_escalation_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  recent_count INT;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM escalations
  WHERE thread_id = NEW.thread_id
    AND created_at > NOW() - INTERVAL '4 hours';

  IF recent_count > 0 THEN
    RAISE EXCEPTION 'Escalation rate limit exceeded. Only one escalation per thread per 4 hours allowed.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER escalation_rate_limit
BEFORE INSERT ON escalations
FOR EACH ROW
EXECUTE FUNCTION check_escalation_rate_limit();

-- ============================================
-- NOTIFICATION QUEUE TABLE (for batching)
-- ============================================

CREATE TABLE notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  priority INT DEFAULT 50,
  urgent BOOLEAN DEFAULT FALSE,
  scheduled_for TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AUDIT LOG TABLE
-- ============================================

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  thread_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_owner_id ON tasks(owner_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_stage ON tasks(stage);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_priority ON tasks(priority DESC);
CREATE INDEX idx_tasks_thread_id ON tasks(canonical_thread_id);
CREATE INDEX idx_tasks_short_id ON tasks(short_id);

CREATE INDEX idx_messages_thread_id ON messages(thread_id);
CREATE INDEX idx_messages_to_actor ON messages(to_actor);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);

CREATE INDEX idx_calendar_events_user_id ON calendar_events(user_id);
CREATE INDEX idx_calendar_events_start_time ON calendar_events(start_time);
CREATE INDEX idx_calendar_events_gcal_id ON calendar_events(gcal_event_id);

CREATE INDEX idx_ideas_user_id ON ideas(user_id);
CREATE INDEX idx_ideas_execution_blocked ON ideas(execution_blocked_until);

CREATE INDEX idx_notification_queue_user ON notification_queue(user_id, scheduled_for);
CREATE INDEX idx_notification_queue_unsent ON notification_queue(sent_at) WHERE sent_at IS NULL;

CREATE INDEX idx_audit_log_user ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_prereads ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_preread_ack ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE interrupt_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Users can see their own data
CREATE POLICY users_own ON users FOR ALL USING (auth.uid() = id);

-- Tasks: users can see tasks assigned to them or owned by them
CREATE POLICY tasks_access ON tasks FOR ALL USING (
  auth.uid() = assigned_to OR
  auth.uid() = owner_id OR
  visibility IN ('org', 'public_record')
);

-- Messages: users can see messages to their person actor or org-wide
CREATE POLICY messages_access ON messages FOR SELECT USING (
  to_actor = 'person_' || auth.uid()::TEXT OR
  to_actor IN (SELECT cell_affiliation FROM users WHERE id = auth.uid()) OR
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Ideas: users can see their own ideas
CREATE POLICY ideas_own ON ideas FOR ALL USING (auth.uid() = user_id);

-- Calendar events: users can see their own events
CREATE POLICY calendar_own ON calendar_events FOR ALL USING (auth.uid() = user_id);

-- Meetings: based on calendar event ownership
CREATE POLICY meetings_access ON meetings FOR ALL USING (
  EXISTS (
    SELECT 1 FROM calendar_events
    WHERE calendar_events.id = meetings.calendar_event_id
    AND calendar_events.user_id = auth.uid()
  ) OR host_user_id = auth.uid()
);

-- User states: own only
CREATE POLICY user_states_own ON user_states FOR ALL USING (auth.uid() = user_id);

-- Interrupt policies: own only
CREATE POLICY interrupt_policies_own ON interrupt_policies FOR ALL USING (auth.uid() = user_id);

-- Notifications: own only
CREATE POLICY notifications_own ON notification_queue FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- REALTIME SUBSCRIPTIONS
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE user_states;
ALTER PUBLICATION supabase_realtime ADD TABLE notification_queue;

-- ============================================
-- FUNCTIONS FOR BUSINESS LOGIC
-- ============================================

-- Check if idea can be executed (72-hour throttle)
CREATE OR REPLACE FUNCTION can_execute_idea(idea_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  blocked_until TIMESTAMPTZ;
  has_override BOOLEAN;
BEGIN
  SELECT execution_blocked_until, containment_override
  INTO blocked_until, has_override
  FROM ideas
  WHERE id = idea_uuid;

  IF has_override THEN
    RETURN TRUE;
  END IF;

  RETURN blocked_until IS NULL OR blocked_until <= NOW();
END;
$$ LANGUAGE plpgsql;

-- Get user's current state with automatic transition
CREATE OR REPLACE FUNCTION get_user_state(user_uuid UUID)
RETURNS TABLE(state user_state, state_until TIMESTAMPTZ, is_protected BOOLEAN) AS $$
DECLARE
  current_state user_state;
  until_time TIMESTAMPTZ;
BEGIN
  SELECT us.state, us.state_until INTO current_state, until_time
  FROM user_states us
  WHERE us.user_id = user_uuid;

  -- Auto-transition if state has expired
  IF until_time IS NOT NULL AND until_time <= NOW() THEN
    UPDATE user_states
    SET state = 'normal', state_until = NULL, updated_at = NOW()
    WHERE user_id = user_uuid;
    current_state := 'normal';
    until_time := NULL;
  END IF;

  RETURN QUERY SELECT
    COALESCE(current_state, 'normal'::user_state),
    until_time,
    current_state IN ('embodied', 'settle', 'focus');
END;
$$ LANGUAGE plpgsql;

-- Batch notifications (to be called by scheduled job)
CREATE OR REPLACE FUNCTION get_batched_notifications(user_uuid UUID)
RETURNS TABLE(notifications JSONB) AS $$
BEGIN
  RETURN QUERY
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'type', notification_type,
      'title', title,
      'body', body,
      'task_id', task_id,
      'priority', priority
    ) ORDER BY priority DESC, created_at
  )
  FROM notification_queue
  WHERE user_id = user_uuid
    AND sent_at IS NULL
    AND (urgent = FALSE OR scheduled_for <= NOW())
    AND scheduled_for <= NOW();
END;
$$ LANGUAGE plpgsql;
