import { useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  ChevronRight,
  Filter,
  Zap,
} from 'lucide-react';
import { useTaskStore } from '../store/taskStore';
import { useIsProtectedState } from '../store/userStateStore';
import type { TaskWithRelations } from '../types';
import {
  cn,
  formatRelativeTime,
  getPriorityColor,
  getPriorityLabel,
  getCellColor,
  getCellName,
} from '../lib/utils';

interface TaskStreamProps {
  onSelectTask: (task: TaskWithRelations) => void;
  selectedTaskId?: string;
}

export default function TaskStream({ onSelectTask, selectedTaskId }: TaskStreamProps) {
  const { tasks, isLoading, filter, setFilter, completeTask } = useTaskStore();
  const isProtected = useIsProtectedState();
  const [showFilters, setShowFilters] = useState(false);

  // Group tasks by urgency
  const urgentTasks = tasks.filter((t) => t.priority >= 80 || t.sla_due_at);
  const judgmentTasks = tasks.filter((t) => t.judgment_required && !urgentTasks.includes(t));
  const normalTasks = tasks.filter(
    (t) => !urgentTasks.includes(t) && !judgmentTasks.includes(t)
  );

  const handleCompleteTask = async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    await completeTask(taskId);
  };

  const renderTask = (task: TaskWithRelations) => {
    const isSelected = task.id === selectedTaskId;
    const priorityClass =
      task.priority >= 80
        ? 'priority-critical'
        : task.priority >= 60
        ? 'priority-high'
        : task.priority >= 40
        ? 'priority-medium'
        : 'priority-low';

    return (
      <div
        key={task.id}
        onClick={() => onSelectTask(task)}
        className={cn(
          'task-card',
          priorityClass,
          isSelected && 'task-card-selected',
          isProtected && task.embodied_protected && 'opacity-50'
        )}
      >
        <div className="flex items-start gap-3">
          {/* Completion checkbox */}
          <button
            onClick={(e) => handleCompleteTask(e, task.id)}
            className="mt-0.5 text-gray-400 hover:text-green-500 transition-colors"
          >
            {task.status === 'completed' ? (
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            ) : (
              <Circle className="w-5 h-5" />
            )}
          </button>

          {/* Task content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-gray-400">{task.short_id}</span>
              {task.judgment_required && (
                <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">
                  Judgment
                </span>
              )}
              {task.decision_class === 'hard_gate' && (
                <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded">
                  Hard Gate
                </span>
              )}
            </div>

            <h3 className="font-medium text-gray-900 line-clamp-1">{task.title}</h3>

            {task.description && (
              <p className="text-sm text-gray-500 line-clamp-2 mt-1">{task.description}</p>
            )}

            <div className="flex items-center gap-3 mt-2">
              {/* Cell badge */}
              {task.cell_affiliation && (
                <span className={cn('badge text-xs', getCellColor(task.cell_affiliation))}>
                  {getCellName(task.cell_affiliation)}
                </span>
              )}

              {/* Due date */}
              {task.due_date && (
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <Clock className="w-3 h-3" />
                  {formatRelativeTime(task.due_date)}
                </span>
              )}

              {/* Priority */}
              <span className={cn('text-xs px-1.5 py-0.5 rounded', getPriorityColor(task.priority))}>
                {getPriorityLabel(task.priority)}
              </span>

              {/* Work mode */}
              {task.work_mode === 'gastown' && (
                <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">
                  Routed
                </span>
              )}
            </div>
          </div>

          {/* Arrow */}
          <ChevronRight className="w-5 h-5 text-gray-300 flex-shrink-0" />
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="task-card animate-pulse">
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 bg-gray-200 rounded-full" />
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-1/4 mb-2" />
                <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2 overflow-x-auto mobile-scroll-x pb-1 sm:pb-0">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'btn btn-ghost text-sm flex-shrink-0',
              showFilters && 'bg-gray-100'
            )}
          >
            <Filter className="w-4 h-4 mr-1" />
            Filters
          </button>

          {/* Quick filters */}
          <button
            onClick={() => setFilter({ judgmentRequired: !filter.judgmentRequired })}
            className={cn(
              'btn btn-ghost text-sm flex-shrink-0 whitespace-nowrap',
              filter.judgmentRequired && 'bg-amber-50 text-amber-700'
            )}
          >
            <Zap className="w-4 h-4 mr-1" />
            Judgment Queue
          </button>
        </div>

        <span className="text-sm text-gray-500 flex-shrink-0">{tasks.length} tasks</span>
      </div>

      {/* Expanded filters */}
      {showFilters && (
        <div className="bg-gray-50 rounded-lg p-3 sm:p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Work Mode</label>
              <select
                className="select text-sm w-full"
                value={filter.workMode || ''}
                onChange={(e) => setFilter({ workMode: e.target.value as 'ralph' | 'gastown' | undefined })}
              >
                <option value="">All</option>
                <option value="ralph">Ralph (Personal)</option>
                <option value="gastown">GasTown (Routed)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Cell</label>
              <select
                className="select text-sm w-full"
                value={filter.cellAffiliation || ''}
                onChange={(e) => setFilter({ cellAffiliation: e.target.value || undefined })}
              >
                <option value="">All Cells</option>
                <option value="cell_1">Cell 1 - Thermal</option>
                <option value="cell_2">Cell 2 - Political</option>
                <option value="cell_3">Cell 3 - Engineering</option>
                <option value="cell_4">Cell 4 - Narrative</option>
                <option value="cell_5">Cell 5 - Legal</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filter.assignedToMe}
                onChange={(e) => setFilter({ assignedToMe: e.target.checked })}
                className="rounded border-gray-300"
              />
              Assigned to me
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filter.ownedByMe}
                onChange={(e) => setFilter({ ownedByMe: e.target.checked })}
                className="rounded border-gray-300"
              />
              Owned by me
            </label>
          </div>
        </div>
      )}

      {/* Protected state warning */}
      {isProtected && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
          <AlertTriangle className="w-4 h-4 inline mr-2" />
          You're in a protected state. Some tasks are suppressed.
        </div>
      )}

      {/* Task groups */}
      {urgentTasks.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-red-600 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Urgent ({urgentTasks.length})
          </h3>
          <div className="space-y-2">{urgentTasks.map(renderTask)}</div>
        </div>
      )}

      {judgmentTasks.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-amber-600 flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Judgment Required ({judgmentTasks.length})
          </h3>
          <div className="space-y-2">{judgmentTasks.map(renderTask)}</div>
        </div>
      )}

      {normalTasks.length > 0 && (
        <div className="space-y-2">
          {(urgentTasks.length > 0 || judgmentTasks.length > 0) && (
            <h3 className="text-sm font-medium text-gray-600">
              Other Tasks ({normalTasks.length})
            </h3>
          )}
          <div className="space-y-2">{normalTasks.map(renderTask)}</div>
        </div>
      )}

      {/* Empty state */}
      {tasks.length === 0 && (
        <div className="text-center py-12">
          <CheckCircle2 className="w-12 h-12 text-green-200 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">All caught up!</h3>
          <p className="text-gray-500">No tasks matching your filters.</p>
        </div>
      )}
    </div>
  );
}
