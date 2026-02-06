import { useState } from 'react';
import {
  Mail,
  Wand2,
  RefreshCw,
  Send,
  Copy,
  CheckCircle,
  User,
  FileText,
  Sparkles,
} from 'lucide-react';

interface EmailGhostwriterProps {
  onDraftGenerated?: (draft: string) => void;
  initialContext?: {
    recipient?: string;
    subject?: string;
    context?: string;
  };
}

interface StyleProfile {
  vocabulary_richness: number;
  avg_sentence_length: number;
  formality_score: number;
  common_greetings: string[];
  common_closings: string[];
  signature_phrases: string[];
}

export default function EmailGhostwriter({
  onDraftGenerated,
  initialContext,
}: EmailGhostwriterProps) {
  const [recipient, setRecipient] = useState(initialContext?.recipient || '');
  const [subject, setSubject] = useState(initialContext?.subject || '');
  const [prompt, setPrompt] = useState(initialContext?.context || '');
  const [draft, setDraft] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [styleProfile, setStyleProfile] = useState<StyleProfile | null>(null);
  const [refinementFeedback, setRefinementFeedback] = useState('');
  const [copied, setCopied] = useState(false);
  // Use setStyleProfile to avoid unused warning
  void setStyleProfile;

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);

    // In production, this would call a Supabase Edge Function that:
    // 1. Loads the user's style profile from storage
    // 2. Calls the Anthropic API with the style profile and prompt
    // 3. Returns the generated draft

    // For now, simulate the generation
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const simulatedDraft = `Hi ${recipient || '[Recipient]'},

${prompt.includes('delay') ? `I wanted to reach out about a change to our timeline. We've encountered some unexpected challenges that will push our delivery back slightly.` : prompt.includes('follow') ? `Following up on our recent conversation - I wanted to share some thoughts and next steps.` : `I hope this email finds you well. ${prompt}`}

I'd be happy to discuss this further if you have any questions. Would you be available for a quick call this week?

Best regards,
[Your name]`;

    setDraft(simulatedDraft);
    setIsGenerating(false);

    if (onDraftGenerated) {
      onDraftGenerated(simulatedDraft);
    }
  };

  const handleRefine = async () => {
    if (!refinementFeedback.trim() || !draft) return;

    setIsGenerating(true);

    // Would call API with refinement instructions
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Simulate refinement
    const refinedDraft = draft.replace(
      'Best regards,',
      refinementFeedback.toLowerCase().includes('casual')
        ? 'Cheers,'
        : refinementFeedback.toLowerCase().includes('formal')
        ? 'Kind regards,'
        : 'Best regards,'
    );

    setDraft(refinedDraft);
    setRefinementFeedback('');
    setIsGenerating(false);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerateVariations = async () => {
    // Would generate multiple variations
    console.log('Generate variations');
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-watershed-50 to-purple-50 px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-watershed-600" />
          <h3 className="font-semibold text-gray-900">Email Ghostwriter</h3>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          AI-powered drafts that match your writing style
        </p>
      </div>

      {/* Style profile indicator */}
      {styleProfile && (
        <div className="px-4 py-2 bg-green-50 border-b border-green-200 flex items-center gap-2 text-sm text-green-700">
          <User className="w-4 h-4" />
          <span>Style profile loaded • Formality: {styleProfile.formality_score}/10</span>
        </div>
      )}

      {/* Input section */}
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Recipient (optional)
            </label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="input"
              placeholder="john@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subject (optional)
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="input"
              placeholder="Project Update"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            What should this email say?
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="textarea"
            rows={3}
            placeholder="I need to inform the client about the project delay and propose a new timeline. Keep it professional but apologetic."
          />
        </div>

        <button
          onClick={handleGenerate}
          disabled={!prompt.trim() || isGenerating}
          className="btn btn-primary w-full"
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Generate Draft
            </>
          )}
        </button>
      </div>

      {/* Generated draft */}
      {draft && (
        <div className="border-t border-gray-200">
          <div className="px-4 py-2 bg-gray-50 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Generated Draft</span>
            <div className="flex gap-2">
              <button
                onClick={handleGenerateVariations}
                className="btn btn-ghost text-xs"
                title="Generate variations"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Variations
              </button>
              <button
                onClick={handleCopy}
                className="btn btn-ghost text-xs"
                title="Copy to clipboard"
              >
                {copied ? (
                  <>
                    <CheckCircle className="w-3 h-3 mr-1 text-green-500" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 mr-1" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="p-4">
            <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm whitespace-pre-wrap">
              {draft}
            </div>
          </div>

          {/* Refinement section */}
          <div className="px-4 pb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Refine this draft
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={refinementFeedback}
                onChange={(e) => setRefinementFeedback(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRefine()}
                className="input flex-1"
                placeholder="Make it more casual / Add specific dates / Shorter..."
              />
              <button
                onClick={handleRefine}
                disabled={!refinementFeedback.trim() || isGenerating}
                className="btn btn-secondary"
              >
                Refine
              </button>
            </div>

            {/* Quick refinement suggestions */}
            <div className="flex flex-wrap gap-2 mt-2">
              {['More casual', 'More formal', 'Shorter', 'Add urgency'].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setRefinementFeedback(suggestion)}
                  className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer with info */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          <FileText className="w-3 h-3 inline mr-1" />
          Drafts are generated using your personalized writing style profile.
          {!styleProfile && (
            <a href="/settings" className="text-watershed-600 hover:underline ml-1">
              Analyze your writing
            </a>
          )}
        </p>
      </div>
    </div>
  );
}

// Quick email compose modal for task-based emails
interface QuickEmailComposeProps {
  taskTitle?: string;
  taskDescription?: string;
  onClose: () => void;
  onSend?: (draft: string) => void;
}

export function QuickEmailCompose({
  taskTitle,
  taskDescription,
  onClose,
  onSend,
}: QuickEmailComposeProps) {
  const [draft, setDraft] = useState('');

  const handleDraftGenerated = (generatedDraft: string) => {
    setDraft(generatedDraft);
  };

  const handleSend = () => {
    if (onSend && draft) {
      onSend(draft);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Compose Email
          </h2>
          <button onClick={onClose} className="btn btn-ghost">
            ✕
          </button>
        </div>

        <div className="p-4">
          <EmailGhostwriter
            onDraftGenerated={handleDraftGenerated}
            initialContext={{
              context: taskTitle
                ? `Regarding: ${taskTitle}${taskDescription ? `. ${taskDescription}` : ''}`
                : undefined,
            }}
          />
        </div>

        {draft && (
          <div className="p-4 border-t border-gray-200 flex gap-3">
            <button onClick={handleSend} className="btn btn-primary flex-1">
              <Send className="w-4 h-4 mr-2" />
              Open in Email Client
            </button>
            <button onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
