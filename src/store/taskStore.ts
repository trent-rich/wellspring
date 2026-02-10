import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type {
  Task,
  TaskWithRelations,
  CreateTaskInput,
  UpdateTaskInput,
  TaskStatus,
  TaskStage,
} from '../types';
import { generateSlug } from '../lib/utils';

interface TaskState {
  tasks: TaskWithRelations[];
  selectedTask: TaskWithRelations | null;
  isLoading: boolean;
  error: string | null;
  filter: TaskFilter;

  // Actions
  fetchTasks: () => Promise<void>;
  fetchTask: (id: string) => Promise<TaskWithRelations | null>;
  fetchTaskByShortId: (shortId: string) => Promise<TaskWithRelations | null>;
  createTask: (input: CreateTaskInput) => Promise<Task>;
  updateTask: (id: string, updates: UpdateTaskInput) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  completeTask: (id: string) => Promise<void>;
  snoozeTask: (id: string, until: Date) => Promise<void>;
  assignTask: (id: string, userId: string) => Promise<void>;
  delegateTask: (id: string, toActorId: string, reason?: string) => Promise<void>;
  escalateTask: (id: string, reason?: string) => Promise<void>;
  setSelectedTask: (task: TaskWithRelations | null) => void;
  setFilter: (filter: Partial<TaskFilter>) => void;
  subscribeToTasks: () => () => void;
  clearError: () => void;
}

interface TaskFilter {
  status?: TaskStatus[];
  stage?: TaskStage[];
  assignedToMe: boolean;
  ownedByMe: boolean;
  workMode?: 'ralph' | 'gastown';
  judgmentRequired?: boolean;
  cellAffiliation?: string;
  search?: string;
}

