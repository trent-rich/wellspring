import { useState } from 'react';
import {
  Lightbulb,
  Plus,
  Clock,
  Play,
  Archive,
  MoreHorizontal,
  AlertTriangle,
} from 'lucide-react';
import { useIdeaStore, useRipeningIdeas, useReadyToExecuteIdeas } from '../store/ideaStore';
import type { Idea, CreateIdeaInput } from '../types';
import {
  cn,
  formatRelativeTime,
  getContainmentRemaining,
} from '../lib/utils';

export default function IdeasPage() {
  const {
    ideas,
    createIdea,
    archiveIdea,
    executeIdea,
    overrideContainment,
  } = useIdeaStore();

  const ripeningIdeas = useRipeningIdeas();
  const readyIdeas = useReadyToExecuteIdeas();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [filter, setFilter] = useState<'all' | 'ripening' | 'ready' | 'archived'>('all');

  const filteredIdeas = ideas.filter((idea) => {
    if (filter === 'archived') return idea.archived;
    if (idea.archived) return false;
    if (filter === 'ripening') {
      const { canExecute } = getContainmentRemaining(idea.execution_blocked_until);
      return !canExecute;
    }
    if (filter === 'ready') {
      const { canExecute } = getContainmentRemaining(idea.execution_blocked_until);
      return canExecute;
    }
    return true;
  });

  const handleExecute = async (idea: Idea) => {
    try {
      await executeIdea(idea.id);
    } catch (error) {
      if (error instanceof Error) {
        alert(error.message);
      }
    }
  };

  const handleOverride = async (idea: Idea) => {
    const reason = prompt('Enter reason for containment override (requires authority):');
    if (reason) {
      await overrideContainment(idea.id, reason);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ideas</h1>
          <p className="text-gray-500 mt-1">
            {ideas.length} ideas • {ripeningIdeas.length} ripening • {readyIdeas.length} ready
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="btn btn-primary"
        >
          <Plus className="w-4 h-4 mr-2" />
          Capture Idea
        </button>
      </div>

      {/* 72-hour containment explainer */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-amber-800">72-Hour Containment</h3>
            <p className="text-sm text-amber-700 mt-1">
              New ideas ripen for 72 hours before execution is allowed. This prevents impulsive
              action and encourages clarity. Override requires explicit authority.
            </p>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {[
          { key: 'all', label: 'All Ideas', count: ideas.filter((i) => !i.archived).length },
          { key: 'ripening', label: 'Ripening', count: ripeningIdeas.length },
          { key: 'ready', label: 'Ready', count: readyIdeas.length },
          { key: 'archived', label: 'Archived', count: ideas.filter((i) => i.archived).length },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key as typeof filter)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              filter === tab.key
                ? 'border-watershed-500 text-watershed-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Ideas grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredIdeas.map((idea) => {
          const { canExecute, hoursRemaining, percentComplete } = getContainmentRemaining(
            idea.execution_blocked_until
          );

          return (
            <div
              key={idea.id}
              className={cn(
                'bg-white rounded-lg border p-4 hover:shadow-md transition-shadow',
                canExecute ? 'border-green-200' : 'border-amber-200'
              )}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Lightbulb
                    className={cn(
                      'w-5 h-5',
                      canExecute ? 'text-green-500' : 'text-amber-500'
                    )}
                  />
                  {canExecute ? (
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                      Ready
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                      {hoursRemaining}h left
                    </span>
                  )}
                </div>
                <button className="text-gray-400 hover:text-gray-600">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>

              {/* Title & Content */}
              <h3 className="font-medium text-gray-900 mb-2 line-clamp-2">{idea.title}</h3>
              {idea.content && (
                <p className="text-sm text-gray-500 line-clamp-3 mb-3">{idea.content}</p>
              )}

              {/* Tags */}
              {idea.concept_tags && idea.concept_tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {idea.concept_tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Containment progress */}
              {!canExecute && (
                <div className="mb-3">
                  <div className="containment-progress">
                    <div
                      className="containment-progress-bar"
                      style={{ width: `${percentComplete}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <span className="text-xs text-gray-400">
                  {formatRelativeTime(idea.created_at)}
                </span>
                <div className="flex gap-2">
                  {canExecute ? (
                    <button
                      onClick={() => handleExecute(idea)}
                      className="btn btn-primary text-xs py-1 px-2"
                    >
                      <Play className="w-3 h-3 mr-1" />
                      Execute
                    </button>
                  ) : (
                    <button
                      onClick={() => handleOverride(idea)}
                      className="btn btn-ghost text-xs py-1 px-2 text-amber-600"
                    >
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Override
                    </button>
                  )}
                  <button
                    onClick={() => archiveIdea(idea.id)}
                    className="btn btn-ghost text-xs py-1 px-2"
                  >
                    <Archive className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {filteredIdeas.length === 0 && (
        <div className="text-center py-12">
          <Lightbulb className="w-12 h-12 text-gray-200 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">No ideas here</h3>
          <p className="text-gray-500 mb-4">
            {filter === 'all'
              ? 'Capture your first idea to get started'
              : `No ${filter} ideas at the moment`}
          </p>
          {filter === 'all' && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="btn btn-primary"
            >
              <Plus className="w-4 h-4 mr-2" />
              Capture Idea
            </button>
          )}
        </div>
      )}

      {/* Create idea modal */}
      {showCreateForm && (
        <CreateIdeaModal
          onClose={() => setShowCreateForm(false)}
          onCreate={async (input) => {
            await createIdea(input);
            setShowCreateForm(false);
          }}
        />
      )}
    </div>
  );
}

// Create idea modal
interface CreateIdeaModalProps {
  onClose: () => void;
  onCreate: (input: CreateIdeaInput) => Promise<void>;
}

function CreateIdeaModal({ onClose, onCreate }: CreateIdeaModalProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      await onCreate({
        title: title.trim(),
        content: content.trim() || undefined,
        concept_tags: tags
          ? tags.split(',').map((t) => t.trim()).filter(Boolean)
          : undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Capture New Idea</h2>
          <p className="text-sm text-gray-500 mt-1">
            This idea will ripen for 72 hours before execution
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Idea Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input"
              placeholder="What's the idea?"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Details / Context
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="textarea"
              rows={4}
              placeholder="Describe the idea, why it matters, what it could look like..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="input"
              placeholder="thermal, engineering, narrative..."
            />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm text-amber-700">
              <Clock className="w-4 h-4 inline mr-1" />
              This idea will be ready to execute in 72 hours ({new Date(Date.now() + 72 * 60 * 60 * 1000).toLocaleDateString()})
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={isSubmitting || !title.trim()}
              className="btn btn-primary flex-1"
            >
              {isSubmitting ? 'Creating...' : 'Capture Idea'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary flex-1"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
