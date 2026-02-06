import { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Video,
  MapPin,
  Clock,
  FileText,
  Users,
  Leaf,
  RefreshCw,
} from 'lucide-react';
import {
  useCalendarStore,
  getIntentLabel,
  getModalityLabel,
} from '../store/calendarStore';
import { useUserStateStore } from '../store/userStateStore';
import type { CalendarEventWithMeeting } from '../types';
import {
  cn,
  formatEventTime,
  formatEventDate,
} from '../lib/utils';
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  addWeeks,
  subWeeks,
  isToday,
  isTomorrow,
} from 'date-fns';

export default function CalendarPage() {
  const { events, syncFromGoogleCalendar, markEventAsEmbodied, setPrereadRequired, lastSync, isLoading } = useCalendarStore();
  const { enterMeetingMode } = useUserStateStore();

  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventWithMeeting | null>(null);

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const getEventsForDay = (day: Date) => {
    return events.filter((event) => isSameDay(new Date(event.start_time), day));
  };

  const handleJoinMeeting = (event: CalendarEventWithMeeting) => {
    enterMeetingMode(event.id);
    if (event.meet_link) {
      window.open(event.meet_link, '_blank');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
          <p className="text-gray-500 mt-1">
            {events.length} events this week
            {lastSync && (
              <span className="ml-2 text-xs">
                • Last synced {format(lastSync, 'h:mm a')}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={syncFromGoogleCalendar}
          disabled={isLoading}
          className="btn btn-secondary"
        >
          <RefreshCw className={cn('w-4 h-4 mr-2', isLoading && 'animate-spin')} />
          Sync Calendar
        </button>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 p-4">
        <button
          onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
          className="btn btn-ghost"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900">
            {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
          </h2>
          <button
            onClick={() => setCurrentWeek(new Date())}
            className="text-sm text-watershed-600 hover:text-watershed-700"
          >
            Today
          </button>
        </div>
        <button
          onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
          className="btn btn-ghost"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Week grid */}
      <div className="grid grid-cols-7 gap-4">
        {weekDays.map((day) => {
          const dayEvents = getEventsForDay(day);
          const today = isToday(day);
          const tomorrow = isTomorrow(day);

          return (
            <div
              key={day.toISOString()}
              className={cn(
                'bg-white rounded-lg border p-3 min-h-[200px]',
                today ? 'border-watershed-300 bg-watershed-50' : 'border-gray-200'
              )}
            >
              <div className="text-center mb-3">
                <div className="text-xs font-medium text-gray-500 uppercase">
                  {format(day, 'EEE')}
                </div>
                <div
                  className={cn(
                    'text-lg font-semibold',
                    today ? 'text-watershed-600' : 'text-gray-900'
                  )}
                >
                  {format(day, 'd')}
                </div>
                {today && (
                  <span className="text-xs text-watershed-600">Today</span>
                )}
                {tomorrow && (
                  <span className="text-xs text-gray-500">Tomorrow</span>
                )}
              </div>

              <div className="space-y-2">
                {dayEvents.map((event) => (
                  <button
                    key={event.id}
                    onClick={() => setSelectedEvent(event)}
                    className={cn(
                      'w-full text-left p-2 rounded text-xs transition-colors',
                      event.embodied_flag
                        ? 'bg-embodied-100 hover:bg-embodied-200 text-embodied-800'
                        : 'bg-purple-50 hover:bg-purple-100 text-purple-800'
                    )}
                  >
                    <div className="font-medium truncate">{event.title}</div>
                    <div className="text-gray-500 flex items-center gap-1 mt-1">
                      <Clock className="w-3 h-3" />
                      {formatEventTime(event.start_time)}
                    </div>
                    {event.preread_required && (
                      <div className="text-amber-600 flex items-center gap-1 mt-1">
                        <FileText className="w-3 h-3" />
                        Pre-read
                      </div>
                    )}
                    {event.embodied_flag && (
                      <div className="text-embodied-600 flex items-center gap-1 mt-1">
                        <Leaf className="w-3 h-3" />
                        Embodied
                      </div>
                    )}
                  </button>
                ))}

                {dayEvents.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">No events</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Event detail panel */}
      {selectedEvent && (
        <EventDetailPanel
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onJoin={() => handleJoinMeeting(selectedEvent)}
          onToggleEmbodied={() => markEventAsEmbodied(selectedEvent.id, !selectedEvent.embodied_flag)}
          onTogglePreread={() => setPrereadRequired(selectedEvent.id, !selectedEvent.preread_required, 30)}
        />
      )}
    </div>
  );
}

// Event detail panel
interface EventDetailPanelProps {
  event: CalendarEventWithMeeting;
  onClose: () => void;
  onJoin: () => void;
  onToggleEmbodied: () => void;
  onTogglePreread: () => void;
}

function EventDetailPanel({
  event,
  onClose,
  onJoin,
  onToggleEmbodied,
  onTogglePreread,
}: EventDetailPanelProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-white border-t border-gray-200 shadow-lg p-6 z-30">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{event.title}</h2>
            <p className="text-gray-500">
              {formatEventDate(event.start_time)} • {formatEventTime(event.start_time)} -{' '}
              {formatEventTime(event.end_time)}
            </p>
          </div>
          <button onClick={onClose} className="btn btn-ghost">
            ✕
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Left column */}
          <div className="space-y-4">
            {event.location && (
              <div className="flex items-center gap-3 text-gray-600">
                <MapPin className="w-5 h-5" />
                <span>{event.location}</span>
              </div>
            )}

            {event.meet_link && (
              <div className="flex items-center gap-3">
                <Video className="w-5 h-5 text-purple-600" />
                <a
                  href={event.meet_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-600 hover:underline"
                >
                  Join Google Meet
                </a>
              </div>
            )}

            {event.attendees && event.attendees.length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-gray-600 mb-2">
                  <Users className="w-5 h-5" />
                  <span>{event.attendees.length} attendees</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {event.attendees.slice(0, 5).map((attendee, i) => (
                    <span
                      key={i}
                      className="text-xs px-2 py-1 bg-gray-100 rounded-full"
                    >
                      {attendee.name || attendee.email}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="text-sm text-gray-500">
              <p>Intent: {getIntentLabel(event.intent)}</p>
              <p>Modality: {getModalityLabel(event.modality)}</p>
            </div>
          </div>

          {/* Right column - Controls */}
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">Embodied Time</p>
                <p className="text-sm text-gray-500">
                  Silence notifications, enable settle buffer
                </p>
              </div>
              <button
                onClick={onToggleEmbodied}
                className={cn(
                  'w-12 h-6 rounded-full transition-colors relative',
                  event.embodied_flag ? 'bg-embodied-500' : 'bg-gray-300'
                )}
              >
                <span
                  className={cn(
                    'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                    event.embodied_flag ? 'translate-x-7' : 'translate-x-1'
                  )}
                />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">Pre-read Required</p>
                <p className="text-sm text-gray-500">
                  Enforce preparation before meeting
                </p>
              </div>
              <button
                onClick={onTogglePreread}
                className={cn(
                  'w-12 h-6 rounded-full transition-colors relative',
                  event.preread_required ? 'bg-amber-500' : 'bg-gray-300'
                )}
              >
                <span
                  className={cn(
                    'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                    event.preread_required ? 'translate-x-7' : 'translate-x-1'
                  )}
                />
              </button>
            </div>

            {event.embodied_flag && (
              <div className="bg-embodied-50 border border-embodied-200 rounded-lg p-3">
                <p className="text-sm text-embodied-700">
                  <Leaf className="w-4 h-4 inline mr-1" />
                  This meeting will trigger a {event.settle_buffer_minutes || 30}-minute settle
                  buffer afterward
                </p>
              </div>
            )}

            {event.meet_link && (
              <button onClick={onJoin} className="btn btn-primary w-full">
                <Video className="w-4 h-4 mr-2" />
                Join Meeting
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
