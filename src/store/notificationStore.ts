import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Notification } from '../types';
import { useUserStateStore } from './userStateStore';

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  lastBatchTime: Date | null;

  // Actions
  fetchNotifications: () => Promise<void>;
  sendNotification: (notification: Omit<Notification, 'id' | 'created_at'>) => Promise<void>;
  markAsSent: (id: string) => Promise<void>;
  getBatchedNotifications: () => Promise<Notification[]>;
  clearNotifications: () => Promise<void>;
  subscribeToNotifications: () => () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  error: null,
  lastBatchTime: null,

  fetchNotifications: async () => {
    try {
      set({ isLoading: true, error: null });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('notification_queue')
        .select('*')
        .eq('user_id', user.id)
        .is('sent_at', null)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      set({
        notifications: data || [],
        unreadCount: data?.length || 0,
        isLoading: false,
      });
    } catch (error) {
      console.error('Fetch notifications error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch notifications',
        isLoading: false,
      });
    }
  },

  sendNotification: async (notification) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Check user state - don't send urgent notifications during protected states
      // unless they're actually critical
      const { currentState } = useUserStateStore.getState();
      const isProtected = currentState === 'embodied' || currentState === 'settle';

      let scheduledFor = notification.scheduled_for
        ? new Date(notification.scheduled_for)
        : new Date();

      // If in protected state and not urgent, schedule for later
      if (isProtected && !notification.urgent) {
        // Schedule for the next hour
        scheduledFor = new Date();
        scheduledFor.setMinutes(0, 0, 0);
        scheduledFor.setHours(scheduledFor.getHours() + 1);
      }

      const { error } = await supabase.from('notification_queue').insert({
        ...notification,
        user_id: user.id,
        scheduled_for: scheduledFor.toISOString(),
      });

      if (error) throw error;

      // Refresh notifications
      await get().fetchNotifications();
    } catch (error) {
      console.error('Send notification error:', error);
      throw error;
    }
  },

  markAsSent: async (id: string) => {
    try {
      const { error } = await supabase
        .from('notification_queue')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      // Update local state
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));
    } catch (error) {
      console.error('Mark notification sent error:', error);
    }
  },

  getBatchedNotifications: async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // Call the database function to get batched notifications
      const { data, error } = await supabase.rpc('get_batched_notifications', {
        user_uuid: user.id,
      });

      if (error) throw error;

      set({ lastBatchTime: new Date() });

      // Parse the JSONB result
      return data?.notifications || [];
    } catch (error) {
      console.error('Get batched notifications error:', error);
      return [];
    }
  },

  clearNotifications: async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Mark all as sent
      const { error } = await supabase
        .from('notification_queue')
        .update({ sent_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('sent_at', null);

      if (error) throw error;

      set({ notifications: [], unreadCount: 0 });
    } catch (error) {
      console.error('Clear notifications error:', error);
    }
  },

  subscribeToNotifications: () => {
    const channel = supabase
      .channel('notification-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notification_queue',
        },
        (payload) => {
          const newNotification = payload.new as Notification;

          // Only add if it's for the current user and not sent
          if (!newNotification.sent_at) {
            set((state) => ({
              notifications: [newNotification, ...state.notifications],
              unreadCount: state.unreadCount + 1,
            }));

            // Show browser notification if urgent
            if (newNotification.urgent && 'Notification' in window) {
              if (Notification.permission === 'granted') {
                new Notification(newNotification.title, {
                  body: newNotification.body || undefined,
                  icon: '/favicon.svg',
                });
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
}));

// Hook to request browser notification permission
export const useNotificationPermission = () => {
  const requestPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  };

  const hasPermission = () => {
    return 'Notification' in window && Notification.permission === 'granted';
  };

  return { requestPermission, hasPermission };
};

// Selector for urgent notifications
export const useUrgentNotifications = () => {
  const notifications = useNotificationStore((state) => state.notifications);
  return notifications.filter((n) => n.urgent);
};

// Selector for task-related notifications
export const useTaskNotifications = (taskId: string) => {
  const notifications = useNotificationStore((state) => state.notifications);
  return notifications.filter((n) => n.task_id === taskId);
};

// Hook to send common notification types
export const useNotificationSender = () => {
  const { sendNotification } = useNotificationStore();

  const notifyTaskDue = async (taskId: string, taskTitle: string) => {
    await sendNotification({
      user_id: '',
      notification_type: 'task_due',
      title: `Task due: ${taskTitle}`,
      body: null,
      task_id: taskId,
      priority: 70,
      urgent: false,
      scheduled_for: new Date().toISOString(),
      sent_at: null,
    });
  };

  const notifyMeetingStarting = async (eventTitle: string, minutesUntil: number) => {
    await sendNotification({
      user_id: '',
      notification_type: 'meeting_starting',
      title: `Meeting in ${minutesUntil} minutes: ${eventTitle}`,
      body: null,
      task_id: null,
      priority: 90,
      urgent: true,
      scheduled_for: new Date().toISOString(),
      sent_at: null,
    });
  };

  const notifyEscalation = async (taskId: string, taskTitle: string, level: number) => {
    await sendNotification({
      user_id: '',
      notification_type: 'escalation',
      title: `Escalation (Level ${level}): ${taskTitle}`,
      body: null,
      task_id: taskId,
      priority: 85,
      urgent: true,
      scheduled_for: new Date().toISOString(),
      sent_at: null,
    });
  };

  const notifyJudgmentRequired = async (taskId: string, taskTitle: string) => {
    await sendNotification({
      user_id: '',
      notification_type: 'judgment_required',
      title: `Judgment needed: ${taskTitle}`,
      body: null,
      task_id: taskId,
      priority: 60,
      urgent: false,
      scheduled_for: new Date().toISOString(),
      sent_at: null,
    });
  };

  const notifyIdeaReady = async (ideaTitle: string) => {
    await sendNotification({
      user_id: '',
      notification_type: 'idea_ready',
      title: `Idea ready to execute: ${ideaTitle}`,
      body: null,
      task_id: null,
      priority: 40,
      urgent: false,
      scheduled_for: new Date().toISOString(),
      sent_at: null,
    });
  };

  return {
    notifyTaskDue,
    notifyMeetingStarting,
    notifyEscalation,
    notifyJudgmentRequired,
    notifyIdeaReady,
  };
};
