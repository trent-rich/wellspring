import { useState } from 'react';
import {
  X,
  Clock,
  CheckCircle,
  AlertTriangle,
  User,
  Calendar,
  FileText,
  ExternalLink,
  ChevronRight,
  MessageSquare,
  Mail,
  Edit3,
  Link2,
  RefreshCw,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  getWorkflowForChapter,
  getWorkflowType,
  getStepMeta,
  calculateDaysOnStep,
  isStepOverdue,
  calculateWorkflowProgress,
  type WorkflowStepMeta,
  type ChapterWorkflowState,
  type WorkflowHistoryEntry,
} from '../../types/geodeWorkflow';
import { GEODE_CHAPTER_TYPES, GEODE_STATES, type GeodeState } from '../../types/geode';
import AIActionPanel, { type ActionSubmission } from './AIActionPanel';
import { useGeodeChapterStore } from '../../store/geodeChapterStore';
import { getIntegrationStatus } from '../../lib/integrations';

// ============================================
// TYPES
// ============================================

interface ChapterDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  chapterState: ChapterWorkflowState;
  onUpdateStep?: (newStep: string, owner: string, notes?: string) => void;
  onActionSubmit?: (action: ActionSubmission) => void;
}

// ============================================
// MONDAY.COM SYNC PANEL
// ============================================

interface MondaySyncPanelProps {
  reportState: string;
  chapterType: string;
  currentStep: string;
  currentOwner: string;
}

function MondaySyncPanel({ reportState, chapterType, currentStep, currentOwner }: MondaySyncPanelProps) {
  const { getMondayItemId, setMondayItemId, syncChapterToMondayBoard } = useGeodeChapterStore();
  const [itemIdInput, setItemIdInput] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isEditing, setIsEditing] = useState(false);

  const integrationStatus = getIntegrationStatus();
  const mondayItemId = getMondayItemId(reportState as GeodeState, chapterType);

  const handleSaveItemId = () => {
    if (itemIdInput.trim()) {
      setMondayItemId(reportState as GeodeState, chapterType, itemIdInput.trim());
      setIsEditing(false);
      setItemIdInput('');
    }
  };

  const handleSync = async () => {
    if (!mondayItemId) return;

    setIsSyncing(true);
    setSyncStatus('idle');

    try {
      const success = await syncChapterToMondayBoard(
        reportState as GeodeState,
        chapterType,
        `[Wellspring Sync] Current step: ${currentStep}\nOwner: ${currentOwner}`
      );
      setSyncStatus(success ? 'success' : 'error');
    } catch {
      setSyncStatus('error');
    } finally {
      setIsSyncing(false);
      // Reset status after 3 seconds
      setTimeout(() => setSyncStatus('idle'), 3000);
    }
  };

  if (!integrationStatus.monday.connected) {
    return null;
  }

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Link2 className="w-4 h-4 text-purple-600" />
          <h4 className="font-medium text-purple-800">Monday.com Sync</h4>
        </div>
        {mondayItemId && (
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className={cn(
              'flex items-center space-x-1 px-2 py-1 text-xs rounded-full transition-colors',
              isSyncing && 'opacity-50 cursor-not-allowed',
              syncStatus === 'success' && 'bg-green-100 text-green-700',
              syncStatus === 'error' && 'bg-red-100 text-red-700',
              syncStatus === 'idle' && 'bg-purple-100 text-purple-700 hover:bg-purple-200'
            )}
          >
            <RefreshCw className={cn('w-3 h-3', isSyncing && 'animate-spin')} />
            <span>
              {isSyncing ? 'Syncing...' :
               syncStatus === 'success' ? 'Synced!' :
               syncStatus === 'error' ? 'Failed' : 'Sync Now'}
            </span>
          </button>
        )}
      </div>

      <div className="mt-2">
        {mondayItemId ? (
          <div className="flex items-center justify-between">
            <div className="text-sm text-purple-700">
              <span className="text-purple-500">Item ID:</span>{' '}
              <code className="bg-purple-100 px-1 rounded">{mondayItemId}</code>
            </div>
            <button
              onClick={() => {
                setItemIdInput(mondayItemId);
                setIsEditing(true);
              }}
              className="text-xs text-purple-600 hover:text-purple-700"
            >
              Change
            </button>
          </div>
        ) : isEditing ? (
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={itemIdInput}
              onChange={(e) => setItemIdInput(e.target.value)}
              placeholder="Enter Monday.com item ID"
              className="flex-1 px-2 py-1 text-sm border border-purple-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              onClick={handleSaveItemId}
              className="px-2 py-1 text-xs text-white bg-purple-600 rounded hover:bg-purple-700"
            >
              Save
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                setItemIdInput('');
              }}
              className="px-2 py-1 text-xs text-purple-600 hover:bg-purple-100 rounded"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="text-sm text-purple-600 hover:text-purple-700 underline"
          >
            Link to Monday.com item
          </button>
        )}
      </div>

      <p className="text-xs text-purple-500 mt-2">
        Status updates will sync to Monday.com when you advance workflow steps.
      </p>
    </div>
  );
}

