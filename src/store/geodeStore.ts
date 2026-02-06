import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type {
  GeodeReport,
  GeodeSection,
  GeodeStakeholder,
  GeodeAssignment,
  GeodeDeliverable,
  GeodeNudge,
  GeodeAIDraft,
  GeodeGhostWriterAssignment,
  GeodeState,
  GeodeReportStatus,
  GeodeStakeholderRole,
  GeodeDashboardKPIs,
  GeodeReportSummary,
  GeodeDeadline,
  GeodeOverdueItem,
  CreateGeodeReportInput,
  CreateGeodeSectionInput,
  CreateGeodeAssignmentInput,
  CreateGeodeNudgeInput,
  CreateGeodeAIDraftInput,
  AssignGhostWriterInput,
} from '../types/geode';
import { GEODE_FINAL_DEADLINE } from '../types/geode';

// ============================================
// STATE INTERFACES
// ============================================

interface GeodeFilter {
  state?: GeodeState[];
  status?: GeodeReportStatus[];
  stakeholderRole?: GeodeStakeholderRole[];
  hasBlockers?: boolean;
  isOverdue?: boolean;
  search?: string;
}

interface GeodeStoreState {
  // Data
  reports: GeodeReport[];
  sections: GeodeSection[];
  stakeholders: GeodeStakeholder[];
  assignments: GeodeAssignment[];
  deliverables: GeodeDeliverable[];
  nudges: GeodeNudge[];
  aiDrafts: GeodeAIDraft[];
  ghostWriterAssignments: GeodeGhostWriterAssignment[];

  // UI State
  selectedReport: GeodeReport | null;
  selectedSection: GeodeSection | null;
  isLoading: boolean;
  error: string | null;
  filter: GeodeFilter;

  // Dashboard KPIs
  kpis: GeodeDashboardKPIs | null;

  // ============================================
  // REPORT ACTIONS
  // ============================================
  fetchReports: () => Promise<void>;
  fetchReport: (id: string) => Promise<GeodeReportSummary | null>;
  createReport: (input: CreateGeodeReportInput) => Promise<GeodeReport>;
  updateReport: (id: string, updates: Partial<GeodeReport>) => Promise<void>;
  deleteReport: (id: string) => Promise<void>;
  setSelectedReport: (report: GeodeReport | null) => void;

  // ============================================
  // SECTION ACTIONS
  // ============================================
  fetchSections: (reportId: string) => Promise<void>;
  createSection: (input: CreateGeodeSectionInput) => Promise<GeodeSection>;
  updateSection: (id: string, updates: Partial<GeodeSection>) => Promise<void>;
  deleteSection: (id: string) => Promise<void>;
  setSelectedSection: (section: GeodeSection | null) => void;

  // ============================================
  // STAKEHOLDER ACTIONS
  // ============================================
  fetchStakeholders: () => Promise<void>;
  createStakeholder: (input: Partial<GeodeStakeholder>) => Promise<GeodeStakeholder>;
  updateStakeholder: (id: string, updates: Partial<GeodeStakeholder>) => Promise<void>;
  getStakeholdersByRole: (role: GeodeStakeholderRole) => GeodeStakeholder[];

  // ============================================
  // ASSIGNMENT ACTIONS
  // ============================================
  fetchAssignments: (sectionId?: string) => Promise<void>;
  createAssignment: (input: CreateGeodeAssignmentInput) => Promise<GeodeAssignment>;
  updateAssignment: (id: string, updates: Partial<GeodeAssignment>) => Promise<void>;
  deleteAssignment: (id: string) => Promise<void>;

  // ============================================
  // DELIVERABLE ACTIONS
  // ============================================
  fetchDeliverables: (reportId?: string) => Promise<void>;
  createDeliverable: (input: Partial<GeodeDeliverable>) => Promise<GeodeDeliverable>;
  updateDeliverable: (id: string, updates: Partial<GeodeDeliverable>) => Promise<void>;
  approveDeliverable: (id: string, approverId: string) => Promise<void>;

