import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { UserState, InterruptPolicy, CalendarEvent } from '../types';
import { addMinutes, isWithinInterval, isBefore } from 'date-fns';

interface UserStateStoreState {
  currentState: UserState;
  stateUntil: Date | null;
  currentEventId: string | null;
  policy: InterruptPolicy | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchState: () => Promise<void>;
  fetchPolicy: () => Promise<void>;
  setState: (state: UserState, durationMinutes?: number) => Promise<void>;
  enterMeetingMode: (eventId: string) => Promise<void>;
  exitMeetingMode: () => Promise<void>;
  enterEmbodiedState: (durationMinutes?: number) => Promise<void>;
  enterSettleState: (durationMinutes?: number) => Promise<void>;
  enterFocusMode: (durationMinutes?: number) => Promise<void>;
  exitProtectedState: () => Promise<void>;
  updatePolicy: (updates: Partial<InterruptPolicy>) => Promise<void>;
  subscribeToState: () => () => void;
  clearError: () => void;
}

export const useUserStateStore = create<UserStateStoreState>((set, get) => ({
  currentState: 'normal',
  stateUntil: null,
  currentEventId: null,
  policy: null,
  isLoading: false,
  error: null,

  fetchState: async () => {
    try {
      set({ isLoading: true, error: null });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('user_states')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        // Check if state has expired
        const stateUntil = data.state_until ? new Date(data.state_until) : null;
        const now = new Date();

        if (stateUntil && isBefore(stateUntil, now)) {
          // State has expired, transition to normal
          await get().exitProtectedState();
          set({
            currentState: 'normal',
            stateUntil: null,
            currentEventId: null,
            isLoading: false,
          });
        } else {
          set({
            currentState: data.state,
            stateUntil,
            currentEventId: data.current_event_id,
            isLoading: false,
          });
        }
      } else {
        // Create default state
        await supabase.from('user_states').insert({
          user_id: user.id,
          state: 'normal',
        });
        set({
          currentState: 'normal',
          stateUntil: null,
          currentEventId: null,
          isLoading: false,
        });
      }
    } catch (error) {
      console.error('Fetch state error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch state',
        isLoading: false,
      });
    }
  },

  fetchPolicy: async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('interrupt_policies')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        set({ policy: data });
      } else {
        // Create default policy
        const { data: newPolicy, error: createError } = await supabase
          .from('interrupt_policies')
          .insert({ user_id: user.id })
          .select()
          .single();

        if (createError) throw createError;
        set({ policy: newPolicy });
      }
    } catch (error) {
      console.error('Fetch policy error:', error);
    }
  },

  setState: async (state: UserState, durationMinutes?: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const stateUntil = durationMinutes
        ? addMinutes(new Date(), durationMinutes)
        : null;

      const { error } = await supabase
        .from('user_states')
        .update({
          state,
          state_until: stateUntil?.toISOString() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (error) throw error;

      set({
        currentState: state,
        stateUntil,
      });

      // Log to audit
      await supabase.from('audit_log').insert({
        user_id: user.id,
        action: 'state_changed',
        entity_type: 'user_state',
        entity_id: user.id,
        details: { state, duration_minutes: durationMinutes },
      });
    } catch (error) {
      console.error('Set state error:', error);
      throw error;
    }
  },

  enterMeetingMode: async (eventId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get the event to determine end time
      const { data: event } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('id', eventId)
        .single();

      const stateUntil = event ? new Date(event.end_time) : null;

      const { error } = await supabase
        .from('user_states')
        .update({
          state: 'meeting_mode',
          state_until: stateUntil?.toISOString() || null,
          current_event_id: eventId,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (error) throw error;

      set({
        currentState: 'meeting_mode',
        stateUntil,
        currentEventId: eventId,
      });
    } catch (error) {
      console.error('Enter meeting mode error:', error);
      throw error;
    }
  },

  exitMeetingMode: async () => {
    const { policy, currentEventId } = get();

    // Check if the meeting was embodied - if so, enter settle state
    if (currentEventId) {
      const { data: event } = await supabase
        .from('calendar_events')
        .select('embodied_flag')
        .eq('id', currentEventId)
        .single();

      if (event?.embodied_flag) {
        const settleDuration = policy?.embodied_default_settle_minutes || 30;
        await get().enterSettleState(settleDuration);
        return;
      }
    }

    // Otherwise, return to normal
    await get().exitProtectedState();
  },

  enterEmbodiedState: async (durationMinutes?: number) => {
    const duration = durationMinutes || 60; // Default 1 hour for manual embodied state
    await get().setState('embodied', duration);
  },

  enterSettleState: async (durationMinutes?: number) => {
    const { policy } = get();
    const duration = durationMinutes || policy?.embodied_default_settle_minutes || 30;
    await get().setState('settle', duration);
  },

  enterFocusMode: async (durationMinutes?: number) => {
    const duration = durationMinutes || 60; // Default 1 hour focus
    await get().setState('focus', duration);
  },

  exitProtectedState: async () => {
    await get().setState('normal');
    set({ currentEventId: null });
  },

  updatePolicy: async (updates: Partial<InterruptPolicy>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('interrupt_policies')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (error) throw error;

      set((state) => ({
        policy: state.policy ? { ...state.policy, ...updates } : null,
      }));
    } catch (error) {
      console.error('Update policy error:', error);
      throw error;
    }
  },

  subscribeToState: () => {
    const channel = supabase
      .channel('user-state-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_states',
        },
        () => {
          get().fetchState();
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

export const useIsProtectedState = () => {
  const state = useUserStateStore((s) => s.currentState);
  return state === 'embodied' || state === 'settle' || state === 'focus';
};

export const useCanReceiveInterrupts = () => {
  const state = useUserStateStore((s) => s.currentState);
  const policy = useUserStateStore((s) => s.policy);

  if (state === 'embodied' || state === 'settle') return false;
  if (state === 'focus' && policy?.suppress_interrupts_in_focus) return false;

  return true;
};

export const useShouldAutoEnterMeetingMode = () => {
  const policy = useUserStateStore((s) => s.policy);
  return policy?.auto_enter_meeting_mode ?? true;
};

// Hook to automatically manage state based on calendar
export const useAutoStateManagement = (events: CalendarEvent[]) => {
  const { currentState, currentEventId, policy } = useUserStateStore();
  const { enterMeetingMode, exitMeetingMode } = useUserStateStore();

  // Check if we should enter meeting mode
  const now = new Date();

  const currentEvent = events.find((e) =>
    isWithinInterval(now, {
      start: new Date(e.start_time),
      end: new Date(e.end_time),
    })
  );

  // Auto-enter meeting mode
  if (
    currentEvent &&
    policy?.auto_enter_meeting_mode &&
    currentState === 'normal' &&
    currentEventId !== currentEvent.id
  ) {
    enterMeetingMode(currentEvent.id);
  }

  // Auto-exit meeting mode when event ends
  if (
    currentState === 'meeting_mode' &&
    currentEventId &&
    !currentEvent
  ) {
    exitMeetingMode();
  }
};
