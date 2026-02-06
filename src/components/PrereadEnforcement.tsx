import { useState, useEffect } from 'react';
import {
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  ExternalLink,
  Send,
  Calendar,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import type { CalendarEventWithMeeting, MeetingPreread, MeetingPrereadAck, CannotPrepareReason } from '../types';
import { cn, formatEventTime, formatTimeUntil, getTimeUntil } from '../lib/utils';
import { addMinutes } from 'date-fns';

interface PrereadEnforcementProps {
  event: CalendarEventWithMeeting;
  isOrganizer: boolean;
}

export default function PrereadEnforcement({ event, isOrganizer }: PrereadEnforcementProps) {
  const { user } = useAuthStore();
  const [prereads, setPrreads] = useState<MeetingPreread[]>([]);
  const [acks, setAcks] = useState<MeetingPrereadAck[]>([]);
  const [myAck, setMyAck] = useState<MeetingPrereadAck | null>(null);
  const [, setIsLoading] = useState(true);
  const [showCannotPrepare, setShowCannotPrepare] = useState(false);

  // Calculate deadline
  const deadlineMinutes = event.preread_deadline_minutes || 30;
  const deadline = addMinutes(new Date(event.start_time), -deadlineMinutes);
  const { isPast: isPastDeadline } = getTimeUntil(deadline);

  // Fetch prereads and acks
  useEffect(() => {
    const fetchData = async () => {
      if (!event.meeting?.id) return;

      setIsLoading(true);

      // Fetch prereads
      const { data: prereadData } = await supabase
        .from('meeting_prereads')
        .select('*')
        .eq('meeting_id', event.meeting.id);

      if (prereadData) setPrreads(prereadData);

      // Fetch acks
      const { data: ackData } = await supabase
        .from('meeting_preread_ack')
        .select('*')
        .eq('meeting_id', event.meeting.id);

      if (ackData) {
        setAcks(ackData);
        const mine = ackData.find((a) => a.user_id === user?.id);
        setMyAck(mine || null);
      }

      setIsLoading(false);
    };

    fetchData();
  }, [event.meeting?.id, user?.id]);

  const handleAcknowledge = async () => {
    if (!event.meeting?.id || !user?.id) return;

    const { error } = await supabase.from('meeting_preread_ack').upsert({
      meeting_id: event.meeting.id,
      user_id: user.id,
      acknowledged_at: new Date().toISOString(),
      cannot_prepare: false,
    });

    if (!error) {
      setMyAck({
        id: '',
        meeting_id: event.meeting.id,
        user_id: user.id,
        acknowledged_at: new Date().toISOString(),
        cannot_prepare: false,
        cannot_prepare_reason: null,
        notes: null,
        created_at: new Date().toISOString(),
      });
    }
  };

  const handleCannotPrepare = async (reason: CannotPrepareReason, notes?: string) => {
    if (!event.meeting?.id || !user?.id) return;

    const { error } = await supabase.from('meeting_preread_ack').upsert({
      meeting_id: event.meeting.id,
      user_id: user.id,
      cannot_prepare: true,
      cannot_prepare_reason: reason,
      notes,
    });

    if (!error) {
      setMyAck({
        id: '',
        meeting_id: event.meeting.id,
        user_id: user.id,
        acknowledged_at: null,
        cannot_prepare: true,
        cannot_prepare_reason: reason,
        notes: notes || null,
        created_at: new Date().toISOString(),
      });
      setShowCannotPrepare(false);
    }
  };

  // Organizer view: compliance panel
  if (isOrganizer) {
    const attendeeCount = event.attendees?.length || 0;
    const acknowledgedCount = acks.filter((a) => a.acknowledged_at).length;
    const cannotPrepareCount = acks.filter((a) => a.cannot_prepare).length;
    const pendingCount = attendeeCount - acknowledgedCount - cannotPrepareCount;

    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Pre-read Compliance
        </h3>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <p className="text-2xl font-bold text-green-600">{acknowledgedCount}</p>
            <p className="text-xs text-green-700">Ready</p>
          </div>
          <div className="text-center p-3 bg-amber-50 rounded-lg">
            <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
            <p className="text-xs text-amber-700">Pending</p>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <p className="text-2xl font-bold text-red-600">{cannotPrepareCount}</p>
            <p className="text-xs text-red-700">Cannot Prepare</p>
          </div>
        </div>

        {/* Deadline warning */}
        {isPastDeadline && pendingCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-4 h-4" />
              <span className="font-medium">Deadline passed with {pendingCount} pending</span>
            </div>
          </div>
        )}

        {/* Attendee list */}
        <div className="space-y-2">
          {event.attendees?.map((attendee, i) => {
            const ack = acks.find((_a) => {
              // Would match by user email in real implementation
              return true;
            });

            return (
              <div
                key={i}
                className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
              >
                <span className="text-sm text-gray-700">
                  {attendee.name || attendee.email}
                </span>
                {ack?.acknowledged_at ? (
                  <span className="flex items-center gap-1 text-green-600 text-sm">
                    <CheckCircle className="w-4 h-4" />
                    Ready
                  </span>
                ) : ack?.cannot_prepare ? (
                  <span className="flex items-center gap-1 text-red-600 text-sm">
                    <XCircle className="w-4 h-4" />
                    {ack.cannot_prepare_reason}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-gray-400 text-sm">
                    <Clock className="w-4 h-4" />
                    Pending
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Organizer actions */}
        <div className="flex gap-2 mt-4">
          <button className="btn btn-secondary flex-1 text-sm">
            <Send className="w-4 h-4 mr-1" />
            Push Request
          </button>
          <button className="btn btn-secondary flex-1 text-sm">
            <Calendar className="w-4 h-4 mr-1" />
            Reschedule
          </button>
        </div>
      </div>
    );
  }

  // Attendee view: pre-read acknowledgment
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <h3 className="font-medium text-amber-800 mb-2 flex items-center gap-2">
        <FileText className="w-5 h-5" />
        Pre-read Required
      </h3>

      {/* Deadline */}
      <p className="text-sm text-amber-700 mb-4">
        Please review materials by{' '}
        <strong>{formatEventTime(deadline.toISOString())}</strong>
        {!isPastDeadline && (
          <span className="ml-1">({formatTimeUntil(deadline)})</span>
        )}
      </p>

      {/* Pre-read documents */}
      {prereads.length > 0 && (
        <div className="space-y-2 mb-4">
          {prereads.map((preread) => (
            <a
              key={preread.id}
              href={preread.artifact_uri}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2 bg-white rounded border border-amber-200 hover:border-amber-300 transition-colors"
            >
              <FileText className="w-4 h-4 text-amber-600" />
              <span className="text-sm text-gray-700 flex-1">
                {preread.artifact_title || 'Pre-read document'}
              </span>
              <ExternalLink className="w-4 h-4 text-gray-400" />
            </a>
          ))}
        </div>
      )}

      {/* Acknowledgment status */}
      {myAck?.acknowledged_at ? (
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle className="w-5 h-5" />
          <span>You've acknowledged the pre-read</span>
        </div>
      ) : myAck?.cannot_prepare ? (
        <div className="flex items-center gap-2 text-red-600">
          <XCircle className="w-5 h-5" />
          <span>Marked as cannot prepare: {myAck.cannot_prepare_reason}</span>
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={handleAcknowledge} className="btn btn-primary flex-1">
            <CheckCircle className="w-4 h-4 mr-2" />
            I'm Prepared
          </button>
          <button
            onClick={() => setShowCannotPrepare(true)}
            className="btn btn-secondary"
          >
            Cannot Prepare
          </button>
        </div>
      )}

      {/* Cannot prepare modal */}
      {showCannotPrepare && (
        <CannotPrepareModal
          onClose={() => setShowCannotPrepare(false)}
          onSubmit={handleCannotPrepare}
        />
      )}
    </div>
  );
}

// Cannot prepare modal
interface CannotPrepareModalProps {
  onClose: () => void;
  onSubmit: (reason: CannotPrepareReason, notes?: string) => void;
}

function CannotPrepareModal({ onClose, onSubmit }: CannotPrepareModalProps) {
  const [reason, setReason] = useState<CannotPrepareReason>('insufficient_time');
  const [notes, setNotes] = useState('');

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Cannot Prepare</h3>
        <p className="text-sm text-gray-500 mb-4">
          Let the organizer know why you can't prepare for this meeting.
        </p>

        <div className="space-y-3 mb-4">
          {[
            { value: 'insufficient_time', label: 'Insufficient time' },
            { value: 'unclear', label: 'Materials unclear' },
            { value: 'wrong_attendee', label: "I shouldn't be in this meeting" },
            { value: 'conflict', label: 'Schedule conflict' },
            { value: 'emergency', label: 'Emergency' },
            { value: 'other', label: 'Other' },
          ].map((option) => (
            <label
              key={option.value}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg border cursor-pointer',
                reason === option.value
                  ? 'border-watershed-500 bg-watershed-50'
                  : 'border-gray-200 hover:bg-gray-50'
              )}
            >
              <input
                type="radio"
                name="reason"
                value={option.value}
                checked={reason === option.value}
                onChange={(e) => setReason(e.target.value as CannotPrepareReason)}
                className="sr-only"
              />
              <div
                className={cn(
                  'w-4 h-4 rounded-full border-2',
                  reason === option.value
                    ? 'border-watershed-500 bg-watershed-500'
                    : 'border-gray-300'
                )}
              >
                {reason === option.value && (
                  <div className="w-2 h-2 bg-white rounded-full m-0.5" />
                )}
              </div>
              <span className="text-sm text-gray-700">{option.label}</span>
            </label>
          ))}
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Additional notes (optional)..."
          className="textarea mb-4"
          rows={2}
        />

        <div className="flex gap-3">
          <button
            onClick={() => onSubmit(reason, notes || undefined)}
            className="btn btn-primary flex-1"
          >
            Submit
          </button>
          <button onClick={onClose} className="btn btn-secondary flex-1">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
