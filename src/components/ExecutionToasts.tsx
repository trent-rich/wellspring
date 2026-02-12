/**
 * ExecutionToasts
 *
 * Renders background GEODE workflow execution status as toast-style
 * notifications in the bottom-right corner. Auto-dismisses after 8 seconds
 * for completed jobs.
 */

import { useEffect } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { useExecutionStore, type ExecutionJob } from '../store/executionStore';
import { cn } from '../lib/utils';

function ExecutionToast({ job }: { job: ExecutionJob }) {
  const { dismissJob } = useExecutionStore();

  // Auto-dismiss completed jobs after 8 seconds
  useEffect(() => {
    if (job.status !== 'running') {
      const timer = setTimeout(() => dismissJob(job.id), 8000);
      return () => clearTimeout(timer);
    }
  }, [job.status, job.id, dismissJob]);

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg shadow-lg border min-w-[320px] max-w-[400px] animate-in slide-in-from-right',
        job.status === 'running' && 'bg-white border-gray-200',
        job.status === 'success' && 'bg-green-50 border-green-200',
        job.status === 'partial' && 'bg-amber-50 border-amber-200',
        job.status === 'failed' && 'bg-red-50 border-red-200'
      )}
    >
      {/* Icon */}
      <div className="flex-shrink-0 mt-0.5">
        {job.status === 'running' && <Loader2 className="w-5 h-5 text-watershed-600 animate-spin" />}
        {job.status === 'success' && <CheckCircle2 className="w-5 h-5 text-green-600" />}
        {job.status === 'partial' && <AlertTriangle className="w-5 h-5 text-amber-600" />}
        {job.status === 'failed' && <AlertTriangle className="w-5 h-5 text-red-600" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">
          {job.status === 'running'
            ? `Executing ${job.workflowTitle}...`
            : job.status === 'success'
            ? `${job.workflowTitle} complete`
            : job.status === 'partial'
            ? `${job.workflowTitle} partially complete`
            : `${job.workflowTitle} failed`}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          {job.taskShortId} {job.authorName ? `\u2022 ${job.authorName}` : ''} {job.state ? `\u2022 ${job.state}` : ''}
        </p>
        {job.message && job.status !== 'running' && (
          <p className="text-xs text-gray-600 mt-1 line-clamp-2">{job.message}</p>
        )}
      </div>

      {/* Dismiss */}
      {job.status !== 'running' && (
        <button
          onClick={() => dismissJob(job.id)}
          className="flex-shrink-0 p-1 hover:bg-gray-100 rounded"
        >
          <X className="w-3.5 h-3.5 text-gray-400" />
        </button>
      )}
    </div>
  );
}

export default function ExecutionToasts() {
  const { jobs } = useExecutionStore();

  if (jobs.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {jobs.map((job) => (
        <ExecutionToast key={job.id} job={job} />
      ))}
    </div>
  );
}
