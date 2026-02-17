import { useState, useEffect, useCallback, useRef } from 'react';
import { Mic, Loader2, X, Send, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTaskStore } from '../store/taskStore';
import { useUserStateStore } from '../store/userStateStore';
import { useSequencingStore } from '../store/sequencingStore';
import { useGeodeChapterStore } from '../store/geodeChapterStore';
import type { VoiceCommand, TaskWithRelations } from '../types';
import { GEODE_CHAPTER_TYPES, GEODE_STATES } from '../types/geode';
import { getStepMeta, calculateWorkflowProgress } from '../types/geodeWorkflow';
import { cn, parseTaskId } from '../lib/utils';
import { aiChat } from '../lib/edgeFunctions';
import { isGmailConnected, fetchRecentEmails, fetchSentEmails } from '../lib/gmailService';
import type { ParsedEmail } from '../types/gmail';

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

interface CommandBarProps {
  onGeodeWorkflow?: (task: TaskWithRelations) => void;
}

// Build a context summary for Claude about the current app state
function buildAppContext(extraContext?: string): string {
  const taskStore = useTaskStore.getState();
  const sequencingStore = useSequencingStore.getState();
  const userStateStore = useUserStateStore.getState();
  const geodeChapterStore = useGeodeChapterStore.getState();

  const tasks = taskStore.tasks || [];
  const openTasks = tasks.filter((t) => t.status !== 'completed').slice(0, 10);
  const invitees = sequencingStore.invitees || [];
  const confirmed = invitees.filter((i) => i.status === 'confirmed');
  const pending = invitees.filter((i) => i.status === 'sent' || i.status === 'follow_up_sent');

  // Build GEODE chapter summary
  const geodeLines: string[] = [];
  for (const state of GEODE_STATES) {
    const chapters = geodeChapterStore.getChaptersForState(state.value);
    if (chapters.length === 0) continue;

    const chapterSummaries = chapters.map((ch) => {
      const chapterInfo = GEODE_CHAPTER_TYPES.find((c) => c.value === ch.chapterType);
      const label = chapterInfo ? `Ch ${chapterInfo.chapterNum} ${chapterInfo.label}` : ch.chapterType;
      const stepMeta = getStepMeta(ch.workflowType, ch.currentStep);
      const stepLabel = stepMeta?.shortLabel || ch.currentStep;
      const progress = calculateWorkflowProgress(ch.workflowType, ch.currentStep);
      const parts = [`${label}: ${stepLabel} (${progress}%)`];
      if (ch.currentOwner) parts.push(`owner: ${ch.currentOwner}`);
      if (ch.blockers) parts.push(`BLOCKER: ${ch.blockers}`);
      if (ch.notes) parts.push(`notes: ${ch.notes}`);
      return parts.join(' | ');
    });

    geodeLines.push(`  ${state.label} (${state.abbreviation}) [DOE deadline: ${state.doeDeadline}]:`);
    chapterSummaries.forEach((s) => geodeLines.push(`    - ${s}`));
  }

  const gmailStatus = isGmailConnected() ? 'Connected' : 'Not connected';

  let context = `You are the AI assistant for Wellspring (Watershed Command Center), a project management tool for Project InnerSpace's GEODE state geothermal reports.

Current app state:
- User state: ${userStateStore.currentState}
- Gmail: ${gmailStatus}
- Open tasks: ${openTasks.length} (${openTasks.slice(0, 5).map((t) => `"${t.title}" [${t.short_id}]`).join(', ')})
- Sequencing: ${invitees.length} total invitees for CERA Week 2026
  - Confirmed: ${confirmed.length} (${confirmed.map((i) => i.name).join(', ') || 'none yet'})
  - Invitation sent: ${pending.length}
  - Not started: ${invitees.filter((i) => i.status === 'not_started').length}

GEODE Report Chapter Status:
${geodeLines.length > 0 ? geodeLines.join('\n') : '  No chapters initialized yet.'}

Available app commands the user can run:
- "go to [dashboard/tasks/ideas/calendar/geode/sequencing/admin]" - navigate
- "create task [title]" - create a new task
- "complete [task ID]" - mark task as done
- "execute geode [task ID]" - run GEODE workflow
- "start focus [duration]" - enter focus mode
- "end focus" - exit focus mode`;

  if (extraContext) {
    context += `\n\n--- Live Data ---\n${extraContext}`;
  }

  context += `\n\nRespond helpfully based on all available data. If the user asks about emails, use the email data provided. If they ask about GEODE chapters, use the chapter status above. Be direct and specific.`;

  return context;
}

