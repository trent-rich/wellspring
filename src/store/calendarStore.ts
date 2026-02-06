import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { CalendarEvent, CalendarEventWithMeeting, MeetingIntent, MeetingModality } from '../types';
import { isToday, isTomorrow, isWithinInterval, addMinutes, isBefore, isAfter } from 'date-fns';

interface SyncEventInput {
  user_id: string;
  gcal_event_id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  location: string | null;
  meet_link: string | null;
  is_all_day: boolean;
  status: 'confirmed' | 'tentative' | 'cancelled';
  attendees: Array<{
    email: string;
    name?: string;
    response_status?: string;
    organizer?: boolean;
  }> | null;
}

interface CalendarState {
  events: CalendarEventWithMeeting[];
  isLoading: boolean;
  error: string | null;
  lastSync: Date | null;

  // Actions
  fetchEvents: (startDate?: Date, endDate?: Date) => Promise<void>;
  createEvent: (event: Partial<CalendarEvent>) => Promise<CalendarEvent>;
  updateEvent: (id: string, updates: Partial<CalendarEvent>) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  markEventAsEmbodied: (id: string, embodied: boolean) => Promise<void>;
  setPrereadRequired: (id: string, required: boolean, deadlineMinutes?: number) => Promise<void>;
  syncEvent: (event: SyncEventInput) => Promise<void>;
  syncFromGoogleCalendar: () => Promise<void>;
  subscribeToEvents: () => () => void;
  clearError: () => void;
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  events: [],
  isLoading: false,
  error: null,
  lastSync: null,

  fetchEvents: async (startDate?: Date, endDate?: Date) => {
    try {
      set({ isLoading: true, error: null });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const start = startDate || new Date();
      const end = endDate || new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days ahead

      // First, fetch calendar events
      const { data: eventsData, error: eventsError } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('user_id', user.id)
        .gte('start_time', start.toISOString())
        .lte('start_time', end.toISOString())
        .neq('status', 'cancelled')
        .order('start_time', { ascending: true });

      if (eventsError) throw eventsError;

      // Map events to include empty meeting/prereads (will be populated later when meetings are created)
      const eventsWithMeetings = (eventsData || []).map(event => ({
        ...event,
        meeting: null,
        prereads: [],
      }));

      set({ events: eventsWithMeetings, isLoading: false });
    } catch (error) {
      console.error('Fetch events error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch events',
        isLoading: false,
      });
    }
  },

  createEvent: async (event: Partial<CalendarEvent>) => {
    try {
      set({ isLoading: true, error: null });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('calendar_events')
        .insert({
          ...event,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Refresh events
      await get().fetchEvents();

      set({ isLoading: false });
      return data;
    } catch (error) {
      console.error('Create event error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to create event',
        isLoading: false,
      });
      throw error;
    }
  },

  updateEvent: async (id: string, updates: Partial<CalendarEvent>) => {
    try {
      set({ isLoading: true, error: null });

      const { error } = await supabase
        .from('calendar_events')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      // Refresh events
      await get().fetchEvents();

      set({ isLoading: false });
    } catch (error) {
      console.error('Update event error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to update event',
        isLoading: false,
      });
      throw error;
    }
  },

  deleteEvent: async (id: string) => {
    try {
      set({ isLoading: true, error: null });

      const { error } = await supabase.from('calendar_events').delete().eq('id', id);

      if (error) throw error;

      // Refresh events
      await get().fetchEvents();

      set({ isLoading: false });
    } catch (error) {
      console.error('Delete event error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to delete event',
        isLoading: false,
      });
      throw error;
    }
  },

  markEventAsEmbodied: async (id: string, embodied: boolean) => {
    await get().updateEvent(id, { embodied_flag: embodied });
  },

  setPrereadRequired: async (id: string, required: boolean, deadlineMinutes?: number) => {
    await get().updateEvent(id, {
      preread_required: required,
      preread_deadline_minutes: deadlineMinutes,
    });
  },

  syncEvent: async (event: SyncEventInput) => {
    try {
      // Upsert the event - insert or update based on gcal_event_id
      const { error } = await supabase
        .from('calendar_events')
        .upsert(
          {
            user_id: event.user_id,
            gcal_event_id: event.gcal_event_id,
            title: event.title,
            description: event.description,
            start_time: event.start_time,
            end_time: event.end_time,
            location: event.location,
            meet_link: event.meet_link,
            is_all_day: event.is_all_day,
            status: event.status,
            attendees: event.attendees,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'gcal_event_id',
          }
        );

      if (error) throw error;
    } catch (error) {
      console.error('Sync event error:', error);
      throw error;
    }
  },

  syncFromGoogleCalendar: async () => {
    try {
      set({ isLoading: true, error: null });

      // This would typically call a Supabase Edge Function that handles Google OAuth
      // and syncs calendar events. For now, this is a placeholder.
      console.log('Google Calendar sync would happen here');

      // In production, this would:
      // 1. Call edge function with user's Google OAuth token
      // 2. Fetch events from Google Calendar API
      // 3. Upsert events to calendar_events table
      // 4. Return sync status

      set({ lastSync: new Date(), isLoading: false });
    } catch (error) {
      console.error('Google Calendar sync error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to sync with Google Calendar',
        isLoading: false,
      });
    }
  },

  subscribeToEvents: () => {
    const channel = supabase
      .channel('calendar-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calendar_events',
        },
        () => {
          get().fetchEvents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  clearError: () => set({ error: null }),
}));

