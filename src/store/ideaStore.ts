import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Idea, CreateIdeaInput } from '../types';
import { getContainmentRemaining } from '../lib/utils';

interface IdeaState {
  ideas: Idea[];
  selectedIdea: Idea | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchIdeas: () => Promise<void>;
  fetchIdea: (id: string) => Promise<Idea | null>;
  createIdea: (input: CreateIdeaInput) => Promise<Idea>;
  updateIdea: (id: string, updates: Partial<Idea>) => Promise<void>;
  archiveIdea: (id: string) => Promise<void>;
  deleteIdea: (id: string) => Promise<void>;
  executeIdea: (id: string) => Promise<void>;
  overrideContainment: (id: string, reason: string) => Promise<void>;
  routeIdea: (id: string, destinations: string[]) => Promise<void>;
  setSelectedIdea: (idea: Idea | null) => void;
  subscribeToIdeas: () => () => void;
  clearError: () => void;
}

export const useIdeaStore = create<IdeaState>((set, get) => ({
  ideas: [],
  selectedIdea: null,
  isLoading: false,
  error: null,

  fetchIdeas: async () => {
    try {
      set({ isLoading: true, error: null });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('ideas')
        .select('*')
        .eq('user_id', user.id)
        .eq('archived', false)
        .order('created_at', { ascending: false });

      if (error) throw error;

      set({ ideas: data || [], isLoading: false });
    } catch (error) {
      console.error('Fetch ideas error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch ideas',
        isLoading: false,
      });
    }
  },

  fetchIdea: async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('ideas')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Fetch idea error:', error);
      return null;
    }
  },

  createIdea: async (input: CreateIdeaInput) => {
    try {
      set({ isLoading: true, error: null });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('ideas')
        .insert({
          ...input,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Log to audit
      await supabase.from('audit_log').insert({
        user_id: user.id,
        action: 'idea_created',
        entity_type: 'idea',
        entity_id: data.id,
        details: { title: input.title },
      });

      // Refresh ideas list
      await get().fetchIdeas();

      set({ isLoading: false });
      return data;
    } catch (error) {
      console.error('Create idea error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to create idea',
        isLoading: false,
      });
      throw error;
    }
  },

  updateIdea: async (id: string, updates: Partial<Idea>) => {
    try {
      set({ isLoading: true, error: null });

      const { error } = await supabase
        .from('ideas')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      // Refresh ideas list
      await get().fetchIdeas();

      // Update selected idea if it's the one being updated
      const { selectedIdea } = get();
      if (selectedIdea?.id === id) {
        const updated = await get().fetchIdea(id);
        set({ selectedIdea: updated });
      }

      set({ isLoading: false });
    } catch (error) {
      console.error('Update idea error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to update idea',
        isLoading: false,
      });
      throw error;
    }
  },

  archiveIdea: async (id: string) => {
    await get().updateIdea(id, { archived: true });
  },

  deleteIdea: async (id: string) => {
    try {
      set({ isLoading: true, error: null });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.from('ideas').delete().eq('id', id);

      if (error) throw error;

      // Log to audit
      await supabase.from('audit_log').insert({
        user_id: user.id,
        action: 'idea_deleted',
        entity_type: 'idea',
        entity_id: id,
      });

      // Refresh ideas list
      await get().fetchIdeas();

      // Clear selected idea if deleted
      const { selectedIdea } = get();
      if (selectedIdea?.id === id) {
        set({ selectedIdea: null });
      }

      set({ isLoading: false });
    } catch (error) {
      console.error('Delete idea error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to delete idea',
        isLoading: false,
      });
      throw error;
    }
  },

  executeIdea: async (id: string) => {
    const idea = await get().fetchIdea(id);
    if (!idea) throw new Error('Idea not found');

    // Check containment
    const { canExecute, hoursRemaining } = getContainmentRemaining(idea.execution_blocked_until);

    if (!canExecute) {
      throw new Error(
        `Idea is still in containment. ${hoursRemaining} hours remaining. Use override if authorized.`
      );
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Create a task from the idea
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .insert({
        title: `Execute: ${idea.title}`,
        description: idea.content,
        task_type: 'idea_execution',
        source: 'idea_tracker',
        idea_id: id,
        owner_id: user.id,
        assigned_to: user.id,
        stage: 'in_execution',
        work_mode: 'gastown',
      })
      .select()
      .single();

    if (taskError) throw taskError;

    // Update idea status
    await get().updateIdea(id, { status: 'executing' });

    // Log to audit
    await supabase.from('audit_log').insert({
      user_id: user.id,
      action: 'idea_executed',
      entity_type: 'idea',
      entity_id: id,
      details: { task_id: task.id },
    });

    return task;
  },

  overrideContainment: async (id: string, reason: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Log the override
    await supabase.from('audit_log').insert({
      user_id: user.id,
      action: 'containment_override',
      entity_type: 'idea',
      entity_id: id,
      details: { reason },
    });

    // Update idea
    await get().updateIdea(id, {
      containment_override: true,
      containment_rule: reason,
    });
  },

  routeIdea: async (id: string, destinations: string[]) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    await get().updateIdea(id, {
      routing_destination: destinations,
      routed_to_spv: destinations,
    });

    // Create routing messages for each destination
    const idea = await get().fetchIdea(id);
    if (idea) {
      for (const dest of destinations) {
        await supabase.from('messages').insert({
          thread_id: `idea_${id}`,
          from_actor: `person_${user.id}`,
          to_actor: dest,
          message_type: 'handoff',
          body: `Idea routed: ${idea.title}`,
          metadata: { idea_id: id },
        });
      }
    }
  },

  setSelectedIdea: (idea: Idea | null) => {
    set({ selectedIdea: idea });
  },

  subscribeToIdeas: () => {
    const channel = supabase
      .channel('ideas-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ideas',
        },
        () => {
          get().fetchIdeas();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  clearError: () => set({ error: null }),
}));

// Selector hooks

export const useRipeningIdeas = () => {
  const ideas = useIdeaStore((state) => state.ideas);

  return ideas.filter((idea) => {
    const { canExecute } = getContainmentRemaining(idea.execution_blocked_until);
    return !canExecute && idea.status === 'active';
  });
};

export const useReadyToExecuteIdeas = () => {
  const ideas = useIdeaStore((state) => state.ideas);

  return ideas.filter((idea) => {
    const { canExecute } = getContainmentRemaining(idea.execution_blocked_until);
    return canExecute && idea.status === 'active';
  });
};

export const useIdeasByStatus = (status: string) => {
  const ideas = useIdeaStore((state) => state.ideas);
  return ideas.filter((idea) => idea.status === status);
};

export const useRecentIdeas = (count: number = 10) => {
  const ideas = useIdeaStore((state) => state.ideas);
  return ideas.slice(0, count);
};
