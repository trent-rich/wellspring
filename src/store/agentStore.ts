// Agent Store - Manages agent jobs, artifacts, and email threads
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type {
  AgentJob,
  AgentArtifact,
  EmailThread,
  Email,
  JobStatus,
  JobType,
} from '../types/agent';

interface AgentState {
  // Jobs
  jobs: AgentJob[];
  jobsLoading: boolean;
  jobsError: string | null;

  // Artifacts
  artifacts: AgentArtifact[];
  artifactsLoading: boolean;

  // Email threads
  emailThreads: EmailThread[];
  emailThreadsLoading: boolean;

  // Selected items
  selectedJobId: string | null;
  selectedThreadId: string | null;

  // Actions - Jobs
  fetchJobs: (filters?: { status?: JobStatus; type?: JobType }) => Promise<void>;
  createJob: (job: Partial<AgentJob>) => Promise<AgentJob | null>;
  subscribeToJobs: () => () => void;

  // Actions - Artifacts
  fetchArtifacts: (jobId?: string) => Promise<void>;
  fetchUnreviewedArtifacts: () => Promise<void>;
  reviewArtifact: (id: string, approved: boolean, notes?: string) => Promise<void>;

  // Actions - Email Threads
  fetchEmailThreads: (filters?: { status?: string }) => Promise<void>;
  fetchEmails: (threadId: string) => Promise<Email[]>;
  updateThreadStatus: (threadId: string, status: string) => Promise<void>;
  subscribeToEmailThreads: () => () => void;

  // Selection
  setSelectedJob: (id: string | null) => void;
  setSelectedThread: (id: string | null) => void;
}

export const useAgentStore = create<AgentState>((set, _get) => ({
  // Initial state
  jobs: [],
  jobsLoading: false,
  jobsError: null,
  artifacts: [],
  artifactsLoading: false,
  emailThreads: [],
  emailThreadsLoading: false,
  selectedJobId: null,
  selectedThreadId: null,

  // Fetch jobs with optional filters
  fetchJobs: async (filters) => {
    set({ jobsLoading: true, jobsError: null });
    try {
      let query = supabase
        .from('agent_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.type) {
        query = query.eq('job_type', filters.type);
      }

      const { data, error } = await query;

      if (error) throw error;
      set({ jobs: data || [], jobsLoading: false });
    } catch (err) {
      console.error('Error fetching jobs:', err);
      set({
        jobsError: err instanceof Error ? err.message : 'Failed to fetch jobs',
        jobsLoading: false,
      });
    }
  },

  // Create a new job
  createJob: async (job) => {
    try {
      const { data, error } = await supabase
        .from('agent_jobs')
        .insert({
          job_type: job.job_type,
          input: job.input,
          priority: job.priority || 50,
          source_email_id: job.source_email_id,
          source_task_id: job.source_task_id,
          metadata: job.metadata,
        })
        .select()
        .single();

      if (error) throw error;

      // Add to local state
      set((state) => ({
        jobs: [data, ...state.jobs],
      }));

      return data;
    } catch (err) {
      console.error('Error creating job:', err);
      return null;
    }
  },

  // Subscribe to job changes
  subscribeToJobs: () => {
    const channel = supabase
      .channel('agent_jobs_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agent_jobs' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            set((state) => ({
              jobs: [payload.new as AgentJob, ...state.jobs],
            }));
          } else if (payload.eventType === 'UPDATE') {
            set((state) => ({
              jobs: state.jobs.map((j) =>
                j.id === payload.new.id ? (payload.new as AgentJob) : j
              ),
            }));
          } else if (payload.eventType === 'DELETE') {
            set((state) => ({
              jobs: state.jobs.filter((j) => j.id !== payload.old.id),
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  // Fetch artifacts
  fetchArtifacts: async (jobId) => {
    set({ artifactsLoading: true });
    try {
      let query = supabase
        .from('agent_artifacts')
        .select('*')
        .order('created_at', { ascending: false });

      if (jobId) {
        query = query.eq('job_id', jobId);
      }

      const { data, error } = await query.limit(50);

      if (error) throw error;
      set({ artifacts: data || [], artifactsLoading: false });
    } catch (err) {
      console.error('Error fetching artifacts:', err);
      set({ artifactsLoading: false });
    }
  },

  // Fetch unreviewed artifacts
  fetchUnreviewedArtifacts: async () => {
    set({ artifactsLoading: true });
    try {
      const { data, error } = await supabase
        .from('agent_artifacts')
        .select('*')
        .is('reviewed_at', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      set({ artifacts: data || [], artifactsLoading: false });
    } catch (err) {
      console.error('Error fetching unreviewed artifacts:', err);
      set({ artifactsLoading: false });
    }
  },

  // Review an artifact
  reviewArtifact: async (id, approved, notes) => {
    try {
      const { error } = await supabase
        .from('agent_artifacts')
        .update({
          approved,
          review_notes: notes,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      // Update local state
      set((state) => ({
        artifacts: state.artifacts.map((a) =>
          a.id === id
            ? {
                ...a,
                approved,
                review_notes: notes,
                reviewed_at: new Date().toISOString(),
              }
            : a
        ),
      }));
    } catch (err) {
      console.error('Error reviewing artifact:', err);
    }
  },

  // Fetch email threads
  fetchEmailThreads: async (filters) => {
    set({ emailThreadsLoading: true });
    try {
      let query = supabase
        .from('email_threads')
        .select('*')
        .order('latest_message_at', { ascending: false })
        .limit(50);

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;

      if (error) throw error;
      set({ emailThreads: data || [], emailThreadsLoading: false });
    } catch (err) {
      console.error('Error fetching email threads:', err);
      set({ emailThreadsLoading: false });
    }
  },

  // Fetch emails in a thread
  fetchEmails: async (threadId) => {
    try {
      const { data, error } = await supabase
        .from('emails')
        .select('*')
        .eq('thread_id', threadId)
        .order('internal_date', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error fetching emails:', err);
      return [];
    }
  },

  // Update thread status
  updateThreadStatus: async (threadId, status) => {
    try {
      const { error } = await supabase
        .from('email_threads')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', threadId);

      if (error) throw error;

      // Update local state
      set((state) => ({
        emailThreads: state.emailThreads.map((t) =>
          t.id === threadId ? { ...t, status: status as EmailThread['status'] } : t
        ),
      }));
    } catch (err) {
      console.error('Error updating thread status:', err);
    }
  },

  // Subscribe to email thread changes
  subscribeToEmailThreads: () => {
    const channel = supabase
      .channel('email_threads_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'email_threads' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            set((state) => ({
              emailThreads: [payload.new as EmailThread, ...state.emailThreads],
            }));
          } else if (payload.eventType === 'UPDATE') {
            set((state) => ({
              emailThreads: state.emailThreads.map((t) =>
                t.id === payload.new.id ? (payload.new as EmailThread) : t
              ),
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  // Selection
  setSelectedJob: (id) => set({ selectedJobId: id }),
  setSelectedThread: (id) => set({ selectedThreadId: id }),
}));
