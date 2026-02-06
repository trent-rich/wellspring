// Ralph AI Widget - Dashboard component showing email processing status
import { useState, useEffect } from 'react';
import {
  Bot,
  Mail,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Clock,
  Zap,
  Settings,
} from 'lucide-react';
import { processEmails, isRalphReady, getRalphStats } from '../lib/emailProcessor';
import { Link } from 'react-router-dom';

interface RalphWidgetProps {
  onTasksCreated?: () => void;
}

export function RalphWidget({ onTasksCreated }: RalphWidgetProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [lastResult, setLastResult] = useState<{
    success: boolean;
    emailsProcessed: number;
    tasksCreated: number;
    errors: string[];
  } | null>(null);

  const [stats, setStats] = useState(getRalphStats());
  const { ready, issues } = isRalphReady();

  useEffect(() => {
    // Refresh stats periodically
    const interval = setInterval(() => {
      setStats(getRalphStats());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleProcessEmails = async () => {
    setIsProcessing(true);
    setProgress(0);
    setStatusMessage('Starting...');
    setLastResult(null);

    const result = await processEmails((status, prog) => {
      setStatusMessage(status);
      setProgress(prog);
    });

    setLastResult(result);
    setStats(getRalphStats());
    setIsProcessing(false);

    if (result.tasksCreated > 0) {
      onTasksCreated?.();
    }
  };

  const formatLastSync = (date: Date | null) => {
    if (!date) return 'Never';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${ready ? 'bg-purple-100' : 'bg-gray-100'}`}>
            <Bot className={`w-5 h-5 ${ready ? 'text-purple-600' : 'text-gray-400'}`} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Ralph AI</h3>
            <p className="text-sm text-gray-500">Email Task Extraction</p>
          </div>
        </div>

        {ready ? (
          <span className="flex items-center gap-1.5 text-sm text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Ready
          </span>
        ) : (
          <Link
            to="/settings"
            className="flex items-center gap-1.5 text-sm text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full hover:bg-amber-100"
          >
            <Settings className="w-3.5 h-3.5" />
            Setup Required
          </Link>
        )}
      </div>

      {/* Issues */}
      {!ready && (
        <div className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
          <p className="text-sm text-amber-800 font-medium mb-1">Setup needed:</p>
          <ul className="text-sm text-amber-700 list-disc list-inside">
            {issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-center gap-1.5 text-gray-500 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-xs">Last Sync</span>
          </div>
          <p className="font-semibold text-gray-900">{formatLastSync(stats.lastSync)}</p>
        </div>

        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-center gap-1.5 text-gray-500 mb-1">
            <Mail className="w-4 h-4" />
            <span className="text-xs">Emails</span>
          </div>
          <p className="font-semibold text-gray-900">{stats.totalEmailsProcessed}</p>
        </div>

        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-center gap-1.5 text-gray-500 mb-1">
            <Zap className="w-4 h-4" />
            <span className="text-xs">Tasks</span>
          </div>
          <p className="font-semibold text-gray-900">{stats.totalTasksCreated}</p>
        </div>
      </div>

      {/* Progress */}
      {isProcessing && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-gray-600">{statusMessage}</span>
            <span className="text-gray-500">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Last Result */}
      {lastResult && !isProcessing && (
        <div
          className={`mb-4 p-3 rounded-lg border ${
            lastResult.success
              ? 'bg-green-50 border-green-200'
              : 'bg-red-50 border-red-200'
          }`}
        >
          {lastResult.success ? (
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-800">
                  Processed {lastResult.emailsProcessed} email{lastResult.emailsProcessed !== 1 ? 's' : ''}
                </p>
                <p className="text-sm text-green-700">
                  Created {lastResult.tasksCreated} new task{lastResult.tasksCreated !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">Processing failed</p>
                {lastResult.errors.map((error, i) => (
                  <p key={i} className="text-sm text-red-700">{error}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action Button */}
      <button
        onClick={handleProcessEmails}
        disabled={!ready || isProcessing}
        className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-medium transition-colors ${
          ready && !isProcessing
            ? 'bg-purple-600 text-white hover:bg-purple-700'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
        }`}
      >
        <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
        {isProcessing ? 'Processing...' : 'Process Emails'}
      </button>

      {/* Last Error */}
      {stats.lastError && !lastResult && (
        <p className="mt-3 text-xs text-red-600 text-center">
          Last error: {stats.lastError}
        </p>
      )}
    </div>
  );
}