// ============================================
// PAYMENTS BOARD SYNC PANEL
// ============================================

interface PaymentsSyncPanelProps {
  reportState: string;
  chapterType: string;
  currentStep: string;
  authorName?: string;
}

function PaymentsSyncPanel({ reportState, chapterType, currentStep, authorName }: PaymentsSyncPanelProps) {
  const { getPaymentContributorId, setPaymentContributorId, syncChapterToPaymentsBoard } = useGeodeChapterStore();
  const [itemIdInput, setItemIdInput] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error' | 'no-trigger'>('idle');
  const [isEditing, setIsEditing] = useState(false);
  const [lastEmailType, setLastEmailType] = useState<string | null>(null);

  const integrationStatus = getIntegrationStatus();
  const contributorId = getPaymentContributorId(reportState as GeodeState, chapterType);

  const handleSaveItemId = () => {
    if (itemIdInput.trim()) {
      setPaymentContributorId(reportState as GeodeState, chapterType, itemIdInput.trim());
      setIsEditing(false);
      setItemIdInput('');
    }
  };

  const handleSync = async () => {
    if (!contributorId) return;

    setIsSyncing(true);
    setSyncStatus('idle');
    setLastEmailType(null);

    try {
      const result = await syncChapterToPaymentsBoard(
        reportState as GeodeState,
        chapterType,
        currentStep
      );
      // If triggered is false but no error, it means no payment milestone was triggered
      setSyncStatus(result.triggered ? 'success' : 'no-trigger');

      // Check if an email was generated
      if (result.email?.emailType) {
        setLastEmailType(result.email.emailType);
      }
    } catch {
      setSyncStatus('error');
    } finally {
      setIsSyncing(false);
      // Reset status after 5 seconds
      setTimeout(() => {
        setSyncStatus('idle');
        setLastEmailType(null);
      }, 5000);
    }
  };

  if (!integrationStatus.monday.connected) {
    return null;
  }

  // Payment milestone info based on current step
  const paymentMilestoneMap: Record<string, string> = {
    'contract_drafted': '📝 Contract Drafted',
    'contract_sent_for_review': '📤 Sent for Review',
    'contract_approved': '✅ Draft Approved',
    'contract_signed': '✍️ Contract Signed',
    'author_onboarded': '💰 Distribution 1 Triggered',
    'author_draft_submitted': '📄 Rough Draft Received',
  };
  const currentMilestone = paymentMilestoneMap[currentStep];

  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Link2 className="w-4 h-4 text-emerald-600" />
          <h4 className="font-medium text-emerald-800">Payments Board Sync</h4>
        </div>
        {contributorId && (
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className={cn(
              'flex items-center space-x-1 px-2 py-1 text-xs rounded-full transition-colors',
              isSyncing && 'opacity-50 cursor-not-allowed',
              syncStatus === 'success' && 'bg-green-100 text-green-700',
              syncStatus === 'error' && 'bg-red-100 text-red-700',
              syncStatus === 'no-trigger' && 'bg-amber-100 text-amber-700',
              syncStatus === 'idle' && 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
            )}
          >
            <RefreshCw className={cn('w-3 h-3', isSyncing && 'animate-spin')} />
            <span>
              {isSyncing ? 'Syncing...' :
               syncStatus === 'success' ? 'Synced!' :
               syncStatus === 'error' ? 'Failed' :
               syncStatus === 'no-trigger' ? 'No milestone' : 'Sync Now'}
            </span>
          </button>
        )}
      </div>

      <div className="mt-2">
        {contributorId ? (
          <div className="flex items-center justify-between">
            <div className="text-sm text-emerald-700">
              <span className="text-emerald-500">Contributor ID:</span>{' '}
              <code className="bg-emerald-100 px-1 rounded">{contributorId}</code>
              {authorName && <span className="ml-2 text-emerald-600">({authorName})</span>}
            </div>
            <button
              onClick={() => {
                setItemIdInput(contributorId);
                setIsEditing(true);
              }}
              className="text-xs text-emerald-600 hover:text-emerald-700"
            >
              Change
            </button>
          </div>
        ) : isEditing ? (
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={itemIdInput}
              onChange={(e) => setItemIdInput(e.target.value)}
              placeholder="Enter Payments board contributor ID"
              className="flex-1 px-2 py-1 text-sm border border-emerald-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              onClick={handleSaveItemId}
              className="px-2 py-1 text-xs text-white bg-emerald-600 rounded hover:bg-emerald-700"
            >
              Save
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                setItemIdInput('');
              }}
              className="px-2 py-1 text-xs text-emerald-600 hover:bg-emerald-100 rounded"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="text-sm text-emerald-600 hover:text-emerald-700 underline"
          >
            Link to Payments board contributor
          </button>
        )}
      </div>

      {currentMilestone && (
        <div className="mt-2 p-2 bg-emerald-100 rounded text-sm text-emerald-800">
          <strong>Current milestone:</strong> {currentMilestone}
        </div>
      )}

      {/* Show email notification info */}
      {lastEmailType && (
        <div className="mt-2 p-2 bg-blue-100 border border-blue-200 rounded text-sm text-blue-800">
          <strong>📧 Email Generated:</strong>{' '}
          {lastEmailType === 'accounting_setup'
            ? 'Accounting team notified to set up contractor'
            : `Invoice reminder ready for ${authorName || 'author'}`}
        </div>
      )}

      {/* Show which steps trigger emails */}
      {currentStep === 'contract_sent_for_signature' && (
        <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
          <Mail className="w-3 h-3 inline mr-1" />
          This step triggers an email to Accounting (CC: Dani) to set up the contractor.
        </div>
      )}

      {(currentStep === 'author_onboarded' || currentStep === 'author_draft_submitted' || currentStep === 'done') && (
        <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
          <Mail className="w-3 h-3 inline mr-1" />
          This step triggers a payment! Author will be reminded to submit invoice to invoice@projectinnerspace.org
        </div>
      )}

      <p className="text-xs text-emerald-500 mt-2">
        Payment milestones sync when contract/author steps are reached.
      </p>
    </div>
  );
}

