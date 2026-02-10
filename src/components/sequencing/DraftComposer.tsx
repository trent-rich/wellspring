import { useState, useCallback } from 'react';
import {
  X,
  Sparkles,
  Send,
  Save,
  RefreshCw,
  Check,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSequencingStore } from '../../store/sequencingStore';
import { generateInvitationDraft } from '../../lib/ai-drafts';
import { sendEmail, createDraft, isGmailConnected } from '../../lib/gmailService';
import type { DraftRequest } from '../../types/sequencing';

type Step = 'generate' | 'review' | 'confirm';

interface DraftComposerProps {
  inviteeId: string;
  onClose: () => void;
}

export default function DraftComposer({ inviteeId, onClose }: DraftComposerProps) {
  const {
    getInvitee,
    getConfirmedNames,
    updateInvitee,
    setInviteeStatus,
    addAutomationEvent,
  } = useSequencingStore();

  const invitee = getInvitee(inviteeId);
  const confirmedNames = getConfirmedNames();

  const [step, setStep] = useState<Step>('generate');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipientEmail, setRecipientEmail] = useState(invitee?.email || '');

  const isFollowUp =
    invitee?.status === 'more_info' ||
    invitee?.status === 'meeting_requested' ||
    invitee?.status === 'follow_up_draft';

  const handleGenerate = useCallback(async () => {
    if (!invitee) return;

    setIsGenerating(true);
    setError(null);

    try {
      const request: DraftRequest = {
        inviteeId: invitee.id,
        inviteeName: invitee.name,
        organization: invitee.organization,
        panel: invitee.panel,
        leverageScript: invitee.leverageScript,
        leverageNames: invitee.leverageNames,
        confirmedNames,
        isFollowUp,
        responseContext: invitee.lastResponseSnippet,
      };

      const draft = await generateInvitationDraft(request);
      setSubject(draft.subject);
      setBody(draft.body);
      setStep('review');

      addAutomationEvent({
        inviteeId: invitee.id,
        inviteeName: invitee.name,
        type: 'draft_generated',
        description: `AI draft ${isFollowUp ? 'follow-up ' : ''}generated for review`,
        requiresAction: false,
      });

      setInviteeStatus(inviteeId, isFollowUp ? 'follow_up_draft' : 'draft_ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate draft');
    } finally {
      setIsGenerating(false);
    }
  }, [invitee, confirmedNames, isFollowUp, inviteeId, addAutomationEvent, setInviteeStatus]);

  const handleRegenerate = useCallback(async () => {
    setStep('generate');
    await handleGenerate();
  }, [handleGenerate]);

  const handleApprove = useCallback(() => {
    if (!invitee) return;
    setInviteeStatus(inviteeId, 'approved');
    updateInvitee(inviteeId, { draftContent: body });
    setStep('confirm');
  }, [invitee, inviteeId, body, setInviteeStatus, updateInvitee]);

  const handleSend = useCallback(async () => {
    if (!invitee || !recipientEmail) return;

    setIsSending(true);
    setError(null);

    try {
      const result = await sendEmail({
        to: [recipientEmail],
        subject,
        body,
        isHtml: false,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to send email');
      }

      updateInvitee(inviteeId, { email: recipientEmail });
      setInviteeStatus(inviteeId, isFollowUp ? 'follow_up_sent' : 'sent');

      addAutomationEvent({
        inviteeId: invitee.id,
        inviteeName: invitee.name,
        type: 'status_changed',
        description: `${isFollowUp ? 'Follow-up' : 'Invitation'} sent to ${recipientEmail}`,
        requiresAction: false,
      });

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setIsSending(false);
    }
  }, [
    invitee,
    recipientEmail,
    subject,
    body,
    inviteeId,
    isFollowUp,
    addAutomationEvent,
    setInviteeStatus,
    updateInvitee,
    onClose,
  ]);

  const handleSaveDraft = useCallback(async () => {
    if (!recipientEmail) return;

    setIsSending(true);
    setError(null);

    try {
      const result = await createDraft({
        to: [recipientEmail],
        subject,
        body,
        isHtml: false,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to save draft');
      }

      updateInvitee(inviteeId, { draftContent: body });
      setInviteeStatus(inviteeId, 'draft_ready');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save draft');
    } finally {
      setIsSending(false);
    }
  }, [recipientEmail, subject, body, inviteeId, setInviteeStatus, updateInvitee, onClose]);

  if (!invitee) return null;

  const gmailConnected = isGmailConnected();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-3xl bg-white rounded-xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {isFollowUp ? 'Follow-up' : 'Invitation'} Draft — {invitee.name}
            </h2>
            <p className="text-sm text-gray-500">
              {invitee.organization} · Panel {invitee.panel}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-2 px-6 py-3 bg-gray-50 border-b border-gray-200">
          {(['generate', 'review', 'confirm'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={cn(
                  'flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold',
                  step === s
                    ? 'bg-watershed-600 text-white'
                    : i < ['generate', 'review', 'confirm'].indexOf(step)
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 text-gray-500'
                )}
              >
                {i < ['generate', 'review', 'confirm'].indexOf(step) ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={cn(
                  'text-xs font-medium',
                  step === s ? 'text-gray-900' : 'text-gray-400'
                )}
              >
                {s === 'generate' ? 'Generate' : s === 'review' ? 'Review & Edit' : 'Send'}
              </span>
              {i < 2 && <ChevronRight className="w-3 h-3 text-gray-300" />}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Step 1: Generate */}
          {step === 'generate' && (
            <div className="text-center py-12">
              <Sparkles className="w-12 h-12 text-watershed-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Generate {isFollowUp ? 'Follow-up' : 'Invitation'} Draft
              </h3>
              <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
                AI will generate a personalized {isFollowUp ? 'follow-up' : 'invitation'} using
                the leverage script, confirmed names, and panel context from the operations package.
              </p>

              {/* Context preview */}
              <div className="text-left bg-gray-50 rounded-lg p-4 mb-6 max-w-md mx-auto">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Draft Context
                </h4>
                <div className="space-y-1.5 text-xs text-gray-600">
                  <p>
                    <span className="font-medium">Panel:</span> {invitee.panel}
                    {invitee.panelRole && ` (${invitee.panelRole})`}
                  </p>
                  <p>
                    <span className="font-medium">Network:</span>{' '}
                    <span className="capitalize">{invitee.invitedBy}</span>
                  </p>
                  {confirmedNames.length > 0 && (
                    <p>
                      <span className="font-medium">Confirmed:</span>{' '}
                      {confirmedNames.slice(0, 4).join(', ')}
                      {confirmedNames.length > 4 && ` +${confirmedNames.length - 4} more`}
                    </p>
                  )}
                  {invitee.leverageScript && (
                    <p>
                      <span className="font-medium">Leverage:</span>{' '}
                      {invitee.leverageScript.slice(0, 100)}...
                    </p>
                  )}
                  {isFollowUp && invitee.lastResponseSnippet && (
                    <p>
                      <span className="font-medium">Their response:</span>{' '}
                      {invitee.lastResponseSnippet}
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="inline-flex items-center gap-2 px-6 py-3 bg-watershed-600 hover:bg-watershed-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Draft
                  </>
                )}
              </button>
            </div>
          )}

          {/* Step 2: Review & Edit */}
          {step === 'review' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Subject
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-watershed-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Body
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={16}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-watershed-500 focus:border-transparent font-mono"
                />
              </div>
            </div>
          )}

          {/* Step 3: Confirm & Send */}
          {step === 'confirm' && (
            <div className="space-y-4">
              {/* Recipient */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Recipient Email
                </label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-watershed-500 focus:border-transparent"
                />
              </div>

              {/* Preview */}
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Preview
                </p>
                <p className="text-sm font-medium text-gray-900 mb-2">{subject}</p>
                <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {body}
                </div>
              </div>

              {!gmailConnected && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  Gmail not connected. Connect your Google account in Settings to send directly.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div>
            {step !== 'generate' && (
              <button
                onClick={() =>
                  setStep(step === 'confirm' ? 'review' : 'generate')
                }
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step === 'review' && (
              <>
                <button
                  onClick={handleRegenerate}
                  disabled={isGenerating}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  <RefreshCw className={cn('w-3.5 h-3.5', isGenerating && 'animate-spin')} />
                  Regenerate
                </button>
                <button
                  onClick={handleApprove}
                  className="flex items-center gap-1.5 px-4 py-2 bg-watershed-600 hover:bg-watershed-700 text-white text-sm font-medium rounded-lg"
                >
                  <Check className="w-4 h-4" />
                  Approve & Continue
                </button>
              </>
            )}
            {step === 'confirm' && (
              <>
                <button
                  onClick={handleSaveDraft}
                  disabled={isSending || !recipientEmail}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save as Gmail Draft
                </button>
                <button
                  onClick={handleSend}
                  disabled={isSending || !recipientEmail || !gmailConnected}
                  className="flex items-center gap-1.5 px-4 py-2 bg-watershed-600 hover:bg-watershed-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  {isSending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Send Email
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