// Selector hooks for calendar views

export const useTodayEvents = () => {
  const events = useCalendarStore((state) => state.events);
  return events.filter((e) => isToday(new Date(e.start_time)));
};

export const useTomorrowEvents = () => {
  const events = useCalendarStore((state) => state.events);
  return events.filter((e) => isTomorrow(new Date(e.start_time)));
};

export const useCurrentEvent = () => {
  const events = useCalendarStore((state) => state.events);
  const now = new Date();

  return events.find((e) =>
    isWithinInterval(now, {
      start: new Date(e.start_time),
      end: new Date(e.end_time),
    })
  );
};

export const useNextEvent = () => {
  const events = useCalendarStore((state) => state.events);
  const now = new Date();

  return events.find((e) => isAfter(new Date(e.start_time), now));
};

export const useUpcomingEvents = (count: number = 5) => {
  const events = useCalendarStore((state) => state.events);
  const now = new Date();

  return events
    .filter((e) => isAfter(new Date(e.start_time), now))
    .slice(0, count);
};

export const useEmbodiedEvents = () => {
  const events = useCalendarStore((state) => state.events);
  return events.filter((e) => e.embodied_flag);
};

export const useEventsNeedingPreread = () => {
  const events = useCalendarStore((state) => state.events);
  const now = new Date();

  return events.filter((e) => {
    if (!e.preread_required) return false;

    const deadline = e.preread_deadline_minutes || 30;
    const prereadDeadline = addMinutes(new Date(e.start_time), -deadline);

    return isBefore(now, prereadDeadline) && isAfter(prereadDeadline, now);
  });
};

// Helper to determine if a meeting is about to start (for interrupts)
export const useUpcomingMeetingInterrupt = (leadMinutes: number = 5) => {
  const events = useCalendarStore((state) => state.events);
  const now = new Date();

  return events.find((e) => {
    const startTime = new Date(e.start_time);
    const interruptTime = addMinutes(startTime, -leadMinutes);

    return isWithinInterval(now, {
      start: interruptTime,
      end: startTime,
    });
  });
};

// Intent and modality helpers
export const getIntentLabel = (intent: MeetingIntent): string => {
  const labels: Record<MeetingIntent, string> = {
    decision: 'Decision Meeting',
    working: 'Working Session',
    bonding: 'Bonding/Social',
    hybrid: 'Hybrid',
    presence_only: 'Presence Only',
  };
  return labels[intent];
};

export const getModalityLabel = (modality: MeetingModality): string => {
  const labels: Record<MeetingModality, string> = {
    seated: 'Seated',
    standing: 'Standing',
    walking: 'Walking',
    on_site: 'On-Site',
    hybrid: 'Hybrid',
  };
  return labels[modality];
};