// Detect if a query is about emails so we can pre-fetch email data
function isEmailQuery(text: string): { isEmail: boolean; wantsSent: boolean; wantsReceived: boolean; count: number } {
  const lower = text.toLowerCase();
  const emailKeywords = ['email', 'emails', 'gmail', 'inbox', 'sent', 'message', 'messages', 'mail'];
  const isEmail = emailKeywords.some((k) => lower.includes(k));

  const wantsSent = lower.includes('sent') || lower.includes('i sent') || lower.includes('my sent') || lower.includes('outgoing');
  const wantsReceived = lower.includes('receiv') || lower.includes('inbox') || lower.includes('incoming') || lower.includes('got');

  // Extract count from query (e.g., "last 25 emails")
  const countMatch = text.match(/(\d+)\s*(email|message|mail)/i);
  const count = countMatch ? Math.min(parseInt(countMatch[1]), 50) : 25;

  return { isEmail, wantsSent, wantsReceived, count };
}

// Summarize emails for Claude context (respects token limits)
function summarizeEmails(emails: ParsedEmail[], label: string): string {
  if (emails.length === 0) return `${label}: None found.\n`;

  const lines = [`${label} (${emails.length} emails):`];
  for (const email of emails) {
    const date = email.date instanceof Date ? email.date.toLocaleDateString() : String(email.date);
    const from = email.from.name || email.from.email;
    const to = email.to.map((t) => t.name || t.email).join(', ');
    // Truncate body for context window
    const bodyPreview = (email.body || email.snippet || '').slice(0, 200);
    lines.push(`  - [${date}] From: ${from} | To: ${to} | Subject: ${email.subject}`);
    lines.push(`    Preview: ${bodyPreview}`);
  }
  return lines.join('\n');
}

async function askClaude(question: string): Promise<string | null> {
  let extraContext = '';

  // Check if this is an email-related query and pre-fetch data
  const emailAnalysis = isEmailQuery(question);
  if (emailAnalysis.isEmail && isGmailConnected()) {
    try {
      const fetchPromises: Promise<ParsedEmail[]>[] = [];
      const labels: string[] = [];

      if (emailAnalysis.wantsSent || (!emailAnalysis.wantsSent && !emailAnalysis.wantsReceived)) {
        fetchPromises.push(fetchSentEmails({ maxResults: emailAnalysis.count }));
        labels.push('Sent Emails');
      }
      if (emailAnalysis.wantsReceived || (!emailAnalysis.wantsSent && !emailAnalysis.wantsReceived)) {
        fetchPromises.push(fetchRecentEmails({ maxResults: emailAnalysis.count, folder: 'inbox' }));
        labels.push('Received Emails');
      }

      const results = await Promise.all(fetchPromises);
      results.forEach((emails, i) => {
        extraContext += summarizeEmails(emails, labels[i]) + '\n';
      });
    } catch (err) {
      console.error('[CommandBar] Failed to fetch emails for context:', err);
      extraContext += 'Gmail error: Could not fetch emails. Token may have expired — user should reconnect Google account in Settings.\n';
    }
  } else if (emailAnalysis.isEmail && !isGmailConnected()) {
    extraContext += 'Gmail is not connected. The user needs to connect their Google account in Settings > Integrations to enable email access.\n';
  }

  return aiChat(question, {
    system: buildAppContext(extraContext),
    max_tokens: 1024,
  });
}

