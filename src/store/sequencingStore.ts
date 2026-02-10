import { create } from 'zustand';
import type {
  Invitee,
  InvitationStatus,
  ResponseClassification,
  AutomationEvent,
  InvitationPhase,
} from '../types/sequencing';

const now = new Date().toISOString();

// All invitees from the CERA Week Complete Operations Package
const INITIAL_INVITEES: Invitee[] = [
  // === PHASE 1: ANCHORS ===
  {
    id: 'inv-terry',
    name: 'David Terry',
    organization: 'NASEO',
    title: 'President',
    panel: '1',
    panelRole: 'moderator',
    phase: 1,
    phaseOrder: '1A',
    status: 'not_started',
    invitedBy: 'trent',
    confidence: 'HIGH',
    leverageScript:
      "NASEO's Geothermal Accelerator is the most significant state-level coordination on geothermal in a decade. CERA Week is the right venue to show the energy establishment that 13 states are already aligned. We'd like NASEO to co-convene a series of panels. You'd moderate the opening panel with your Accelerator state directors.",
    dependencies: [],
    notes: 'Direct relationship. NASEO co-hosting advances Accelerator visibility.',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'inv-latimer',
    name: 'Tim Latimer',
    organization: 'Fervo Energy',
    title: 'CEO',
    panel: '2',
    panelRole: 'speaker',
    phase: 1,
    phaseOrder: '1B',
    status: 'not_started',
    invitedBy: 'jamie',
    confidence: 'HIGH',
    leverageScript:
      "NASEO is co-convening. We're building six panels at CERA Week connecting state geothermal policy to hyperscaler demand. Your Pact is going to be presented as the industry standard. We need you on the demand panel.",
    dependencies: ['inv-terry'],
    notes: "Jamie's ecosystem. InnerSpace and Fervo share research investment history.",
    created_at: now,
    updated_at: now,
  },
  {
    id: 'inv-arnold',
    name: 'John Arnold',
    organization: 'Arnold Ventures',
    title: 'Founder',
    panel: '5',
    panelRole: 'moderator',
    phase: 1,
    phaseOrder: '1C',
    status: 'not_started',
    invitedBy: 'jamie',
    confidence: 'JAMIE ONLY',
    leverageScript:
      "We're organizing a closed-door series at CERA Week on geothermal, AI infrastructure, and grid modernization. The room will include ERCOT, PJM, 13 state energy directors, and hyperscaler energy teams from Google and Microsoft. We'd like you to moderate the closing conversation on capital, grid, and distributional equity — questions you've been thinking about through Grid United and your Fervo investment.",
    dependencies: [],
    notes:
      'CRITICAL anchor. Do not invite anyone for Panel 5 until Arnold confirms. Single point of failure.',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'inv-lesofski',
    name: 'Emy Lesofski',
    organization: 'Utah Office of Energy Development',
    title: 'Director',
    panel: '1',
    panelRole: 'speaker',
    phase: 1,
    phaseOrder: '1D',
    status: 'not_started',
    invitedBy: 'trent',
    confidence: 'HIGH',
    leverageScript:
      "David Terry is co-convening the CERA Week geothermal series through NASEO. Utah is the anchor state — FORGE, Fervo, and the data center proposals in Millard County make Utah the proof point. We'd like you on the opening policy panel.",
    dependencies: ['inv-terry'],
    notes: "Utah energy circles. She's publicly championed FORGE + Fervo.",
    created_at: now,
    updated_at: now,
  },
  {
    id: 'inv-turnerlee',
    name: 'Nicol Turner Lee',
    organization: 'Brookings Institution',
    title: 'Senior Fellow',
    panel: '3',
    panelRole: 'moderator',
    phase: 1,
    phaseOrder: '1E',
    status: 'not_started',
    invitedBy: 'jamie',
    confidence: 'MEDIUM',
    leverageScript:
      "Your January 2026 report on data center CBAs is the most authoritative analysis in the field. Would you present your findings and moderate a panel at CERA Week? The panel includes the mayors of Lancaster, Marana, and the city manager from Hermiston — the three municipalities that built the models your report recommends.",
    dependencies: [],
    notes: "Policy world. Jamie's DC network.",
    created_at: now,
    updated_at: now,
  },
  // === PHASE 2: DEMAND SIGNAL ===
  {
    id: 'inv-corio',
    name: 'Amanda Peterson Corio',
    organization: 'Google',
    title: 'Data Center Energy Lead',
    panel: '2',
    panelRole: 'speaker',
    phase: 2,
    phaseOrder: '2A',
    status: 'not_started',
    invitedBy: 'jamie',
    confidence: 'MEDIUM-HIGH',
    leverageNames: ['Tim Latimer', 'David Terry', 'John Arnold'],
    dependencies: ['inv-latimer', 'inv-terry', 'inv-arnold'],
    notes: "Through Fervo-Google PPA relationship. Latimer confirmation is the bridge.",
    created_at: now,
    updated_at: now,
  },
  {
    id: 'inv-hollis',
    name: 'Bobby Hollis',
    organization: 'Microsoft',
    title: 'VP Energy',
    panel: '2',
    panelRole: 'speaker',
    phase: 2,
    phaseOrder: '2B',
    status: 'not_started',
    invitedBy: 'jamie',
    confidence: 'MEDIUM',
    leverageNames: ['Amanda Peterson Corio', 'Tim Latimer'],
    dependencies: ['inv-corio'],
    notes: "Google's energy lead confirmed creates competitive pull.",
    created_at: now,
    updated_at: now,
  },
  {
    id: 'inv-herlihy',
    name: 'Brian Herlihy',
    organization: 'QTS (Blackstone)',
    title: 'Chief Energy Strategy Officer',
    panel: '2',
    panelRole: 'moderator',
    phase: 2,
    phaseOrder: '2C',
    status: 'not_started',
    invitedBy: 'jamie',
    confidence: 'MEDIUM-HIGH',
    leverageNames: ['Sean Klimczak'],
    dependencies: ['inv-latimer'],
    notes: 'QTS/Blackstone ecosystem.',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'inv-klimczak',
    name: 'Sean Klimczak',
    organization: 'Blackstone Infrastructure',
    title: 'Global Head',
    panel: '2',
    panelRole: 'speaker',
    phase: 2,
    phaseOrder: '2D',
    status: 'not_started',
    invitedBy: 'jamie',
    confidence: 'MEDIUM',
    leverageNames: ['John Arnold', 'Tim Latimer'],
    dependencies: ['inv-arnold', 'inv-latimer'],
    notes: "Blackstone owns QTS. Arnold connection is the bridge.",
    created_at: now,
    updated_at: now,
  },
  {
    id: 'inv-vegas',
    name: 'Pablo Vegas',
    organization: 'ERCOT',
    title: 'CEO',
    panel: '5',
    panelRole: 'speaker',
    phase: 2,
    phaseOrder: '2E',
    status: 'not_started',
    invitedBy: 'jamie',
    confidence: 'MEDIUM',
    leverageNames: ['John Arnold'],
    dependencies: ['inv-arnold'],
    notes: 'Houston-based. CERA Week is home turf. Arnold confirmation pulls him in.',
    created_at: now,
    updated_at: now,
  },
  // === PHASE 3: CIVIC + INFRASTRUCTURE + INTERNATIONAL ===
  {
    id: 'inv-sorace',
    name: 'Danene Sorace',
    organization: 'City of Lancaster, PA',
    title: 'Mayor',
    panel: '3',
    panelRole: 'speaker',
    phase: 3,
    phaseOrder: '3A',
    status: 'not_started',
    invitedBy: 'jamie',
    confidence: 'MEDIUM',
    leverageNames: ['Nicol Turner Lee'],
    dependencies: ['inv-turnerlee'],
    notes: '$20M CBA is the national reference case.',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'inv-post',
    name: 'Jon Post',
    organization: 'City of Marana, AZ',
    title: 'Mayor',
    panel: '3',
    panelRole: 'speaker',
    phase: 3,
    phaseOrder: '3B',
    status: 'not_started',
    invitedBy: 'trent',
    confidence: 'MEDIUM',
    leverageNames: ['Nicol Turner Lee', 'Danene Sorace'],
    dependencies: ['inv-turnerlee'],
    notes: 'Ordinance-first model is the standard. NASEO Accelerator includes Arizona.',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'inv-morgan',
    name: 'Mark Morgan',
    organization: 'City of Hermiston, OR',
    title: 'City Manager',
    panel: '3',
    panelRole: 'speaker',
    phase: 3,
    phaseOrder: '3C',
    status: 'not_started',
    invitedBy: 'jamie',
    confidence: 'MEDIUM',
    leverageNames: ['Nicol Turner Lee'],
    dependencies: ['inv-turnerlee'],
    notes: 'ChangeX model and water agreement proof point.',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'inv-jewett',
    name: 'Sarah Jewett',
    organization: 'Fervo Energy',
    title: 'VP Strategy',
    panel: '3',
    panelRole: 'speaker',
    phase: 3,
    phaseOrder: '3D',
    status: 'not_started',
    invitedBy: 'jamie',
    confidence: 'HIGH',
    dependencies: ['inv-latimer'],
    notes: 'Comes with Latimer confirmation. Pact presentation.',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'inv-lochmiller',
    name: 'Chase Lochmiller',
    organization: 'Crusoe Energy',
    title: 'CEO',
    panel: '2.5',
    panelRole: 'speaker',
    phase: 3,
    phaseOrder: '3E',
    status: 'not_started',
    invitedBy: 'drew',
    confidence: 'MEDIUM',
    leverageNames: ['Michael McNamara', 'Bill Long'],
    dependencies: [],
    notes: '1.2GW campus, 350MW on-site power. $10B+ valuation.',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'inv-mcnamara',
    name: 'Michael McNamara',
    organization: 'Lancium',
    title: 'CEO',
    panel: '2.5',
    panelRole: 'speaker',
    phase: 3,
    phaseOrder: '3F',
    status: 'not_started',
    invitedBy: 'drew',
    confidence: 'MEDIUM-HIGH',
    leverageNames: ['Chase Lochmiller'],
    dependencies: ['inv-lochmiller'],
    notes: 'Woodlands, TX-based. Mitchell Foundation bridge.',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'inv-long',
    name: 'Bill Long',
    organization: 'Zayo Group',
    title: 'CPO & CSO',
    panel: '2.5',
    panelRole: 'moderator',
    phase: 3,
    phaseOrder: '3G',
    status: 'not_started',
    invitedBy: 'jamie',
    confidence: 'MEDIUM',
    leverageNames: ['Chase Lochmiller', 'Michael McNamara'],
    dependencies: ['inv-lochmiller', 'inv-mcnamara'],
    notes: '220,000+ route miles. Building 5,000 new for AI/data center.',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'inv-kristinsson',
    name: 'Eyjólfur Kristinsson',
    organization: 'atNorth',
    title: 'CEO',
    panel: '4',
    panelRole: 'speaker',
    phase: 3,
    phaseOrder: '3H',
    status: 'not_started',
    invitedBy: 'jamie',
    confidence: 'MEDIUM',
    dependencies: [],
    notes: 'Iceland geothermal-AI model.',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'inv-ward',
    name: 'Dominic Ward',
    organization: 'Verne',
    title: 'CEO',
    panel: '4',
    panelRole: 'speaker',
    phase: 3,
    phaseOrder: '3I',
    status: 'not_started',
    invitedBy: 'jamie',
    confidence: 'MEDIUM',
    dependencies: ['inv-kristinsson'],
    notes: 'Iceland ecosystem. Comes with atNorth invitation.',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'inv-seed',
    name: 'Chris Seed',
    organization: 'NZ Ambassador to the US',
    title: 'Ambassador',
    panel: '4',
    panelRole: 'speaker',
    phase: 3,
    phaseOrder: '3J',
    status: 'not_started',
    invitedBy: 'jamie',
    confidence: 'LOW-MEDIUM',
    leverageNames: ['Mike Fuge'],
    dependencies: [],
    notes: 'Diplomatic channel. Mike Fuge (Contact Energy) may bridge.',
    created_at: now,
    updated_at: now,
  },
  // === PHASE 4: FINAL SEATS + ALTERNATES ===
  {
    id: 'inv-mills',
    name: 'David E. Mills',
    organization: 'PJM Interconnection',
    title: 'Interim CEO',
    panel: '5',
    panelRole: 'speaker',
    phase: 4,
    phaseOrder: '4A',
    status: 'not_started',
    invitedBy: 'jamie',
    confidence: 'LOW-MEDIUM',
    leverageNames: ['John Arnold'],
    dependencies: ['inv-arnold'],
    notes: "Arnold's confirmation pulls grid operators.",
    created_at: now,
    updated_at: now,
  },
  {
    id: 'inv-noel',
    name: 'Donna Marie Noel',
    organization: 'Pyramid Lake Paiute Tribe',
    title: 'Energy Director',
    panel: '5',
    panelRole: 'speaker',
    phase: 4,
    phaseOrder: '4B',
    status: 'not_started',
    invitedBy: 'jamie',
    confidence: 'MEDIUM',
    dependencies: [],
    notes: 'DOE geothermal ecosystem. InnerSpace connection.',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'inv-magavi',
    name: 'Zeyneb Magavi',
    organization: 'HEET',
    title: 'Co-Executive Director',
    panel: '5',
    panelRole: 'speaker',
    phase: 4,
    phaseOrder: '4C',
    status: 'not_started',
    invitedBy: 'jamie',
    confidence: 'HIGH',
    dependencies: [],
    notes: 'Known entity in geothermal ecosystem. Jamie likely direct.',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'inv-karsanbhai',
    name: 'Lal Karsanbhai',
    organization: 'Emerson Electric',
    title: 'CEO',
    panel: '5',
    panelRole: 'speaker',
    phase: 4,
    phaseOrder: '4D',
    status: 'not_started',
    invitedBy: 'drew',
    confidence: 'MEDIUM',
    leverageNames: ['John Arnold'],
    dependencies: ['inv-arnold'],
    notes: 'Houston-based Fortune 500. Ovation Green platform powers geothermal plants.',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'inv-clark',
    name: 'Gabe Clark',
    organization: 'Corgan',
    title: 'Principal',
    panel: '4',
    panelRole: 'speaker',
    phase: 4,
    phaseOrder: '4E',
    status: 'not_started',
    invitedBy: 'jamie',
    confidence: 'MEDIUM',
    dependencies: [],
    notes: '#1 data center architecture firm. Commercial-scale cost perspective.',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'inv-thorsen',
    name: 'Kjetil Thorsen',
    organization: 'Snøhetta',
    title: 'Founding Partner',
    panel: '4',
    panelRole: 'speaker',
    phase: 4,
    phaseOrder: '4F',
    status: 'not_started',
    invitedBy: 'jamie',
    confidence: 'LOW-MEDIUM',
    dependencies: [],
    notes: '"The Spark" concept. Nordic architecture network.',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'inv-ingels',
    name: 'Bjarke Ingels',
    organization: 'BIG',
    title: 'Founder & Creative Director',
    panel: '4',
    panelRole: 'keynote',
    phase: 4,
    phaseOrder: '4G',
    status: 'not_started',
    invitedBy: 'jamie',
    confidence: 'LOW-MEDIUM',
    dependencies: [],
    notes: 'Keynote conversation, not panel moderator.',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'inv-powers',
    name: 'Cassie Powers',
    organization: 'NASEO',
    title: 'Sr. Managing Director',
    panel: '1',
    panelRole: 'speaker',
    phase: 1,
    phaseOrder: '1A2',
    status: 'not_started',
    invitedBy: 'trent',
    confidence: 'HIGH',
    dependencies: ['inv-terry'],
    notes: 'Comes with Terry. Operational lead for the Accelerator.',
    created_at: now,
    updated_at: now,
  },
];

