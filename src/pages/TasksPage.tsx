import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useTaskStore } from '../store/taskStore';
import TaskStream from '../components/TaskStream';
import TaskDetail from '../components/TaskDetail';
import type { TaskWithRelations, CreateTaskInput } from '../types';

export default function TasksPage() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { tasks, fetchTask, createTask, setFilter } = useTaskStore();

  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Handle URL parameters
  useEffect(() => {
    const filter = searchParams.get('filter');
    if (filter === 'due_today') {
      setFilter({ status: ['pending', 'in_progress'] });
    } else if (filter === 'judgment') {
      setFilter({ judgmentRequired: true });
    } else if (filter === 'hard_gate') {
      // Would filter by decision_class
    }
  }, [searchParams, setFilter]);

  // Load task from URL
  useEffect(() => {
    if (taskId) {
      fetchTask(taskId).then((task) => {
        if (task) setSelectedTask(task);
      });
    } else {
      setSelectedTask(null);
    }
  }, [taskId, fetchTask]);

  const handleSelectTask = (task: TaskWithRelations) => {
    setSelectedTask(task);
    navigate(`/tasks/${task.id}`);
  };

  const handleCloseDetail = () => {
    setSelectedTask(null);
    navigate('/tasks');
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    setFilter({ search: query || undefined });
  };

  return (
    <div className="h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-gray-500 mt-1">{tasks.length} tasks in view</p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="btn btn-primary"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Task
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={handleSearch}
          placeholder="Search tasks by ID, title, or description..."
          className="input pl-10"
        />
      </div>

      {/* Task stream */}
      <TaskStream
        onSelectTask={handleSelectTask}
        selectedTaskId={selectedTask?.id}
      />

      {/* Task detail drawer */}
      {selectedTask && (
        <TaskDetail task={selectedTask} onClose={handleCloseDetail} />
      )}

      {/* Create task modal */}
      {showCreateForm && (
        <CreateTaskModal
          onClose={() => setShowCreateForm(false)}
          onCreate={async (input) => {
            await createTask(input);
            setShowCreateForm(false);
          }}
        />
      )}
    </div>
  );
}

// Create task modal component
interface CreateTaskModalProps {
  onClose: () => void;
  onCreate: (input: CreateTaskInput) => Promise<void>;
}

function CreateTaskModal({ onClose, onCreate }: CreateTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState(50);
  const [cellAffiliation, setCellAffiliation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      await onCreate({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        cell_affiliation: cellAffiliation || undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Create New Task</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input"
              placeholder="What needs to be done?"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="textarea"
              rows={3}
              placeholder="Additional details..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="select"
              >
                <option value={20}>Low</option>
                <option value={50}>Medium</option>
                <option value={70}>High</option>
                <option value={90}>Critical</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cell Affiliation
              </label>
              <select
                value={cellAffiliation}
                onChange={(e) => setCellAffiliation(e.target.value)}
                className="select"
              >
                <option value="">None</option>
                <option value="cell_1">Cell 1 - Thermal Commons</option>
                <option value="cell_2">Cell 2 - Political</option>
                <option value="cell_3">Cell 3 - Engineering</option>
                <option value="cell_4">Cell 4 - Narrative</option>
                <option value="cell_5">Cell 5 - Legal/Ethical</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={isSubmitting || !title.trim()}
              className="btn btn-primary flex-1"
            >
              {isSubmitting ? 'Creating...' : 'Create Task'}
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
