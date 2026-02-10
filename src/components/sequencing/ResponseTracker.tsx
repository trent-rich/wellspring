import { useState, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  Mail,
  Unlock,
  FileText,
  RefreshCw,
  X,
  ChevronDown,
  Activity,
  Bell,
  Zap,
  Clock,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSequencingStore } from '../../store/sequencingStore';
import { listEmails, getEmail, parseEmail, isGmailConnected } from '../../lib/gmailService';
import { classifyEmailResponse } from '../../lib/ai-drafts';
import type { AutomationEvent, ResponseClassification } from '../../types/sequencing';

const EVENT_TYPE_COLORS: Record<AutomationEvent['type'], string> = {
  response_detected: 'border-blue-500',
  follow_up_generated: 'border-green-500',
  status_changed: 'border-yellow-500',
  dependency_unlocked: 'border-purple-500',
  draft_generated: 'border-orange-500',
};

const EVENT_TYPE_BG: Record<AutomationEvent['type'], string> = {
  response_detected: 'bg-blue-50',
  follow_up_generated: 'bg-green-50',
  status_changed: 'bg-yellow-50',
  dependency_unlocked: 'bg-purple-50',
  draft_generated: 'bg-orange-50',
};

function getEventIcon(type: AutomationEvent['type']) {
  switch (type) {
    case 'response_detected':
      return <Mail className="w-4 h-4 text-blue-500" />;
    case 'follow_up_generated':
      return <FileText className="w-4 h-4 text-green-500" />;
    case 'status_changed':
      return <Activity className="w-4 h-4 text-yellow-600" />;
    case 'dependency_unlocked':
      return <Unlock className="w-4 h-4 text-purple-500" />;
    case 'draft_generated':
      return <FileText className="w-4 h-4 text-orange-500" />;
  }
}

function formatRelativeTime(timestamp: string): string {
  try {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  } catch {
    return '';
  }
}

const CLASSIFICATION_OPTIONS: { value: ResponseClassification; label: string }[] = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'declined', label: 'Declined' },
  { value: 'more_info', label: 'More Info Requested' },
  { value: 'meeting_requested', label: 'Meeting Requested' },
];