interface SequencingState {
  invitees: Invitee[];
  automationEvents: AutomationEvent[];
  selectedInviteeId: string | null;
  showDraftComposer: boolean;
  draftComposerInviteeId: string | null;

  // Actions
  updateInvitee: (id: string, updates: Partial<Invitee>) => void;
  setInviteeStatus: (id: string, status: InvitationStatus) => void;
  classifyResponse: (
    inviteeId: string,
    classification: ResponseClassification,
    snippet: string
  ) => void;
  addAutomationEvent: (event: Omit<AutomationEvent, 'id' | 'timestamp'>) => void;
  clearAutomationEvent: (eventId: string) => void;
  setSelectedInviteeId: (id: string | null) => void;
  setShowDraftComposer: (show: boolean, inviteeId?: string | null) => void;

  // Computed helpers
  getInvitee: (id: string) => Invitee | undefined;
  getInviteesByPhase: (phase: InvitationPhase) => Invitee[];
  getConfirmedNames: () => string[];
  getDependenciesMet: (inviteeId: string) => boolean;
  getUnlockedInvitees: () => Invitee[];
  getPendingActions: () => AutomationEvent[];
  getPhaseProgress: (phase: InvitationPhase) => {
    total: number;
    confirmed: number;
    sent: number;
    declined: number;
  };
}

