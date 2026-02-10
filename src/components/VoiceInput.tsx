import { useState, useEffect, useCallback, useRef } from 'react';
import { Mic, Loader2, X, Volume2, Check, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTaskStore } from '../store/taskStore';
import { useUserStateStore } from '../store/userStateStore';
import { useGeodeEmailStore } from '../store/geodeEmailStore';
import { generateVoiceResponse } from '../lib/aiService';
import { GEODE_STATES, GEODE_CHAPTER_TYPES } from '../types/geode';
import { AUTHOR_AGREEMENT_ACTIONS } from '../types/geodeEmailEvents';
import type { GeodeState, GeodeContentSection } from '../types/geode';
import type { VoiceCommand, TaskWithRelations } from '../types';
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
  const [textInput, setTextInput] = useState('');
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('voice');

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const navigate = useNavigate();

  const { fetchTaskByShortId, completeTask, snoozeTask, createTask } = useTaskStore();
  const { enterFocusMode, exitProtectedState } = useUserStateStore();
  const { getPendingTasks, confirmTask, addEmailEvent } = useGeodeEmailStore();
  const [pendingAction, setPendingAction] = useState<VoiceCommand | null>(null);
  const [aiResponse, setAiResponse] = useState<string | null>(null);

  // State for GEODE workflow clarification
  const [clarificationMode, setClarificationMode] = useState<'state' | 'chapter' | 'author' | null>(null);
  const [pendingGeodeTask, setPendingGeodeTask] = useState<TaskWithRelations | null>(null);
  const [geodeContext, setGeodeContext] = useState<{
    state?: GeodeState;
    chapterType?: GeodeContentSection;
    authorName?: string;
    authorEmail?: string;
  }>({});

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
        setAiResponse(null);
        const fullTranscript = transcript + interimTranscript;
        const parsedCommand = parseVoiceCommand(fullTranscript);
        setCommand(parsedCommand);

        // For create_task, require user confirmation before executing
        if (parsedCommand.intent === 'create_task' && parsedCommand.parameters.title) {
          setPendingAction(parsedCommand);
          setIsProcessing(false);
        } else if (parsedCommand.intent === 'unknown') {
          // Send to AI for interpretation
          await processWithAI(fullTranscript);
          setIsProcessing(false);
        } else {
          await executeCommand(parsedCommand);
          setIsProcessing(false);
        }
      }
    }
  }, [isListening, transcript, interimTranscript]);

  // Process text input
  const handleTextSubmit = useCallback(async () => {
    if (!textInput.trim()) return;

    setIsProcessing(true);
    setAiResponse(null);
    setTranscript(textInput);

    const parsedCommand = parseVoiceCommand(textInput);
    console.log('[VoiceInput] Parsed command:', parsedCommand);
    setCommand(parsedCommand);

    // For create_task, require user confirmation before executing
    if (parsedCommand.intent === 'create_task' && parsedCommand.parameters.title) {
      setPendingAction(parsedCommand);
      setIsProcessing(false);
    } else if (parsedCommand.intent === 'execute_geode') {
      // For GEODE commands, also require confirmation
      setPendingAction(parsedCommand);
      setIsProcessing(false);
    } else if (parsedCommand.intent === 'unknown') {
      // Send to AI for interpretation
      await processWithAI(textInput);
      setIsProcessing(false);
    } else {
      await executeCommand(parsedCommand);
      setIsProcessing(false);
    }

    setTextInput('');
  }, [textInput]);

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

    // Execute GEODE workflow
    if (lowerText.includes('execute') && (lowerText.includes('geode') || lowerText.includes('workflow') || lowerText.includes('contract'))) {
      // Extract the task description from the command
      const taskDescription = text
        .replace(/execute\s+(the\s+)?geode\s+(contract\s+)?workflow\s+(for\s+)?/i, '')
        .replace(/execute\s+(the\s+)?workflow\s+(for\s+)?/i, '')
        .replace(/execute\s+(the\s+)?contract\s+(workflow\s+)?(for\s+)?/i, '')
        .trim();

      // Also extract task IDs if present (e.g., "task 0035" or just "0035")
      const taskIdMatches = text.match(/\b0*(\d{1,4})\b/g);
      const taskIds = taskIdMatches ? taskIdMatches.map(m => m.replace(/^0+/, '') || '0').join(',') : undefined;

      return {
        intent: 'execute_geode' as VoiceCommand['intent'],
        parameters: {
          taskDescription,
          ...(taskIds && { taskIds })
        },
        raw_transcript: text,
        confidence: 0.85,
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
        case 'execute_geode': {
          // Execute tasks - check BOTH GEODE email store AND main task store
          const pendingGeodeTasks = getPendingTasks();
          const taskDescription = cmd.parameters.taskDescription as string;
          const taskIdsParam = cmd.parameters.taskIds as string;

          console.log('[VoiceInput] execute_geode - taskIds:', taskIdsParam, 'description:', taskDescription);
          console.log('[VoiceInput] pendingGeodeTasks count:', pendingGeodeTasks.length);

          // If specific task IDs were provided (e.g., "0035,0036,0037")
          if (taskIdsParam) {
            const taskIds = taskIdsParam.split(',').map(id => id.trim());
            console.log('[VoiceInput] Processing task IDs:', taskIds);
            const executed: string[] = [];
            const notFound: string[] = [];
            const needsContext: { taskId: string; task: TaskWithRelations }[] = [];

            for (const taskId of taskIds) {
              let found = false;
              console.log('[VoiceInput] Looking up task:', taskId);

              // First check GEODE email store - by linked short ID or task ID suffix
              const matchingGeodeTask = pendingGeodeTasks.find(task => {
                // Check if this GEODE task is linked to the short ID
                if (task.linkedTaskShortId) {
                  const shortNum = task.linkedTaskShortId.replace('T-', '');
                  if (shortNum === taskId.padStart(4, '0') || shortNum === taskId) {
                    return true;
                  }
                }
                // Also check the task ID suffix
                const idSuffix = task.id.slice(-4).replace(/^0+/, '');
                return idSuffix === taskId || task.id.endsWith(taskId);
              });

              if (matchingGeodeTask) {
                console.log('[VoiceInput] Found matching GEODE task:', matchingGeodeTask.id);
                await confirmTask(matchingGeodeTask.id, 'voice-command');
                executed.push(`T-${taskId.padStart(4, '0')}`);
                found = true;
              }

              // If not found in GEODE store, check main task store
              if (!found) {
                console.log('[VoiceInput] Not in GEODE store, checking main task store for:', taskId);
                try {
                  // Add timeout to prevent hanging
                  const timeoutPromise = new Promise<null>((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout')), 10000)
                  );
                  const mainTask = await Promise.race([
                    fetchTaskByShortId(taskId),
                    timeoutPromise
                  ]) as TaskWithRelations | null;
                  console.log('[VoiceInput] Main task lookup result:', mainTask ? mainTask.short_id : 'not found');

                if (mainTask) {
                  // Check if there's a linked GEODE task
                  const linkedGeodeTask = pendingGeodeTasks.find(t => t.linkedTaskId === mainTask.id);
                  if (linkedGeodeTask) {
                    console.log('[VoiceInput] Found linked GEODE task');
                    await confirmTask(linkedGeodeTask.id, 'voice-command');
                    executed.push(mainTask.short_id || `T-${taskId.padStart(4, '0')}`);
                    found = true;
                  } else {
                    // Task exists but has no GEODE context - need to ask for details
                    console.log('[VoiceInput] Task needs GEODE context:', mainTask.short_id);
                    needsContext.push({ taskId, task: mainTask });
                    found = true;
                  }
                }
                } catch (fetchError) {
                  console.error('[VoiceInput] Error fetching task:', fetchError);
                  // Task lookup failed - treat as not found
                }
              }

              if (!found) {
                console.log('[VoiceInput] Task not found:', taskId);
                notFound.push(taskId);
              }
            }

            console.log('[VoiceInput] Results - executed:', executed, 'notFound:', notFound, 'needsContext:', needsContext.length);

            // If any tasks need GEODE context, enter clarification mode
            if (needsContext.length > 0) {
              const firstTask = needsContext[0];
              console.log('[VoiceInput] Entering clarification mode for:', firstTask.task.short_id);
              setPendingGeodeTask(firstTask.task);
              setGeodeContext({});
              setClarificationMode('state');
              setAiResponse(`Task ${firstTask.task.short_id} "${firstTask.task.title}" needs GEODE context. Please select the state:`);
              return; // Don't close, wait for user input
            }

            if (executed.length > 0) {
              const msg = `Executed ${executed.length} task(s): ${executed.join(', ')}`;
              const notFoundMsg = notFound.length > 0 ? `. Not found: ${notFound.join(', ')}` : '';
              setAiResponse(msg + notFoundMsg);
            } else {
              setAiResponse(`No matching tasks found for IDs: ${taskIds.join(', ')}`);
            }
          } else if (pendingGeodeTasks.length === 0) {
            setAiResponse('No pending GEODE tasks to execute.');
          } else {
            // Find tasks matching the description (fuzzy match)
            const matchingTask = pendingGeodeTasks.find(task => {
              const titleMatch = task.title.toLowerCase().includes(taskDescription?.toLowerCase() || '');
              const descMatch = task.description?.toLowerCase().includes(taskDescription?.toLowerCase() || '');
              return titleMatch || descMatch;
            });

            if (matchingTask) {
              await confirmTask(matchingTask.id, 'voice-command');
              setAiResponse(`Executed GEODE task: ${matchingTask.title}`);
            } else {
              // No matching task, show all pending tasks
              setAiResponse(`No matching task found. ${pendingGeodeTasks.length} pending GEODE tasks available.`);
            }
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

  // Process unknown commands with AI
  const processWithAI = async (transcriptText: string) => {
    try {
      console.log('[VoiceInput] Sending to AI:', transcriptText);

      // First, try local parsing for common patterns that AI isn't needed for
      const localResult = tryLocalParsing(transcriptText);
      if (localResult) {
        setCommand(localResult);
        if (localResult.intent === 'execute_geode') {
          setPendingAction(localResult);
        } else {
          await executeCommand(localResult);
        }
        return;
      }

      // Build context about what actions are available
      const pendingTasks = getPendingTasks();
      const geodeContext = pendingTasks.length > 0
        ? `Available GEODE tasks to execute: ${pendingTasks.map(t => `"${t.title}"`).join(', ')}`
        : 'No pending GEODE tasks.';

      const response = await generateVoiceResponse(
        `User voice command: "${transcriptText}"\n\n` +
        `Context: ${geodeContext}\n\n` +
        `Available actions:\n` +
        `- execute_geode: Execute a GEODE workflow task\n` +
        `- create_task: Create a new task\n` +
        `- navigate: Go to a page (dashboard, tasks, ideas, calendar, settings)\n` +
        `- start_focus: Start focus mode\n` +
        `- search: Search for something\n\n` +
        `Respond with JSON: {"intent": "action_name", "parameters": {...}, "message": "human readable response"}\n` +
        `If you cannot determine the intent, respond with {"intent": "unknown", "message": "explanation"}`
      );

      console.log('[VoiceInput] AI response:', response);

      if (response.success && response.data) {
        const data = response.data as { intent?: string; parameters?: Record<string, unknown>; message?: string; response?: string };

        // Check if the response has a structured intent
        if (data.intent && data.intent !== 'unknown') {
          // Convert parameters to the expected type
          const params: Record<string, string | number | boolean> = {};
          if (data.parameters) {
            for (const [key, value] of Object.entries(data.parameters)) {
              if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                params[key] = value;
              }
            }
          }

          const aiCommand: VoiceCommand = {
            intent: data.intent as VoiceCommand['intent'],
            parameters: params,
            raw_transcript: transcriptText,
            confidence: 0.8,
          };

          setCommand(aiCommand);
          setAiResponse(data.message || data.response || null);

          // For certain intents, require confirmation
          if (data.intent === 'create_task' || data.intent === 'execute_geode') {
            setPendingAction(aiCommand);
          } else {
            await executeCommand(aiCommand);
          }
        } else {
          // AI couldn't determine a clear action
          setAiResponse(data.message || data.response || 'I understood your request but I\'m not sure what action to take. Try being more specific.');
        }
      } else {
        // AI request failed - try fallback parsing
        console.log('[VoiceInput] AI failed, trying fallback parsing');
        const fallbackResult = tryLocalParsing(transcriptText);
        if (fallbackResult && fallbackResult.intent !== 'unknown') {
          setCommand(fallbackResult);
          setAiResponse(`AI unavailable. Using local parsing: ${fallbackResult.intent.replace(/_/g, ' ')}`);
          if (fallbackResult.intent === 'execute_geode') {
            setPendingAction(fallbackResult);
          } else {
            await executeCommand(fallbackResult);
          }
        } else {
          setAiResponse(response.error || 'AI service unavailable. Try commands like "execute task 0035" or "create task [title]".');
        }
      }
    } catch (err) {
      console.error('[VoiceInput] AI processing error:', err);
      setAiResponse('Failed to process with AI. Try a simpler command.');
    }
  };

  // Try to parse the command locally without AI
  const tryLocalParsing = (text: string): VoiceCommand | null => {
    const lowerText = text.toLowerCase();

    // Pattern: "execute task 0035" or "execute tasks 0035 0036 0037"
    const taskIdMatches = text.match(/\b0*(\d{1,4})\b/g);
    if (taskIdMatches && (lowerText.includes('execute') || lowerText.includes('confirm') || lowerText.includes('approve'))) {
      // Found task IDs to execute
      const taskIds = taskIdMatches.map(m => m.replace(/^0+/, '')); // Remove leading zeros
      return {
        intent: 'execute_geode',
        parameters: { taskIds: taskIds.join(','), taskDescription: `tasks ${taskIds.join(', ')}` },
        raw_transcript: text,
        confidence: 0.85,
      };
    }

    // Pattern: numbers mentioned with "task" - could be task IDs
    if (lowerText.includes('task') && taskIdMatches) {
      const taskIds = taskIdMatches.map(m => m.replace(/^0+/, ''));
      // Check if this looks like an execute command
      if (lowerText.includes('execute') || lowerText.includes('confirm') || lowerText.includes('run')) {
        return {
          intent: 'execute_geode',
          parameters: { taskIds: taskIds.join(','), taskDescription: `tasks ${taskIds.join(', ')}` },
          raw_transcript: text,
          confidence: 0.8,
        };
      }
    }

    return null;
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
    setClarificationMode(null);
    setPendingGeodeTask(null);
    setGeodeContext({});
  };

  // Handle GEODE context selection
  const handleStateSelect = (state: GeodeState) => {
    setGeodeContext(prev => ({ ...prev, state }));
    setClarificationMode('chapter');
    setAiResponse(`State: ${GEODE_STATES.find(s => s.value === state)?.label}. Now select the chapter type:`);
  };

  const handleChapterSelect = (chapterType: GeodeContentSection) => {
    setGeodeContext(prev => ({ ...prev, chapterType }));
    setClarificationMode('author');
    setAiResponse(`Chapter: ${GEODE_CHAPTER_TYPES.find(c => c.value === chapterType)?.label}. Enter author name (or skip):`);
  };

  const handleAuthorInput = (authorName: string) => {
    const finalContext = { ...geodeContext, authorName: authorName || undefined };
    executeGeodeWorkflowWithContext(finalContext);
  };

  const handleSkipAuthor = () => {
    executeGeodeWorkflowWithContext(geodeContext);
  };

  // Execute GEODE workflow with collected context
  const executeGeodeWorkflowWithContext = async (context: typeof geodeContext) => {
    if (!pendingGeodeTask) return;

    setIsProcessing(true);
    setClarificationMode(null);

    try {
      // Create a GEODE email event from the task with the collected context
      const eventId = `manual_${Date.now()}`;
      const event = {
        id: eventId,
        emailId: `task_${pendingGeodeTask.id}`,
        subject: pendingGeodeTask.title,
        fromEmail: context.authorEmail || 'manual@watershed.app',
        fromName: context.authorName || 'Manual Entry',
        toEmails: ['trent@projectinnerspace.org'],
        ccEmails: [],
        receivedAt: new Date().toISOString(),
        snippet: pendingGeodeTask.description || '',
        eventType: 'author_agreed' as const,
        confidence: 1.0,
        detectedState: context.state,
        detectedChapter: context.chapterType,
        detectedAuthorName: context.authorName,
        detectedAuthorEmail: context.authorEmail,
        extractedDetails: {
          ...(context.authorName && { authorName: context.authorName }),
          ...(context.authorEmail && { authorEmail: context.authorEmail }),
        },
        suggestedActions: AUTHOR_AGREEMENT_ACTIONS,
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
      };

      // Add the event to create a GEODE confirmation task
      addEmailEvent(event);

      // Now confirm it immediately to execute the workflow
      const geodeTaskId = `task_${eventId}`;
      await confirmTask(geodeTaskId, 'voice-command');

      // Also complete the original task
      await completeTask(pendingGeodeTask.id);

      setAiResponse(`✓ Executed GEODE workflow for ${pendingGeodeTask.short_id}: ${context.state ? GEODE_STATES.find(s => s.value === context.state)?.abbreviation : ''} ${context.chapterType ? GEODE_CHAPTER_TYPES.find(c => c.value === context.chapterType)?.label : ''}`);
    } catch (err) {
      console.error('GEODE workflow execution error:', err);
      setError('Failed to execute GEODE workflow');
    } finally {
      setIsProcessing(false);
      setPendingGeodeTask(null);
      setGeodeContext({});
    }
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
          <h2 className="text-lg font-semibold text-gray-900">Command</h2>
          <div className="flex items-center gap-2">
            {/* Mode toggle */}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setInputMode('voice')}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                  inputMode === 'voice' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                )}
              >
                Voice
              </button>
              <button
                onClick={() => setInputMode('text')}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                  inputMode === 'text' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                )}
              >
                Text
              </button>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Main content - scrollable */}
        <div className="p-6 overflow-y-auto flex-1">
          {inputMode === 'voice' ? (
            <>
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
            </>
          ) : (
            <>
              {/* Text input */}
              <div className="mb-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isProcessing) {
                        handleTextSubmit();
                      }
                    }}
                    placeholder="Type your command..."
                    className="flex-1 px-4 py-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-watershed-500 focus:ring-1 focus:ring-watershed-500"
                    disabled={isProcessing}
                    autoFocus
                  />
                  <button
                    onClick={handleTextSubmit}
                    disabled={isProcessing || !textInput.trim()}
                    className="px-4 py-3 bg-watershed-600 text-white rounded-lg hover:bg-watershed-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Check className="w-5 h-5" />
                    )}
                  </button>
                </div>
                <p className="text-center text-xs text-gray-400 mt-2">
                  Press Enter to submit
                </p>
              </div>
            </>
          )}

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
                command.intent === 'unknown' && !aiResponse
                  ? 'bg-amber-50 border border-amber-200'
                  : pendingAction
                  ? 'bg-blue-50 border border-blue-200'
                  : aiResponse
                  ? 'bg-purple-50 border border-purple-200'
                  : 'bg-green-50 border border-green-200'
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                {aiResponse ? (
                  <Sparkles className="w-4 h-4 text-purple-600" />
                ) : (
                  <Volume2 className={cn(
                    'w-4 h-4',
                    command.intent === 'unknown' ? 'text-amber-600' : pendingAction ? 'text-blue-600' : 'text-green-600'
                  )} />
                )}
                <span className={cn(
                  'text-sm font-medium',
                  command.intent === 'unknown' && !aiResponse
                    ? 'text-amber-700'
                    : pendingAction
                    ? 'text-blue-700'
                    : aiResponse
                    ? 'text-purple-700'
                    : 'text-green-700'
                )}>
                  {command.intent === 'unknown' && !aiResponse
                    ? 'Processing with AI...'
                    : pendingAction
                    ? `Confirm: ${command.intent.replace(/_/g, ' ')}`
                    : aiResponse
                    ? 'AI Response'
                    : `Executing: ${command.intent.replace(/_/g, ' ')}`}
                </span>
              </div>
              {!aiResponse && (
                <p className="text-sm text-gray-600 mb-1">
                  Confidence: {Math.round(command.confidence * 100)}%
                </p>
              )}
              {aiResponse && (
                <p className="text-sm text-gray-700 mt-2">
                  {aiResponse}
                </p>
              )}
              {pendingAction && pendingAction.intent === 'create_task' && (
                <p className="text-sm text-gray-700 font-medium mt-2">
                  Task: "{pendingAction.parameters.title}"
                </p>
              )}
              {pendingAction && pendingAction.intent === 'execute_geode' && (
                <p className="text-sm text-gray-700 font-medium mt-2">
                  GEODE Task: "{pendingAction.parameters.taskDescription || 'Execute workflow'}"
                </p>
              )}
            </div>
          )}

          {/* Confirmation buttons for pending actions */}
          {pendingAction && !clarificationMode && (
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
                {isProcessing
                  ? pendingAction.intent === 'execute_geode' ? 'Executing...' : 'Creating...'
                  : pendingAction.intent === 'execute_geode' ? 'Execute' : 'Create Task'}
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

          {/* GEODE Context Clarification UI */}
          {clarificationMode && pendingGeodeTask && (
            <div className="mb-4 space-y-3">
              {/* Task info banner */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <p className="text-sm text-purple-700 font-medium">
                  Setting up GEODE workflow for: {pendingGeodeTask.short_id} "{pendingGeodeTask.title}"
                </p>
              </div>

              {/* State Selection */}
              {clarificationMode === 'state' && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">Select State:</p>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                    {GEODE_STATES.map(state => (
                      <button
                        key={state.value}
                        onClick={() => handleStateSelect(state.value)}
                        className="text-left px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-watershed-300 transition-colors"
                      >
                        <span className="font-medium">{state.abbreviation}</span>
                        <span className="text-gray-500 ml-1 text-xs">{state.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Chapter Selection */}
              {clarificationMode === 'chapter' && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">Select Chapter Type:</p>
                  <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                    {GEODE_CHAPTER_TYPES.map(chapter => (
                      <button
                        key={chapter.value}
                        onClick={() => handleChapterSelect(chapter.value)}
                        className="text-left px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-watershed-300 transition-colors"
                      >
                        <span className="font-medium">Ch {chapter.chapterNum}:</span>
                        <span className="text-gray-600 ml-1">{chapter.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Author Input */}
              {clarificationMode === 'author' && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">Author Name (optional):</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter author name..."
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-watershed-500"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleAuthorInput((e.target as HTMLInputElement).value);
                        }
                      }}
                      autoFocus
                    />
                    <button
                      onClick={(e) => {
                        const input = (e.target as HTMLElement).parentElement?.querySelector('input');
                        handleAuthorInput(input?.value || '');
                      }}
                      className="px-4 py-2 bg-watershed-600 text-white text-sm font-medium rounded-lg hover:bg-watershed-700"
                    >
                      Continue
                    </button>
                    <button
                      onClick={handleSkipAuthor}
                      className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              )}

              {/* Cancel button */}
              <button
                onClick={handleCancelAction}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200"
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
              'Execute GEODE workflow',
              'Create task review proposal',
              "What's next?",
              'Start focus mode',
              'Go to dashboard',
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
