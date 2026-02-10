import {
  X,
  Clock,
  FileText,
  MessageSquare,
  Lock,
  Unlock,
  ChevronRight,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSequencingStore } from '../../store/sequencingStore';
import type { InvitationStatus } from '../../types/sequencing';

const STATUS_FLOW: InvitationStatus[] = [
  'not_started',
  'pre_warming',
  'draft_pending',
  'draft_ready',
  'approved',
  'sent',
  'confirmed',
];

const STATUS_LABELS: Record<InvitationStatus, string> = {
  not_started: 'Not Started',
  pre_warming: 'Pre-warming',
  draft_pending: 'Draft Pending',
  draft_ready: 'Draft Ready',
  approved: 'Approved',
  sent: 'Sent',
  confirmed: 'Confirmed',
  declined: 'Declined',
  more_info: 'More Info',
  meeting_requested: 'Meeting Requested',
  follow_up_draft: 'Follow-up Draft',
  follow_up_sent: 'Follow-up Sent',
};

const CONFIDENCE_COLORS: Record<string, string> = {
  HIGH: 'bg-green-100 text-green-700',
  'MEDIUM-HIGH': 'bg-blue-100 text-blue-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  'LOW-MEDIUM': 'bg-orange-100 text-orange-700',
  'JAMIE ONLY': 'bg-purple-100 text-purple-700',
};

interface InviteeDetailProps {
  inviteeId: string;
  onClose: () => void;
  onDraft: (id: string) => void;
}

