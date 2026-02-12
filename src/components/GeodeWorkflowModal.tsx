import { useState, useMemo } from 'react';
import { X, Play, Users, FileSignature } from 'lucide-react';
import { GEODE_STATES, GEODE_CHAPTER_TYPES } from '../types/geode';
import type { GeodeState, GeodeContentSection } from '../types/geode';
import type { TaskWithRelations } from '../types';
import {
  AUTHOR_OUTREACH_ACTIONS,
  AUTHOR_AGREEMENT_ACTIONS,
  inferGeodeWorkflowType,
  type GeodeWorkflowType,
} from '../types/geodeEmailEvents';
import { useGeodeEmailStore } from '../store/geodeEmailStore';
import { useTaskStore } from '../store/taskStore';
import { useExecutionStore } from '../store/executionStore';
import { canExecuteActions } from '../lib/geodeActionExecutor';
import { cn } from '../lib/utils';

interface GeodeWorkflowModalProps {
  task: TaskWithRelations;
  onClose: () => void;
  onComplete?: () => void;
}

const WORKFLOW_INFO: Record<GeodeWorkflowType, {
  title: string;
  description: string;
  icon: typeof Users;
  color: string;
}> = {
  author_outreach: {
    title: 'Author Outreach',
    description: 'Send contract to prospective author for review',
    icon: Users,
    color: 'text-blue-600 bg-blue-100',
  },
  author_agreement: {
    title: 'Author Agreement',
    description: 'Process paperwork for author who has agreed',
    icon: FileSignature,
    color: 'text-green-600 bg-green-100',
  },
  contract_signed: {
    title: 'Contract Signed',
    description: 'Process signed contract and onboard author',
    icon: FileSignature,
    color: 'text-purple-600 bg-purple-100',
  },
};

