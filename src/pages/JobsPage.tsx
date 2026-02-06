// Jobs Page - Agent job queue management and monitoring
import { useEffect, useState } from 'react';
import {
  PlayIcon,
  CheckIcon,
  XMarkIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  ArrowPathIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import { useAgentStore } from '../store/agentStore';
import {
  AgentJob,
  AgentArtifact,
  JobStatus,
  JobType,
  getJobTypeLabel,
  getJobStatusColor,
  getArtifactTypeLabel,
} from '../types/agent';
import { formatDistanceToNow } from 'date-fns';

// Status icon component
function StatusIcon({ status }: { status: JobStatus }) {
  switch (status) {
    case 'pending':
      return <ClockIcon className="h-4 w-4 text-yellow-500" />;
    case 'locked':
      return <PlayIcon className="h-4 w-4 text-blue-500 animate-pulse" />;
    case 'completed':
      return <CheckIcon className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <XMarkIcon className="h-4 w-4 text-red-500" />;
    case 'cancelled':
      return <ExclamationTriangleIcon className="h-4 w-4 text-gray-500" />;
  }
}

// Job card component
function JobCard({
  job,
  isSelected,
  onClick,
}: {
  job: AgentJob;
  isSelected: boolean;
  onClick: () => void;
}) {
  const timeAgo = formatDistanceToNow(new Date(job.created_at), { addSuffix: true });

  return (
    <div
      onClick={onClick}
      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
        isSelected
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <StatusIcon status={job.status} />
          <span className="font-medium text-sm">{getJobTypeLabel(job.job_type)}</span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${getJobStatusColor(job.status)}`}>
          {job.status}
        </span>
      </div>

      <p className="text-xs text-gray-500 mb-2 line-clamp-2">
        {JSON.stringify(job.input).slice(0, 100)}...
      </p>

      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{timeAgo}</span>
        {job.attempts > 0 && (
          <span>
            Attempt {job.attempts}/{job.max_attempts}
          </span>
        )}
      </div>

      {job.error && (
        <p className="mt-2 text-xs text-red-600 line-clamp-1">{job.error}</p>
      )}
    </div>
  );
}

// Job detail panel
function JobDetail({ job }: { job: AgentJob }) {
  const { fetchArtifacts, artifacts, artifactsLoading } = useAgentStore();

  useEffect(() => {
    fetchArtifacts(job.id);
  }, [job.id, fetchArtifacts]);

  return (
    <div className="h-full overflow-auto p-4">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <StatusIcon status={job.status} />
          <h2 className="text-lg font-semibold">{getJobTypeLabel(job.job_type)}</h2>
        </div>
        <span className={`text-sm px-2 py-1 rounded-full ${getJobStatusColor(job.status)}`}>
          {job.status}
        </span>
      </div>

      {/* Timing */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-500">Created</p>
          <p className="text-sm">{new Date(job.created_at).toLocaleString()}</p>
        </div>
        {job.started_at && (
          <div>
            <p className="text-xs text-gray-500">Started</p>
            <p className="text-sm">{new Date(job.started_at).toLocaleString()}</p>
          </div>
        )}
        {job.completed_at && (
          <div>
            <p className="text-xs text-gray-500">Completed</p>
            <p className="text-sm">{new Date(job.completed_at).toLocaleString()}</p>
          </div>
        )}
        {job.locked_by && (
          <div>
            <p className="text-xs text-gray-500">Locked by</p>
            <p className="text-sm font-mono text-xs">{job.locked_by}</p>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Input</h3>
        <pre className="bg-gray-100 rounded-lg p-3 text-xs overflow-auto max-h-40">
          {JSON.stringify(job.input, null, 2)}
        </pre>
      </div>

      {/* Output */}
      {job.output && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Output</h3>
          <pre className="bg-green-50 rounded-lg p-3 text-xs overflow-auto max-h-40">
            {JSON.stringify(job.output, null, 2)}
          </pre>
        </div>
      )}

      {/* Error */}
      {job.error && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-red-700 mb-2">Error</h3>
          <p className="bg-red-50 rounded-lg p-3 text-sm text-red-800">{job.error}</p>
        </div>
      )}

      {/* Artifacts */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">
          Artifacts ({artifacts.length})
        </h3>
        {artifactsLoading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : artifacts.length === 0 ? (
          <p className="text-sm text-gray-500">No artifacts</p>
        ) : (
          <div className="space-y-2">
            {artifacts.map((artifact) => (
              <ArtifactCard key={artifact.id} artifact={artifact} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Artifact card component
function ArtifactCard({ artifact }: { artifact: AgentArtifact }) {
  const [expanded, setExpanded] = useState(false);
  const { reviewArtifact } = useAgentStore();

  const handleApprove = () => reviewArtifact(artifact.id, true);
  const handleReject = () => reviewArtifact(artifact.id, false);

  return (
    <div className="border rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <DocumentTextIcon className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium">
            {artifact.title || getArtifactTypeLabel(artifact.artifact_type)}
          </span>
        </div>
        {artifact.reviewed_at ? (
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              artifact.approved
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}
          >
            {artifact.approved ? 'Approved' : 'Rejected'}
          </span>
        ) : (
          <div className="flex gap-1">
            <button
              onClick={handleApprove}
              className="p-1 text-green-600 hover:bg-green-50 rounded"
              title="Approve"
            >
              <CheckIcon className="h-4 w-4" />
            </button>
            <button
              onClick={handleReject}
              className="p-1 text-red-600 hover:bg-red-50 rounded"
              title="Reject"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-blue-600 hover:underline"
      >
        {expanded ? 'Hide content' : 'Show content'}
      </button>

      {expanded && (
        <div className="mt-2">
          {artifact.content && (
            <pre className="bg-gray-50 rounded p-2 text-xs overflow-auto max-h-60 whitespace-pre-wrap">
              {artifact.content}
            </pre>
          )}
          {artifact.content_json && (
            <pre className="bg-gray-50 rounded p-2 text-xs overflow-auto max-h-60">
              {JSON.stringify(artifact.content_json, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// Main Jobs Page
export default function JobsPage() {
  const {
    jobs,
    jobsLoading,
    fetchJobs,
    subscribeToJobs,
    selectedJobId,
    setSelectedJob,
    createJob,
  } = useAgentStore();

  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<JobType | 'all'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Initial fetch and subscription
  useEffect(() => {
    fetchJobs();
    const unsubscribe = subscribeToJobs();
    return unsubscribe;
  }, [fetchJobs, subscribeToJobs]);

  // Filter jobs
  const filteredJobs = jobs.filter((job) => {
    if (statusFilter !== 'all' && job.status !== statusFilter) return false;
    if (typeFilter !== 'all' && job.job_type !== typeFilter) return false;
    return true;
  });

  const selectedJob = jobs.find((j) => j.id === selectedJobId);

  // Job stats
  const stats = {
    pending: jobs.filter((j) => j.status === 'pending').length,
    running: jobs.filter((j) => j.status === 'locked').length,
    completed: jobs.filter((j) => j.status === 'completed').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
  };

  const handleCreateJob = async (type: JobType, input: Record<string, unknown>) => {
    await createJob({ job_type: type, input });
    setShowCreateModal(false);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Agent Jobs</h1>
            <p className="text-sm text-gray-500">
              Monitor and manage AI agent job queue
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => fetchJobs()}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
            >
              <ArrowPathIcon className="h-4 w-4" />
              Refresh
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <PlusIcon className="h-4 w-4" />
              New Job
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div className="bg-yellow-50 rounded-lg p-3">
            <p className="text-xs text-yellow-600">Pending</p>
            <p className="text-2xl font-bold text-yellow-800">{stats.pending}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-xs text-blue-600">Running</p>
            <p className="text-2xl font-bold text-blue-800">{stats.running}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <p className="text-xs text-green-600">Completed</p>
            <p className="text-2xl font-bold text-green-800">{stats.completed}</p>
          </div>
          <div className="bg-red-50 rounded-lg p-3">
            <p className="text-xs text-red-600">Failed</p>
            <p className="text-2xl font-bold text-red-800">{stats.failed}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <FunnelIcon className="h-4 w-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as JobStatus | 'all')}
              className="text-sm border rounded px-2 py-1"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="locked">Running</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as JobType | 'all')}
              className="text-sm border rounded px-2 py-1"
            >
              <option value="all">All Types</option>
              <option value="email_triage">Email Triage</option>
              <option value="email_draft_reply">Draft Reply</option>
              <option value="email_summarize_thread">Summarize Thread</option>
              <option value="research_web">Web Research</option>
              <option value="research_document">Document Research</option>
              <option value="write_document">Write Document</option>
              <option value="write_email">Write Email</option>
              <option value="write_summary">Write Summary</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Job list */}
        <div className="w-1/2 border-r overflow-auto p-4">
          {jobsLoading ? (
            <div className="flex items-center justify-center h-32">
              <ArrowPathIcon className="h-8 w-8 text-gray-400 animate-spin" />
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-500">
              <MagnifyingGlassIcon className="h-8 w-8 mb-2" />
              <p>No jobs found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredJobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  isSelected={job.id === selectedJobId}
                  onClick={() => setSelectedJob(job.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Job detail */}
        <div className="w-1/2 bg-gray-50">
          {selectedJob ? (
            <JobDetail job={selectedJob} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <DocumentTextIcon className="h-12 w-12 mb-2" />
              <p>Select a job to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Job Modal */}
      {showCreateModal && (
        <CreateJobModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateJob}
        />
      )}
    </div>
  );
}

// Create Job Modal
function CreateJobModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (type: JobType, input: Record<string, unknown>) => void;
}) {
  const [jobType, setJobType] = useState<JobType>('research_web');
  const [inputJson, setInputJson] = useState('{\n  "query": ""\n}');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    try {
      const input = JSON.parse(inputJson);
      onCreate(jobType, input);
    } catch (err) {
      setError('Invalid JSON input');
    }
  };

  // Default inputs for each job type
  const getDefaultInput = (type: JobType): string => {
    const defaults: Record<JobType, object> = {
      email_triage: { thread_id: '', gmail_thread_id: '', subject: '' },
      email_draft_reply: { thread_id: '', instruction: '', tone: 'friendly' },
      email_summarize_thread: { thread_content: '', subject: '' },
      research_web: { query: '', context: '' },
      research_codebase: { code_content: '', query: '', file_path: '' },
      research_document: { document_content: '', query: '' },
      write_document: { title: '', instructions: '', format: 'markdown' },
      write_email: { instruction: '', recipient: '', tone: 'professional' },
      write_summary: { content: '', max_words: 200 },
      monitor_inbox: {},
      monitor_calendar: {},
      monitor_mentions: {},
    };
    return JSON.stringify(defaults[type], null, 2);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Create New Job</h2>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Job Type
          </label>
          <select
            value={jobType}
            onChange={(e) => {
              setJobType(e.target.value as JobType);
              setInputJson(getDefaultInput(e.target.value as JobType));
            }}
            className="w-full border rounded-lg px-3 py-2"
          >
            <option value="research_web">Web Research</option>
            <option value="research_document">Document Research</option>
            <option value="write_document">Write Document</option>
            <option value="write_email">Write Email</option>
            <option value="write_summary">Write Summary</option>
            <option value="email_triage">Email Triage</option>
            <option value="email_draft_reply">Draft Reply</option>
            <option value="email_summarize_thread">Summarize Thread</option>
          </select>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Input (JSON)
          </label>
          <textarea
            value={inputJson}
            onChange={(e) => {
              setInputJson(e.target.value);
              setError(null);
            }}
            className="w-full border rounded-lg px-3 py-2 font-mono text-sm h-48"
          />
          {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Create Job
          </button>
        </div>
      </div>
    </div>
  );
}
