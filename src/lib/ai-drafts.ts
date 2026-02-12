// AI Draft Generation for CERA Week Invitation Sequencing
// Uses Supabase Edge Function (ai-gateway) for draft generation and response classification

import type { DraftRequest, ResponseClassification } from '../types/sequencing';
import { aiChat } from './edgeFunctions';

const PANEL_CONTEXT: Record<string, string> = {
  '1': 'Panel 1: State Policy Scaffolding — 13-state Geothermal Accelerator, NASEO co-convening, state energy directors.',
  '2': 'Panel 2: Demand Signal + Deployment — Hyperscaler energy procurement, Fervo commercial PPA, Blackstone infrastructure.',
  '2.5': 'Panel 2.5: Infrastructure Routing — Behind-the-meter power, fiber connectivity, Crusoe/Lancium/Zayo. Title: "When Power Is Local and Data Is Mobile: Infrastructure That Doesn\'t Wait"',
  '3': 'Panel 3: Community Siting Standard — $50B in rejected data center projects, Lancaster CBA, Marana ordinance-first, Hermiston ChangeX. Title: "The New Siting Standard: $50 Billion in Dead Projects and What Replaced Opposition"',
  '4': 'Panel 4: Design + International Proof — Iceland/NZ geothermal data centers, Snøhetta thermal commons, Corgan commercial-scale.',
  '5': 'Panel 5: Capital + Grid + Equity — Arnold Ventures, ERCOT, PJM, HEET networked geothermal, tribal sovereignty, Emerson.',
};

const SYSTEM_PROMPT = `You are drafting invitation emails for a high-level CERA Week 2026 event series on geothermal-powered AI infrastructure.

VOICE RULES:
- Write in the voice of a senior strategist who understands power dynamics
- Never use: "clean energy", "sustainability", "stakeholder", "social license", "transition", "best practices", "opportunity", "framework"
- Preferred language: "baseload", "24/7 power", "deployment", "campaign", "infrastructure", "standard", "requirement", "permanence"
- Invitations are signals, not requests. Frame each as: "This is happening. Your presence signals X."
- Each email must make the recipient feel that the event is already inevitable and their absence would be a miss
- Keep emails concise — 150-250 words maximum
- Use the confirmed names as social proof, but sparingly — never list more than 3-4 names
- Match the tone to the recipient's position: CEOs get directness, academics get intellectual hooks, government officials get institutional framing

FORMAT:
Return ONLY the email body (no subject line, no "Dear X" — that will be added separately). Start with the recipient's first name followed by a dash, then the message.`;

export async function generateInvitationDraft(
  request: DraftRequest
): Promise<{ subject: string; body: string }> {
  const panelInfo = PANEL_CONTEXT[request.panel] || `Panel ${request.panel}`;

  const confirmedList =
    request.confirmedNames.length > 0
      ? `Already confirmed: ${request.confirmedNames.slice(0, 4).join(', ')}.`
      : 'This is among the first invitations being sent.';

  const leverageInfo = request.leverageScript
    ? `Leverage script from operations package: "${request.leverageScript}"`
    : '';

  const leverageNameInfo =
    request.leverageNames && request.leverageNames.length > 0
      ? `Names to reference as confirmed/committed: ${request.leverageNames.join(', ')}`
      : '';

  const followUpContext = request.isFollowUp
    ? `This is a FOLLOW-UP email. The recipient previously responded: "${request.responseContext}". Address their specific question or concern while maintaining the inevitability frame.`
    : 'This is an initial invitation.';

  const prompt = `Generate an invitation email for:

Recipient: ${request.inviteeName}
Organization: ${request.organization}
Panel: ${panelInfo}
${followUpContext}
${confirmedList}
${leverageInfo}
${leverageNameInfo}

The event is a closed-door series at CERA Week 2026 (Houston, March 23-27) on geothermal-powered AI infrastructure. NASEO is co-convening. The agenda connects state geothermal policy to hyperscaler demand, community siting standards, and capital formation.`;

  // Use AI Gateway Edge Function
  try {
    const body = await aiChat(prompt, {
      system: SYSTEM_PROMPT,
      max_tokens: 1024,
    });

    if (body) {
      const subject = request.isFollowUp
        ? `Re: CERA Week 2026 — ${request.organization}`
        : `CERA Week 2026 — Invitation: ${request.inviteeName}`;

      return { subject, body };
    }
  } catch (err) {
    console.error('[ai-drafts] AI Gateway error:', err);
  }

  // Fallback: template-based generation
  return generateTemplateDraft(request);
}