  // ============================================
  // AI DRAFT WORKFLOW ACTIONS
  // ============================================
  fetchAIDrafts: (reportId?: string) => Promise<void>;
  createAIDraft: (input: CreateGeodeAIDraftInput) => Promise<GeodeAIDraft>;
  sendDraftToMaria: (draftId: string) => Promise<void>;
  assignGhostWriter: (input: AssignGhostWriterInput) => Promise<GeodeGhostWriterAssignment>;
  updateGhostWriterAssignment: (id: string, updates: Partial<GeodeGhostWriterAssignment>) => Promise<void>;

  // ============================================
  // NUDGE ACTIONS
  // ============================================
  fetchNudges: (stakeholderId?: string) => Promise<void>;
  createNudge: (input: CreateGeodeNudgeInput) => Promise<GeodeNudge>;
  sendNudge: (nudgeId: string) => Promise<void>;
  acknowledgeNudge: (nudgeId: string, response?: string) => Promise<void>;
  scheduleAutomatedNudges: (reportId: string) => Promise<void>;

  // ============================================
  // DASHBOARD & ANALYTICS
  // ============================================
  fetchDashboardKPIs: () => Promise<void>;
  getUpcomingDeadlines: (days?: number) => GeodeDeadline[];
  getOverdueItems: () => GeodeOverdueItem[];
  getBlockers: () => string[];

  // ============================================
  // FILTERING & UTILITIES
  // ============================================
  setFilter: (filter: Partial<GeodeFilter>) => void;
  clearFilter: () => void;
  clearError: () => void;
  subscribeToChanges: () => () => void;
}

// ============================================
// DEFAULT VALUES
// ============================================

const defaultFilter: GeodeFilter = {};