export default function CommandBar({ onGeodeWorkflow }: CommandBarProps) {
  const [inputValue, setInputValue] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info' | 'ai'; message: string } | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const { fetchTaskByShortId, completeTask, createTask } = useTaskStore();
  const { enterFocusMode, exitProtectedState } = useUserStateStore();

  // Initialize speech recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInputValue(transcript);
    };

    recognition.onerror = () => {
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

  // Toggle voice input
  const toggleVoice = useCallback(() => {
    if (!recognitionRef.current) {
      setFeedback({ type: 'error', message: 'Voice not supported' });
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setInputValue('');
      recognitionRef.current.start();
    }
  }, [isListening]);

  // Clear feedback after delay (longer for AI responses)
  useEffect(() => {
    if (feedback) {
      const delay = feedback.type === 'ai' ? 30000 : 3000;
      const timer = setTimeout(() => setFeedback(null), delay);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  // Parse voice command
  const parseCommand = (text: string): VoiceCommand => {
    const lowerText = text.toLowerCase().trim();

    // Open task by ID
    const taskId = parseTaskId(text);
    if (taskId && (lowerText.includes('open') || lowerText.includes('show'))) {
      return { intent: 'open_task', parameters: { taskId }, raw_transcript: text, confidence: 0.9 };
    }

    // Complete task
    if (lowerText.includes('complete') || lowerText.includes('done') || lowerText.includes('finish')) {
      const id = parseTaskId(text);
      if (id) {
        return { intent: 'complete_task', parameters: { taskId: id }, raw_transcript: text, confidence: 0.85 };
      }
    }

    // Execute GEODE workflow
    if (lowerText.includes('execute') && (lowerText.includes('geode') || lowerText.includes('workflow') || lowerText.includes('contract'))) {
      const taskIdMatches = text.match(/\b0*(\d{1,4})\b/g);
      const taskIds = taskIdMatches ? taskIdMatches.map(m => m.replace(/^0+/, '') || '0').join(',') : undefined;
      return {
        intent: 'execute_geode' as VoiceCommand['intent'],
        parameters: taskIds ? { taskIds } : {},
        raw_transcript: text,
        confidence: 0.85,
      };
    }

    // Create task
    if (lowerText.includes('create task') || lowerText.includes('new task') || lowerText.includes('add task')) {
      const title = text.replace(/create\s+task|new\s+task|add\s+task/i, '').trim();
      return { intent: 'create_task', parameters: { title }, raw_transcript: text, confidence: 0.75 };
    }

    // Navigation
    if (lowerText.includes('go to') || lowerText.startsWith('open ') || lowerText.startsWith('show ')) {
      if (lowerText.includes('dashboard')) return { intent: 'navigate', parameters: { page: '/dashboard' }, raw_transcript: text, confidence: 0.9 };
      if (lowerText.includes('task')) return { intent: 'navigate', parameters: { page: '/tasks' }, raw_transcript: text, confidence: 0.9 };
      if (lowerText.includes('idea')) return { intent: 'navigate', parameters: { page: '/ideas' }, raw_transcript: text, confidence: 0.9 };
      if (lowerText.includes('calendar')) return { intent: 'navigate', parameters: { page: '/calendar' }, raw_transcript: text, confidence: 0.9 };
      if (lowerText.includes('geode')) return { intent: 'navigate', parameters: { page: '/geode' }, raw_transcript: text, confidence: 0.9 };
      if (lowerText.includes('sequencing')) return { intent: 'navigate', parameters: { page: '/sequencing' }, raw_transcript: text, confidence: 0.9 };
      if (lowerText.includes('admin')) return { intent: 'navigate', parameters: { page: '/admin' }, raw_transcript: text, confidence: 0.9 };
    }

    // Focus mode
    if (lowerText.includes('start focus') || lowerText.includes('focus mode')) {
      const durationMatch = text.match(/(\d+)\s*(hour|minute|min|hr)/i);
      const duration = durationMatch
        ? durationMatch[2].startsWith('hour') || durationMatch[2].startsWith('hr')
          ? parseInt(durationMatch[1]) * 60
          : parseInt(durationMatch[1])
        : 60;
      return { intent: 'start_focus', parameters: { duration }, raw_transcript: text, confidence: 0.85 };
    }

    if (lowerText.includes('end focus') || lowerText.includes('stop focus')) {
      return { intent: 'end_focus', parameters: {}, raw_transcript: text, confidence: 0.9 };
    }

    // Nothing matched — this will go to Claude
    return { intent: 'unknown', parameters: {}, raw_transcript: text, confidence: 0.3 };
  };

  // Execute command
  const executeCommand = async (cmd: VoiceCommand) => {
    try {
      switch (cmd.intent) {
        case 'open_task': {
          const task = await fetchTaskByShortId(cmd.parameters.taskId as string);
          if (task) {
            navigate(`/tasks/${task.id}`);
            setFeedback({ type: 'success', message: `Opening ${task.short_id}` });
          } else {
            setFeedback({ type: 'error', message: 'Task not found' });
          }
          break;
        }
        case 'complete_task': {
          const task = await fetchTaskByShortId(cmd.parameters.taskId as string);
          if (task) {
            await completeTask(task.id);
            setFeedback({ type: 'success', message: `Completed ${task.short_id}` });
          }
          break;
        }
        case 'execute_geode': {
          const taskIdsParam = cmd.parameters.taskIds as string;
          if (taskIdsParam) {
            const taskIds = taskIdsParam.split(',').map(id => id.trim());
            for (const taskId of taskIds) {
              const mainTask = await fetchTaskByShortId(taskId);
              if (mainTask && onGeodeWorkflow) {
                onGeodeWorkflow(mainTask);
                setFeedback({ type: 'info', message: `GEODE workflow for ${mainTask.short_id}` });
                return;
              }
            }
            setFeedback({ type: 'error', message: 'Task not found' });
          } else {
            setFeedback({ type: 'error', message: 'Specify task ID (e.g., "execute geode 0035")' });
          }
          break;
        }
        case 'create_task': {
          const title = cmd.parameters.title as string;
          if (title) {
            await createTask({ title, priority: 50 });
            setFeedback({ type: 'success', message: `Created task: ${title}` });
          }
          break;
        }
        case 'navigate':
          navigate(cmd.parameters.page as string);
          setFeedback({ type: 'success', message: `Navigating...` });
          break;
        case 'start_focus':
          await enterFocusMode(cmd.parameters.duration as number);
          setFeedback({ type: 'success', message: `Focus mode started` });
          break;
        case 'end_focus':
          await exitProtectedState();
          setFeedback({ type: 'success', message: `Focus mode ended` });
          break;
        case 'unknown': {
          // Fall through to Claude AI
          const aiResponse = await askClaude(cmd.raw_transcript);
          if (aiResponse) {
            setFeedback({ type: 'ai', message: aiResponse });
          } else {
            setFeedback({ type: 'error', message: 'AI service unavailable. Check Edge Function configuration.' });
          }
          break;
        }
      }
    } catch (err) {
      console.error('Command error:', err);
      setFeedback({ type: 'error', message: 'Command failed' });
    }
  };

  // Handle submit
  const handleSubmit = async () => {
    if (!inputValue.trim() || isProcessing) return;

    setIsProcessing(true);
    setShowDropdown(false);

    try {
      const cmd = parseCommand(inputValue);
      await executeCommand(cmd);
    } finally {
      setIsProcessing(false);
      setInputValue('');
    }
  };

  return (
    <div className="relative flex-1 max-w-md">
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Escape') {
              setInputValue('');
              setFeedback(null);
              inputRef.current?.blur();
            }
          }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          placeholder={isListening ? 'Listening...' : 'Ask anything or type a command...'}
          className={cn(
            'w-full pl-4 pr-20 py-2 text-sm border rounded-lg transition-colors',
            isListening
              ? 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-1 focus:ring-red-400'
              : 'border-gray-200 focus:border-watershed-500 focus:ring-1 focus:ring-watershed-500',
            'focus:outline-none'
          )}
          disabled={isProcessing}
        />

        {/* Right side buttons inside input */}
        <div className="absolute right-1 flex items-center gap-1">
          {inputValue && !isProcessing && (
            <button
              onClick={() => setInputValue('')}
              className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {isProcessing ? (
            <div className="p-1.5 flex items-center gap-1">
              <Loader2 className="w-4 h-4 animate-spin text-watershed-600" />
            </div>
          ) : inputValue ? (
            <button
              onClick={handleSubmit}
              className="p-1.5 bg-watershed-600 hover:bg-watershed-700 rounded text-white"
            >
              <Send className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={toggleVoice}
              className={cn(
                'p-1.5 rounded transition-colors',
                isListening
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
              )}
              title={isListening ? 'Stop listening' : 'Voice input'}
            >
              <Mic className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Feedback message */}
      {feedback && (
        <div className={cn(
          'absolute top-full mt-1 left-0 right-0 px-3 py-2 text-sm rounded-lg shadow-lg z-50',
          feedback.type === 'success' && 'bg-green-50 text-green-700 border border-green-200',
          feedback.type === 'error' && 'bg-red-50 text-red-700 border border-red-200',
          feedback.type === 'info' && 'bg-blue-50 text-blue-700 border border-blue-200',
          feedback.type === 'ai' && 'bg-purple-50 text-purple-900 border border-purple-200'
        )}>
          {feedback.type === 'ai' && (
            <div className="flex items-center gap-1.5 mb-1">
              <Sparkles className="w-3 h-3 text-purple-500" />
              <span className="text-[10px] font-semibold text-purple-500 uppercase tracking-wider">Claude</span>
            </div>
          )}
          <span className={feedback.type === 'ai' ? 'text-[13px] leading-relaxed' : ''}>
            {feedback.message}
          </span>
        </div>
      )}

      {/* Command hints dropdown */}
      {showDropdown && !inputValue && !feedback && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg py-2 z-50">
          <p className="px-3 py-1 text-xs font-medium text-gray-400 uppercase">Commands</p>
          {[
            { cmd: 'go to sequencing', desc: 'Navigate' },
            { cmd: 'create task Review proposal', desc: 'New task' },
            { cmd: 'execute geode 0035', desc: 'GEODE workflow' },
            { cmd: 'start focus 30 min', desc: 'Focus mode' },
          ].map((item) => (
            <button
              key={item.cmd}
              onClick={() => {
                setInputValue(item.cmd);
                inputRef.current?.focus();
              }}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 flex items-center justify-between"
            >
              <span className="text-gray-700">{item.cmd}</span>
              <span className="text-xs text-gray-400">{item.desc}</span>
            </button>
          ))}
          <div className="border-t border-gray-100 mt-1 pt-1">
            <p className="px-3 py-1 text-xs font-medium text-purple-400 uppercase flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Ask Claude
            </p>
            {[
              'Summarize my last 10 sent emails',
              'What is the status of Arizona GEODE chapters?',
              'What tasks are due today?',
            ].map((q) => (
              <button
                key={q}
                onClick={() => {
                  setInputValue(q);
                  inputRef.current?.focus();
                }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-purple-50 text-purple-700"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
