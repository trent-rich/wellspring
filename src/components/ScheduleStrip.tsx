import { Video, Clock, AlertCircle, ChevronRight } from 'lucide-react';
import { useCurrentEvent, useNextEvent, useUpcomingEvents, useUpcomingMeetingInterrupt } from '../store/calendarStore';
import { useUserStateStore } from '../store/userStateStore';
import { cn, formatEventTime, formatTimeUntil, getTimeUntil } from '../lib/utils';

export default function ScheduleStrip() {
  const currentEvent = useCurrentEvent();
  const nextEvent = useNextEvent();
  const upcomingEvents = useUpcomingEvents(3);
  const meetingInterrupt = useUpcomingMeetingInterrupt(5);
  const { currentState, enterMeetingMode } = useUserStateStore();

  const handleJoinMeeting = (eventId: string, meetLink?: string | null) => {
    enterMeetingMode(eventId);
    if (meetLink) {
      window.open(meetLink, '_blank');
    }
  };

  // If in a meeting, show meeting mode strip
  if (currentState === 'meeting_mode' && currentEvent) {
    return (
      <div className="schedule-strip px-4 py-3 bg-purple-50 border-b border-purple-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
              <Video className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="font-medium text-purple-900">{currentEvent.title}</p>
              <p className="text-sm text-purple-600">
                Until {formatEventTime(currentEvent.end_time)}
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
                Rejoin Meeting
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  // If meeting is about to start, show interrupt
  if (meetingInterrupt) {
    const { minutes } = getTimeUntil(meetingInterrupt.start_time);
    return (
      <div className="schedule-strip px-4 py-3 bg-purple-100 border-b border-purple-300 animate-pulse-slow">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-200 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-purple-700" />
            </div>
            <div>
              <p className="font-medium text-purple-900">
                Meeting starting in {minutes} {minutes === 1 ? 'minute' : 'minutes'}
              </p>
              <p className="text-sm text-purple-700">{meetingInterrupt.title}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleJoinMeeting(meetingInterrupt.id, meetingInterrupt.meet_link)}
              className="btn btn-primary text-sm"
            >
              <Video className="w-4 h-4 mr-2" />
              Join Now
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Normal schedule strip
  return (
    <div className="schedule-strip px-4 py-2">
      <div className="flex items-center gap-6 overflow-x-auto scrollbar-thin">
        {/* Now */}
        {currentEvent ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs font-medium text-gray-500 uppercase">Now</span>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-100 rounded-full">
              <Video className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-medium text-purple-700 truncate max-w-[200px]">
                {currentEvent.title}
              </span>
              {currentEvent.meet_link && (
                <button
                  onClick={() => handleJoinMeeting(currentEvent.id, currentEvent.meet_link)}
                  className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                >
                  Join
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs font-medium text-gray-500 uppercase">Now</span>
            <span className="text-sm text-gray-500">No current meeting</span>
          </div>
        )}

        {/* Divider */}
        <div className="w-px h-6 bg-gray-200 flex-shrink-0" />

        {/* Next */}
        {nextEvent ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs font-medium text-gray-500 uppercase">Next</span>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-700 truncate max-w-[200px]">
                {nextEvent.title}
              </span>
              <span className="text-sm text-gray-500">
                {formatTimeUntil(nextEvent.start_time)}
              </span>
              {nextEvent.preread_required && (
                <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                  Pre-read required
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs font-medium text-gray-500 uppercase">Next</span>
            <span className="text-sm text-gray-500">No upcoming meetings</span>
          </div>
        )}

        {/* Divider */}
        {upcomingEvents.length > 1 && (
          <>
            <div className="w-px h-6 bg-gray-200 flex-shrink-0" />

            {/* Today's remaining */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-xs font-medium text-gray-500 uppercase">Today</span>
              {upcomingEvents.slice(1).map((event) => (
                <div
                  key={event.id}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded text-sm',
                    event.embodied_flag
                      ? 'bg-embodied-50 text-embodied-700'
                      : 'bg-gray-100 text-gray-600'
                  )}
                >
                  <span className="truncate max-w-[120px]">{event.title}</span>
                  <span className="text-xs text-gray-400">
                    {formatEventTime(event.start_time)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Calendar link */}
        <div className="flex-shrink-0 ml-auto">
          <a
            href="/calendar"
            className="flex items-center gap-1 text-sm text-watershed-600 hover:text-watershed-700"
          >
            Full calendar
            <ChevronRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