export default function GeodeWorkflowModal({ task, onClose, onComplete }: GeodeWorkflowModalProps) {
  const [step, setStep] = useState<'workflow' | 'state' | 'chapter' | 'author'>('workflow');
  const [selectedWorkflow, setSelectedWorkflow] = useState<GeodeWorkflowType | null>(null);
  const [selectedState, setSelectedState] = useState<GeodeState | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<GeodeContentSection | null>(null);
  const [authorName, setAuthorName] = useState('');
  const [authorEmail, setAuthorEmail] = useState('');
  const [paymentAmount, setPaymentAmount] = useState<number>(5000);
  const [error, setError] = useState<string | null>(null);

  const { addEmailEvent, confirmTask } = useGeodeEmailStore();
  const { completeTask } = useTaskStore();
  const { addJob, updateJob } = useExecutionStore();

  // Infer the workflow type from task context
  const inferredWorkflow = useMemo(() => {
    return inferGeodeWorkflowType({
      taskTitle: task.title,
      taskDescription: task.description || '',
    });
  }, [task.title, task.description]);

  // Auto-select the inferred workflow and skip to state selection
  const handleAutoInfer = () => {
    setSelectedWorkflow(inferredWorkflow);
    setStep('state');
  };

  const handleWorkflowSelect = (workflow: GeodeWorkflowType) => {
    setSelectedWorkflow(workflow);
    setStep('state');
  };

  const handleStateSelect = (state: GeodeState) => {
    setSelectedState(state);
    setStep('chapter');
  };

  const handleChapterSelect = (chapter: GeodeContentSection) => {
    setSelectedChapter(chapter);
    setStep('author');
  };

  const handleExecute = async () => {
    if (!selectedState || !selectedChapter || !selectedWorkflow) return;

    // For outreach workflow, author email is required
    if (selectedWorkflow === 'author_outreach' && !authorEmail) {
      setError('Author email is required for outreach workflow');
      return;
    }

    // Pre-flight check: verify Gmail is connected before starting
    const preflight = canExecuteActions();
    if (!preflight.ready) {
      setError(`Cannot execute workflow: ${preflight.issues.join(', ')}. Your Google session may have expired. Go to Settings → Integrations → Connect Google to re-authenticate.`);
      return;
    }

    setError(null);

    // Capture values before closing modal
    const execState = selectedState;
    const execChapter = selectedChapter;
    const execWorkflow = selectedWorkflow;
    const execAuthorName = authorName;
    const execAuthorEmail = authorEmail;
    const execPaymentAmount = paymentAmount;
    const stateLabel = GEODE_STATES.find(s => s.value === execState)?.abbreviation || execState;
    const chapterLabel = GEODE_CHAPTER_TYPES.find(c => c.value === execChapter)?.label || execChapter;
    const workflowInfo = WORKFLOW_INFO[execWorkflow];

    // Create a background execution job
    const jobId = `exec_${Date.now()}`;
    addJob({
      id: jobId,
      taskShortId: task.short_id,
      taskId: task.id,
      workflowTitle: workflowInfo.title,
      state: stateLabel,
      chapter: chapterLabel,
      authorName: execAuthorName || undefined,
    });

    // Close the modal immediately — execution continues in background
    if (onComplete) {
      onComplete();
    } else {
      onClose();
    }

    // ---- Background execution (fire-and-forget from modal's perspective) ----
    try {
      const actions = execWorkflow === 'author_outreach'
        ? AUTHOR_OUTREACH_ACTIONS
        : AUTHOR_AGREEMENT_ACTIONS;

      const eventId = `manual_${Date.now()}`;
      const eventType = execWorkflow === 'author_outreach' ? 'contract_requested' : 'author_agreed';

      const event = {
        id: eventId,
        emailId: `task_${task.id}`,
        subject: task.title,
        fromEmail: execAuthorEmail || 'manual@watershed.app',
        fromName: execAuthorName || 'Manual Entry',
        toEmails: ['trent@projectinnerspace.org'],
        ccEmails: [],
        receivedAt: new Date().toISOString(),
        snippet: task.description || '',
        eventType: eventType as 'author_agreed' | 'contract_requested',
        confidence: 1.0,
        detectedState: execState,
        detectedChapter: execChapter,
        detectedAuthorName: execAuthorName || undefined,
        detectedAuthorEmail: execAuthorEmail || undefined,
        extractedDetails: {
          workflowType: execWorkflow,
          ...(execAuthorName && { authorName: execAuthorName }),
          ...(execAuthorEmail && { authorEmail: execAuthorEmail }),
          ...(execWorkflow === 'author_outreach' && { paymentAmount: String(execPaymentAmount) }),
        },
        suggestedActions: actions,
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
      };

      addEmailEvent(event);

      const geodeTaskId = `task_${eventId}`;
      const executionResult = await confirmTask(geodeTaskId, 'task-detail');

      if (!executionResult) {
        updateJob(jobId, {
          status: 'failed',
          message: 'Workflow execution returned no result.',
        });
        return;
      }

      const failedActions = executionResult.results.filter(r => !r.success);

      if (failedActions.length > 0 && failedActions.length === executionResult.results.length) {
        const failMessages = failedActions.map(r => r.message).join('; ');
        updateJob(jobId, {
          status: 'failed',
          message: `All actions failed: ${failMessages}`,
        });
        return;
      }

      // At least some actions succeeded — complete the original task
      await completeTask(task.id);

      if (failedActions.length > 0) {
        const failMessages = failedActions.map(r => r.message).join('; ');
        updateJob(jobId, {
          status: 'partial',
          message: `${executionResult.summary} (Failed: ${failMessages})`,
        });
      } else {
        updateJob(jobId, {
          status: 'success',
          message: executionResult.summary,
        });
      }
    } catch (err) {
      console.error('GEODE background execution error:', err);
      updateJob(jobId, {
        status: 'failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };

  const handleBack = () => {
    if (step === 'state') {
      setStep('workflow');
      setSelectedWorkflow(null);
    } else if (step === 'chapter') {
      setStep('state');
      setSelectedState(null);
    } else if (step === 'author') {
      setStep('chapter');
      setSelectedChapter(null);
    }
  };

  const currentWorkflowInfo = selectedWorkflow ? WORKFLOW_INFO[selectedWorkflow] : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Execute GEODE Workflow</h2>
            <p className="text-sm text-gray-500">{task.short_id}: {task.title}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* Progress indicator */}
          {step !== 'workflow' && (
            <div className="flex items-center justify-center gap-2 mb-6">
              {(['state', 'chapter', 'author'] as const).map((s, i) => {
                const stepOrder = ['workflow', 'state', 'chapter', 'author'];
                const currentIndex = stepOrder.indexOf(step);
                const stepIndex = stepOrder.indexOf(s);
                const isActive = currentIndex >= stepIndex && currentIndex <= stepIndex + 3;
                const isPast = currentIndex > stepIndex + 1;

                return (
                  <div key={s} className="flex items-center">
                    <div className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
                      isActive
                        ? 'bg-watershed-600 text-white'
                        : isPast
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-200 text-gray-500'
                    )}>
                      {i + 1}
                    </div>
                    {i < 2 && (
                      <div className={cn(
                        'w-8 h-0.5 mx-1',
                        currentIndex > stepIndex + 1
                          ? 'bg-green-500'
                          : 'bg-gray-200'
                      )} />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Workflow Type Selection */}
          {step === 'workflow' && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Select Workflow Type</h3>

              {/* Inferred recommendation */}
              <div className="mb-4 p-3 bg-watershed-50 border border-watershed-200 rounded-lg">
                <p className="text-sm text-watershed-700 mb-2">
                  <span className="font-medium">Recommended:</span> Based on the task, this appears to be{' '}
                  <span className="font-semibold">{WORKFLOW_INFO[inferredWorkflow].title}</span>
                </p>
                <button
                  onClick={handleAutoInfer}
                  className="w-full px-4 py-2 bg-watershed-600 text-white rounded-lg hover:bg-watershed-700 text-sm font-medium"
                >
                  Use {WORKFLOW_INFO[inferredWorkflow].title}
                </button>
              </div>

              <p className="text-xs text-gray-500 mb-3">Or select a different workflow:</p>

              <div className="space-y-2">
                {(['author_outreach', 'author_agreement'] as GeodeWorkflowType[]).map(workflow => {
                  const info = WORKFLOW_INFO[workflow];
                  const Icon = info.icon;
                  const isInferred = workflow === inferredWorkflow;

                  return (
                    <button
                      key={workflow}
                      onClick={() => handleWorkflowSelect(workflow)}
                      className={cn(
                        'w-full text-left p-4 border rounded-lg transition-colors flex items-start gap-3',
                        isInferred
                          ? 'border-watershed-300 bg-watershed-50/50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      )}
                    >
                      <div className={cn('p-2 rounded-lg', info.color)}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {info.title}
                          {isInferred && (
                            <span className="ml-2 text-xs text-watershed-600 font-normal">(Recommended)</span>
                          )}
                        </p>
                        <p className="text-sm text-gray-500">{info.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* State Selection */}
          {step === 'state' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700">Select State</h3>
                <button onClick={handleBack} className="text-xs text-watershed-600 hover:underline">
                  Back
                </button>
              </div>
              {currentWorkflowInfo && (
                <p className="text-xs text-gray-500 mb-3">
                  Workflow: <span className="font-medium">{currentWorkflowInfo.title}</span>
                </p>
              )}
              <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                {GEODE_STATES.map(state => (
                  <button
                    key={state.value}
                    onClick={() => handleStateSelect(state.value)}
                    className="text-left px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-watershed-300 transition-colors"
                  >
                    <span className="font-medium">{state.abbreviation}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chapter Selection */}
          {step === 'chapter' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700">Select Chapter Type</h3>
                <button onClick={handleBack} className="text-xs text-watershed-600 hover:underline">
                  Back
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                {currentWorkflowInfo && <><span className="font-medium">{currentWorkflowInfo.title}</span> • </>}
                State: <span className="font-medium">{GEODE_STATES.find(s => s.value === selectedState)?.label}</span>
              </p>
              <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto">
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
          {step === 'author' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700">
                  Author Information
                  {selectedWorkflow === 'author_outreach' ? ' (Required)' : ' (Optional)'}
                </h3>
                <button onClick={handleBack} className="text-xs text-watershed-600 hover:underline">
                  Back
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-4">
                {currentWorkflowInfo && <><span className="font-medium">{currentWorkflowInfo.title}</span> • </>}
                State: <span className="font-medium">{GEODE_STATES.find(s => s.value === selectedState)?.label}</span>
                {' • '}
                Chapter: <span className="font-medium">{GEODE_CHAPTER_TYPES.find(c => c.value === selectedChapter)?.label}</span>
              </p>

              {selectedWorkflow === 'author_outreach' && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-700">
                    <span className="font-medium">Author Outreach:</span> This will create an email draft to send the contract to the prospective author. Email address is required.
                  </p>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Author Name</label>
                  <input
                    type="text"
                    value={authorName}
                    onChange={(e) => setAuthorName(e.target.value)}
                    placeholder="e.g., John Smith"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-watershed-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Author Email
                    {selectedWorkflow === 'author_outreach' && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  <input
                    type="email"
                    value={authorEmail}
                    onChange={(e) => setAuthorEmail(e.target.value)}
                    placeholder="e.g., john@example.com"
                    className={cn(
                      'w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:border-watershed-500',
                      selectedWorkflow === 'author_outreach' && !authorEmail
                        ? 'border-red-300'
                        : 'border-gray-200'
                    )}
                    required={selectedWorkflow === 'author_outreach'}
                  />
                </div>

                {/* Grant Amount — only for author outreach */}
                {selectedWorkflow === 'author_outreach' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Grant Amount
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-sm text-gray-500">$</span>
                      <input
                        type="number"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(Number(e.target.value) || 5000)}
                        className="w-full pl-7 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-watershed-500"
                        min={0}
                        step={100}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Payment split: ${(paymentAmount * 0.375).toLocaleString()} / ${(paymentAmount * 0.375).toLocaleString()} / ${(paymentAmount * 0.25).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div className="mt-6 flex gap-3">
                <button
                  onClick={handleExecute}
                  disabled={selectedWorkflow === 'author_outreach' && !authorEmail}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
                >
                  <Play className="w-5 h-5" />
                  Execute {currentWorkflowInfo?.title || 'Workflow'}
                </button>
              </div>
            </div>
          )}

          {/* Note: executing/done steps now handled by background ExecutionToasts */}
        </div>
      </div>
    </div>
  );
}
