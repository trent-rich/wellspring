import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  type GeodeEmailEvent,
  type GeodeConfirmationTask,
  MOCK_EMAIL_EVENTS,
  createConfirmationTask,
} from '../types/geodeEmailEvents';
import { executeTaskActions, type TaskExecutionResult } from '../lib/geodeActionExecutor';

// ============================================
// STORE INTERFACE
// ============================================

interface GeodeEmailStoreState {
  // Email events detected by AI
  emailEvents: GeodeEmailEvent[];

  // Confirmation tasks pending user action
  confirmationTasks: GeodeConfirmationTask[];

  // Actions
  addEmailEvent: (event: GeodeEmailEvent) => void;
  confirmEmailEvent: (eventId: string, userId: string) => void;
  dismissEmailEvent: (eventId: string, userId: string, reason?: string) => void;

  confirmTask: (taskId: string, userId: string) => Promise<TaskExecutionResult | null>;
  dismissTask: (taskId: string, userId: string, reason?: string) => void;

  // Queries
  getPendingTasks: () => GeodeConfirmationTask[];
  getTasksByChapter: (state: string, chapterType: string) => GeodeConfirmationTask[];
  getHighPriorityTasks: () => GeodeConfirmationTask[];

  // Initialize with mock data
  initializeMockData: () => void;

  // Reset store (clear all data)
  resetStore: () => void;
}

// ============================================
// STORE IMPLEMENTATION
// ============================================

export const useGeodeEmailStore = create<GeodeEmailStoreState>()(
  persist(
    (set, get) => ({
      emailEvents: [],
      confirmationTasks: [],

      addEmailEvent: (event) => {
        const task = createConfirmationTask(event);
        set((state) => ({
          emailEvents: [...state.emailEvents, event],
          confirmationTasks: [...state.confirmationTasks, task],
        }));
      },

      confirmEmailEvent: (eventId, userId) => {
        set((state) => ({
          emailEvents: state.emailEvents.map((e) =>
            e.id === eventId
              ? { ...e, status: 'confirmed' as const, confirmedAt: new Date().toISOString(), confirmedBy: userId }
              : e
          ),
        }));
      },

      dismissEmailEvent: (eventId, userId, reason) => {
        set((state) => ({
          emailEvents: state.emailEvents.map((e) =>
            e.id === eventId
              ? { ...e, status: 'dismissed' as const, confirmedAt: new Date().toISOString(), confirmedBy: userId }
              : e
          ),
          confirmationTasks: state.confirmationTasks.map((t) =>
            t.emailEventId === eventId
              ? {
                  ...t,
                  status: 'dismissed' as const,
                  dismissedAt: new Date().toISOString(),
                  dismissedBy: userId,
                  dismissReason: reason,
                }
              : t
          ),
        }));
      },

      confirmTask: async (taskId, userId) => {
        const task = get().confirmationTasks.find((t) => t.id === taskId);
        if (!task) return null;

        console.log('[GeodeEmailStore] Confirming task:', taskId);

        // Execute the actions
        const executionResult = await executeTaskActions(task);
        console.log('[GeodeEmailStore] Execution result:', executionResult);

        // Update task status based on execution result
        set((state) => ({
          confirmationTasks: state.confirmationTasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  status: 'confirmed' as const,
                  confirmedAt: new Date().toISOString(),
                  confirmedBy: userId,
                }
              : t
          ),
          emailEvents: state.emailEvents.map((e) =>
            e.id === task.emailEventId
              ? { ...e, status: 'actioned' as const }
              : e
          ),
        }));

        return executionResult;
      },

      dismissTask: (taskId, userId, reason) => {
        set((state) => ({
          confirmationTasks: state.confirmationTasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  status: 'dismissed' as const,
                  dismissedAt: new Date().toISOString(),
                  dismissedBy: userId,
                  dismissReason: reason,
                }
              : t
          ),
        }));
      },

      getPendingTasks: () => {
        return get().confirmationTasks.filter((t) => t.status === 'pending');
      },

      getTasksByChapter: (state, chapterType) => {
        return get().confirmationTasks.filter(
          (t) => t.state === state && t.chapterType === chapterType && t.status === 'pending'
        );
      },

      getHighPriorityTasks: () => {
        return get().confirmationTasks.filter(
          (t) => (t.priority === 'urgent' || t.priority === 'high') && t.status === 'pending'
        );
      },

      initializeMockData: () => {
        // Only initialize if empty
        if (get().emailEvents.length > 0) return;

        MOCK_EMAIL_EVENTS.forEach((event) => {
          const task = createConfirmationTask(event);
          set((state) => ({
            emailEvents: [...state.emailEvents, event],
            confirmationTasks: [...state.confirmationTasks, task],
          }));
        });
      },

      resetStore: () => {
        // Clear all data and reinitialize with mock data
        set({ emailEvents: [], confirmationTasks: [] });

        // Reinitialize mock data
        MOCK_EMAIL_EVENTS.forEach((event) => {
          const task = createConfirmationTask(event);
          set((state) => ({
            emailEvents: [...state.emailEvents, event],
            confirmationTasks: [...state.confirmationTasks, task],
          }));
        });
      },
    }),
    {
      name: 'geode-email-store',
      version: 2, // Bumped to re-run migration with correct field names
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as {
          emailEvents: GeodeEmailEvent[];
          confirmationTasks: GeodeConfirmationTask[];
        };

        // Migration to version 2: Remove Jayash Paudel mock data
        // Previous v1 migration used wrong field name (authorName vs detectedAuthorName)
        if (version < 2) {
          console.log('[GeodeEmailStore] Running migration v2: Cleaning up Jayash Paudel mock data');

          const cleanedEmailEvents = (state.emailEvents || []).filter((event) => {
            // Check both possible field names and also fromName/subject
            const detectedAuthor = (event.detectedAuthorName || '').toLowerCase();
            const fromName = (event.fromName || '').toLowerCase();
            const subject = (event.subject || '').toLowerCase();
            const shouldRemove = detectedAuthor.includes('jayash') || detectedAuthor.includes('paudel') ||
                                 fromName.includes('jayash') || fromName.includes('paudel') ||
                                 subject.includes('jayash') || subject.includes('paudel');
            if (shouldRemove) {
              console.log('[GeodeEmailStore] Removing mock email event:', event.id);
            }
            return !shouldRemove;
          });

          const cleanedTasks = (state.confirmationTasks || []).filter((task) => {
            const authorName = (task.authorName || '').toLowerCase();
            const title = (task.title || '').toLowerCase();
            const shouldRemove = authorName.includes('jayash') || authorName.includes('paudel') ||
                                 title.includes('jayash') || title.includes('paudel');
            if (shouldRemove) {
              console.log('[GeodeEmailStore] Removing mock task:', task.id);
            }
            return !shouldRemove;
          });

          return {
            ...state,
            emailEvents: cleanedEmailEvents,
            confirmationTasks: cleanedTasks,
          };
        }

        return state;
      },
    }
  )
);

// ============================================
// SELECTOR HOOKS
// ============================================

export const usePendingEmailTasks = () => {
  const getPendingTasks = useGeodeEmailStore((s) => s.getPendingTasks);
  return getPendingTasks();
};

export const useHighPriorityEmailTasks = () => {
  const getHighPriorityTasks = useGeodeEmailStore((s) => s.getHighPriorityTasks);
  return getHighPriorityTasks();
};