const defaultFilter: TaskFilter = {
  assignedToMe: true,
  ownedByMe: true,
};

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  selectedTask: null,
  isLoading: false,
  error: null,
  filter: defaultFilter,

  fetchTasks: async () => {
    try {
      set({ isLoading: true, error: null });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { filter } = get();

      let query = supabase
        .from('tasks')
        .select(`
          *,
          owner:users!tasks_owner_id_fkey(*),
          assignee:users!tasks_assigned_to_fkey(*)
        `)
        .order('priority', { ascending: false })
        .order('sla_due_at', { ascending: true, nullsFirst: false })
        .order('due_date', { ascending: true, nullsFirst: false });

      // Apply filters
      if (filter.status?.length) {
        query = query.in('status', filter.status);
      } else {
        // Default: exclude completed tasks
        query = query.neq('status', 'completed');
      }

      if (filter.stage?.length) {
        query = query.in('stage', filter.stage);
      }

      if (filter.assignedToMe && filter.ownedByMe) {
        query = query.or(`assigned_to.eq.${user.id},owner_id.eq.${user.id}`);
      } else if (filter.assignedToMe) {
        query = query.eq('assigned_to', user.id);
      } else if (filter.ownedByMe) {
        query = query.eq('owner_id', user.id);
      }

      if (filter.workMode) {
        query = query.eq('work_mode', filter.workMode);
      }

      if (filter.judgmentRequired !== undefined) {
        query = query.eq('judgment_required', filter.judgmentRequired);
      }

      if (filter.cellAffiliation) {
        query = query.eq('cell_affiliation', filter.cellAffiliation);
      }

      if (filter.search) {
        query = query.or(`title.ilike.%${filter.search}%,description.ilike.%${filter.search}%,short_id.ilike.%${filter.search}%`);
      }

      const { data, error } = await query;

      if (error) throw error;

      set({ tasks: data || [], isLoading: false });
    } catch (error) {
      console.error('Fetch tasks error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch tasks',
        isLoading: false,
      });
    }
  },

  fetchTask: async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          owner:users!tasks_owner_id_fkey(*),
          assignee:users!tasks_assigned_to_fkey(*),
          idea:ideas(*)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Fetch task error:', error);
      return null;
    }
  },

  fetchTaskByShortId: async (shortId: string) => {
    try {
      const normalizedId = shortId.toUpperCase().startsWith('T-')
        ? shortId.toUpperCase()
        : `T-${shortId.padStart(4, '0')}`;

      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          owner:users!tasks_owner_id_fkey(*),
          assignee:users!tasks_assigned_to_fkey(*)
        `)
        .eq('short_id', normalizedId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Fetch task by short ID error:', error);
      return null;
    }
  },

  createTask: async (input: CreateTaskInput) => {
    try {
      set({ isLoading: true, error: null });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const slug = generateSlug(input.title);

      const { data, error } = await supabase
        .from('tasks')
        .insert({
          ...input,
          slug,
          owner_id: user.id,
          assigned_to: input.assigned_to || user.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Log to audit
      await supabase.from('audit_log').insert({
        user_id: user.id,
        action: 'task_created',
        entity_type: 'task',
        entity_id: data.id,
        details: { title: input.title },
      });

      // Refresh tasks list
      await get().fetchTasks();

      set({ isLoading: false });
      return data;
    } catch (error) {
      console.error('Create task error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to create task',
        isLoading: false,
      });
      throw error;
    }
  },

  updateTask: async (id: string, updates: UpdateTaskInput) => {
    try {
      set({ isLoading: true, error: null });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('tasks')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      // Log to audit
      await supabase.from('audit_log').insert({
        user_id: user.id,
        action: 'task_updated',
        entity_type: 'task',
        entity_id: id,
        details: updates,
      });

      // Refresh tasks list
      await get().fetchTasks();

      // Update selected task if it's the one being updated
      const { selectedTask } = get();
      if (selectedTask?.id === id) {
        const updated = await get().fetchTask(id);
        set({ selectedTask: updated });
      }

      set({ isLoading: false });
    } catch (error) {
      console.error('Update task error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to update task',
        isLoading: false,
      });
      throw error;
    }
  },

  deleteTask: async (id: string) => {
    try {
      set({ isLoading: true, error: null });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.from('tasks').delete().eq('id', id);

      if (error) throw error;

      // Log to audit
      await supabase.from('audit_log').insert({
        user_id: user.id,
        action: 'task_deleted',
        entity_type: 'task',
        entity_id: id,
      });

      // Refresh tasks list
      await get().fetchTasks();

      // Clear selected task if deleted
      const { selectedTask } = get();
      if (selectedTask?.id === id) {
        set({ selectedTask: null });
      }

      set({ isLoading: false });
    } catch (error) {
      console.error('Delete task error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to delete task',
        isLoading: false,
      });
      throw error;
    }
  },

  completeTask: async (id: string) => {
    await get().updateTask(id, {
      status: 'completed',
      stage: 'done',
    });

    // Also update completed_at timestamp
    await supabase
      .from('tasks')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', id);
  },

  snoozeTask: async (id: string, until: Date) => {
    await get().updateTask(id, { status: 'snoozed' });

    // Create a notification for when snooze ends
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const task = await get().fetchTask(id);
      await supabase.from('notification_queue').insert({
        user_id: user.id,
        notification_type: 'snooze_ended',
        title: `Snoozed task ready: ${task?.title}`,
        task_id: id,
        scheduled_for: until.toISOString(),
      });
    }
  },

  assignTask: async (id: string, userId: string) => {
    await get().updateTask(id, { assigned_to: userId });
  },

  delegateTask: async (id: string, toActorId: string, reason?: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Record delegation
      await supabase.from('task_delegations').insert({
        task_id: id,
        from_user_id: user.id,
        to_actor: toActorId,
        reason,
      });

      // Update task work mode to gastown (organizational)
      await get().updateTask(id, {
        stage: 'routed',
      });

      // Create a message in the thread
      const task = await get().fetchTask(id);
      if (task?.canonical_thread_id) {
        await supabase.from('messages').insert({
          thread_id: task.canonical_thread_id,
          from_actor: `person_${user.id}`,
          to_actor: toActorId,
          message_type: 'handoff',
          body: reason || `Task delegated to ${toActorId}`,
          task_id: id,
        });
      }
    } catch (error) {
      console.error('Delegate task error:', error);
      throw error;
    }
  },

  escalateTask: async (id: string, reason?: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const task = await get().fetchTask(id);
      if (!task) throw new Error('Task not found');

      const newLevel = task.escalation_level + 1;

      // Record escalation (will fail if rate limited by trigger)
      await supabase.from('escalations').insert({
        task_id: id,
        thread_id: task.canonical_thread_id,
        from_level: task.escalation_level,
        to_level: newLevel,
        reason,
        escalated_by: user.id,
      });

      // Update task
      await get().updateTask(id, {
        escalation_level: newLevel,
      });

      // Create interrupt message if escalation level is high
      if (newLevel >= 2 && task.canonical_thread_id) {
        await supabase.from('messages').insert({
          thread_id: task.canonical_thread_id,
          from_actor: `person_${user.id}`,
          to_actor: newLevel >= 3 ? 'head_of_watershed' : 'reality_check',
          message_type: 'interrupt',
          body: reason || `Escalation to level ${newLevel}`,
          task_id: id,
        });
      }
    } catch (error) {
      console.error('Escalate task error:', error);
      throw error;
    }
  },

  setSelectedTask: (task: TaskWithRelations | null) => {
    set({ selectedTask: task });
  },

  setFilter: (newFilter: Partial<TaskFilter>) => {
    set({ filter: { ...get().filter, ...newFilter } });
    get().fetchTasks();
  },

  subscribeToTasks: () => {
    const channel = supabase
      .channel('tasks-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
        },
        () => {
          // Refresh tasks on any change
          get().fetchTasks();
        }
      )
      .subscribe();

    // Return unsubscribe function
    return () => {
      supabase.removeChannel(channel);
    };
  },

  clearError: () => set({ error: null }),
}));

// Selector hooks for common filtered views
export const useMyTasks = () => {
  const tasks = useTaskStore((state) => state.tasks);
  return tasks.filter((t) => t.status !== 'completed');
};

export const useJudgmentQueue = () => {
  const tasks = useTaskStore((state) => state.tasks);
  return tasks.filter((t) => t.judgment_required && t.status !== 'completed');
};

export const useHardGateTasks = () => {
  const tasks = useTaskStore((state) => state.tasks);
  return tasks.filter((t) => t.decision_class === 'hard_gate' && t.status !== 'completed');
};

export const usePriorityTasks = () => {
  const tasks = useTaskStore((state) => state.tasks);
  return tasks
    .filter((t) => t.status !== 'completed' && t.priority >= 60)
    .slice(0, 10);
};
