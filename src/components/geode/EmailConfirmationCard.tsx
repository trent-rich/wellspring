// Email Confirmation Card
// Displays AI-detected email events that need user confirmation

import {
  Mail,
  UserCheck,
  FileSignature,
  Send,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  AlertCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../lib/utils';
import type { GeodeConfirmationTask } from '../../types/geodeEmailEvents';
import { useGeodeEmailStore } from '../../store/geodeEmailStore';
import { GEODE_STATES, GEODE_CHAPTER_TYPES } from '../../types/geode';

// ============================================
// TYPES
// ============================================

interface EmailConfirmationCardProps {
  task: GeodeConfirmationTask;
  compact?: boolean;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getCategoryIcon(category: GeodeConfirmationTask['category']) {
  switch (category) {
    case 'author_onboarding':
      return UserCheck;
    case 'contract':
      return FileSignature;
    case 'communication':
      return Send;
    default:
      return Mail;
  }
}

function getPriorityColor(priority: GeodeConfirmationTask['priority']) {
  switch (priority) {
    case 'urgent':
      return 'bg-red-50 border-red-200';
    case 'high':
      return 'bg-amber-50 border-amber-200';
    case 'normal':
      return 'bg-blue-50 border-blue-200';
    default:
      return 'bg-gray-50 border-gray-200';
  }
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function EmailConfirmationCard({ task, compact = false }: EmailConfirmationCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [executionResult, setExecutionResult] = useState<{
    success: boolean;
    summary: string;
    hasDraft: boolean;
  } | null>(null);
  const { confirmTask, dismissTask } = useGeodeEmailStore();

  const Icon = getCategoryIcon(task.category);
  const stateInfo = task.state ? GEODE_STATES.find((s) => s.value === task.state) : null;
  const chapterInfo = task.chapterType
    ? GEODE_CHAPTER_TYPES.find((c) => c.value === task.chapterType)
    : null;

  const handleConfirm = async () => {
    setIsProcessing(true);
    setExecutionResult(null);

    try {
      const result = await confirmTask(task.id, 'trent');

      if (result) {
        const hasDraft = result.results.some(
          r => r.artifacts?.some(a => a.type === 'draft')
        );

        setExecutionResult({
          success: result.success,
          summary: result.summary,
          hasDraft,
        });

        // Auto-clear success message after 10 seconds
        if (result.success) {
          setTimeout(() => setExecutionResult(null), 10000);
        }
      }
    } catch (error) {
      console.error('Failed to execute task:', error);
      setExecutionResult({
        success: false,
        summary: 'Failed to execute actions',
        hasDraft: false,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDismiss = () => {
    dismissTask(task.id, 'trent', 'Dismissed by user');
  };

  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-3 p-3 rounded-lg border transition-all',
          getPriorityColor(task.priority)
        )}
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white shadow-sm">
          <Sparkles className="w-4 h-4 text-purple-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
          <p className="text-xs text-gray-500 truncate">
            {stateInfo?.abbreviation && `${stateInfo.abbreviation} • `}
            {formatTimeAgo(task.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleConfirm}
            disabled={isProcessing}
            className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg transition-colors disabled:opacity-50"
            title="Confirm and execute actions"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            onClick={handleDismiss}
            className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg border transition-all',
        getPriorityColor(task.priority)
      )}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-white shadow-sm">
            <Icon className="w-5 h-5 text-watershed-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium text-gray-900">{task.title}</h3>
              {task.priority === 'urgent' && (
                <span className="px-2 py-0.5 text-xs font-medium text-red-700 bg-red-100 rounded-full">
                  Urgent
                </span>
              )}
              {task.priority === 'high' && (
                <span className="px-2 py-0.5 text-xs font-medium text-amber-700 bg-amber-100 rounded-full">
                  High
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600">{task.description}</p>

            {/* Context badges */}
            <div className="flex items-center gap-2 mt-2">
              {stateInfo && (
                <span className="text-xs px-2 py-0.5 bg-white border border-gray-200 rounded-full text-gray-600">
                  {stateInfo.label}
                </span>
              )}
              {chapterInfo && (
                <span className="text-xs px-2 py-0.5 bg-white border border-gray-200 rounded-full text-gray-600">
                  Ch {chapterInfo.chapterNum}: {chapterInfo.label}
                </span>
              )}
              {task.authorName && (
                <span className="text-xs px-2 py-0.5 bg-purple-100 border border-purple-200 rounded-full text-purple-700">
                  {task.authorName}
                </span>
              )}
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatTimeAgo(task.createdAt)}
              </span>
            </div>
          </div>
        </div>

        {/* Pending Actions Preview */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between mt-3 pt-3 border-t border-gray-200 text-sm text-gray-600 hover:text-gray-900"
        >
          <span className="flex items-center gap-1">
            <Sparkles className="w-4 h-4 text-purple-500" />
            {task.pendingActions.length} action{task.pendingActions.length !== 1 ? 's' : ''} will be executed
          </span>
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Expanded Actions */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-2">
          {task.pendingActions.map((action, index) => (
            <div
              key={action.id}
              className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-100"
            >
              <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-xs font-medium text-gray-400 bg-gray-100 rounded-full">
                {index + 1}
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">{action.title}</p>
                <p className="text-xs text-gray-500">{action.description}</p>
                {action.requiresConfirmation && (
                  <span className="inline-flex items-center gap-1 mt-1 text-xs text-amber-600">
                    <AlertCircle className="w-3 h-3" />
                    Requires your confirmation
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Execution Result */}
      {executionResult && (
        <div
          className={cn(
            'mx-4 mb-3 p-3 rounded-lg border',
            executionResult.success
              ? 'bg-green-50 border-green-200'
              : 'bg-red-50 border-red-200'
          )}
        >
          <div className="flex items-start gap-2">
            {executionResult.success ? (
              <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            )}
            <div>
              <p
                className={cn(
                  'text-sm font-medium',
                  executionResult.success ? 'text-green-800' : 'text-red-800'
                )}
              >
                {executionResult.summary}
              </p>
              {executionResult.hasDraft && (
                <a
                  href="https://mail.google.com/mail/u/0/#drafts"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-green-700 underline hover:text-green-800 mt-1 inline-block"
                >
                  Open Gmail Drafts →
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-3 bg-white border-t border-gray-100 rounded-b-lg">
        <button
          onClick={handleConfirm}
          disabled={isProcessing || task.status === 'confirmed'}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
            task.status === 'confirmed'
              ? 'bg-green-100 text-green-700'
              : 'bg-watershed-600 text-white hover:bg-watershed-700',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {isProcessing ? (
            <>
              <span className="animate-spin">⏳</span>
              Processing...
            </>
          ) : task.status === 'confirmed' ? (
            <>
              <Check className="w-4 h-4" />
              Confirmed
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              Confirm & Execute
            </>
          )}
        </button>
        {task.status !== 'confirmed' && (
          <button
            onClick={handleDismiss}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