// ============================================
// GANTT CHART COMPONENT
// ============================================

interface GanttChartProps {
  workflow: WorkflowStepMeta[];
  history: WorkflowHistoryEntry[];
  currentStep: string;
  contractDeadlines: Record<string, string>;
  doeDeadline: string;
}

function GanttChart({ workflow, history, currentStep, contractDeadlines, doeDeadline }: GanttChartProps) {
  const now = new Date();
  const doeDate = new Date(doeDeadline);

  // Find the earliest date in history or use 60 days ago
  const historyDates = history
    .filter(h => h.startedAt)
    .map(h => new Date(h.startedAt));
  const earliestDate = historyDates.length > 0
    ? new Date(Math.min(...historyDates.map(d => d.getTime())))
    : new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  // Chart spans from earliest date to DOE deadline + 14 days for design
  const chartEndDate = new Date(doeDate.getTime() + 14 * 24 * 60 * 60 * 1000);
  const totalDays = Math.ceil((chartEndDate.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24));

  const getPositionPercent = (date: Date) => {
    const daysSinceStart = (date.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.min(100, (daysSinceStart / totalDays) * 100));
  };

  const currentStepIndex = workflow.findIndex(s => s.id === currentStep);

  return (
    <div className="mt-4 bg-gray-50 rounded-lg p-4">
      <h4 className="text-sm font-medium text-gray-700 mb-3">Timeline</h4>

      {/* Timeline header with month markers */}
      <div className="relative h-6 mb-2 border-b border-gray-200">
        {/* Today marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-blue-500 z-10"
          style={{ left: `${getPositionPercent(now)}%` }}
        >
          <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs text-blue-600 font-medium whitespace-nowrap">
            Today
          </span>
        </div>

        {/* DOE Deadline marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
          style={{ left: `${getPositionPercent(doeDate)}%` }}
        >
          <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs text-red-600 font-medium whitespace-nowrap">
            DOE
          </span>
        </div>
      </div>

      {/* Workflow steps */}
      <div className="space-y-1">
        {workflow.map((step, index) => {
          if (step.id === 'not_started') return null;

          const historyEntry = history.find(h => h.stepId === step.id);
          const isComplete = historyEntry?.completedAt != null;
          const isCurrent = step.id === currentStep;
          const isFuture = index > currentStepIndex;
          const deadline = contractDeadlines[step.id];

          // Calculate bar position and width
          let barStart = 0;
          let barWidth = 0;

          if (isComplete && historyEntry) {
            const startDate = new Date(historyEntry.startedAt);
            const endDate = new Date(historyEntry.completedAt!);
            barStart = getPositionPercent(startDate);
            barWidth = getPositionPercent(endDate) - barStart;
          } else if (isCurrent && historyEntry) {
            const startDate = new Date(historyEntry.startedAt);
            barStart = getPositionPercent(startDate);
            barWidth = getPositionPercent(now) - barStart;
          } else if (isFuture && deadline) {
            // Show projected deadline
            const deadlineDate = new Date(deadline);
            barStart = getPositionPercent(now);
            barWidth = Math.max(2, getPositionPercent(deadlineDate) - barStart);
          }

          return (
            <div key={step.id} className="flex items-center h-6">
              {/* Step label */}
              <div className="w-32 flex-shrink-0 text-xs text-gray-600 truncate pr-2">
                {step.shortLabel}
              </div>

              {/* Bar area */}
              <div className="flex-1 relative h-4 bg-gray-100 rounded">
                {(isComplete || isCurrent || (isFuture && deadline)) && (
                  <div
                    className={cn(
                      'absolute top-0 bottom-0 rounded transition-all',
                      isComplete && 'bg-green-400',
                      isCurrent && 'bg-blue-400',
                      isFuture && 'bg-gray-300 opacity-50'
                    )}
                    style={{
                      left: `${barStart}%`,
                      width: `${Math.max(barWidth, 1)}%`,
                    }}
                  />
                )}

                {/* Deadline marker for future steps */}
                {isFuture && deadline && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-orange-400"
                    style={{ left: `${getPositionPercent(new Date(deadline))}%` }}
                    title={`Deadline: ${new Date(deadline).toLocaleDateString()}`}
                  />
                )}
              </div>

              {/* Duration/Status */}
              <div className="w-16 flex-shrink-0 text-xs text-right pl-2">
                {isComplete && historyEntry?.durationDays != null && (
                  <span className="text-green-600">{historyEntry.durationDays}d</span>
                )}
                {isCurrent && (
                  <span className={cn(
                    isStepOverdue(history.find(h => h.stepId === currentStep)?.startedAt || '', step.typicalDurationDays)
                      ? 'text-red-600'
                      : 'text-blue-600'
                  )}>
                    {calculateDaysOnStep(history.find(h => h.stepId === currentStep)?.startedAt || '')}d
                  </span>
                )}
                {isFuture && deadline && (
                  <span className="text-gray-400">{new Date(deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center space-x-4 mt-3 pt-3 border-t border-gray-200 text-xs">
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 rounded bg-green-400" />
          <span className="text-gray-600">Complete</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 rounded bg-blue-400" />
          <span className="text-gray-600">In Progress</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 rounded bg-gray-300" />
          <span className="text-gray-600">Planned</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-0.5 h-3 bg-blue-500" />
          <span className="text-gray-600">Today</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-0.5 h-3 bg-red-500" />
          <span className="text-gray-600">DOE Deadline</span>
        </div>
      </div>
    </div>
  );
}

// ============================================
// WORKFLOW STEP LIST
// ============================================

interface WorkflowStepListProps {
  workflow: WorkflowStepMeta[];
  history: WorkflowHistoryEntry[];
  currentStep: string;
}

function WorkflowStepList({ workflow, history, currentStep }: WorkflowStepListProps) {
  const currentStepIndex = workflow.findIndex(s => s.id === currentStep);

  return (
    <div className="space-y-2">
      {workflow.map((step, index) => {
        if (step.id === 'not_started') return null;

        const historyEntry = history.find(h => h.stepId === step.id);
        const isComplete = historyEntry?.completedAt != null;
        const isCurrent = step.id === currentStep;
        const isFuture = index > currentStepIndex;

        return (
          <div
            key={step.id}
            className={cn(
              'flex items-start p-3 rounded-lg border transition-colors',
              isComplete && 'bg-green-50 border-green-200',
              isCurrent && 'bg-blue-50 border-blue-200',
              isFuture && 'bg-gray-50 border-gray-200 opacity-60'
            )}
          >
            {/* Status icon */}
            <div className="flex-shrink-0 mt-0.5">
              {isComplete && <CheckCircle className="w-5 h-5 text-green-500" />}
              {isCurrent && <Clock className="w-5 h-5 text-blue-500" />}
              {isFuture && <div className="w-5 h-5 rounded-full border-2 border-gray-300" />}
            </div>

            {/* Content */}
            <div className="ml-3 flex-1">
              <div className="flex items-center justify-between">
                <h5 className={cn(
                  'text-sm font-medium',
                  isComplete && 'text-green-800',
                  isCurrent && 'text-blue-800',
                  isFuture && 'text-gray-500'
                )}>
                  {step.label}
                </h5>

                {/* Duration badge */}
                {isComplete && historyEntry?.durationDays != null && (
                  <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                    {historyEntry.durationDays} days
                  </span>
                )}
                {isCurrent && historyEntry && (
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded-full',
                    isStepOverdue(historyEntry.startedAt, step.typicalDurationDays)
                      ? 'text-red-600 bg-red-100'
                      : 'text-blue-600 bg-blue-100'
                  )}>
                    {calculateDaysOnStep(historyEntry.startedAt)} days
                    {step.typicalDurationDays > 0 && ` / ${step.typicalDurationDays} typical`}
                  </span>
                )}
              </div>

              <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>

              {/* Owner and dates */}
              {(isComplete || isCurrent) && historyEntry && (
                <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                  <div className="flex items-center space-x-1">
                    <User className="w-3 h-3" />
                    <span>{historyEntry.owner}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Calendar className="w-3 h-3" />
                    <span>
                      {new Date(historyEntry.startedAt).toLocaleDateString()}
                      {historyEntry.completedAt && ` → ${new Date(historyEntry.completedAt).toLocaleDateString()}`}
                    </span>
                  </div>
                </div>
              )}

              {/* Notes */}
              {historyEntry?.notes && (
                <p className="text-xs text-gray-600 mt-1 italic">"{historyEntry.notes}"</p>
              )}

              {/* Future step info */}
              {isFuture && step.defaultOwner && (
                <div className="flex items-center space-x-1 mt-1 text-xs text-gray-400">
                  <User className="w-3 h-3" />
                  <span>Assigned to: {step.defaultOwner}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================
// MAIN MODAL COMPONENT
// ============================================

export default function ChapterDetailModal({
  isOpen,
  onClose,
  chapterState,
  onUpdateStep,
  onActionSubmit,
}: ChapterDetailModalProps) {
  const [showAllSteps, setShowAllSteps] = useState(false);

  if (!isOpen) return null;

  // Handle AI action submission
  const handleActionSubmit = (action: ActionSubmission) => {
    console.log('Action submitted:', action);
    onActionSubmit?.(action);
  };

  // Handle step advancement
  const handleStepAdvance = (notes?: string, nextOwner?: string) => {
    const workflow = getWorkflowForChapter(chapterState.chapterType);
    const currentIndex = workflow.findIndex(s => s.id === chapterState.currentStep);
    if (currentIndex < workflow.length - 1) {
      const nextStep = workflow[currentIndex + 1];
      const owner = nextOwner || nextStep.defaultOwner || chapterState.currentOwner;
      onUpdateStep?.(nextStep.id, owner, notes);
    }
  };

  const chapterInfo = GEODE_CHAPTER_TYPES.find(c => c.value === chapterState.chapterType);
  const stateInfo = GEODE_STATES.find(s => s.value === chapterState.reportState);
  const workflow = getWorkflowForChapter(chapterState.chapterType);
  const workflowType = getWorkflowType(chapterState.chapterType);
  const currentStepMeta = getStepMeta(workflowType, chapterState.currentStep);
  const progress = calculateWorkflowProgress(workflowType, chapterState.currentStep);

  const currentHistoryEntry = chapterState.history.find(h => h.stepId === chapterState.currentStep);
  const daysOnCurrentStep = currentHistoryEntry
    ? calculateDaysOnStep(currentHistoryEntry.startedAt)
    : 0;
  const isOverdue = currentStepMeta
    ? isStepOverdue(currentHistoryEntry?.startedAt || '', currentStepMeta.typicalDurationDays)
    : false;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">{stateInfo?.label}</span>
                <ChevronRight className="w-4 h-4 text-gray-400" />
                <h2 className="text-lg font-semibold text-gray-900">
                  Ch {chapterInfo?.chapterNum}: {chapterInfo?.label}
                </h2>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                {workflowType === 'subsurface' ? 'Subsurface Workflow' :
                 workflowType === 'ch101' ? 'Ch 101 Workflow' : 'Standard Chapter Workflow'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
            {/* Current Status Card */}
            <div className={cn(
              'rounded-lg p-4 mb-4',
              isOverdue ? 'bg-red-50 border border-red-200' : 'bg-blue-50 border border-blue-200'
            )}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <Clock className={cn('w-5 h-5', isOverdue ? 'text-red-500' : 'text-blue-500')} />
                    <h3 className={cn(
                      'font-semibold',
                      isOverdue ? 'text-red-800' : 'text-blue-800'
                    )}>
                      Current Step: {currentStepMeta?.label}
                    </h3>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{currentStepMeta?.description}</p>
                </div>

                <div className="text-right">
                  <div className={cn(
                    'text-2xl font-bold',
                    isOverdue ? 'text-red-600' : 'text-blue-600'
                  )}>
                    {daysOnCurrentStep} days
                  </div>
                  <div className="text-xs text-gray-500">
                    on this step
                    {currentStepMeta && currentStepMeta.typicalDurationDays > 0 && (
                      <span className={isOverdue ? ' (overdue!)' : ''}>
                        {' '}/ {currentStepMeta.typicalDurationDays} typical
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Current owner and communication */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
                <div className="flex items-center space-x-2">
                  <User className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-700">
                    Current owner: <strong>{chapterState.currentOwner}</strong>
                  </span>
                  {chapterState.currentOwner.toLowerCase().includes('maria') ||
                   chapterState.currentOwner.toLowerCase().includes('trent') ||
                   chapterState.currentOwner.toLowerCase().includes('ryan') ? (
                    <span className="flex items-center space-x-1 text-xs text-purple-600">
                      <MessageSquare className="w-3 h-3" />
                      <span>Slack</span>
                    </span>
                  ) : (
                    <span className="flex items-center space-x-1 text-xs text-blue-600">
                      <Mail className="w-3 h-3" />
                      <span>Email</span>
                    </span>
                  )}
                </div>

                <div className="text-sm text-gray-500">
                  Started: {currentHistoryEntry
                    ? new Date(currentHistoryEntry.startedAt).toLocaleDateString()
                    : 'N/A'}
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-500 mb-1">
                <span>Overall Progress</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* AI Action Panel */}
            <div className="mb-4">
              <AIActionPanel
                chapter={chapterState}
                onActionSubmit={handleActionSubmit}
                onStepAdvance={handleStepAdvance}
              />
            </div>

            {/* Author Info (for standard workflow) */}
            {workflowType === 'standard' && (
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Author Information</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Author:</span>
                    <span className="ml-2 text-gray-900">{chapterState.authorName || 'Not yet identified'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Contract:</span>
                    <span className={cn(
                      'ml-2',
                      chapterState.contractSigned ? 'text-green-600' : 'text-amber-600'
                    )}>
                      {chapterState.contractSigned
                        ? `Signed ${chapterState.contractSignedDate ? new Date(chapterState.contractSignedDate).toLocaleDateString() : ''}`
                        : 'Pending'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Google Doc link */}
            {chapterState.googleDocUrl && (
              <a
                href={chapterState.googleDocUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-2 text-sm text-watershed-600 hover:text-watershed-700 mb-4"
              >
                <FileText className="w-4 h-4" />
                <span>Open in Google Docs</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}

            {/* Monday.com Sync */}
            <MondaySyncPanel
              reportState={chapterState.reportState}
              chapterType={chapterState.chapterType}
              currentStep={chapterState.currentStep}
              currentOwner={chapterState.currentOwner}
            />

            {/* Payments Board Sync (for standard workflow with authors) */}
            {workflowType === 'standard' && (
              <PaymentsSyncPanel
                reportState={chapterState.reportState}
                chapterType={chapterState.chapterType}
                currentStep={chapterState.currentStep}
                authorName={chapterState.authorName || undefined}
              />
            )}

            {/* Blockers */}
            {chapterState.blockers && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <div className="flex items-center space-x-2 text-red-800">
                  <AlertTriangle className="w-4 h-4" />
                  <h4 className="font-medium">Blocker</h4>
                </div>
                <p className="text-sm text-red-700 mt-1">{chapterState.blockers}</p>
              </div>
            )}

            {/* Notes */}
            {chapterState.notes && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                <div className="flex items-center space-x-2 text-amber-800">
                  <Edit3 className="w-4 h-4" />
                  <h4 className="font-medium">Notes</h4>
                </div>
                <p className="text-sm text-amber-700 mt-1">{chapterState.notes}</p>
              </div>
            )}

            {/* Gantt Chart */}
            <GanttChart
              workflow={workflow}
              history={chapterState.history}
              currentStep={chapterState.currentStep}
              contractDeadlines={chapterState.contractDeadlines}
              doeDeadline={stateInfo?.doeDeadline || '2026-04-30'}
            />

            {/* Workflow Steps */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-gray-700">Workflow Steps</h4>
                <button
                  onClick={() => setShowAllSteps(!showAllSteps)}
                  className="text-xs text-watershed-600 hover:text-watershed-700"
                >
                  {showAllSteps ? 'Show Recent Only' : 'Show All Steps'}
                </button>
              </div>

              <WorkflowStepList
                workflow={showAllSteps ? workflow : workflow.slice(0, 8)}
                history={chapterState.history}
                currentStep={chapterState.currentStep}
              />

              {!showAllSteps && workflow.length > 8 && (
                <p className="text-xs text-gray-400 text-center mt-2">
                  + {workflow.length - 8} more steps
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
            <div className="text-xs text-gray-500">
              Last updated: {new Date(chapterState.history[chapterState.history.length - 1]?.startedAt || '').toLocaleString()}
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
