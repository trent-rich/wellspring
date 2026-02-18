import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GeodeState } from '../types/geode';
import {
  type ChapterWorkflowState,
  getWorkflowType,
  getStepMeta,
  calculateDaysOnStep,
} from '../types/geodeWorkflow';
import { GEODE_CHAPTER_TYPES, GEODE_STATES, GEODE_CHAPTER_LEADS, DEFAULT_STATE_CHAPTERS, type GeodeContentSection, type ChapterTypeDefinition, getAllChapterTypes, getChapterTypeInfo } from '../types/geode';
import { addMondayComment, getMondayStatusLabel } from '../lib/geodeMondaySync';
import {
  syncChapterToPaymentsWithEmail,
  shouldTriggerPayment,
  getPaymentEmailForStep,
  type PaymentEmailResult,
} from '../lib/geodePaymentsSync';
import { shouldSendPaymentEmail } from '../lib/geodePaymentEmails';
import { createDraftWithAttachment, createDraft, isGmailConnected } from '../lib/gmailService';

// ============================================
// STORE INTERFACE
// ============================================

interface GeodeChapterStoreState {
  // All chapter workflow states by composite key: `${state}_${chapterType}`
  chapters: Record<string, ChapterWorkflowState>;

  // Per-state chapter lists (which chapters are enabled for each state)
  stateChapters: Record<GeodeState, GeodeContentSection[]>;

  // Custom chapter type definitions (user-created, persisted)
  customChapterTypes: ChapterTypeDefinition[];

  // Editable DOE deadlines (admin only)
  doeDeadlines: Record<GeodeState, string>;

  // Monday.com Reports Progress board item ID mappings: `${state}_${chapterType}` -> item ID
  mondayItemIds: Record<string, string>;

  // Monday.com Payments board contributor item ID mappings: `${state}_${chapterType}` -> item ID
  paymentContributorIds: Record<string, string>;

  // Actions
  getChapter: (state: GeodeState, chapterType: string) => ChapterWorkflowState | null;
  updateChapterStep: (
    state: GeodeState,
    chapterType: string,
    newStep: string,
    owner: string,
    notes?: string,
    syncToMonday?: boolean
  ) => void;
  updateChapterNotes: (state: GeodeState, chapterType: string, notes: string) => void;
  updateChapterBlocker: (state: GeodeState, chapterType: string, blocker: string | null) => void;
  setAuthorInfo: (
    state: GeodeState,
    chapterType: string,
    authorName: string,
    authorEmail: string,
    contractSigned: boolean,
    contractSignedDate?: string
  ) => void;
  setContractDeadline: (state: GeodeState, chapterType: string, stepId: string, deadline: string) => void;
  setDoeDeadline: (state: GeodeState, deadline: string) => void;
  setMondayItemId: (state: GeodeState, chapterType: string, itemId: string) => void;
  setPaymentContributorId: (state: GeodeState, chapterType: string, itemId: string) => void;
  syncChapterToMondayBoard: (state: GeodeState, chapterType: string, comment?: string) => Promise<boolean>;
  syncChapterToPaymentsBoard: (state: GeodeState, chapterType: string, workflowStep: string) => Promise<{
    triggered: boolean;
    email: PaymentEmailResult | null;
  }>;
  initializeChapters: () => void;

  // Chapter management
  addChapterToState: (state: GeodeState, chapterType: GeodeContentSection) => void;
  removeChapterFromState: (state: GeodeState, chapterType: GeodeContentSection) => void;
  getStateChapterTypes: (state: GeodeState) => GeodeContentSection[];

  // Custom chapter type management
  addCustomChapterType: (def: ChapterTypeDefinition) => void;
  removeCustomChapterType: (value: string) => void;

  // Queries
  getChaptersForState: (state: GeodeState) => ChapterWorkflowState[];
  getChaptersByOwner: (ownerName: string) => ChapterWorkflowState[];
  getOverdueChapters: () => ChapterWorkflowState[];
  getChaptersWithBlockers: () => ChapterWorkflowState[];
  getMondayItemId: (state: GeodeState, chapterType: string) => string | null;
  getPaymentContributorId: (state: GeodeState, chapterType: string) => string | null;
}

