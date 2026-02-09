import { useState, useEffect, useCallback, useRef } from 'react';
import { Mic, Loader2, X, Volume2, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTaskStore } from '../store/taskStore';
import { useUserStateStore } from '../store/userStateStore';
import type { VoiceCommand } from '../types';
import { cn, parseTaskId } from '../lib/utils';

interface VoiceInputProps {
  onClose: () => void;
}

// Web Speech API types
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export default function VoiceInput({ onClose }: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [command, setCommand] = useState<VoiceCommand | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const navigate = useNavigate();

  const { fetchTaskByShortId, completeTask, snoozeTask, createTask } = useTaskStore();
  const { enterFocusMode, exitProtectedState } = useUserStateStore();
  const [pendingAction, setPendingAction] = useState<VoiceCommand | null>(null);

  // Initialize speech recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError('Speech recognition is not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      setInterimTranscript(interim);
      if (final) {
        setTranscript((prev) => prev + final);
      }
    };

    recognition.onerror = (event: Event) => {
      console.error('Speech recognition error:', event);
      setError('Failed to recognize speech. Please try again.');
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.abort();
    };
  }, []);

  // Start listening
  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListening) {
      setTranscript('');
      setInterimTranscript('');
      setCommand(null);
      recognitionRef.current.start();
    }
  }, [isListening]);

  // Stop listening and process
  const stopListening = useCallback(async () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();

      // Process the transcript
      if (transcript || interimTranscript) {
        setIsProcessing(true);
        const fullTranscript = transcript + interimTranscript;
        const parsedCommand = parseVoiceCommand(fullTranscript);
        setCommand(parsedCommand);

        // For create_task, require user confirmation before executing
        if (parsedCommand.intent === 'create_task' && parsedCommand.parameters.title) {
          setPendingAction(parsedCommand);
          setIsProcessing(false);
        } else {
          await executeCommand(parsedCommand);
          setIsProcessing(false);
        }
      }
    }
  }, [isListening, transcript, interimTranscript]);

  // Parse voice command
  const parseVoiceCommand = (text: string): VoiceCommand => {
    const lowerText = text.toLowerCase().trim();

    // Open task by ID
    const taskId = parseTaskId(text);
    if (taskId && (lowerText.includes('open') || lowerText.includes('show'))) {
      return {
        intent: 'open_task',
        parameters: { taskId },
        raw_transcript: text,
        confidence: 0.9,
      };
    }

    // Complete task
    if (lowerText.includes('complete') || lowerText.includes('done') || lowerText.includes('finish')) {
      const id = parseTaskId(text);
      if (id) {
        return {
          intent: 'complete_task',
          parameters: { taskId: id },
          raw_transcript: text,
          confidence: 0.85,
        };
      }
    }

    // Snooze task
    if (lowerText.includes('snooze') || lowerText.includes('later') || lowerText.includes('remind')) {
      const id = parseTaskId(text);
      if (id) {
        return {
          intent: 'snooze_task',
          parameters: { taskId: id },
          raw_transcript: text,
          confidence: 0.8,
        };
      }
    }

    // What's next
    if (lowerText.includes("what's next") || lowerText.includes('whats next') || lowerText.includes('what do i')) {
      return {
        intent: 'whats_next',
        parameters: {},
        raw_transcript: text,
        confidence: 0.9,
      };
    }

    // Join meeting
    if (lowerText.includes('join') && lowerText.includes('meeting')) {
      return {
        intent: 'join_meeting',
        parameters: {},
        raw_transcript: text,
        confidence: 0.85,
      };
    }

    // Start focus
    if (lowerText.includes('start focus') || lowerText.includes('focus mode')) {
      const durationMatch = text.match(/(\d+)\s*(hour|minute|min|hr)/i);
      const duration = durationMatch
        ? durationMatch[2].startsWith('hour') || durationMatch[2].startsWith('hr')
          ? parseInt(durationMatch[1]) * 60
          : parseInt(durationMatch[1])
        : 60;
      return {
        intent: 'start_focus',
        parameters: { duration },
        raw_transcript: text,
        confidence: 0.85,
      };
    }

    // End focus
    if (lowerText.includes('end focus') || lowerText.includes('stop focus') || lowerText.includes('exit focus')) {
      return {
        intent: 'end_focus',
        parameters: {},
        raw_transcript: text,
        confidence: 0.9,
      };
    }

    // Create task
    if (lowerText.includes('create task') || lowerText.includes('new task') || lowerText.includes('add task')) {
      const title = text.replace(/create\s+task|new\s+task|add\s+task/i, '').trim();
      return {
        intent: 'create_task',
        parameters: { title },
        raw_transcript: text,
        confidence: 0.75,
      };
    }

    // Navigation
    if (lowerText.includes('go to') || lowerText.includes('open') || lowerText.includes('show')) {
      if (lowerText.includes('dashboard')) {
        return { intent: 'navigate', parameters: { page: '/dashboard' }, raw_transcript: text, confidence: 0.9 };
      }
      if (lowerText.includes('task')) {
        return { intent: 'navigate', parameters: { page: '/tasks' }, raw_transcript: text, confidence: 0.9 };
      }
      if (lowerText.includes('idea')) {
        return { intent: 'navigate', parameters: { page: '/ideas' }, raw_transcript: text, confidence: 0.9 };
      }
      if (lowerText.includes('calendar')) {
        return { intent: 'navigate', parameters: { page: '/calendar' }, raw_transcript: text, confidence: 0.9 };
      }
      if (lowerText.includes('setting')) {
        return { intent: 'navigate', parameters: { page: '/settings' }, raw_transcript: text, confidence: 0.9 };
      }
    }

    // Search
    if (lowerText.includes('search') || lowerText.includes('find')) {
      const query = text.replace(/search\s+for|find/i, '').trim();
      return {
        intent: 'search',
        parameters: { query },
        raw_transcript: text,
        confidence: 0.7,
      };
    }

    return {
      intent: 'unknown',
      parameters: {},
      raw_transcript: text,
      confidence: 0.3,
    };
  };

  // Execute the parsed command
  const executeCommand = async (cmd: VoiceCommand) => {
    try {
      switch (cmd.intent) {
        case 'open_task': {
          const task = await fetchTaskByShortId(cmd.parameters.taskId as string);
          if (task) {
            navigate(`/tasks/${task.id}`);
            onClose();
          }
          break;
        }
        case 'complete_task': {
          const task = await fetchTaskByShortId(cmd.parameters.taskId as string);
          if (task) {
            await completeTask(task.id);
          }
          break;
        }
        case 'snooze_task': {
          const task = await fetchTaskByShortId(cmd.parameters.taskId as string);
          if (task) {
            const until = new Date();
            until.setHours(until.getHours() + 1);
            await snoozeTask(task.id, until);
          }
          break;
        }
        case 'whats_next':
          navigate('/tasks');
          onClose();
          break;
        case 'start_focus':
          await enterFocusMode(cmd.parameters.duration as number);
          onClose();
          break;
        case 'end_focus':
          await exitProtectedState();
          break;
        case 'navigate':
          navigate(cmd.parameters.page as string);
          onClose();
          break;
        case 'search':
          navigate(`/tasks?search=${encodeURIComponent(cmd.parameters.query as string)}`);
          onClose();
          break;
        case 'create_task': {
          const title = cmd.parameters.title as string;
          if (title) {
            await createTask({ title, priority: 50 });
            onClose();
          }
          break;
        }
        default:
          // Unknown command - keep modal open for user to see
          break;
      }
    } catch (err) {
      console.error('Command execution error:', err);
      setError('Failed to execute command.');
    }
  };

  // Handle confirming a pending action
  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    setIsProcessing(true);
    await executeCommand(pendingAction);
    setPendingAction(null);
    setIsProcessing(false);
  };

  // Handle canceling a pending action
  const handleCancelAction = () => {
    setPendingAction(null);
    setCommand(null);
    setTranscript('');
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isListening && !isProcessing) {
        e.preventDefault();
        startListening();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && isListening) {
        e.preventDefault();
        stopListening();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [isListening, isProcessing, startListening, stopListening]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Voice Command</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Main content - scrollable */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* Microphone button */}
          <div className="flex justify-center mb-6">
            <button
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onTouchStart={startListening}
              onTouchEnd={stopListening}
              disabled={isProcessing}
              className={cn(
                'w-24 h-24 rounded-full flex items-center justify-center transition-all duration-200',
                isListening
                  ? 'bg-red-500 text-white scale-110 shadow-lg shadow-red-500/30'
                  : 'bg-watershed-100 text-watershed-600 hover:bg-watershed-200'
              )}
            >
              {isProcessing ? (
                <Loader2 className="w-10 h-10 animate-spin" />
              ) : isListening ? (
                <Mic className="w-10 h-10 animate-pulse" />
              ) : (
                <Mic className="w-10 h-10" />
              )}
            </button>
          </div>

          {/* Instructions */}
          <p className="text-center text-sm text-gray-500 mb-4">
            {isListening
              ? 'Listening... Release to process'
              : isProcessing
              ? 'Processing...'
              : 'Hold Space or tap microphone to speak'}
          </p>

          {/* Transcript display */}
          {(transcript || interimTranscript) && (
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <p className="text-gray-900">
                {transcript}
                <span className="text-gray-400">{interimTranscript}</span>
              </p>
            </div>
          )}

          {/* Command result */}
          {command && (
            <div
              className={cn(
                'rounded-lg p-4 mb-4',
                command.intent === 'unknown'
                  ? 'bg-amber-50 border border-amber-200'
                  : pendingAction
                  ? 'bg-blue-50 border border-blue-200'
                  : 'bg-green-50 border border-green-200'
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <Volume2 className={cn(
                  'w-4 h-4',
                  command.intent === 'unknown' ? 'text-amber-600' : pendingAction ? 'text-blue-600' : 'text-green-600'
                )} />
                <span className={cn(
                  'text-sm font-medium',
                  command.intent === 'unknown' ? 'text-amber-700' : pendingAction ? 'text-blue-700' : 'text-green-700'
                )}>
                  {command.intent === 'unknown'
                    ? "Didn't understand"
                    : pendingAction
                    ? `Confirm: ${command.intent.replace('_', ' ')}`
                    : `Executing: ${command.intent.replace('_', ' ')}`}
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-1">
                Confidence: {Math.round(command.confidence * 100)}%
              </p>
              {pendingAction && pendingAction.intent === 'create_task' && (
                <p className="text-sm text-gray-700 font-medium mt-2">
                  Task: "{pendingAction.parameters.title}"
                </p>
              )}
            </div>
          )}

          {/* Confirmation buttons for pending actions */}
          {pendingAction && (
            <div className="flex gap-3 mb-4">
              <button
                onClick={handleConfirmAction}
                disabled={isProcessing}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-watershed-600 text-white rounded-lg hover:bg-watershed-700 disabled:opacity-50 font-medium"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {isProcessing ? 'Creating...' : 'Create Task'}
              </button>
              <button
                onClick={handleCancelAction}
                disabled={isProcessing}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 font-medium"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Example commands */}
        <div className="bg-gray-50 p-4 border-t border-gray-200 flex-shrink-0">
          <p className="text-xs font-medium text-gray-500 mb-2">Example commands:</p>
          <div className="flex flex-wrap gap-2">
            {[
              'Open T-1234',
              'Complete T-5678',
              "What's next?",
              'Start focus mode',
              'Go to calendar',
            ].map((example) => (
              <span
                key={example}
                className="text-xs px-2 py-1 bg-white border border-gray-200 rounded-full text-gray-600"
              >
                {example}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