export default function InviteeDetail({ inviteeId, onClose, onDraft }: InviteeDetailProps) {
  const { getInvitee, getInvitee: lookupInvitee, setInviteeStatus, getDependenciesMet } =
    useSequencingStore();

  const invitee = getInvitee(inviteeId);
  if (!invitee) return null;

  const depsMet = getDependenciesMet(inviteeId);

  const statusIndex = STATUS_FLOW.indexOf(invitee.status);
  const isTerminal =
    invitee.status === 'confirmed' ||
    invitee.status === 'declined' ||
    invitee.status === 'more_info' ||
    invitee.status === 'meeting_requested';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-white shadow-xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{invitee.name}</h2>
              <p className="text-sm text-gray-500">
                {invitee.title ? `${invitee.title}, ` : ''}
                {invitee.organization}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 space-y-6">
          {/* Status Timeline */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Status
            </h3>
            <div className="flex items-center gap-1">
              {STATUS_FLOW.slice(0, isTerminal ? undefined : undefined).map((s, i) => {
                const isCurrent = invitee.status === s;
                const isPast = statusIndex > i;
                return (
                  <div key={s} className="flex items-center gap-1">
                    <button
                      onClick={() => setInviteeStatus(inviteeId, s)}
                      className={cn(
                        'px-2 py-1 rounded text-[11px] font-medium transition-colors',
                        isCurrent
                          ? 'bg-watershed-100 text-watershed-700 ring-1 ring-watershed-300'
                          : isPast
                            ? 'bg-green-50 text-green-600'
                            : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                      )}
                    >
                      {STATUS_LABELS[s]}
                    </button>
                    {i < STATUS_FLOW.length - 1 && (
                      <ChevronRight className="w-3 h-3 text-gray-300 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
            {isTerminal && !STATUS_FLOW.includes(invitee.status) && (
              <div className="mt-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium',
                    invitee.status === 'confirmed'
                      ? 'bg-green-100 text-green-700'
                      : invitee.status === 'declined'
                        ? 'bg-red-100 text-red-600'
                        : 'bg-amber-100 text-amber-700'
                  )}
                >
                  {STATUS_LABELS[invitee.status]}
                </span>
              </div>
            )}
          </div>

          {/* Quick Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">Panel</p>
              <p className="text-sm text-gray-900">
                Panel {invitee.panel}
                {invitee.panelRole && (
                  <span className="text-xs text-gray-500 ml-1">({invitee.panelRole})</span>
                )}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">Phase</p>
              <p className="text-sm text-gray-900">
                Phase {invitee.phase} ({invitee.phaseOrder})
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">Network</p>
              <p className="text-sm text-gray-900 capitalize">{invitee.invitedBy}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">Confidence</p>
              <span
                className={cn(
                  'inline-flex px-2 py-0.5 rounded text-xs font-medium',
                  CONFIDENCE_COLORS[invitee.confidence] || 'bg-gray-100 text-gray-600'
                )}
              >
                {invitee.confidence}
              </span>
            </div>
          </div>

          {/* Email */}
          {invitee.email && (
            <div>
              <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium mb-1">Email</p>
              <p className="text-sm text-gray-900">{invitee.email}</p>
            </div>
          )}

          {/* Dependencies */}
          {invitee.dependencies.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Dependencies
              </h3>
              <div className="space-y-2">
                {invitee.dependencies.map((depId) => {
                  const dep = lookupInvitee(depId);
                  if (!dep) return null;
                  const isConfirmed = dep.status === 'confirmed';
                  return (
                    <div
                      key={depId}
                      className={cn(
                        'flex items-center gap-2 p-2.5 rounded-lg border',
                        isConfirmed ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
                      )}
                    >
                      {isConfirmed ? (
                        <Unlock className="w-4 h-4 text-green-500" />
                      ) : (
                        <Lock className="w-4 h-4 text-gray-400" />
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{dep.name}</p>
                        <p className="text-xs text-gray-500">{dep.organization}</p>
                      </div>
                      <span
                        className={cn(
                          'text-[11px] font-medium px-2 py-0.5 rounded-full',
                          isConfirmed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        )}
                      >
                        {isConfirmed ? 'Confirmed' : STATUS_LABELS[dep.status]}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p
                className={cn(
                  'text-xs mt-2 font-medium',
                  depsMet ? 'text-green-600' : 'text-gray-400'
                )}
              >
                {depsMet ? 'All dependencies met — ready to invite' : 'Waiting on dependencies'}
              </p>
            </div>
          )}

          {/* Leverage Script */}
          {invitee.leverageScript && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Leverage Script
              </h3>
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 leading-relaxed border border-gray-200">
                "{invitee.leverageScript}"
              </div>
            </div>
          )}

          {/* Leverage Names */}
          {invitee.leverageNames && invitee.leverageNames.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Names to Drop
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {invitee.leverageNames.map((name) => (
                  <span
                    key={name}
                    className="px-2 py-0.5 bg-watershed-50 text-watershed-700 rounded text-xs font-medium"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Last Response */}
          {invitee.lastResponseSnippet && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Last Response
              </h3>
              <div className="bg-blue-50 rounded-lg p-3 text-sm text-gray-700 border border-blue-200">
                <p className="text-[11px] text-blue-600 font-medium mb-1">
                  {invitee.lastResponseClassification?.replace(/_/g, ' ').toUpperCase()}
                  {invitee.lastResponseAt && (
                    <span className="text-gray-400 ml-2">
                      {new Date(invitee.lastResponseAt).toLocaleDateString()}
                    </span>
                  )}
                </p>
                <p>{invitee.lastResponseSnippet}</p>
              </div>
            </div>
          )}

          {/* Notes */}
          {invitee.notes && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Notes
              </h3>
              <p className="text-sm text-gray-600">{invitee.notes}</p>
            </div>
          )}

          {/* Actions */}
          <div className="border-t border-gray-200 pt-4 space-y-2">
            {(invitee.status === 'not_started' || invitee.status === 'pre_warming') && depsMet && (
              <button
                onClick={() => onDraft(inviteeId)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-watershed-600 hover:bg-watershed-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <FileText className="w-4 h-4" />
                Generate Invitation Draft
              </button>
            )}
            {invitee.status === 'more_info' && (
              <button
                onClick={() => onDraft(inviteeId)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                Generate Follow-up Draft
              </button>
            )}
            {invitee.status === 'not_started' && (
              <button
                onClick={() => setInviteeStatus(inviteeId, 'pre_warming')}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors"
              >
                <Clock className="w-4 h-4" />
                Mark as Pre-warming
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
