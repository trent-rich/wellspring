import { useState } from 'react';
import {
  Video,
  FileText,
  Plus,
  CheckCircle,
  Lightbulb,
  Users,
  ExternalLink,
  Minimize2,
  Maximize2,
} from 'lucide-react';
import { useUserStateStore } from '../store/userStateStore';
import { useCurrentEvent } from '../store/calendarStore';
import { useTaskStore } from '../store/taskStore';
import { useIdeaStore } from '../store/ideaStore';
import { cn, formatEventTime, getTimeUntil } from '../lib/utils';

export default function MeetingMode() {
  const { currentState, exitMeetingMode } = useUserStateStore();
  const currentEvent = useCurrentEvent();
  const { createTask } = useTaskStore();
  const { createIdea } = useIdeaStore();

  const [isMinimized, setIsMinimized] = useState(false);
  const [quickNote, setQuickNote] = useState('');
  const [capturedItems, setCapturedItems] = useState<
    Array<{ type: 'task' | 'idea'; text: string; id?: string }>
  >([]);

  // Only show in meeting mode
  if (currentState !== 'meeting_mode' || !currentEvent) {
    return null;
  }

  const { hours, minutes } = getTimeUntil(currentEvent.end_time);
  const timeRemaining = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  const handleCaptureTask = async () => {
    if (!quickNote.trim()) return;

    const task = await createTask({
      title: quickNote.trim(),
      source: 'meeting',
      cell_affiliation: currentEvent.attendees?.[0]?.email?.includes('watershed')
        ? 'cell_1' // Would be smarter routing
        : undefined,
    });

    setCapturedItems([
      ...capturedItems,
      { type: 'task', text: quickNote.trim(), id: task.id },
    ]);
    setQuickNote('');
  };

  const handleCaptureIdea = async () => {
    if (!quickNote.trim()) return;

    const idea = await createIdea({
      title: quickNote.trim(),
    });

    setCapturedItems([
      ...capturedItems,
      { type: 'idea', text: quickNote.trim(), id: idea.id },
    ]);
    setQuickNote('');
  };

  const handleEndMeeting = () => {
    exitMeetingMode();
  };

  // Minimized view
  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={() => setIsMinimized(false)}
          className="bg-purple-600 text-white rounded-full px-4 py-2 shadow-lg flex items-center gap-2 hover:bg-purple-700 transition-colors"
        >
          <Video className="w-4 h-4" />
          <span className="font-medium">{currentEvent.title}</span>
          <span className="text-purple-200">• {timeRemaining} left</span>
          <Maximize2 className="w-4 h-4 ml-2" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 lg:left-64 z-40">
      {/* Dimmed task area indicator */}
      <div className="absolute inset-0 bg-gradient-to-t from-purple-900/20 to-transparent pointer-events-none -top-20" />

      {/* Meeting panel */}
      <div className="bg-white border-t border-purple-200 shadow-lg">
        {/* Header */}
        <div className="bg-purple-50 px-4 py-3 flex items-center justify-between border-b border-purple-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
              <Video className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="font-semibold text-purple-900">{currentEvent.title}</h2>
              <p className="text-sm text-purple-600">
                Until {formatEventTime(currentEvent.end_time)} • {timeRemaining} remaining
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentEvent.meet_link && (
              <a
                href={currentEvent.meet_link}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary text-sm"
              >
                <Video className="w-4 h-4 mr-1" />
                Rejoin
              </a>
            )}
            <button
              onClick={() => setIsMinimized(true)}
              className="btn btn-ghost"
              title="Minimize"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleEndMeeting}
              className="btn btn-secondary text-sm"
            >
              End Meeting
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="grid lg:grid-cols-3 gap-4">
            {/* Left: Quick capture */}
            <div className="lg:col-span-2">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Quick Capture</h3>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={quickNote}
                  onChange={(e) => setQuickNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.metaKey) handleCaptureTask();
                    if (e.key === 'Enter' && e.altKey) handleCaptureIdea();
                  }}
                  placeholder="Capture action item or idea..."
                  className="input flex-1"
                />
                <button
                  onClick={handleCaptureTask}
                  disabled={!quickNote.trim()}
                  className="btn btn-primary"
                  title="Save as task (⌘+Enter)"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Task
                </button>
                <button
                  onClick={handleCaptureIdea}
                  disabled={!quickNote.trim()}
                  className="btn btn-secondary"
                  title="Save as idea (⌥+Enter)"
                >
                  <Lightbulb className="w-4 h-4 mr-1" />
                  Idea
                </button>
              </div>

              {/* Captured items */}
              {capturedItems.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">
                    Captured during this meeting ({capturedItems.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {capturedItems.map((item, i) => (
                      <span
                        key={i}
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-1 rounded text-xs',
                          item.type === 'task'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-amber-50 text-amber-700'
                        )}
                      >
                        {item.type === 'task' ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : (
                          <Lightbulb className="w-3 h-3" />
                        )}
                        {item.text}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Meeting info */}
            <div className="space-y-4">
              {/* Attendees */}
              {currentEvent.attendees && currentEvent.attendees.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    Attendees ({currentEvent.attendees.length})
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {currentEvent.attendees.slice(0, 5).map((attendee, i) => (
                      <span
                        key={i}
                        className="text-xs px-2 py-0.5 bg-gray-100 rounded-full"
                      >
                        {attendee.name?.split(' ')[0] || attendee.email.split('@')[0]}
                      </span>
                    ))}
                    {currentEvent.attendees.length > 5 && (
                      <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full">
                        +{currentEvent.attendees.length - 5}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Pre-reads */}
              {currentEvent.preread_required && currentEvent.meeting?.id && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    Meeting Materials
                  </h4>
                  {/* Would show preread links here */}
                  <a
                    href="#"
                    className="text-xs text-watershed-600 hover:underline flex items-center gap-1"
                  >
                    View pre-read materials
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {/* Embodied indicator */}
              {currentEvent.embodied_flag && (
                <div className="bg-embodied-50 border border-embodied-200 rounded-lg p-2 text-xs text-embodied-700">
                  This is an embodied meeting. A settle buffer will follow.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Keyboard shortcuts hint */}
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 flex items-center gap-4">
          <span>
            <kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded">⌘+Enter</kbd> Save
            as task
          </span>
          <span>
            <kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded">⌥+Enter</kbd> Save
            as idea
          </span>
          <span>
            <kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded">Esc</kbd> Minimize
          </span>
        </div>
      </div>
    </div>
  );
}
