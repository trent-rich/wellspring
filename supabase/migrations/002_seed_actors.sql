-- Watershed Command Center - Seed Watershed Actors
-- Based on organizational structure from spec

-- ============================================
-- SEED WATERSHED ACTORS
-- ============================================

INSERT INTO actors (actor_id, actor_type, display_name, description, authority_scope, default_visibility, routing_rules) VALUES

-- Cells (primary organizational units)
('cell_1', 'cell', 'Cell 1 - Thermal Commons',
 'Thermal commons definition, resource allocation, commons governance',
 'thermal_commons',
 'cell',
 '{"keywords": ["thermal", "commons", "heat", "cooling", "resource", "allocation"], "intents": ["resource_definition", "commons_governance"]}'
),

('cell_2', 'cell', 'Cell 2 - Political/Jurisdictional',
 'Political engagement, jurisdictional matters, municipal relations, regulatory affairs',
 'political_jurisdictional',
 'cell',
 '{"keywords": ["political", "jurisdiction", "municipal", "regulatory", "government", "policy", "permit"], "intents": ["government_relations", "regulatory_compliance"]}'
),

('cell_3', 'cell', 'Cell 3 - Engineering',
 'Engineering permanence, safety, operations, technical infrastructure',
 'engineering_ops',
 'cell',
 '{"keywords": ["engineering", "technical", "safety", "operations", "infrastructure", "build", "construct"], "intents": ["engineering_decision", "safety_review", "operations"]}'
),

('cell_4', 'cell', 'Cell 4 - Narrative/Cultural',
 'Narrative development, cultural signal, communications, brand, public presence',
 'narrative_cultural',
 'cell',
 '{"keywords": ["narrative", "story", "culture", "brand", "communication", "press", "media", "public"], "intents": ["communications", "cultural_signal", "public_narrative"]}'
),

('cell_5', 'cell', 'Cell 5 - Legal/Ethical',
 'Legal compliance, ethical boundaries, containment enforcement, hard gate decisions',
 'legal_ethical',
 'cell',
 '{"keywords": ["legal", "ethical", "compliance", "boundary", "containment", "contract", "liability"], "intents": ["legal_review", "ethical_boundary", "hard_gate"]}'
),

-- Key Roles
('cos', 'role', 'Chief of Staff',
 'Cross-cell coordination, meeting management, operational rhythm, pre-read enforcement',
 'cross_cell',
 'org',
 '{"keywords": ["coordination", "meeting", "schedule", "preread", "rhythm"], "intents": ["coordination", "scheduling", "preread_enforcement"]}'
),

('head_of_watershed', 'role', 'Head of Watershed',
 'Ultimate authority, escalation endpoint, strategic decisions',
 'all',
 'org',
 '{"keywords": ["strategic", "final", "ultimate", "escalation"], "intents": ["final_decision", "strategic_direction"]}'
),

('reality_check', 'role', 'Reality Check',
 'Interrupt authority, cross-cell intervention, SLA enforcement, truth-telling function',
 'interrupt',
 'org',
 '{"keywords": ["reality", "check", "interrupt", "intervention", "truth"], "intents": ["interrupt", "reality_check", "truth_telling"]}'
),

('legal_ethics_boundary_manager', 'role', 'Legal/Ethics Boundary Manager',
 'Hard gate enforcement, Cell 5 liaison, legal/ethical final review',
 'hard_gate',
 'org',
 '{"keywords": ["boundary", "gate", "legal", "ethics"], "intents": ["hard_gate_review", "boundary_enforcement"]}'
),

-- Cross-SPV Actors (interfaces to sister companies)
('andolyn_interface', 'agent', 'Andolyn Interface',
 'Interface to Andolyn SPV for idea routing and project coordination',
 'cross_spv',
 'org',
 '{"keywords": ["andolyn", "project", "site"], "intents": ["cross_spv_routing"]}'
),

('slipstream_interface', 'agent', 'Slipstream Interface',
 'Interface to Slipstream SPV for idea routing and operational coordination',
 'cross_spv',
 'org',
 '{"keywords": ["slipstream", "operations"], "intents": ["cross_spv_routing"]}'
),

-- System Actors
('ralph', 'agent', 'Ralph',
 'Personal cognition layer - generates candidate tasks, judgment requests, ripened ideas',
 'personal',
 'private',
 '{"intents": ["candidate_generation", "judgment_request", "idea_ripening"]}'
),

('gastown', 'agent', 'GasTown',
 'Organizational message bus - routing, handoffs, escalations, gate checks',
 'organizational',
 'org',
 '{"intents": ["routing", "handoff", "escalation", "gate_check"]}'
),

('system', 'agent', 'System',
 'Automated system operations - notifications, scheduled jobs, monitoring',
 'system',
 'org',
 '{"intents": ["notification", "scheduled_job", "monitoring"]}'
);

-- ============================================
-- DEFAULT ROUTING RULES
-- ============================================

-- Create a routing_rules table for more complex routing logic
CREATE TABLE IF NOT EXISTS routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  priority INT DEFAULT 50,
  conditions JSONB NOT NULL,
  target_actor TEXT REFERENCES actors(actor_id),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO routing_rules (name, description, priority, conditions, target_actor) VALUES
('thermal_commons_keywords', 'Route thermal/commons related items to Cell 1', 80,
 '{"keywords": ["thermal", "commons", "heat pump", "cooling", "district energy", "resource sharing"]}',
 'cell_1'),

('political_keywords', 'Route political/jurisdictional items to Cell 2', 80,
 '{"keywords": ["municipal", "city council", "permit", "regulatory", "government", "jurisdiction", "political"]}',
 'cell_2'),

('engineering_keywords', 'Route engineering/safety items to Cell 3', 80,
 '{"keywords": ["engineering", "safety", "construction", "infrastructure", "technical spec", "operations"]}',
 'cell_3'),

('narrative_keywords', 'Route narrative/cultural items to Cell 4', 80,
 '{"keywords": ["narrative", "story", "press", "media", "brand", "communication", "public statement"]}',
 'cell_4'),

('legal_keywords', 'Route legal/ethical items to Cell 5', 90,
 '{"keywords": ["legal", "contract", "liability", "compliance", "ethics", "boundary"]}',
 'cell_5'),

('hard_gate_trigger', 'Escalate hard gate decisions to boundary manager', 100,
 '{"decision_class": "hard_gate"}',
 'legal_ethics_boundary_manager'),

('sla_breach_escalation', 'Escalate SLA breaches to Reality Check', 95,
 '{"sla_breached": true}',
 'reality_check'),

('final_escalation', 'Final escalation to Head of Watershed', 100,
 '{"escalation_level": 3}',
 'head_of_watershed');
