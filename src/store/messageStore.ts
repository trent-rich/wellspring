import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Message, CreateMessageInput, MessageType } from '../types';

interface MessageState {
  messages: Message[];
  threadMessages: Record<string, Message[]>;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchMessagesForThread: (threadId: string) => Promise<Message[]>;
  fetchMessagesForActor: (actorId: string) => Promise<void>;
  sendMessage: (input: CreateMessageInput) => Promise<Message>;
  acknowledgeMessage: (messageId: string) => Promise<void>;
  subscribeToMessages: (actorId: string) => () => void;
  clearError: () => void;
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: [],
  threadMessages: {},
  isLoading: false,
  error: null,

  fetchMessagesForThread: async (threadId: string) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      set((state) => ({
        threadMessages: {
          ...state.threadMessages,
          [threadId]: data || [],
        },
      }));

      return data || [];
    } catch (error) {
      console.error('Fetch thread messages error:', error);
      return [];
    }
  },

  fetchMessagesForActor: async (actorId: string) => {
    try {
      set({ isLoading: true, error: null });

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('to_actor', actorId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      set({ messages: data || [], isLoading: false });
    } catch (error) {
      console.error('Fetch actor messages error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch messages',
        isLoading: false,
      });
    }
  },

  sendMessage: async (input: CreateMessageInput) => {
    try {
      set({ isLoading: true, error: null });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const fromActor = `person_${user.id}`;

      const { data, error } = await supabase
        .from('messages')
        .insert({
          ...input,
          from_actor: fromActor,
          source: 'system',
        })
        .select()
        .single();

      if (error) throw error;

      // Update local state
      set((state) => ({
        messages: [data, ...state.messages],
        threadMessages: {
          ...state.threadMessages,
          [input.thread_id]: [
            ...(state.threadMessages[input.thread_id] || []),
            data,
          ],
        },
        isLoading: false,
      }));

      // Log to audit
      await supabase.from('audit_log').insert({
        user_id: user.id,
        action: 'message_sent',
        entity_type: 'message',
        entity_id: data.id,
        thread_id: input.thread_id,
        details: { message_type: input.message_type, to_actor: input.to_actor },
      });

      return data;
    } catch (error) {
      console.error('Send message error:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to send message',
        isLoading: false,
      });
      throw error;
    }
  },

  acknowledgeMessage: async (messageId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get the original message
      const { data: originalMessage, error: fetchError } = await supabase
        .from('messages')
        .select('*')
        .eq('id', messageId)
        .single();

      if (fetchError) throw fetchError;

      // Send acknowledgment message
      await get().sendMessage({
        thread_id: originalMessage.thread_id,
        to_actor: originalMessage.from_actor,
        message_type: 'ack',
        body: `Acknowledged`,
        metadata: { acknowledged_message_id: messageId },
      });
    } catch (error) {
      console.error('Acknowledge message error:', error);
      throw error;
    }
  },

  subscribeToMessages: (actorId: string) => {
    const channel = supabase
      .channel('messages-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `to_actor=eq.${actorId}`,
        },
        (payload) => {
          const newMessage = payload.new as Message;
          set((state) => ({
            messages: [newMessage, ...state.messages],
            threadMessages: {
              ...state.threadMessages,
              [newMessage.thread_id]: [
                ...(state.threadMessages[newMessage.thread_id] || []),
                newMessage,
              ],
            },
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  clearError: () => set({ error: null }),
}));

// Helper to create a new thread ID
export const createThreadId = (): string => {
  return `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Helper to send a routing message
export const sendRoutingMessage = async (
  threadId: string,
  taskId: string,
  _fromActor: string,
  toActor: string,
  messageType: MessageType,
  body: string,
  metadata?: Record<string, unknown>
) => {
  const store = useMessageStore.getState();
  return store.sendMessage({
    thread_id: threadId,
    to_actor: toActor,
    message_type: messageType,
    body,
    task_id: taskId,
    metadata,
  });
};

// Selector for unread interrupts
export const useUnreadInterrupts = () => {
  const messages = useMessageStore((state) => state.messages);
  return messages.filter(
    (m) =>
      m.message_type === 'interrupt' &&
      !m.metadata?.acknowledged
  );
};

// Selector for pending judgment requests
export const usePendingJudgmentRequests = () => {
  const messages = useMessageStore((state) => state.messages);
  return messages.filter(
    (m) =>
      m.message_type === 'decision_request' &&
      !m.metadata?.resolved
  );
};