// ============================================
// INITIAL DATA
// ============================================

// DOE deadlines - editable
const DEFAULT_DOE_DEADLINES: Record<GeodeState, string> = {
  arizona: '2026-02-15',
  louisiana: '2026-02-15', // Same as Arizona per Trent
  oklahoma: '2026-03-15',
  alaska: '2026-03-25',
  idaho: '2026-04-30',
  oregon: '2026-04-30',
};

// Create initial chapter state for a given state/chapter combo
function createInitialChapterState(
  reportState: GeodeState,
  chapterType: string
): ChapterWorkflowState {
  const workflowType = getWorkflowType(chapterType);
  const leads = GEODE_CHAPTER_LEADS[reportState];
  const contentOwner = leads[chapterType] || 'Unassigned';

  // Ch 101 is done for all states
  const isCh101Done = chapterType === 'ch1_101';

  return {
    chapterId: `${reportState}_${chapterType}`,
    reportState,
    chapterType,
    workflowType,
    currentStep: isCh101Done ? 'done' : 'not_started',
    currentStepStartedAt: isCh101Done ? '2025-12-01' : new Date().toISOString(),
    currentOwner: isCh101Done ? '' : contentOwner,
    history: isCh101Done ? [
      {
        stepId: 'not_started',
        startedAt: '2025-10-01',
        completedAt: '2025-10-01',
        owner: '',
        notes: null,
        durationDays: 0,
      },
      {
        stepId: 'drafting',
        startedAt: '2025-10-01',
        completedAt: '2025-11-15',
        owner: 'Drew, Dani, Maria, Trent',
        notes: 'Universal chapter drafted',
        durationDays: 45,
      },
      {
        stepId: 'internal_review',
        startedAt: '2025-11-15',
        completedAt: '2025-11-30',
        owner: 'Trent',
        notes: null,
        durationDays: 15,
      },
      {
        stepId: 'final_edit',
        startedAt: '2025-11-30',
        completedAt: '2025-12-01',
        owner: 'Maria',
        notes: null,
        durationDays: 1,
      },
      {
        stepId: 'done',
        startedAt: '2025-12-01',
        completedAt: '2025-12-01',
        owner: '',
        notes: 'Complete for all 6 states',
        durationDays: 0,
      },
    ] : [],
    contractDeadlines: {},
    notes: null,
    blockers: null,
    googleDocUrl: null,
    authorName: null,
    authorEmail: null,
    contractSigned: false,
    contractSignedDate: null,
  };
}