export const useSequencingStore = create<SequencingState>((set, get) => ({
  invitees: INITIAL_INVITEES,
  automationEvents: [],
  selectedInviteeId: null,
  showDraftComposer: false,
  draftComposerInviteeId: null,

  updateInvitee: (id, updates) =>
    set((state) => ({
      invitees: state.invitees.map((inv) =>
        inv.id === id ? { ...inv, ...updates, updated_at: new Date().toISOString() } : inv
      ),
    })),

  setInviteeStatus: (id, status) => {
    const invitee = get().getInvitee(id);
    if (!invitee) return;

    set((state) => ({
      invitees: state.invitees.map((inv) =>
        inv.id === id
          ? { ...inv, status, updated_at: new Date().toISOString() }
          : inv
      ),
    }));

    get().addAutomationEvent({
      inviteeId: id,
      inviteeName: invitee.name,
      type: 'status_changed',
      description: `Status changed to ${status.replace(/_/g, ' ')}`,
      requiresAction: false,
    });
  },

  classifyResponse: (inviteeId, classification, snippet) => {
    const invitee = get().getInvitee(inviteeId);
    if (!invitee) return;

    // Map classification to status
    const statusMap: Record<ResponseClassification, InvitationStatus> = {
      confirmed: 'confirmed',
      declined: 'declined',
      more_info: 'more_info',
      meeting_requested: 'meeting_requested',
      unclear: invitee.status,
    };

    const newStatus = statusMap[classification];

    set((state) => ({
      invitees: state.invitees.map((inv) =>
        inv.id === inviteeId
          ? {
              ...inv,
              status: newStatus,
              lastResponseAt: new Date().toISOString(),
              lastResponseClassification: classification,
              lastResponseSnippet: snippet,
              updated_at: new Date().toISOString(),
            }
          : inv
      ),
    }));

    // Log the response event
    get().addAutomationEvent({
      inviteeId,
      inviteeName: invitee.name,
      type: 'response_detected',
      description: `Response classified as "${classification}": ${snippet}`,
      requiresAction: classification === 'more_info' || classification === 'meeting_requested',
      actionLabel:
        classification === 'more_info'
          ? 'Draft follow-up'
          : classification === 'meeting_requested'
            ? 'Schedule meeting'
            : undefined,
    });

    // If confirmed, check for unlocked cascade invitations
    if (classification === 'confirmed') {
      const allInvitees = get().invitees;
      const unlocked = allInvitees.filter(
        (inv) =>
          inv.dependencies.includes(inviteeId) &&
          inv.status === 'not_started' &&
          get().getDependenciesMet(inv.id)
      );

      for (const inv of unlocked) {
        get().addAutomationEvent({
          inviteeId: inv.id,
          inviteeName: inv.name,
          type: 'dependency_unlocked',
          description: `${invitee.name} confirmed — ${inv.name} is now unlocked for invitation`,
          requiresAction: true,
          actionLabel: 'Generate draft',
        });
      }
    }
  },

  addAutomationEvent: (event) =>
    set((state) => ({
      automationEvents: [
        ...state.automationEvents,
        {
          ...event,
          id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: new Date().toISOString(),
        },
      ],
    })),

  clearAutomationEvent: (eventId) =>
    set((state) => ({
      automationEvents: state.automationEvents.map((e) =>
        e.id === eventId ? { ...e, requiresAction: false } : e
      ),
    })),

  setSelectedInviteeId: (id) => set({ selectedInviteeId: id }),

  setShowDraftComposer: (show, inviteeId) =>
    set({
      showDraftComposer: show,
      draftComposerInviteeId: inviteeId ?? null,
    }),

  // Computed helpers
  getInvitee: (id) => get().invitees.find((inv) => inv.id === id),

  getInviteesByPhase: (phase) =>
    get()
      .invitees.filter((inv) => inv.phase === phase)
      .sort((a, b) => a.phaseOrder.localeCompare(b.phaseOrder)),

  getConfirmedNames: () =>
    get()
      .invitees.filter((inv) => inv.status === 'confirmed')
      .map((inv) => inv.name),

  getDependenciesMet: (inviteeId) => {
    const invitee = get().getInvitee(inviteeId);
    if (!invitee) return false;
    if (invitee.dependencies.length === 0) return true;

    const invitees = get().invitees;
    return invitee.dependencies.every((depId) => {
      const dep = invitees.find((i) => i.id === depId);
      return dep?.status === 'confirmed';
    });
  },

  getUnlockedInvitees: () => {
    const state = get();
    return state.invitees.filter(
      (inv) =>
        inv.status === 'not_started' &&
        state.getDependenciesMet(inv.id)
    );
  },

  getPendingActions: () =>
    get().automationEvents.filter((e) => e.requiresAction),

  getPhaseProgress: (phase) => {
    const phaseInvitees = get().getInviteesByPhase(phase);
    return {
      total: phaseInvitees.length,
      confirmed: phaseInvitees.filter((i) => i.status === 'confirmed').length,
      sent: phaseInvitees.filter(
        (i) => i.status === 'sent' || i.status === 'follow_up_sent'
      ).length,
      declined: phaseInvitees.filter((i) => i.status === 'declined').length,
    };
  },
}));