const defaultKPIs: GeodeDashboardKPIs = {
  reports_total: 6,
  reports_on_track: 0,
  reports_at_risk: 0,
  reports_behind: 0,
  sections_total: 0,
  sections_complete: 0,
  sections_in_progress: 0,
  sections_not_started: 0,
  deliverables_pending: 0,
  deliverables_overdue: 0,
  payments_pending_amount: 0,
  payments_overdue_amount: 0,
  days_until_deadline: Math.ceil((GEODE_FINAL_DEADLINE.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  stakeholders_active: 0,
  blockers_count: 0,
};

// ============================================
// STORE IMPLEMENTATION
// ============================================

export const useGeodeStore = create<GeodeStoreState>((set, get) => ({
  // Initial state
  reports: [],
  sections: [],
  stakeholders: [],
  assignments: [],
  deliverables: [],
  nudges: [],
  aiDrafts: [],
  ghostWriterAssignments: [],
  selectedReport: null,
  selectedSection: null,
  isLoading: false,
  error: null,
  filter: defaultFilter,
  kpis: defaultKPIs,

  // ============================================
  // REPORT ACTIONS
  // ============================================

  fetchReports: async () => {
    try {
      set({ isLoading: true, error: null });

      const { filter } = get();

      let query = supabase
        .from('geode_reports')
        .select('*')
        .order('created_at', { ascending: true });

      if (filter.state?.length) {
        query = query.in('state', filter.state);
      }

      if (filter.status?.length) {
        query = query.in('status', filter.status);
      }

      if (filter.search) {
        query = query.or(`title.ilike.%${filter.search}%,description.ilike.%${filter.search}%`);
      }

      const { data, error } = await query;

      if (error) throw error;

      set({ reports: data || [], isLoading: false });
    } catch (error) {
      console.error('Fetch GEODE reports error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch reports',
        isLoading: false,
      });
    }
  },

  fetchReport: async (id: string) => {
    try {
      set({ isLoading: true, error: null });

      // Fetch report with all related data
      const { data: report, error: reportError } = await supabase
        .from('geode_reports')
        .select('*')
        .eq('id', id)
        .single();

      if (reportError) throw reportError;

      const { data: sections } = await supabase
        .from('geode_sections')
        .select('*')
        .eq('report_id', id);

      const { data: stakeholders } = await supabase
        .from('geode_stakeholders')
        .select('*');

      // Calculate summary data
      const upcomingDeadlines = get().getUpcomingDeadlines(14);
      const overdueItems = get().getOverdueItems();
      const blockers = sections?.filter(s => s.blockers).map(s => s.blockers!) || [];

      const summary: GeodeReportSummary = {
        report,
        sections: sections || [],
        stakeholders: stakeholders || [],
        upcoming_deadlines: upcomingDeadlines.filter(d => d.report_id === id),
        overdue_items: overdueItems.filter(o => o.report_id === id),
        pending_payments: [], // Would need to join with contracts
        blockers,
      };

      set({ isLoading: false, selectedReport: report });
      return summary;
    } catch (error) {
      console.error('Fetch GEODE report error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch report',
        isLoading: false,
      });
      return null;
    }
  },

  createReport: async (input: CreateGeodeReportInput) => {
    try {
      set({ isLoading: true, error: null });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('geode_reports')
        .insert({
          ...input,
          target_publish_date: input.target_publish_date || '2026-04-30',
          overall_progress_percent: 0,
          sections_complete: 0,
          sections_total: 0,
          total_contract_value: 0,
          amount_paid: 0,
          amount_pending: 0,
          status: 'not_started',
        })
        .select()
        .single();

      if (error) throw error;

      // Log to audit
      await supabase.from('audit_log').insert({
        user_id: user.id,
        action: 'geode_report_created',
        entity_type: 'geode_report',
        entity_id: data.id,
        details: { state: input.state, title: input.title },
      });

      await get().fetchReports();
      set({ isLoading: false });
      return data;
    } catch (error) {
      console.error('Create GEODE report error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to create report',
        isLoading: false,
      });
      throw error;
    }
  },

  updateReport: async (id: string, updates: Partial<GeodeReport>) => {
    try {
      set({ isLoading: true, error: null });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('geode_reports')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      await supabase.from('audit_log').insert({
        user_id: user.id,
        action: 'geode_report_updated',
        entity_type: 'geode_report',
        entity_id: id,
        details: updates,
      });

      await get().fetchReports();

      const { selectedReport } = get();
      if (selectedReport?.id === id) {
        await get().fetchReport(id);
      }

      set({ isLoading: false });
    } catch (error) {
      console.error('Update GEODE report error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to update report',
        isLoading: false,
      });
      throw error;
    }
  },

  deleteReport: async (id: string) => {
    try {
      set({ isLoading: true, error: null });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('geode_reports')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await supabase.from('audit_log').insert({
        user_id: user.id,
        action: 'geode_report_deleted',
        entity_type: 'geode_report',
        entity_id: id,
      });

      await get().fetchReports();

      const { selectedReport } = get();
      if (selectedReport?.id === id) {
        set({ selectedReport: null });
      }

      set({ isLoading: false });
    } catch (error) {
      console.error('Delete GEODE report error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to delete report',
        isLoading: false,
      });
      throw error;
    }
  },

  setSelectedReport: (report: GeodeReport | null) => {
    set({ selectedReport: report });
  },

  // ============================================
  // SECTION ACTIONS
  // ============================================

  fetchSections: async (reportId: string) => {
    try {
      const { data, error } = await supabase
        .from('geode_sections')
        .select('*')
        .eq('report_id', reportId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      set({ sections: data || [] });
    } catch (error) {
      console.error('Fetch sections error:', error);
      set({ error: error instanceof Error ? error.message : 'Failed to fetch sections' });
    }
  },

  createSection: async (input: CreateGeodeSectionInput) => {
    try {
      set({ isLoading: true, error: null });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('geode_sections')
        .insert({
          ...input,
          status: 'not_started',
          progress_percent: 0,
        })
        .select()
        .single();

      if (error) throw error;

      await supabase.from('audit_log').insert({
        user_id: user.id,
        action: 'geode_section_created',
        entity_type: 'geode_section',
        entity_id: data.id,
        details: { report_id: input.report_id, section_type: input.section_type },
      });

      // Update report section count
      const report = get().reports.find(r => r.id === input.report_id);
      if (report) {
        await get().updateReport(input.report_id, {
          sections_total: report.sections_total + 1,
        });
      }

      await get().fetchSections(input.report_id);
      set({ isLoading: false });
      return data;
    } catch (error) {
      console.error('Create section error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to create section',
        isLoading: false,
      });
      throw error;
    }
  },

  updateSection: async (id: string, updates: Partial<GeodeSection>) => {
    try {
      set({ isLoading: true, error: null });

      const { error } = await supabase
        .from('geode_sections')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      const section = get().sections.find(s => s.id === id);
      if (section) {
        await get().fetchSections(section.report_id);
      }

      set({ isLoading: false });
    } catch (error) {
      console.error('Update section error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to update section',
        isLoading: false,
      });
      throw error;
    }
  },

  deleteSection: async (id: string) => {
    try {
      set({ isLoading: true, error: null });

      const section = get().sections.find(s => s.id === id);

      const { error } = await supabase
        .from('geode_sections')
        .delete()
        .eq('id', id);

      if (error) throw error;

      if (section) {
        await get().fetchSections(section.report_id);
      }

      set({ isLoading: false });
    } catch (error) {
      console.error('Delete section error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to delete section',
        isLoading: false,
      });
      throw error;
    }
  },

  setSelectedSection: (section: GeodeSection | null) => {
    set({ selectedSection: section });
  },

  // ============================================
  // STAKEHOLDER ACTIONS
  // ============================================

  fetchStakeholders: async () => {
    try {
      const { data, error } = await supabase
        .from('geode_stakeholders')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;

      set({ stakeholders: data || [] });
    } catch (error) {
      console.error('Fetch stakeholders error:', error);
      set({ error: error instanceof Error ? error.message : 'Failed to fetch stakeholders' });
    }
  },

  createStakeholder: async (input: Partial<GeodeStakeholder>) => {
    try {
      set({ isLoading: true, error: null });

      const { data, error } = await supabase
        .from('geode_stakeholders')
        .insert({
          ...input,
          current_assignments: 0,
          preferred_channel: input.preferred_channel || 'email',
        })
        .select()
        .single();

      if (error) throw error;

      await get().fetchStakeholders();
      set({ isLoading: false });
      return data;
    } catch (error) {
      console.error('Create stakeholder error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to create stakeholder',
        isLoading: false,
      });
      throw error;
    }
  },

  updateStakeholder: async (id: string, updates: Partial<GeodeStakeholder>) => {
    try {
      const { error } = await supabase
        .from('geode_stakeholders')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      await get().fetchStakeholders();
    } catch (error) {
      console.error('Update stakeholder error:', error);
      set({ error: error instanceof Error ? error.message : 'Failed to update stakeholder' });
      throw error;
    }
  },

  getStakeholdersByRole: (role: GeodeStakeholderRole) => {
    return get().stakeholders.filter(s => s.role === role);
  },

  // ============================================
  // ASSIGNMENT ACTIONS
  // ============================================

  fetchAssignments: async (sectionId?: string) => {
    try {
      let query = supabase
        .from('geode_assignments')
        .select('*')
        .order('assigned_at', { ascending: false });

      if (sectionId) {
        query = query.eq('section_id', sectionId);
      }

      const { data, error } = await query;

      if (error) throw error;

      set({ assignments: data || [] });
    } catch (error) {
      console.error('Fetch assignments error:', error);
      set({ error: error instanceof Error ? error.message : 'Failed to fetch assignments' });
    }
  },

  createAssignment: async (input: CreateGeodeAssignmentInput) => {
    try {
      set({ isLoading: true, error: null });

      const { data, error } = await supabase
        .from('geode_assignments')
        .insert({
          ...input,
          status: 'assigned',
          assigned_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      // Update stakeholder assignment count
      const stakeholder = get().stakeholders.find(s => s.id === input.stakeholder_id);
      if (stakeholder) {
        await get().updateStakeholder(input.stakeholder_id, {
          current_assignments: stakeholder.current_assignments + 1,
        });
      }

      await get().fetchAssignments(input.section_id);
      set({ isLoading: false });
      return data;
    } catch (error) {
      console.error('Create assignment error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to create assignment',
        isLoading: false,
      });
      throw error;
    }
  },

  updateAssignment: async (id: string, updates: Partial<GeodeAssignment>) => {
    try {
      const { error } = await supabase
        .from('geode_assignments')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      await get().fetchAssignments();
    } catch (error) {
      console.error('Update assignment error:', error);
      set({ error: error instanceof Error ? error.message : 'Failed to update assignment' });
      throw error;
    }
  },

  deleteAssignment: async (id: string) => {
    try {
      const assignment = get().assignments.find(a => a.id === id);

      const { error } = await supabase
        .from('geode_assignments')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Update stakeholder assignment count
      if (assignment) {
        const stakeholder = get().stakeholders.find(s => s.id === assignment.stakeholder_id);
        if (stakeholder && stakeholder.current_assignments > 0) {
          await get().updateStakeholder(assignment.stakeholder_id, {
            current_assignments: stakeholder.current_assignments - 1,
          });
        }
      }

      await get().fetchAssignments();
    } catch (error) {
      console.error('Delete assignment error:', error);
      set({ error: error instanceof Error ? error.message : 'Failed to delete assignment' });
      throw error;
    }
  },

  // ============================================
  // DELIVERABLE ACTIONS
  // ============================================

  fetchDeliverables: async (reportId?: string) => {
    try {
      let query = supabase
        .from('geode_deliverables')
        .select('*')
        .order('created_at', { ascending: false });

      if (reportId) {
        query = query.eq('report_id', reportId);
      }

      const { data, error } = await query;

      if (error) throw error;

      set({ deliverables: data || [] });
    } catch (error) {
      console.error('Fetch deliverables error:', error);
      set({ error: error instanceof Error ? error.message : 'Failed to fetch deliverables' });
    }
  },

  createDeliverable: async (input: Partial<GeodeDeliverable>) => {
    try {
      set({ isLoading: true, error: null });

      const { data, error } = await supabase
        .from('geode_deliverables')
        .insert({
          ...input,
          status: 'not_started',
          version: 1,
        })
        .select()
        .single();

      if (error) throw error;

      await get().fetchDeliverables(input.report_id);
      set({ isLoading: false });
      return data;
    } catch (error) {
      console.error('Create deliverable error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to create deliverable',
        isLoading: false,
      });
      throw error;
    }
  },

  updateDeliverable: async (id: string, updates: Partial<GeodeDeliverable>) => {
    try {
      const { error } = await supabase
        .from('geode_deliverables')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      await get().fetchDeliverables();
    } catch (error) {
      console.error('Update deliverable error:', error);
      set({ error: error instanceof Error ? error.message : 'Failed to update deliverable' });
      throw error;
    }
  },

  approveDeliverable: async (id: string, approverId: string) => {
    try {
      await get().updateDeliverable(id, {
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by_id: approverId,
      });
    } catch (error) {
      console.error('Approve deliverable error:', error);
      throw error;
    }
  },

  // ============================================
  // AI DRAFT WORKFLOW ACTIONS
  // ============================================

  fetchAIDrafts: async (reportId?: string) => {
    try {
      let query = supabase
        .from('geode_ai_drafts')
        .select('*')
        .order('generated_at', { ascending: false });

      if (reportId) {
        query = query.eq('report_id', reportId);
      }

      const { data, error } = await query;

      if (error) throw error;

      set({ aiDrafts: data || [] });
    } catch (error) {
      console.error('Fetch AI drafts error:', error);
      set({ error: error instanceof Error ? error.message : 'Failed to fetch AI drafts' });
    }
  },

  createAIDraft: async (input: CreateGeodeAIDraftInput) => {
    try {
      set({ isLoading: true, error: null });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('geode_ai_drafts')
        .insert({
          ...input,
          generated_by: 'deep_research_ai',
          generated_at: new Date().toISOString(),
          research_sources: input.research_sources || [],
          status: 'generated',
        })
        .select()
        .single();

      if (error) throw error;

      await supabase.from('audit_log').insert({
        user_id: user.id,
        action: 'geode_ai_draft_created',
        entity_type: 'geode_ai_draft',
        entity_id: data.id,
        details: { section_id: input.section_id, word_count: input.word_count },
      });

      await get().fetchAIDrafts(input.report_id);
      set({ isLoading: false });
      return data;
    } catch (error) {
      console.error('Create AI draft error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to create AI draft',
        isLoading: false,
      });
      throw error;
    }
  },

  sendDraftToMaria: async (draftId: string) => {
    try {
      set({ isLoading: true, error: null });

      // Update draft status
      const { error } = await supabase
        .from('geode_ai_drafts')
        .update({
          sent_to_maria_at: new Date().toISOString(),
          status: 'sent_to_maria',
        })
        .eq('id', draftId);

      if (error) throw error;

      // TODO: Trigger actual notification to Maria via Slack or email
      // This would integrate with the Slack notification service

      await get().fetchAIDrafts();
      set({ isLoading: false });
    } catch (error) {
      console.error('Send draft to Maria error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to send draft to Maria',
        isLoading: false,
      });
      throw error;
    }
  },

  assignGhostWriter: async (input: AssignGhostWriterInput) => {
    try {
      set({ isLoading: true, error: null });

      // Create ghost writer assignment
      const { data, error } = await supabase
        .from('geode_ghost_writer_assignments')
        .insert({
          ai_draft_id: input.ai_draft_id,
          ghost_writer_id: input.ghost_writer_id,
          assigned_by: 'maria',
          assignment_method: input.assignment_method,
          assigned_at: new Date().toISOString(),
          due_date: input.due_date,
          source_email_id: input.source_email_id || null,
          source_slack_message_ts: input.source_slack_message_ts || null,
          revision_count: 0,
          status: 'assigned',
        })
        .select()
        .single();

      if (error) throw error;

      // Update AI draft status
      await supabase
        .from('geode_ai_drafts')
        .update({
          assigned_ghost_writer_id: input.ghost_writer_id,
          assigned_at: new Date().toISOString(),
          assignment_method: input.assignment_method,
          status: 'assigned',
        })
        .eq('id', input.ai_draft_id);

      // Update stakeholder assignment count
      const stakeholder = get().stakeholders.find(s => s.id === input.ghost_writer_id);
      if (stakeholder) {
        await get().updateStakeholder(input.ghost_writer_id, {
          current_assignments: stakeholder.current_assignments + 1,
        });
      }

      await get().fetchAIDrafts();
      set({ isLoading: false });
      return data;
    } catch (error) {
      console.error('Assign ghost writer error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to assign ghost writer',
        isLoading: false,
      });
      throw error;
    }
  },

  updateGhostWriterAssignment: async (id: string, updates: Partial<GeodeGhostWriterAssignment>) => {
    try {
      const { error } = await supabase
        .from('geode_ghost_writer_assignments')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      await get().fetchAIDrafts();
    } catch (error) {
      console.error('Update ghost writer assignment error:', error);
      set({ error: error instanceof Error ? error.message : 'Failed to update assignment' });
      throw error;
    }
  },

  // ============================================
  // NUDGE ACTIONS
  // ============================================

  fetchNudges: async (stakeholderId?: string) => {
    try {
      let query = supabase
        .from('geode_nudges')
        .select('*')
        .order('scheduled_for', { ascending: true });

      if (stakeholderId) {
        query = query.eq('stakeholder_id', stakeholderId);
      }

      const { data, error } = await query;

      if (error) throw error;

      set({ nudges: data || [] });
    } catch (error) {
      console.error('Fetch nudges error:', error);
      set({ error: error instanceof Error ? error.message : 'Failed to fetch nudges' });
    }
  },

  createNudge: async (input: CreateGeodeNudgeInput) => {
    try {
      set({ isLoading: true, error: null });

      const stakeholder = get().stakeholders.find(s => s.id === input.stakeholder_id);

      const { data, error } = await supabase
        .from('geode_nudges')
        .insert({
          ...input,
          channel: input.channel || stakeholder?.preferred_channel || 'email',
          priority: input.priority || 2,
          scheduled_for: input.scheduled_for || new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      await get().fetchNudges();
      set({ isLoading: false });
      return data;
    } catch (error) {
      console.error('Create nudge error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to create nudge',
        isLoading: false,
      });
      throw error;
    }
  },

  sendNudge: async (nudgeId: string) => {
    try {
      const nudge = get().nudges.find(n => n.id === nudgeId);
      if (!nudge) throw new Error('Nudge not found');

      // TODO: Actually send via Slack/email based on channel
      // This will integrate with the Slack service

      const { error } = await supabase
        .from('geode_nudges')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', nudgeId);

      if (error) throw error;

      await get().fetchNudges();
    } catch (error) {
      console.error('Send nudge error:', error);
      set({ error: error instanceof Error ? error.message : 'Failed to send nudge' });
      throw error;
    }
  },

  acknowledgeNudge: async (nudgeId: string, response?: string) => {
    try {
      const { error } = await supabase
        .from('geode_nudges')
        .update({
          acknowledged_at: new Date().toISOString(),
          response: response || null,
        })
        .eq('id', nudgeId);

      if (error) throw error;

      await get().fetchNudges();
    } catch (error) {
      console.error('Acknowledge nudge error:', error);
      set({ error: error instanceof Error ? error.message : 'Failed to acknowledge nudge' });
      throw error;
    }
  },

  scheduleAutomatedNudges: async (reportId: string) => {
    // This would be implemented as part of the deadline monitoring system
    // For now, it's a placeholder for the nudge scheduling logic
    console.log('Schedule automated nudges for report:', reportId);
  },

  // ============================================
  // DASHBOARD & ANALYTICS
  // ============================================

  fetchDashboardKPIs: async () => {
    try {
      const { reports, sections, stakeholders, deliverables } = get();

      // Calculate KPIs
      const now = new Date();
      const daysUntilDeadline = Math.ceil((GEODE_FINAL_DEADLINE.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      const reportsOnTrack = reports.filter(r => {
        const expectedProgress = ((Date.now() - new Date(r.kick_off_date || r.created_at).getTime()) /
          (GEODE_FINAL_DEADLINE.getTime() - new Date(r.kick_off_date || r.created_at).getTime())) * 100;
        return r.overall_progress_percent >= expectedProgress - 10;
      }).length;

      const reportsAtRisk = reports.filter(r => {
        const expectedProgress = ((Date.now() - new Date(r.kick_off_date || r.created_at).getTime()) /
          (GEODE_FINAL_DEADLINE.getTime() - new Date(r.kick_off_date || r.created_at).getTime())) * 100;
        const diff = expectedProgress - r.overall_progress_percent;
        return diff > 10 && diff <= 25;
      }).length;

      const reportsBehind = reports.filter(r => {
        const expectedProgress = ((Date.now() - new Date(r.kick_off_date || r.created_at).getTime()) /
          (GEODE_FINAL_DEADLINE.getTime() - new Date(r.kick_off_date || r.created_at).getTime())) * 100;
        return expectedProgress - r.overall_progress_percent > 25;
      }).length;

      const sectionsComplete = sections.filter(s => s.status === 'published').length;
      const sectionsInProgress = sections.filter(s =>
        ['research', 'drafting', 'internal_review', 'peer_review', 'editing', 'design', 'final_review'].includes(s.status)
      ).length;
      const sectionsNotStarted = sections.filter(s => s.status === 'not_started').length;

      const pendingDeliverables = deliverables.filter(d =>
        ['not_started', 'in_progress', 'submitted', 'in_review'].includes(d.status)
      ).length;

      const overdueDeliverables = deliverables.filter(d => {
        // Would need due_date field to calculate this properly
        return d.status === 'in_progress' && d.submitted_at === null;
      }).length;

      const blockersCount = sections.filter(s => s.blockers).length;

      const kpis: GeodeDashboardKPIs = {
        reports_total: 6,
        reports_on_track: reportsOnTrack,
        reports_at_risk: reportsAtRisk,
        reports_behind: reportsBehind,
        sections_total: sections.length,
        sections_complete: sectionsComplete,
        sections_in_progress: sectionsInProgress,
        sections_not_started: sectionsNotStarted,
        deliverables_pending: pendingDeliverables,
        deliverables_overdue: overdueDeliverables,
        payments_pending_amount: reports.reduce((sum, r) => sum + r.amount_pending, 0),
        payments_overdue_amount: 0, // Would need more data to calculate
        days_until_deadline: daysUntilDeadline,
        stakeholders_active: stakeholders.filter(s => s.current_assignments > 0).length,
        blockers_count: blockersCount,
      };

      set({ kpis });
    } catch (error) {
      console.error('Fetch dashboard KPIs error:', error);
      set({ error: error instanceof Error ? error.message : 'Failed to fetch KPIs' });
    }
  },

  getUpcomingDeadlines: (days = 14): GeodeDeadline[] => {
    const { sections } = get();
    const now = new Date();
    const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const deadlines: GeodeDeadline[] = [];

    sections.forEach(section => {
      const deadlineFields = [
        { field: 'research_deadline', type: 'section' as const },
        { field: 'draft_deadline', type: 'deliverable' as const },
        { field: 'review_deadline', type: 'review' as const },
        { field: 'final_deadline', type: 'section' as const },
      ];

      deadlineFields.forEach(({ field, type }) => {
        const dateStr = section[field as keyof GeodeSection] as string | null;
        if (dateStr) {
          const date = new Date(dateStr);
          if (date >= now && date <= cutoff) {
            deadlines.push({
              id: `${section.id}-${field}`,
              report_id: section.report_id,
              section_id: section.id,
              stakeholder_id: section.content_owner_id,
              stakeholder_name: null, // Would need to join with stakeholders
              title: `${section.title} - ${field.replace('_deadline', '').replace('_', ' ')}`,
              due_date: dateStr,
              days_until: Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
              type,
            });
          }
        }
      });
    });

    return deadlines.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
  },

  getOverdueItems: (): GeodeOverdueItem[] => {
    const { sections, stakeholders } = get();
    const now = new Date();
    const overdueItems: GeodeOverdueItem[] = [];

    // Check section deadlines
    sections.forEach(section => {
      const deadlines = [
        { field: 'research_deadline', status: 'research' },
        { field: 'draft_deadline', status: 'drafting' },
        { field: 'review_deadline', status: 'internal_review' },
        { field: 'final_deadline', status: 'final_review' },
      ];

      deadlines.forEach(({ field }) => {
        const dateStr = section[field as keyof GeodeSection] as string | null;
        if (dateStr) {
          const date = new Date(dateStr);
          // If deadline passed and section hasn't progressed past this stage
          if (date < now && ['not_started', 'research', 'drafting', 'internal_review'].includes(section.status)) {
            const stakeholder = stakeholders.find(s => s.id === section.content_owner_id);
            overdueItems.push({
              id: `${section.id}-${field}`,
              report_id: section.report_id,
              section_id: section.id,
              assignment_id: null,
              stakeholder_id: section.content_owner_id || '',
              stakeholder_name: stakeholder?.name || 'Unassigned',
              title: `${section.title} - ${field.replace('_deadline', '')}`,
              due_date: dateStr,
              days_overdue: Math.ceil((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)),
              type: 'section',
              last_nudge_at: null,
            });
          }
        }
      });
    });

    return overdueItems.sort((a, b) => b.days_overdue - a.days_overdue);
  },

  getBlockers: (): string[] => {
    const { sections } = get();
    return sections
      .filter(s => s.blockers)
      .map(s => `[${s.title}] ${s.blockers}`);
  },

  // ============================================
  // FILTERING & UTILITIES
  // ============================================

  setFilter: (newFilter: Partial<GeodeFilter>) => {
    set({ filter: { ...get().filter, ...newFilter } });
    get().fetchReports();
  },

  clearFilter: () => {
    set({ filter: defaultFilter });
    get().fetchReports();
  },

  clearError: () => set({ error: null }),

  subscribeToChanges: () => {
    const channels = [
      supabase
        .channel('geode-reports-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'geode_reports' }, () => {
          get().fetchReports();
          get().fetchDashboardKPIs();
        })
        .subscribe(),

      supabase
        .channel('geode-sections-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'geode_sections' }, () => {
          const { selectedReport } = get();
          if (selectedReport) {
            get().fetchSections(selectedReport.id);
          }
          get().fetchDashboardKPIs();
        })
        .subscribe(),

      supabase
        .channel('geode-nudges-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'geode_nudges' }, () => {
          get().fetchNudges();
        })
        .subscribe(),
    ];

    return () => {
      channels.forEach(channel => supabase.removeChannel(channel));
    };
  },
}));

// ============================================
// SELECTOR HOOKS
// ============================================

export const useGeodeReportsByState = (state: GeodeState) => {
  const reports = useGeodeStore((s) => s.reports);
  return reports.filter(r => r.state === state);
};

export const useGeodeOverdueCount = () => {
  const getOverdueItems = useGeodeStore((s) => s.getOverdueItems);
  return getOverdueItems().length;
};

export const useGeodeBlockers = () => {
  const getBlockers = useGeodeStore((s) => s.getBlockers);
  return getBlockers();
};

export const useGeodeGhostWriters = () => {
  const getStakeholdersByRole = useGeodeStore((s) => s.getStakeholdersByRole);
  return getStakeholdersByRole('ghost_writer');
};

export const useGeodeContentOwners = () => {
  const getStakeholdersByRole = useGeodeStore((s) => s.getStakeholdersByRole);
  return getStakeholdersByRole('content_owner');
};