// Arizona-specific chapter states based on Monday.com "Reports Progress" board
// Last synced: 2026-02-05
// Monday.com statuses mapped to Wellspring workflow steps with completed history
function getArizonaChapterOverrides(): Partial<Record<string, Partial<ChapterWorkflowState>>> {
  const recentDate = '2026-02-03';

  // Helper to create completed history through a given step for standard workflow
  const createStandardHistory = (throughStep: string, authorName?: string) => {
    const steps = [
      { stepId: 'not_started', startedAt: '2025-09-01', owner: '' },
      { stepId: 'outreach_identify_authors', startedAt: '2025-09-01', owner: 'Content Owner' },
      { stepId: 'schedule_meeting', startedAt: '2025-09-15', owner: 'Content Owner' },
      { stepId: 'explain_project', startedAt: '2025-09-20', owner: 'Content Owner' },
      { stepId: 'send_contract', startedAt: '2025-09-21', owner: 'Content Owner' },
      { stepId: 'awaiting_contract_signature', startedAt: '2025-09-22', owner: authorName || 'Author' },
      { stepId: 'awaiting_author_responses', startedAt: '2025-10-01', owner: authorName || 'Author' },
      { stepId: 'ai_deep_research_draft', startedAt: '2025-10-15', owner: 'Deep Research AI' },
      { stepId: 'maria_initial_review', startedAt: '2025-10-20', owner: 'Maria' },
      { stepId: 'content_approver_review_1', startedAt: '2025-10-25', owner: 'Content Approver' },
      { stepId: 'drew_review', startedAt: '2025-11-01', owner: 'Drew' },
      { stepId: 'author_approval_round_1', startedAt: '2025-11-10', owner: authorName || 'Author' },
      { stepId: 'content_approver_review_2', startedAt: '2025-11-20', owner: 'Content Approver' },
      { stepId: 'maria_edit_pass', startedAt: '2025-12-01', owner: 'Maria' },
      { stepId: 'drew_content_approver_review', startedAt: '2025-12-15', owner: 'Content Approver' },
      { stepId: 'peer_review', startedAt: '2026-01-05', owner: 'External Reviewer' },
      { stepId: 'author_approval_round_2', startedAt: '2026-01-15', owner: authorName || 'Author' },
      { stepId: 'copywriter_pass', startedAt: '2026-01-25', owner: 'Copywriter' },
      { stepId: 'author_approval_round_3', startedAt: '2026-02-01', owner: authorName || 'Author' },
      { stepId: 'doe_ready', startedAt: '2026-02-05', owner: '' },
      { stepId: 'design_phase', startedAt: '2026-02-10', owner: 'Designers' },
      { stepId: 'done', startedAt: '2026-02-15', owner: '' },
    ];

    const throughIndex = steps.findIndex(s => s.stepId === throughStep);
    if (throughIndex === -1) return [];

    const history = [];
    for (let i = 0; i <= throughIndex; i++) {
      const isLast = i === throughIndex;
      const nextStep = steps[i + 1];
      history.push({
        stepId: steps[i].stepId,
        startedAt: steps[i].startedAt,
        completedAt: isLast ? null : (nextStep?.startedAt || steps[i].startedAt),
        owner: steps[i].owner,
        notes: null,
        durationDays: isLast ? null : 5,
      });
    }
    return history;
  };

  return {
    // Ch 2 Subsurface: Monday "In Final Clean Up" -> copywriter_pass
    ch2_subsurface: {
      currentStep: 'copywriter_pass',
      currentStepStartedAt: '2026-01-25',
      currentOwner: 'Copy Editor (Wendy)',
      notes: 'In Final Clean Up per Monday.com',
      history: [
        { stepId: 'not_started', startedAt: '2025-09-01', completedAt: '2025-09-01', owner: '', notes: null, durationDays: 0 },
        { stepId: 'state_geologist_prework', startedAt: '2025-09-01', completedAt: '2025-09-20', owner: 'State Geologist', notes: null, durationDays: 19 },
        { stepId: 'veit_summary_draft', startedAt: '2025-09-20', completedAt: '2025-10-05', owner: 'Veit', notes: null, durationDays: 15 },
        { stepId: 'ghost_writer_draft', startedAt: '2025-10-05', completedAt: '2025-10-25', owner: 'Ghost Writer', notes: null, durationDays: 20 },
        { stepId: 'trent_review_1', startedAt: '2025-10-25', completedAt: '2025-10-30', owner: 'Trent', notes: null, durationDays: 5 },
        { stepId: 'maria_review_1', startedAt: '2025-10-30', completedAt: '2025-11-05', owner: 'Maria', notes: null, durationDays: 6 },
        { stepId: 'peer_review_state_geologist', startedAt: '2025-11-05', completedAt: '2025-11-20', owner: 'State Geologist', notes: null, durationDays: 15 },
        { stepId: 'veit_review_2', startedAt: '2025-11-20', completedAt: '2025-11-25', owner: 'Veit', notes: null, durationDays: 5 },
        { stepId: 'trent_review_2', startedAt: '2025-11-25', completedAt: '2025-12-01', owner: 'Trent', notes: null, durationDays: 6 },
        { stepId: 'maria_review_2', startedAt: '2025-12-01', completedAt: '2025-12-15', owner: 'Maria', notes: null, durationDays: 14 },
        { stepId: 'copywriter_pass', startedAt: '2026-01-25', completedAt: null, owner: 'Copy Editor (Wendy)', notes: 'In Final Clean Up', durationDays: null },
      ],
    },

    // Ch 3 Electricity: Monday "With Ryan" -> drew_content_approver_review (Drew/Approver step)
    // Per user: at Drew/Approver step, preparing for Peer Review. All prior steps done.
    ch3_electricity: {
      currentStep: 'drew_content_approver_review',
      currentStepStartedAt: recentDate,
      currentOwner: 'Ryan',
      notes: 'With Ryan per Monday.com. Preparing for Peer Review.',
      history: createStandardHistory('drew_content_approver_review'),
    },

    // Ch 4 Direct-Use: Monday "With Trent" -> content_approver_review_1
    ch4_direct_use: {
      currentStep: 'content_approver_review_1',
      currentStepStartedAt: recentDate,
      currentOwner: 'Trent',
      notes: 'With Trent per Monday.com',
      history: createStandardHistory('content_approver_review_1'),
    },

    // Ch 4.5 Commercial GSHP: Not in Monday list, keeping previous state
    ch4_5_commercial_gshp: {
      currentStep: 'content_approver_review_1',
      currentStepStartedAt: recentDate,
      currentOwner: 'Trent',
      notes: null,
      history: createStandardHistory('content_approver_review_1'),
    },

    // Ch 5 Heat Ownership: Monday "Ready for Peer Review" -> peer_review
    ch5_heat_ownership: {
      currentStep: 'peer_review',
      currentStepStartedAt: recentDate,
      currentOwner: 'External Reviewer',
      notes: 'Ready for Peer Review per Monday.com',
      history: createStandardHistory('peer_review'),
    },

    // Ch 6 Policy: Monday "With Author for Review" -> author_approval_round_1
    ch6_policy: {
      currentStep: 'author_approval_round_1',
      currentStepStartedAt: '2026-02-06',
      currentOwner: 'Author',
      notes: 'With Author for Review per Monday.com',
      history: createStandardHistory('author_approval_round_1'),
    },

    // Ch 7 Stakeholders: Monday "Ready for Peer Review" -> peer_review
    ch7_stakeholders: {
      currentStep: 'peer_review',
      currentStepStartedAt: recentDate,
      currentOwner: 'External Reviewer',
      notes: 'Ready for Peer Review per Monday.com',
      history: createStandardHistory('peer_review'),
    },

    // Ch 8 Environment/Land: Monday "Ready for Peer Review" -> peer_review
    ch8_environment: {
      currentStep: 'peer_review',
      currentStepStartedAt: recentDate,
      currentOwner: 'External Reviewer',
      notes: 'Ready for Peer Review per Monday.com',
      history: createStandardHistory('peer_review'),
    },

    // Ch 9 Military: Monday "With Trent" -> content_approver_review_1
    ch9_military: {
      currentStep: 'content_approver_review_1',
      currentStepStartedAt: recentDate,
      currentOwner: 'Trent',
      notes: 'With Trent per Monday.com',
      history: createStandardHistory('content_approver_review_1'),
    },
  };
}