export default function ResponseTracker() {
  const {
    automationEvents,
    invitees,
    getPendingActions,
    clearAutomationEvent,
    classifyResponse,
    setShowDraftComposer,
    setSelectedInviteeId,
    updateInvitee,
  } = useSequencingStore();

  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);

  // Manual classification state
  const [manualInviteeId, setManualInviteeId] = useState('');
  const [manualClassification, setManualClassification] =
    useState<ResponseClassification>('confirmed');
  const [manualSnippet, setManualSnippet] = useState('');

  const pendingActions = getPendingActions();
  const sentInvitees = invitees.filter((inv) => inv.status === 'sent' && inv.email);
  const gmailConnected = isGmailConnected();

  const handleScanForResponses = useCallback(async () => {
    setIsScanning(true);
    setScanStatus('Scanning...');
    let foundCount = 0;

    try {
      for (const invitee of sentInvitees) {
        if (!invitee.email) continue;
        setScanStatus(`Checking ${invitee.name}...`);

        try {
          const query = `from:${invitee.email} is:unread newer_than:1d`;
          const listResult = await listEmails({ maxResults: 3, q: query });

          if (listResult.messages && listResult.messages.length > 0) {
            const fullMsg = await getEmail(listResult.messages[0].id);
            const parsed = parseEmail(fullMsg);

            const result = await classifyEmailResponse(parsed.body, invitee.name);

            if (result.classification !== 'unclear') {
              classifyResponse(invitee.id, result.classification, parsed.snippet);
              foundCount++;
            }

            if (fullMsg.threadId) {
              updateInvitee(invitee.id, { emailThreadId: fullMsg.threadId });
            }
          }
        } catch {
          // Continue scanning other invitees
        }
      }

      setScanStatus(
        foundCount > 0
          ? `Found ${foundCount} response${foundCount > 1 ? 's' : ''}`
          : 'No new responses'
      );
      setTimeout(() => setScanStatus(null), 4000);
    } catch {
      setScanStatus('Scan failed');
      setTimeout(() => setScanStatus(null), 4000);
    } finally {
      setIsScanning(false);
    }
  }, [sentInvitees, classifyResponse, updateInvitee]);

  const handleAction = useCallback(
    (event: AutomationEvent) => {
      if (!event.actionLabel) return;

      switch (event.actionLabel) {
        case 'Generate draft':
        case 'Review draft':
        case 'Draft follow-up':
          setShowDraftComposer(true, event.inviteeId);
          break;
        case 'Schedule meeting':
          setSelectedInviteeId(event.inviteeId);
          break;
        default:
          setSelectedInviteeId(event.inviteeId);
      }
    },
    [setShowDraftComposer, setSelectedInviteeId]
  );

  const handleManualClassify = useCallback(() => {
    if (!manualInviteeId || !manualSnippet.trim()) return;

    classifyResponse(manualInviteeId, manualClassification, manualSnippet.trim());
    setManualInviteeId('');
    setManualSnippet('');
    setManualClassification('confirmed');
  }, [manualInviteeId, manualClassification, manualSnippet, classifyResponse]);

  const sortedEvents = [...automationEvents].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <div className="space-y-6">
      {/* Scan Button */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-gray-900">Response Scanner</h3>
        </div>
        <button
          onClick={handleScanForResponses}
          disabled={isScanning || sentInvitees.length === 0 || !gmailConnected}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg bg-watershed-600 hover:bg-watershed-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className={cn('w-4 h-4', isScanning && 'animate-spin')} />
          {isScanning ? 'Scanning...' : 'Scan for Responses'}
        </button>
        {scanStatus && !isScanning && (
          <p className="mt-2 text-xs text-gray-500 text-center">{scanStatus}</p>
        )}
        {sentInvitees.length === 0 && (
          <p className="mt-2 text-xs text-gray-500 text-center">
            No sent invitations to scan
          </p>
        )}
        {!gmailConnected && sentInvitees.length > 0 && (
          <p className="mt-2 text-xs text-amber-600 text-center">
            Connect Gmail in Settings to scan for responses
          </p>
        )}
      </div>

      {/* Pending Actions */}
      {pendingActions.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-gray-900">
              Pending Actions
            </h3>
            <span className="flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-red-500 text-white rounded-full">
              {pendingActions.length}
            </span>
          </div>
          <div className="space-y-2">
            {pendingActions.map((event) => (
              <div
                key={event.id}
                className={cn(
                  'relative rounded-lg border-l-2 p-3',
                  EVENT_TYPE_COLORS[event.type],
                  EVENT_TYPE_BG[event.type]
                )}
              >
                <button
                  onClick={() => clearAutomationEvent(event.id)}
                  className="absolute top-2 right-2 p-0.5 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Dismiss"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                <div className="flex items-start gap-2 pr-6">
                  <div className="mt-0.5 shrink-0">{getEventIcon(event.type)}</div>
                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => setSelectedInviteeId(event.inviteeId)}
                      className="text-sm font-medium text-gray-900 hover:text-watershed-600 transition-colors truncate block text-left"
                    >
                      {event.inviteeName}
                    </button>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                      {event.description}
                    </p>
                    {event.actionLabel && (
                      <button
                        onClick={() => handleAction(event)}
                        className="mt-2 inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-md bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 transition-colors"
                      >
                        {event.actionLabel}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Event Log */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">Event Log</h3>
        </div>
        {sortedEvents.length === 0 ? (
          <div className="text-center py-8">
            <Activity className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No events yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Events will appear as invitations are sent and responses arrive.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedEvents.map((event) => (
              <div
                key={event.id}
                className={cn(
                  'rounded-lg border-l-2 px-3 py-2',
                  EVENT_TYPE_COLORS[event.type],
                  'bg-gray-50'
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 shrink-0">{getEventIcon(event.type)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <button
                        onClick={() => setSelectedInviteeId(event.inviteeId)}
                        className="text-xs font-medium text-gray-700 hover:text-watershed-600 transition-colors truncate text-left"
                      >
                        {event.inviteeName}
                      </button>
                      <span className="text-[10px] text-gray-400 whitespace-nowrap shrink-0">
                        {formatRelativeTime(event.timestamp)}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">
                      {event.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manual Classification Override */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">
          Manual Classification
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          For responses received via phone, in-person, or other channels outside Gmail.
        </p>

        {/* Invitee selector */}
        <div className="relative mb-2">
          <select
            value={manualInviteeId}
            onChange={(e) => setManualInviteeId(e.target.value)}
            className="w-full appearance-none bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-watershed-500 focus:border-transparent pr-8"
          >
            <option value="">Select invitee...</option>
            {sentInvitees.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.name} ({inv.organization})
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>

        {/* Classification selector */}
        <div className="relative mb-2">
          <select
            value={manualClassification}
            onChange={(e) =>
              setManualClassification(e.target.value as ResponseClassification)
            }
            className="w-full appearance-none bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-watershed-500 focus:border-transparent pr-8"
          >
            {CLASSIFICATION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>

        {/* Response snippet */}
        <input
          type="text"
          value={manualSnippet}
          onChange={(e) => setManualSnippet(e.target.value)}
          placeholder="Response summary (e.g., 'Confirmed via phone call')"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-watershed-500 focus:border-transparent mb-3"
        />

        <button
          onClick={handleManualClassify}
          disabled={!manualInviteeId || !manualSnippet.trim()}
          className="w-full px-3 py-2 text-sm font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Classify Response
        </button>
      </div>
    </div>
  );
}