function generateTemplateDraft(
  request: DraftRequest
): { subject: string; body: string } {
  const { inviteeName, organization, panel, confirmedNames, isFollowUp, leverageScript } =
    request;

  const firstName = inviteeName.split(' ')[0];

  if (isFollowUp) {
    return {
      subject: `Re: CERA Week 2026 — ${organization}`,
      body: `${firstName} —\n\nThank you for your response. I wanted to follow up on your question and provide additional context about the CERA Week series.\n\nThe program has continued to take shape since we last spoke. ${confirmedNames.length > 0 ? `${confirmedNames.slice(0, 3).join(', ')} ${confirmedNames.length > 1 ? 'have' : 'has'} confirmed.` : ''}\n\nYour perspective on Panel ${panel} would add significant weight to the conversation. The room is designed so that each participant's presence changes the calculus for everyone else.\n\nHappy to discuss further at your convenience.\n\nBest,\nTrent`,
    };
  }

  const body = leverageScript
    ? `${firstName} —\n\n${leverageScript}\n\n${confirmedNames.length > 0 ? `Confirmed participants include ${confirmedNames.slice(0, 3).join(', ')}.` : ''}\n\nThis is a closed-door series — not a conference panel, not a public event. The room is curated so that each participant's presence is a signal to every other participant.\n\nWould you be available for Panel ${panel} during CERA Week (March 23-27, Houston)?\n\nBest,\nTrent`
    : `${firstName} —\n\nWe're building a closed-door series at CERA Week 2026 connecting state geothermal policy to hyperscaler demand, community infrastructure standards, and capital formation.\n\n${confirmedNames.length > 0 ? `The room already includes ${confirmedNames.slice(0, 3).join(', ')}.` : 'NASEO is co-convening with 13 state energy directors.'}\n\nYour work at ${organization} is directly relevant to Panel ${panel}. This is a curated conversation — every seat is a signal.\n\nWould you join us in Houston, March 23-27?\n\nBest,\nTrent`;

  return {
    subject: `CERA Week 2026 — Invitation: ${inviteeName}`,
    body,
  };
}

export async function classifyEmailResponse(
  emailBody: string,
  inviteeName: string
): Promise<{ classification: ResponseClassification; confidence: number }> {
  try {
    const text = await aiChat(
      `Classify this response from ${inviteeName} to a CERA Week 2026 invitation:\n\n${emailBody}`,
      {
        system: 'You classify email responses to event invitations. Respond with ONLY a JSON object: {"classification": "confirmed"|"declined"|"more_info"|"meeting_requested"|"unclear", "confidence": 0.0-1.0}',
        max_tokens: 256,
      }
    );

    if (text) {
      const parsed = JSON.parse(text);
      return {
        classification: parsed.classification || 'unclear',
        confidence: parsed.confidence || 0.5,
      };
    }
  } catch (err) {
    console.error('[ai-drafts] Classification error:', err);
  }

  // Fallback: keyword-based classification
  return classifyByKeywords(emailBody);
}

function classifyByKeywords(
  body: string
): { classification: ResponseClassification; confidence: number } {
  const lower = body.toLowerCase();

  const confirmPatterns = [
    'confirm',
    'happy to join',
    'count me in',
    'looking forward',
    'i accept',
    "i'll be there",
    'yes',
    'absolutely',
    'delighted to',
    'pleased to accept',
  ];
  const declinePatterns = [
    'decline',
    'unable to',
    "can't make",
    'regret',
    'not available',
    'unfortunately',
    "won't be able",
    'conflict',
    'pass on this',
  ];
  const moreInfoPatterns = [
    'more information',
    'more details',
    'tell me more',
    'can you share',
    'what exactly',
    'who else',
    'agenda',
    'specifics',
  ];
  const meetingPatterns = [
    'let\'s discuss',
    'schedule a call',
    'can we talk',
    'meet to discuss',
    'hop on a call',
    'let\'s chat',
    'set up a time',
  ];

  if (confirmPatterns.some((p) => lower.includes(p)))
    return { classification: 'confirmed', confidence: 0.7 };
  if (declinePatterns.some((p) => lower.includes(p)))
    return { classification: 'declined', confidence: 0.7 };
  if (meetingPatterns.some((p) => lower.includes(p)))
    return { classification: 'meeting_requested', confidence: 0.6 };
  if (moreInfoPatterns.some((p) => lower.includes(p)))
    return { classification: 'more_info', confidence: 0.6 };

  return { classification: 'unclear', confidence: 0.3 };
}