// ============================================
// STORE IMPLEMENTATION
// ============================================

export const useGeodeChapterStore = create<GeodeChapterStoreState>()(
  persist(
    (set, get) => ({
      chapters: {},
      stateChapters: { ...DEFAULT_STATE_CHAPTERS },
      customChapterTypes: [],
      doeDeadlines: DEFAULT_DOE_DEADLINES,
      mondayItemIds: {},
      paymentContributorIds: {},

      getChapter: (state, chapterType) => {
        const key = `${state}_${chapterType}`;
        return get().chapters[key] || null;
      },

      getMondayItemId: (state, chapterType) => {
        const key = `${state}_${chapterType}`;
        return get().mondayItemIds[key] || null;
      },

      getPaymentContributorId: (state, chapterType) => {
        const key = `${state}_${chapterType}`;
        return get().paymentContributorIds[key] || null;
      },

      setMondayItemId: (state, chapterType, itemId) => {
        const key = `${state}_${chapterType}`;
        set((s) => ({
          mondayItemIds: {
            ...s.mondayItemIds,
            [key]: itemId,
          },
        }));
      },

      setPaymentContributorId: (state, chapterType, itemId) => {
        const key = `${state}_${chapterType}`;
        set((s) => ({
          paymentContributorIds: {
            ...s.paymentContributorIds,
            [key]: itemId,
          },
        }));
      },

      syncChapterToMondayBoard: async (state, chapterType, comment) => {
        const key = `${state}_${chapterType}`;
        const chapter = get().chapters[key];
        const itemId = get().mondayItemIds[key];

        if (!chapter) {
          console.warn('[GeodeStore] Chapter not found:', key);
          return false;
        }

        if (!itemId) {
          console.warn('[GeodeStore] No Monday.com item ID for:', key);
          return false;
        }

        const statusLabel = getMondayStatusLabel(chapter.currentStep);
        const fullComment = comment ||
          `[Wellspring Update] Status: ${statusLabel}\nOwner: ${chapter.currentOwner}${chapter.notes ? `\nNotes: ${chapter.notes}` : ''}`;

        const success = await addMondayComment(itemId, fullComment);
        if (success) {
          console.log('[GeodeStore] Synced to Monday.com:', key, '->', statusLabel);
        }
        return success;
      },

      syncChapterToPaymentsBoard: async (state, chapterType, workflowStep) => {
        const key = `${state}_${chapterType}`;
        const chapter = get().chapters[key];
        const contributorId = get().paymentContributorIds[key];

        if (!chapter) {
          console.warn('[GeodeStore] Chapter not found for payments sync:', key);
          return { triggered: false, email: null };
        }

        if (!contributorId) {
          console.warn('[GeodeStore] No Payments board contributor ID for:', key);
          return { triggered: false, email: null };
        }

        // Check if this step should trigger a payment milestone
        const milestone = shouldTriggerPayment(workflowStep);
        if (!milestone) {
          console.log('[GeodeStore] No payment milestone for step:', workflowStep);
          return { triggered: false, email: null };
        }

        const chapterInfo = getChapterTypeInfo(chapterType, get().customChapterTypes);
        const chapterTitle = chapterInfo?.label || chapterType;
        const stateInfo = GEODE_STATES.find(s => s.value === state);

        // Build author info for email generation
        const authorInfo = {
          name: chapter.authorName || 'Unknown Author',
          email: chapter.authorEmail || '',
          chapter: chapterType,
          chapterTitle,
          state: stateInfo?.label || state,
        };

        const grantAmount = chapter.grantAmount || 5000;

        const result = await syncChapterToPaymentsWithEmail(
          contributorId,
          workflowStep,
          chapterTitle,
          authorInfo,
          grantAmount,
          chapterInfo?.chapterNum
        );

        if (result.mondayUpdated) {
          console.log('[GeodeStore] Payment milestone triggered:', result.milestone, 'for:', key);
        }

        if (result.email.emailType) {
          console.log('[GeodeStore] Email generated:', result.email.emailType, 'for:', key);
        }

        return {
          triggered: result.mondayUpdated,
          email: result.email,
        };
      },

      updateChapterStep: (state, chapterType, newStep, owner, notes, syncToMonday = true) => {
        const key = `${state}_${chapterType}`;
        const chapter = get().chapters[key];
        if (!chapter) return;

        // The step that is being COMPLETED is the chapter's current step
        const completedStep = chapter.currentStep;
        const now = new Date().toISOString();

        // Complete current step in history
        const updatedHistory = [...chapter.history];
        const currentHistoryIndex = updatedHistory.findIndex(
          h => h.stepId === chapter.currentStep && !h.completedAt
        );

        if (currentHistoryIndex >= 0) {
          const startDate = new Date(updatedHistory[currentHistoryIndex].startedAt);
          const endDate = new Date(now);
          updatedHistory[currentHistoryIndex] = {
            ...updatedHistory[currentHistoryIndex],
            completedAt: now,
            durationDays: Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
          };
        }

        // Add new step to history
        updatedHistory.push({
          stepId: newStep,
          startedAt: now,
          completedAt: null,
          owner,
          notes: notes || null,
          durationDays: null,
        });

        set((s) => ({
          chapters: {
            ...s.chapters,
            [key]: {
              ...chapter,
              currentStep: newStep,
              currentStepStartedAt: now,
              currentOwner: owner,
              history: updatedHistory,
            },
          },
        }));

        // Sync to Monday.com if enabled and item ID exists
        if (syncToMonday) {
          const itemId = get().mondayItemIds[key];
          if (itemId) {
            const statusLabel = getMondayStatusLabel(newStep);
            const comment = `[Wellspring] Step advanced to: ${statusLabel}\nOwner: ${owner}${notes ? `\nNotes: ${notes}` : ''}`;
            addMondayComment(itemId, comment).then(success => {
              if (success) {
                console.log('[GeodeStore] Monday.com synced for:', key);
              }
            });
          }
        }

        // Check if the COMPLETED step triggers a payment milestone
        // If so, generate a prefilled invoice and create a Gmail draft
        const { sendInvoiceReminder } = shouldSendPaymentEmail(completedStep);
        if (sendInvoiceReminder && chapter.authorEmail && chapter.authorName) {
          const chapterInfo = getChapterTypeInfo(chapterType, get().customChapterTypes);
          const stateInfo = GEODE_STATES.find(s => s.value === state);

          const authorInfo = {
            name: chapter.authorName,
            email: chapter.authorEmail,
            chapter: chapterType,
            chapterTitle: chapterInfo?.label || chapterType,
            state: stateInfo?.label || state,
          };

          const grantAmount = chapter.grantAmount || 5000;

          // Generate invoice email asynchronously (fire and forget with logging)
          getPaymentEmailForStep(completedStep, authorInfo, grantAmount, chapterInfo?.chapterNum)
            .then(async (emailResult) => {
              if (emailResult.emailData && isGmailConnected()) {
                console.log('[GeodeStore] Creating invoice email draft for:', chapter.authorName);

                let draftResult;
                if (emailResult.emailData.attachment) {
                  draftResult = await createDraftWithAttachment({
                    to: emailResult.emailData.to,
                    cc: emailResult.emailData.cc,
                    subject: emailResult.emailData.subject,
                    body: emailResult.emailData.body,
                    isHtml: false,
                    attachment: emailResult.emailData.attachment,
                  });
                } else {
                  draftResult = await createDraft({
                    to: emailResult.emailData.to,
                    cc: emailResult.emailData.cc,
                    subject: emailResult.emailData.subject,
                    body: emailResult.emailData.body,
                    isHtml: false,
                  });
                }

                if (draftResult.success) {
                  console.log('[GeodeStore] Invoice email draft created:', draftResult.draftId);
                } else {
                  console.error('[GeodeStore] Failed to create invoice draft:', draftResult.error);
                }
              } else if (!isGmailConnected()) {
                console.warn('[GeodeStore] Gmail not connected — invoice email skipped for:', chapter.authorName);
              }
            })
            .catch(error => {
              console.error('[GeodeStore] Error generating invoice email:', error);
            });
        }
      },

      updateChapterNotes: (state, chapterType, notes) => {
        const key = `${state}_${chapterType}`;
        set((s) => ({
          chapters: {
            ...s.chapters,
            [key]: {
              ...s.chapters[key],
              notes,
            },
          },
        }));
      },

      updateChapterBlocker: (state, chapterType, blocker) => {
        const key = `${state}_${chapterType}`;
        set((s) => ({
          chapters: {
            ...s.chapters,
            [key]: {
              ...s.chapters[key],
              blockers: blocker,
            },
          },
        }));
      },

      setAuthorInfo: (state, chapterType, authorName, authorEmail, contractSigned, contractSignedDate) => {
        const key = `${state}_${chapterType}`;
        set((s) => ({
          chapters: {
            ...s.chapters,
            [key]: {
              ...s.chapters[key],
              authorName,
              authorEmail,
              contractSigned,
              contractSignedDate: contractSignedDate || null,
            },
          },
        }));
      },

      setContractDeadline: (state, chapterType, stepId, deadline) => {
        const key = `${state}_${chapterType}`;
        set((s) => ({
          chapters: {
            ...s.chapters,
            [key]: {
              ...s.chapters[key],
              contractDeadlines: {
                ...s.chapters[key]?.contractDeadlines,
                [stepId]: deadline,
              },
            },
          },
        }));
      },

      setDoeDeadline: (state, deadline) => {
        set((s) => ({
          doeDeadlines: {
            ...s.doeDeadlines,
            [state]: deadline,
          },
        }));
      },

      initializeChapters: () => {
        const chapters: Record<string, ChapterWorkflowState> = {};
        const arizonaOverrides = getArizonaChapterOverrides();
        const currentStateChapters = get().stateChapters;

        for (const state of GEODE_STATES) {
          // Use per-state chapter list (falls back to default if not yet set)
          const enabledChapters = currentStateChapters[state.value as GeodeState] || DEFAULT_STATE_CHAPTERS[state.value as GeodeState];
          const allTypes = getAllChapterTypes(get().customChapterTypes);
          const chapterTypes = allTypes.filter(c => enabledChapters.includes(c.value));

          for (const chapter of chapterTypes) {
            const key = `${state.value}_${chapter.value}`;
            const initialState = createInitialChapterState(state.value, chapter.value);

            // Apply Arizona overrides
            if (state.value === 'arizona' && arizonaOverrides[chapter.value]) {
              chapters[key] = {
                ...initialState,
                ...arizonaOverrides[chapter.value],
                history: arizonaOverrides[chapter.value]?.history || initialState.history,
              };
            } else {
              chapters[key] = initialState;
            }
          }
        }

        set({ chapters });
      },

      addChapterToState: (state, chapterType) => {
        const current = get().stateChapters[state] || DEFAULT_STATE_CHAPTERS[state];
        if (current.includes(chapterType)) return; // Already exists

        // Insert in chapter number order based on merged chapter list (built-in + custom)
        const allTypes = getAllChapterTypes(get().customChapterTypes);
        const masterOrder = allTypes.map(c => c.value);
        const updated = [...current, chapterType].sort(
          (a, b) => {
            const aIdx = masterOrder.indexOf(a);
            const bIdx = masterOrder.indexOf(b);
            return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
          }
        );

        // Create the chapter workflow state entry
        const key = `${state}_${chapterType}`;
        const initialState = createInitialChapterState(state, chapterType);

        set((s) => ({
          stateChapters: { ...s.stateChapters, [state]: updated },
          chapters: { ...s.chapters, [key]: initialState },
        }));
      },

      removeChapterFromState: (state, chapterType) => {
        const current = get().stateChapters[state] || DEFAULT_STATE_CHAPTERS[state];
        if (!current.includes(chapterType)) return; // Doesn't exist

        const updated = current.filter(c => c !== chapterType);
        const key = `${state}_${chapterType}`;

        // Remove the chapter from the chapters record
        const { [key]: _removed, ...remainingChapters } = get().chapters;

        set((s) => ({
          stateChapters: { ...s.stateChapters, [state]: updated },
          chapters: remainingChapters,
        }));
      },

      getStateChapterTypes: (state) => {
        return get().stateChapters[state] || DEFAULT_STATE_CHAPTERS[state];
      },

      addCustomChapterType: (def) => {
        const existing = getAllChapterTypes(get().customChapterTypes);
        if (existing.some(c => c.value === def.value)) return; // Duplicate slug
        set((s) => ({
          customChapterTypes: [...s.customChapterTypes, { ...def, isCustom: true }],
        }));
      },

      removeCustomChapterType: (value) => {
        // Only remove custom types (not built-in)
        if (GEODE_CHAPTER_TYPES.some(c => c.value === value)) return;

        // Also remove from all state chapter lists and chapter data
        const newStateChapters = { ...get().stateChapters };
        const newChapters = { ...get().chapters };
        for (const state of GEODE_STATES) {
          const stateKey = state.value as GeodeState;
          const current = newStateChapters[stateKey] || DEFAULT_STATE_CHAPTERS[stateKey];
          if (current.includes(value)) {
            newStateChapters[stateKey] = current.filter(c => c !== value);
          }
          const chapterKey = `${stateKey}_${value}`;
          delete newChapters[chapterKey];
        }

        set((s) => ({
          customChapterTypes: s.customChapterTypes.filter(c => c.value !== value),
          stateChapters: newStateChapters,
          chapters: newChapters,
        }));
      },

      getChaptersForState: (state) => {
        const allChapters = get().chapters;
        const enabledChapters = get().stateChapters[state] || DEFAULT_STATE_CHAPTERS[state];
        // Return only chapters that are in the enabled list for this state
        return Object.values(allChapters)
          .filter(c => c.reportState === state && enabledChapters.includes(c.chapterType as GeodeContentSection));
      },

      getChaptersByOwner: (ownerName) => {
        const allChapters = get().chapters;
        const nameLower = ownerName.toLowerCase();
        return Object.values(allChapters).filter(c =>
          c.currentOwner.toLowerCase().includes(nameLower) &&
          c.currentStep !== 'done' &&
          c.currentStep !== 'not_started'
        );
      },

      getOverdueChapters: () => {
        const allChapters = get().chapters;
        return Object.values(allChapters).filter(c => {
          if (c.currentStep === 'done' || c.currentStep === 'not_started') return false;
          const stepMeta = getStepMeta(c.workflowType, c.currentStep);
          if (!stepMeta) return false;
          const daysOnStep = calculateDaysOnStep(c.currentStepStartedAt);
          return daysOnStep > stepMeta.typicalDurationDays;
        });
      },

      getChaptersWithBlockers: () => {
        const allChapters = get().chapters;
        return Object.values(allChapters).filter(c => c.blockers != null && c.blockers.length > 0);
      },
    }),
    {
      name: 'geode-chapter-store',
      // Persist chapters, deadlines, Monday.com item IDs, per-state chapter lists, and custom types
      partialize: (state) => ({
        chapters: state.chapters,
        stateChapters: state.stateChapters,
        customChapterTypes: state.customChapterTypes,
        doeDeadlines: state.doeDeadlines,
        mondayItemIds: state.mondayItemIds,
        paymentContributorIds: state.paymentContributorIds,
      }),
      // On rehydration, sync any missing chapter entries from defaults
      // This fixes the bug where DEFAULT_STATE_CHAPTERS changes (e.g. adding OK ch7.1)
      // but existing persisted chapters record doesn't have the new entries
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const { chapters, stateChapters } = state;
        let needsUpdate = false;
        const updatedChapters = { ...chapters };

        // For each state, check if any enabled chapters are missing from the chapters record
        for (const geodeState of GEODE_STATES) {
          const stateKey = geodeState.value as GeodeState;
          const enabledChapters = stateChapters[stateKey] || DEFAULT_STATE_CHAPTERS[stateKey];

          for (const chapterType of enabledChapters) {
            const key = `${stateKey}_${chapterType}`;
            if (!updatedChapters[key]) {
              // Missing chapter — create it
              updatedChapters[key] = createInitialChapterState(stateKey, chapterType);
              needsUpdate = true;
            }
          }
        }

        if (needsUpdate) {
          // Use setTimeout to defer the set call after hydration completes
          setTimeout(() => {
            useGeodeChapterStore.setState({ chapters: updatedChapters });
          }, 0);
        }
      },
    }
  )
);

// ============================================
// SELECTOR HOOKS
// ============================================

export const useTrentChapters = () => {
  const getChaptersByOwner = useGeodeChapterStore((s) => s.getChaptersByOwner);
  return getChaptersByOwner('Trent');
};

export const useMariaChapters = () => {
  const getChaptersByOwner = useGeodeChapterStore((s) => s.getChaptersByOwner);
  return getChaptersByOwner('Maria');
};

export const useOverdueChapters = () => {
  const getOverdueChapters = useGeodeChapterStore((s) => s.getOverdueChapters);
  return getOverdueChapters();
};
