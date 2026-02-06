import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTaskStore } from '../store/taskStore';
import { useUserStateStore } from '../store/userStateStore';

interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
  shift?: boolean;
  description: string;
  action: () => void;
}

export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const { selectedTask, completeTask, snoozeTask, setSelectedTask } = useTaskStore();
  const { enterFocusMode, exitProtectedState, currentState } = useUserStateStore();

  const shortcuts: KeyboardShortcut[] = [
    // Navigation
    {
      key: 'g',
      description: 'Go to Dashboard',
      action: () => navigate('/dashboard'),
    },
    {
      key: 't',
      description: 'Go to Tasks',
      action: () => navigate('/tasks'),
    },
    {
      key: 'i',
      description: 'Go to Ideas',
      action: () => navigate('/ideas'),
    },
    {
      key: 'c',
      description: 'Go to Calendar',
      action: () => navigate('/calendar'),
    },

    // Task actions (when task is selected)
    {
      key: 'c',
      shift: true,
      description: 'Complete selected task',
      action: () => {
        if (selectedTask) {
          completeTask(selectedTask.id);
        }
      },
    },
    {
      key: 's',
      shift: true,
      description: 'Snooze selected task (1 hour)',
      action: () => {
        if (selectedTask) {
          const until = new Date();
          until.setHours(until.getHours() + 1);
          snoozeTask(selectedTask.id, until);
        }
      },
    },
    {
      key: 'Escape',
      description: 'Close task detail / deselect',
      action: () => {
        setSelectedTask(null);
      },
    },

    // State controls
    {
      key: 'f',
      meta: true,
      shift: true,
      description: 'Toggle Focus Mode',
      action: () => {
        if (currentState === 'focus') {
          exitProtectedState();
        } else if (currentState === 'normal') {
          enterFocusMode(60);
        }
      },
    },

    // New task/idea
    {
      key: 'n',
      description: 'New task',
      action: () => {
        navigate('/tasks');
        // Would trigger create modal
      },
    },
  ];

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      for (const shortcut of shortcuts) {
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatch = shortcut.ctrl ? event.ctrlKey : !event.ctrlKey;
        const metaMatch = shortcut.meta ? event.metaKey : !event.metaKey;
        const altMatch = shortcut.alt ? event.altKey : !event.altKey;
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;

        if (keyMatch && ctrlMatch && metaMatch && altMatch && shiftMatch) {
          event.preventDefault();
          shortcut.action();
          return;
        }
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return shortcuts;
}

// Hook for push-to-talk voice input
export function usePushToTalk(onStart: () => void, onEnd: () => void) {
  useEffect(() => {
    let isHolding = false;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isHolding) {
        const target = event.target as HTMLElement;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        ) {
          return;
        }

        event.preventDefault();
        isHolding = true;
        onStart();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space' && isHolding) {
        event.preventDefault();
        isHolding = false;
        onEnd();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [onStart, onEnd]);
}

// Hook for detecting task ID mentions (for voice/command palette)
export function useTaskIdMention(onMention: (taskId: string) => void) {
  const detectTaskId = useCallback(
    (text: string) => {
      const match = text.match(/T-?(\d{1,4})/i);
      if (match) {
        const taskId = `T-${match[1].padStart(4, '0')}`;
        onMention(taskId);
      }
    },
    [onMention]
  );

  return detectTaskId;
}
