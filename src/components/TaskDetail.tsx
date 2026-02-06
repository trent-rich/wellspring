import { useState } from 'react';
import {
  X,
  CheckCircle2,
  User,
  Calendar,
  MessageSquare,
  ArrowUpRight,
  MoreHorizontal,
  Trash2,
  Send,
  AlertTriangle,
  Lightbulb,
} from 'lucide-react';
import { useTaskStore } from '../store/taskStore';
import { useMessageStore } from '../store/messageStore';
import { useAuthStore } from '../store/authStore';
import type { TaskWithRelations, Message } from '../types';
import {
  cn,
  formatDateTime,
  formatRelativeTime,
  getPriorityColor,
  getPriorityLabel,
  getStatusColor,
  getStageColor,
  getCellColor,
  getCellName,
  getContainmentRemaining,
} from '../lib/utils';

interface TaskDetailProps {
  task: TaskWithRelations;
  onClose: () => void;
}

export default function TaskDetail({ task, onClose }: TaskDetailProps) {
  const { user } = useAuthStore();
  const {
    updateTask,
    completeTask,
    snoozeTask,
    delegateTask,
    escalateTask,
    deleteTask,
  } = useTaskStore();
  const { fetchMessagesForThread, sendMessage } = useMessageStore();

  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [priority, setPriority] = useState(task.priority);
  const [showActions, setShowActions] = useState(false);
  // Use setPriority to avoid unused warning
  void setPriority;
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showDelegateModal, setShowDelegateModal] = useState(false);

  // Fetch messages for this task's thread
  useState(() => {
    if (task.canonical_thread_id) {
      fetchMessagesForThread(task.canonical_thread_id).then(setMessages);
    }
  });

  const handleSave = async () => {
    await updateTask(task.id, { title, description, priority });
    setIsEditing(false);
  };

  const handleComplete = async () => {
    await completeTask(task.id);
    onClose();
  };

  const handleSnooze = async (hours: number) => {
    const until = new Date();
    until.setHours(until.getHours() + hours);
    await snoozeTask(task.id, until);
    setShowActions(false);
  };

  const handleDelegate = async (actorId: string) => {
    await delegateTask(task.id, actorId, 'Delegated via UI');
    setShowDelegateModal(false);
  };

  const handleEscalate = async () => {
    try {
      await escalateTask(task.id, 'Escalated via UI');
    } catch (error) {
      // Rate limit error
      alert('Cannot escalate - rate limit reached (1 per 4 hours)');
    }
    setShowActions(false);
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this task?')) {
      await deleteTask(task.id);
      onClose();
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !task.canonical_thread_id) return;

    await sendMessage({
      thread_id: task.canonical_thread_id,
      to_actor: task.cell_affiliation || 'system',
      message_type: 'note',
      body: newMessage,
      task_id: task.id,
    });

    setNewMessage('');
    const updated = await fetchMessagesForThread(task.canonical_thread_id);
    setMessages(updated);
  };

  return (
    <>
      {/* Backdrop */}
      <div className="drawer-overlay" onClick={onClose} />

      {/* Drawer panel */}
      <div className="drawer-panel">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-gray-400">{task.short_id}</span>
              <span className={cn('badge', getStatusColor(task.status))}>{task.status}</span>
              <span className={cn('text-sm', getStageColor(task.stage))}>{task.stage}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  onClick={() => setShowActions(!showActions)}
                  className="btn btn-ghost"
                >
                  <MoreHorizontal className="w-5 h-5" />
                </button>
                {showActions && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-48 z-20">
                    <button
                      onClick={() => handleSnooze(1)}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
                    >
                      Snooze 1 hour
                    </button>
                    <button
                      onClick={() => handleSnooze(24)}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
                    >
                      Snooze until tomorrow
                    </button>
                    <button
                      onClick={() => setShowDelegateModal(true)}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
                    >
                      Delegate to cell...
                    </button>
                    <button
                      onClick={handleEscalate}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 text-amber-600"
                    >
                      <ArrowUpRight className="w-4 h-4 inline mr-2" />
                      Escalate
                    </button>
                    <hr className="my-1" />
                    <button
                      onClick={handleDelete}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 text-red-600"
                    >
                      <Trash2 className="w-4 h-4 inline mr-2" />
                      Delete task
                    </button>
                  </div>
                )}
              </div>
              <button onClick={onClose} className="btn btn-ghost">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6">
          {/* Title & Description */}
          <div>
            {isEditing ? (
              <div className="space-y-3">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="input text-lg font-semibold"
                />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="textarea"
                  rows={4}
                />
                <div className="flex gap-2">
                  <button onClick={handleSave} className="btn btn-primary">
                    Save
                  </button>
                  <button onClick={() => setIsEditing(false)} className="btn btn-secondary">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div onClick={() => setIsEditing(true)} className="cursor-pointer">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">{task.title}</h2>
                {task.description ? (
                  <p className="text-gray-600">{task.description}</p>
                ) : (
                  <p className="text-gray-400 italic">Click to add description...</p>
                )}
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">Priority</label>
              <div className={cn('px-3 py-2 rounded-lg', getPriorityColor(task.priority))}>
                {getPriorityLabel(task.priority)} ({task.priority})
              </div>
            </div>

            {task.cell_affiliation && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Cell</label>
                <div className={cn('px-3 py-2 rounded-lg', getCellColor(task.cell_affiliation))}>
                  {getCellName(task.cell_affiliation)}
                </div>
              </div>
            )}

            {task.due_date && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Due Date</label>
                <div className="flex items-center gap-2 text-gray-700">
                  <Calendar className="w-4 h-4" />
                  {formatDateTime(task.due_date)}
                </div>
              </div>
            )}

            {task.assignee && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Assigned To</label>
                <div className="flex items-center gap-2 text-gray-700">
                  <User className="w-4 h-4" />
                  {task.assignee.full_name || task.assignee.email}
                </div>
              </div>
            )}
          </div>

          {/* Decision class warning */}
          {task.decision_class === 'hard_gate' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-red-800">Hard Gate Decision</h4>
                  <p className="text-sm text-red-600 mt-1">
                    This task requires formal decision record and cannot be silently completed.
                    Route to Cell 5 (Legal/Ethical) for review.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Linked idea containment */}
          {task.idea && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Lightbulb className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-amber-800">Linked Idea: {task.idea.title}</h4>
                  {task.idea.execution_blocked_until && (
                    <div className="mt-2">
                      {(() => {
                        const { canExecute, hoursRemaining, percentComplete } = getContainmentRemaining(
                          task.idea.execution_blocked_until
                        );
                        if (canExecute) {
                          return (
                            <p className="text-sm text-green-600">72-hour containment complete. Ready to execute.</p>
                          );
                        }
                        return (
                          <>
                            <p className="text-sm text-amber-600">
                              {hoursRemaining} hours remaining in containment
                            </p>
                            <div className="containment-progress mt-2">
                              <div
                                className="containment-progress-bar"
                                style={{ width: `${percentComplete}%` }}
                              />
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Thread messages */}
          {task.canonical_thread_id && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Thread ({messages.length})
              </h3>

              <div className="space-y-3 max-h-64 overflow-y-auto">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'p-3 rounded-lg',
                      msg.from_actor === `person_${user?.id}`
                        ? 'bg-watershed-50 ml-4'
                        : 'bg-gray-50 mr-4'
                    )}
                  >
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>{msg.from_actor}</span>
                      <span>{formatRelativeTime(msg.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-700">{msg.body}</p>
                    <span className="text-xs text-gray-400 mt-1 inline-block">
                      {msg.message_type}
                    </span>
                  </div>
                ))}
              </div>

              {/* New message input */}
              <div className="flex gap-2 mt-3">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Add a note..."
                  className="input flex-1"
                />
                <button onClick={handleSendMessage} className="btn btn-primary">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="text-xs text-gray-400 space-y-1">
            <p>Created: {formatDateTime(task.created_at)}</p>
            <p>Updated: {formatDateTime(task.updated_at)}</p>
            {task.completed_at && <p>Completed: {formatDateTime(task.completed_at)}</p>}
          </div>
        </div>

        {/* Footer actions */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4">
          <div className="flex gap-3">
            {task.status !== 'completed' && (
              <button onClick={handleComplete} className="btn btn-primary flex-1">
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Complete
              </button>
            )}
            <button onClick={() => setIsEditing(true)} className="btn btn-secondary flex-1">
              Edit
            </button>
          </div>
        </div>
      </div>

      {/* Delegate modal */}
      {showDelegateModal && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">Delegate Task</h3>
            <div className="space-y-2">
              {['cell_1', 'cell_2', 'cell_3', 'cell_4', 'cell_5', 'cos', 'reality_check'].map(
                (actorId) => (
                  <button
                    key={actorId}
                    onClick={() => handleDelegate(actorId)}
                    className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-50 border border-gray-200"
                  >
                    <span className={cn('badge mr-2', getCellColor(actorId))}>
                      {getCellName(actorId)}
                    </span>
                  </button>
                )
              )}
            </div>
            <button
              onClick={() => setShowDelegateModal(false)}
              className="btn btn-secondary w-full mt-4"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
