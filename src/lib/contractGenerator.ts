/**
 * GEODE Contract Generator
 *
 * Generates Independent Contractor Agreement DOCX files in the browser,
 * then uploads to Google Drive and/or attaches to email drafts.
 *
 * Ported from: email-ghostwriter/create_contracts.py
 * Timeline logic from: email-ghostwriter/LEARNED_CHANGES.md
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  PageBreak,
} from 'docx';
import { GEODE_STATES, GEODE_DOE_DEADLINES, type GeodeState } from '../types/geode';
import { getGoogleTokenAsync } from './googleCalendar';

// ============================================
// CONSTANTS
// ============================================

const CONTRACTS_FOLDER_ID = '1su4hSG2DDjJ-t2Oi7q_39HeaYQD8IIfj';

// ============================================
// TIMELINE CALCULATION
// ============================================

/**
 * Calculate contract milestone dates by working backwards from the DOE deadline.
 *
 * From LEARNED_CHANGES.md:
 *
 * ### For "Tight" Timelines (≤8 weeks to DOE):
 * 1. Expert Questions: 1 week after contract signing
 * 2. First Draft: 8 days after expert questions
 * 3. Review Returned: 12 days after first draft
 * 4. Grammar Proof: 9 days after review returned
 * 5. Final Approval: 7 days after grammar proof
 * Total: ~37 days from expert questions to approval
 *
 * ### For "Medium" Timelines (>8 weeks to DOE):
 * 1. Expert Questions: Within 2-3 weeks of contract signing
 * 2. First Draft: 14 days after expert questions
 * 3. Review Returned: 7 days after first draft
 * 4. Grammar Proof: 7 days after review returned
 * 5. Final Approval: 14 days after grammar proof
 * Total: ~42 days from expert questions to approval
 *
 * Key principles:
 * - Don't fill all available time — build 2-3 week buffer before DOE deadline
 * - Compress front-end (getting expert input and first drafts)
 * - Allow adequate back-end buffer (grammar/design polish)
 */
export interface ContractTimeline {
  effectiveDate: string;     // Contract signing date (MM/DD/YYYY)
  expertQDate: string;       // M1: Expert questions due
  firstDraftDate: string;    // M2: Ghostwriter draft to contractor
  reviewReturnDate: string;  // M3: Contractor review returned
  grammarProofDate: string;  // M4: Grammar/design proof
  finalApprovalDate: string; // M5: Final publication approval
  doeDeadline: string;       // Actual DOE deadline for reference
  bufferDays: number;        // Days of buffer before DOE deadline
  timelineType: 'tight' | 'medium';
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function formatDateLong(date: Date): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export function calculateContractTimeline(
  state: GeodeState,
  signingDate?: Date
): ContractTimeline {
  const today = signingDate || new Date();
  const doeDeadlineInfo = GEODE_DOE_DEADLINES[state];
  const doeDate = new Date(doeDeadlineInfo.date);

  // Calculate weeks until DOE deadline
  const msUntilDoe = doeDate.getTime() - today.getTime();
  const weeksUntilDoe = msUntilDoe / (1000 * 60 * 60 * 24 * 7);

  const isTight = weeksUntilDoe <= 8;

  let expertQDate: Date;
  let firstDraftDate: Date;
  let reviewReturnDate: Date;
  let grammarProofDate: Date;
  let finalApprovalDate: Date;

  if (isTight) {
    // Tight timeline: ~37 days from expert questions to approval
    expertQDate = addDays(today, 7);          // 1 week after signing
    firstDraftDate = addDays(expertQDate, 8); // 8 days after expert Q
    reviewReturnDate = addDays(firstDraftDate, 12); // 12 days after first draft
    grammarProofDate = addDays(reviewReturnDate, 9); // 9 days after review
    finalApprovalDate = addDays(grammarProofDate, 7); // 7 days after grammar
  } else {
    // Medium timeline: ~42 days from expert questions to approval
    expertQDate = addDays(today, 14);          // 2 weeks after signing
    firstDraftDate = addDays(expertQDate, 14); // 14 days after expert Q
    reviewReturnDate = addDays(firstDraftDate, 7); // 7 days after first draft
    grammarProofDate = addDays(reviewReturnDate, 7); // 7 days after review
    finalApprovalDate = addDays(grammarProofDate, 14); // 14 days after grammar
  }

  // Calculate actual buffer
  const bufferMs = doeDate.getTime() - finalApprovalDate.getTime();
  const bufferDays = Math.round(bufferMs / (1000 * 60 * 60 * 24));

  // Safety check: if final approval is AFTER DOE deadline, compress
  if (bufferDays < 7) {
    console.warn(
      `[ContractTimeline] WARNING: Only ${bufferDays} days buffer before DOE deadline for ${state}. ` +
      `Consider whether this timeline is realistic.`
    );
  }

  return {
    effectiveDate: formatDateLong(today),
    expertQDate: formatDate(expertQDate),
    firstDraftDate: formatDate(firstDraftDate),
    reviewReturnDate: formatDate(reviewReturnDate),
    grammarProofDate: formatDate(grammarProofDate),
    finalApprovalDate: formatDate(finalApprovalDate),
    doeDeadline: formatDate(doeDate),
    bufferDays,
    timelineType: isTight ? 'tight' : 'medium',
  };
}

// ============================================
// CHAPTER SCOPE TEXTS
// ============================================

/**
 * Default scope text per chapter type.
 * These can be customized per state — the defaults cover the common case.
 */
const CHAPTER_SCOPE_DEFAULTS: Record<string, (stateName: string) => string> = {
  ch1_101: (state) =>
    `The 101 section:\n` +
    `This introductory chapter provides a comprehensive overview of geothermal energy fundamentals as they relate to ${state}. ` +
    `It covers the basic science, resource types, and current landscape of geothermal development in the state.`,

  ch2_subsurface: (state) =>
    `Subsurface section:\n` +
    `This chapter provides a detailed analysis of ${state}'s subsurface geothermal resources, including geological formations, ` +
    `temperature gradients, and resource characterization. The author should assess both conventional hydrothermal and enhanced ` +
    `geothermal system (EGS) potential.`,

  ch3_electricity: (state) =>
    `Electricity section:\n` +
    `This chapter should provide a comprehensive analysis of geothermal electricity potential in ${state}, covering technical ` +
    `feasibility, grid integration, economic competitiveness, and policy considerations.\n\n` +
    `Key questions to address:\n` +
    `- Resource Assessment: What is the technical potential for geothermal electricity generation in ${state}, including both hydrothermal and enhanced geothermal systems?\n` +
    `- Grid Integration: How can geothermal power be integrated into ${state}'s existing electricity grid infrastructure, and what transmission upgrades may be needed?\n` +
    `- Economic Analysis: How does geothermal electricity compare economically with other baseload and renewable energy sources in ${state}'s energy market?\n` +
    `- Market Structure: What is ${state}'s electricity market structure, and how do current policies and regulations affect geothermal development?\n` +
    `- Utility Engagement: What roles can ${state}'s utilities and cooperatives play in facilitating geothermal electricity development?\n` +
    `- Policy Recommendations: What policy changes or incentives could accelerate geothermal electricity deployment in ${state}?`,

  ch4_direct_use: (state) =>
    `Direct Use section:\n` +
    `This chapter explores the potential for direct-use geothermal applications in ${state}, including district heating, ` +
    `agricultural uses, aquaculture, and industrial process heat. The analysis should cover technical feasibility, ` +
    `economic viability, and specific opportunities unique to ${state}.`,

  ch5_heat_ownership: (state) =>
    `Heat Ownership section:\n` +
    `This chapter examines the legal framework governing subsurface heat ownership in ${state}. It should analyze ` +
    `existing mineral rights, water rights, and any emerging geothermal-specific legislation, as well as recommend ` +
    `policy approaches to clarify heat ownership.`,

  ch6_policy: (state) =>
    `Policy section:\n` +
    `This chapter provides a comprehensive analysis of the policy landscape affecting geothermal development in ${state}. ` +
    `It should cover federal, state, and local policies, regulatory frameworks, permitting processes, and recommend ` +
    `policy changes to accelerate geothermal deployment.`,

  ch7_stakeholders: (state) =>
    `Stakeholders section:\n` +
    `This chapter should highlight how private and public interests can align to unlock geothermal as a long-term ` +
    `economic development tool for ${state}. The author should analyze the role of landowners, public land managers, ` +
    `rural communities, and tribal communities, offering insight into stakeholder priorities and the types of partnerships ` +
    `that can ensure widespread support and equitable benefit-sharing.\n\n` +
    `Key questions to address:\n` +
    `- Benefits for Private Landowners: What new income streams can geothermal projects offer to ${state}'s private landowners, and how can landowners be engaged early as partners in geothermal development?\n` +
    `- Public Sector Gains and Roles: What potential revenue or economic benefits could ${state}'s state and local governments gain from geothermal energy, and what roles can public agencies play in supporting and regulating geothermal projects?\n` +
    `- Tribal Engagement: How will ${state}'s tribal nations be involved in geothermal development, and what steps can ensure that tribal rights are respected and that tribal communities share in the economic and energy benefits?\n` +
    `- Stakeholder Collaboration: What strategies will promote effective collaboration among all key stakeholders so that everyone is fairly engaged in ${state}'s geothermal projects and shares the benefits without unfair burdens?\n` +
    `- Oil & Gas Industry Engagement: How can ${state}'s oil and gas companies and skilled workforce be mobilized to kickstart geothermal energy projects, and what economic benefits could this bring to the state?`,

  ch8_environment: (state) =>
    `Environment section:\n` +
    `This chapter provides a comprehensive environmental assessment of geothermal development in ${state}. It should ` +
    `cover environmental impacts, mitigation strategies, permitting requirements, and the overall environmental ` +
    `benefits of geothermal compared to other energy sources.`,

  ch9_military: (state) =>
    `Military Installations section:\n` +
    `This chapter assesses the potential for geothermal energy at military installations in ${state}. It should ` +
    `cover energy security requirements, existing infrastructure, and opportunities for geothermal to support ` +
    `military base energy resilience goals.`,
};

function getChapterScopeText(chapterType: string, stateName: string): string {
  const generator = CHAPTER_SCOPE_DEFAULTS[chapterType];
  if (generator) {
    return generator(stateName);
  }
  return `This chapter covers ${chapterType.replace('ch', 'Chapter ').replace('_', ' ')} for the ${stateName} state geothermal data report.`;
}

// ============================================
// DOCX GENERATION
// ============================================

export interface ContractParams {
  contractorName: string;
  contractorEmail: string;
  state: GeodeState;
  stateName: string;
  chapterName: string;
  chapterType: string;
  chapterNum: string;
  timeline: ContractTimeline;
  chapterScopeText?: string; // Override default scope text
  paymentAmount?: number;    // Total grant amount (defaults to 5000)
}

/**
 * Generate a full Independent Contractor Agreement as a DOCX file.
 * Returns a Blob that can be uploaded to Google Drive or attached to email.
 */
export async function generateContractDocx(params: ContractParams): Promise<Blob> {
  const {
    contractorName,
    contractorEmail,
    stateName,
    chapterName,
    chapterType,
    timeline,
  } = params;

  const scopeText = params.chapterScopeText || getChapterScopeText(chapterType, stateName);

  // Calculate payment amounts from total grant
  const totalGrant = params.paymentAmount || 5000;
  const payment1 = totalGrant * 0.375;
  const payment2 = totalGrant * 0.375;
  const payment3 = totalGrant * 0.25;
  const fmtCurrency = (n: number) =>
    `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const doc = new Document({
    sections: [
      {
        children: [
          // ==================
          // TITLE
          // ==================
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: 'INDEPENDENT CONTRACTOR AGREEMENT', bold: true, size: 28 }),
            ],
          }),

          new Paragraph({ children: [] }),

          // ==================
          // OPENING PARAGRAPH
          // ==================
          new Paragraph({
            children: [
              new TextRun({
                text: `This Independent Contractor Agreement (this "Agreement") is made effective as of ${timeline.effectiveDate}, ` +
                  `by and between Project InnerSpace, Inc. (the "Recipient"), of 68 Harrison Ave, Ste 605 PMB 9959., ` +
                  `Boston, Massachusetts 02111-1929, and ${contractorName} (the "Contractor"). In this Agreement, ` +
                  `the party who is contracting to receive the services shall be referred to as "Recipient", and the ` +
                  `party who will be providing the services shall be referred to as "Contractor."`,
              }),
            ],
          }),

          new Paragraph({ children: [] }),

          // ==================
          // SECTION 1: DESCRIPTION OF SERVICES
          // ==================
          new Paragraph({
            children: [
              new TextRun({ text: '1. DESCRIPTION OF SERVICES. ', bold: true }),
              new TextRun({
                text: `Beginning on the effective date of this Agreement and concluding upon the completion of the Services ` +
                  `outlined under DELIVERABLES and as described in Annex 1 attached hereto and incorporated herein by ` +
                  `reference, the Contractor shall deliver the services (collectively, the "Services") specified. The scope, ` +
                  `duration, principal responsibilities, deliverables, and timeline for the Services are as detailed in Annex 1.`,
              }),
            ],
          }),

          new Paragraph({ children: [] }),

          new Paragraph({
            children: [
              new TextRun({ text: 'DELIVERABLES:', bold: true }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'The Contractor will provide three deliverables over the course of the Project, which are due on or before the date indicated in the Timeline below.',
              }),
            ],
          }),

          new Paragraph({ children: [] }),

          new Paragraph({
            children: [new TextRun({ text: 'First draft of the answers to the Report Chapter "Expert" Questions.' })],
          }),
          new Paragraph({
            children: [new TextRun({ text: 'Review of ghostwritten draft chapter.' })],
          }),
          new Paragraph({
            children: [new TextRun({ text: 'Approval of the final version of the chapter, revised and refined based on feedback.' })],
          }),

          new Paragraph({ children: [] }),

          new Paragraph({
            children: [new TextRun({ text: 'TIMELINE:', bold: true })],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'Please note all milestone and timeline deadlines and dates contained in this timeline may be adjusted and are subject to the mutual agreement and execution of the Recipient and Contractor.',
              }),
            ],
          }),

          new Paragraph({ children: [] }),

          new Paragraph({
            children: [new TextRun({ text: `Research and answering of "expert" questions: ${timeline.expertQDate}` })],
          }),
          new Paragraph({
            children: [new TextRun({ text: `Ghostwriter draft to Contractor: ${timeline.firstDraftDate}` })],
          }),
          new Paragraph({
            children: [new TextRun({ text: `Contractor review and edits returned to ghostwriter: ${timeline.reviewReturnDate}` })],
          }),
          new Paragraph({
            children: [new TextRun({ text: `Grammar, copy edits, & design proof to Contractor: ${timeline.grammarProofDate}` })],
          }),
          new Paragraph({
            children: [new TextRun({ text: `Contractor publication approval of grammar, copy edits, & design proof: ${timeline.finalApprovalDate}` })],
          }),

          new Paragraph({ children: [] }),

          // ==================
          // SECTION 2: PAYMENT
          // ==================
          new Paragraph({
            children: [
              new TextRun({ text: '2. PAYMENT FOR SERVICES. ', bold: true }),
              new TextRun({
                text: `The Recipient will pay compensation to the Contractor for the Services in the amount of ${fmtCurrency(totalGrant)}. Invoices will be sent as detailed in Schedule A.`,
              }),
            ],
          }),

          new Paragraph({ children: [] }),

          new Paragraph({
            children: [
              new TextRun({
                text: 'The funds will be paid to the Contractor in the following manner, in accordance with the Deliverables and Timeline:',
              }),
            ],
          }),

          new Paragraph({ children: [] }),

          new Paragraph({ children: [new TextRun({ text: `Total Grant: ${fmtCurrency(totalGrant)}` })] }),
          new Paragraph({ children: [new TextRun({ text: `Initial payment (37.5%): ${fmtCurrency(payment1)} - upon contract signing` })] }),
          new Paragraph({ children: [new TextRun({ text: `Second Payment (37.5%): ${fmtCurrency(payment2)} - upon completion of contractor review of Project InnerSpace first draft.` })] }),
          new Paragraph({ children: [new TextRun({ text: `Final payment (25%): ${fmtCurrency(payment3)} - to be paid within 30 days of Project InnerSpace receiving the Contractor's final publication approval.` })] }),

          new Paragraph({ children: [] }),

          new Paragraph({
            children: [
              new TextRun({
                text: 'No other fees and/or expenses will be paid to the Contractor unless such fees and/or expenses have been ' +
                  'approved in advance by the appropriate executive on behalf of the Recipient in writing. The Contractor shall ' +
                  'be solely responsible for any and all taxes, Social Security contributions or payments, disability insurance, ' +
                  'unemployment taxes, and other payroll-type taxes applicable to such compensation.',
              }),
            ],
          }),

          new Paragraph({ children: [] }),

          // ==================
          // SECTION 3: TERM/TERMINATION
          // ==================
          new Paragraph({
            children: [
              new TextRun({ text: '3. TERM/TERMINATION. ', bold: true }),
              new TextRun({
                text: "This Agreement may be terminated by either party (i) upon thirty (30) days' written notice to the other party, " +
                  'or (ii) upon ten (10) days written notice to the other party, if the other party materially breaches this Agreement, ' +
                  'unless the breach is cured within the notice period. A regular, ongoing relationship of indefinite term is not ' +
                  'contemplated. Upon termination and as otherwise requested by the Recipient, the Contractor will promptly return ' +
                  'to the Recipient all items and copies containing or embodying Confidential Information (as defined herein), and all ' +
                  'Work Product (as defined herein), except that the Contractor may keep its personal copies of its compensation records ' +
                  'and this Agreement. The following provisions shall survive termination or expiration of this Agreement: 3, 4, 5, and ' +
                  '9 through 18.',
              }),
            ],
          }),

          new Paragraph({ children: [] }),

          // ==================
          // SECTION 4: RELATIONSHIP OF PARTIES
          // ==================
          new Paragraph({
            children: [
              new TextRun({ text: '4. RELATIONSHIP OF PARTIES. ', bold: true }),
              new TextRun({
                text: 'It is understood by the parties that the Contractor is an independent contractor with respect to the Recipient, ' +
                  'and not an employee of the Recipient. The Recipient will not provide fringe benefits, including health insurance ' +
                  'benefits, paid vacation, or any other employee benefit, for the benefit of the Contractor. It is contemplated that ' +
                  'the relationship between the Contractor and the Recipient shall be a non-exclusive one. The Contractor also performs ' +
                  'services for other organizations and/or individuals.',
              }),
            ],
          }),

          new Paragraph({ children: [] }),

          // ==================
          // SECTION 5: OWNERSHIP OF WORK PRODUCT
          // ==================
          new Paragraph({
            children: [
              new TextRun({ text: '5. OWNERSHIP OF WORK PRODUCT. ', bold: true }),
              new TextRun({
                text: 'The Recipient will have full and exclusive ownership of any and all work product created by the Contractor or provided ' +
                  'to the Recipient under this Agreement (collectively, "Work Product"). All Work Product is work made for hire to the extent ' +
                  'allowed by law. In addition, if any Work Product does not qualify as a work made for hire, the Contractor (a) hereby assigns ' +
                  'and agrees to assign to the Recipient all rights, title, and interest in the Work Product; (b) grants to the Recipient an ' +
                  'irrevocable, exclusive, royalty-free, and perpetual license to any rights in the Work Product that cannot be assigned to the ' +
                  'Recipient; and (c) waives enforcement of any rights (including, without limitation, artist\'s rights or moral rights) in the ' +
                  'Work Product that cannot be assigned or licensed to the Recipient.',
              }),
            ],
          }),

          new Paragraph({ children: [] }),

          // ==================
          // SECTION 6: RECIPIENT'S CONTROL
          // ==================
          new Paragraph({
            children: [
              new TextRun({ text: "6. RECIPIENT'S CONTROL. ", bold: true }),
              new TextRun({
                text: 'Except in extraordinary circumstances and when necessary, the Contractor shall perform the Services without direct supervision by the Recipient.',
              }),
            ],
          }),

          new Paragraph({ children: [] }),

          // ==================
          // SECTION 7: PROFESSIONAL CAPACITY
          // ==================
          new Paragraph({
            children: [
              new TextRun({ text: '7. PROFESSIONAL CAPACITY. ', bold: true }),
              new TextRun({
                text: 'The Contractor is a professional who uses his or her own professional and business methods to perform services. The Contractor ' +
                  'has not and will not receive training from the Recipient regarding how to perform the Services.',
              }),
            ],
          }),

          new Paragraph({ children: [] }),

          // ==================
          // SECTION 8: NO LOCATION ON PREMISES
          // ==================
          new Paragraph({
            children: [
              new TextRun({ text: '8. NO LOCATION ON PREMISES. ', bold: true }),
              new TextRun({
                text: 'The Contractor has no desk or other equipment either located at or furnished by the Recipient. Except to the extent that the ' +
                  "Contractor works in a territory as defined by the Recipient, his or her services are not integrated into the mainstream of the " +
                  "Recipient's business.",
              }),
            ],
          }),

          new Paragraph({ children: [] }),

          // ==================
          // SECTION 9: REPRESENTATIONS AND WARRANTIES
          // ==================
          new Paragraph({
            children: [
              new TextRun({ text: '9. REPRESENTATIONS AND WARRANTIES. ', bold: true }),
              new TextRun({
                text: 'The Contractor represents, warrants and covenants that: (i) the Services will be performed in a professional and workmanlike ' +
                  'manner and that none of such Services or any part of this Agreement is or will be inconsistent with any obligation the Contractor ' +
                  'may have to others; (ii) all work under this Agreement shall be the Contractor\'s original work and none of the Services or Work ' +
                  'Product or any use or exploitation thereof hereunder will infringe, misappropriate or violate any intellectual property or other ' +
                  'right of any person or entity (including, without limitation, the Contractor); (iii) the Contractor has the full right to provide ' +
                  'the Recipient with the assignments and rights provided for herein (and has written enforceable agreements with all persons necessary ' +
                  'to give it the rights to do the foregoing and otherwise fully perform this Agreement); (iv) the Work Product shall be in accordance ' +
                  "with the relevant specifications and the Recipient's written instructions, and any deviation from the specifications and the Recipient's " +
                  'written instructions shall be promptly corrected by Consultant, at its own cost; (v) the Contractor shall comply with all applicable ' +
                  "laws and Recipient safety rules in the course of performing the Services; and (v) if the Contractor's work requires a license, the " +
                  'Contractor has obtained that license and the license is in full force and effect.',
              }),
            ],
          }),

          new Paragraph({ children: [] }),

          // ==================
          // SECTION 10: EXPENSES
          // ==================
          new Paragraph({
            children: [
              new TextRun({ text: '10. EXPENSES PAID BY RECIPIENT. ', bold: true }),
              new TextRun({
                text: "The Contractor's business and travel expenses, when incurred at the request of the Recipient are to be paid by the Recipient.",
              }),
            ],
          }),

          new Paragraph({ children: [] }),

          // ==================
          // SECTION 11: CONFIDENTIALITY
          // ==================
          new Paragraph({
            children: [
              new TextRun({ text: '11. CONFIDENTIALITY. ', bold: true }),
              new TextRun({
                text: 'The Contractor may have had access to proprietary, private and/or otherwise confidential information ("Confidential Information") ' +
                  'of the Recipient. The Contractor agrees to hold all Confidential Information in strict confidence and not to disclose any ' +
                  'Confidential Information to any third party without the prior written consent of the Recipient. Upon termination of this Agreement, ' +
                  'the Contractor shall return all Confidential Information and copies thereof to the Recipient.',
              }),
            ],
          }),

          new Paragraph({ children: [] }),

          // ==================
          // SECTIONS 12-18: STANDARD BOILERPLATE
          // ==================
          new Paragraph({
            children: [
              new TextRun({ text: '12. INDEMNIFICATION. ', bold: true }),
              new TextRun({
                text: 'The Contractor shall indemnify and hold harmless the Recipient from any and all claims, damages, losses, costs, and expenses ' +
                  '(including reasonable attorneys\' fees) arising from the Contractor\'s breach of this Agreement or the Contractor\'s negligent or willful acts or omissions.',
              }),
            ],
          }),

          new Paragraph({ children: [] }),

          new Paragraph({
            children: [
              new TextRun({ text: '13. LIMITATION OF LIABILITY. ', bold: true }),
              new TextRun({
                text: "In no event shall either party be liable to the other for any incidental, consequential, indirect, or special damages of any kind.",
              }),
            ],
          }),

          new Paragraph({ children: [] }),

          new Paragraph({
            children: [
              new TextRun({ text: '14. DISPUTE RESOLUTION. ', bold: true }),
              new TextRun({
                text: 'Any disputes arising out of this Agreement shall first be submitted to mediation. If mediation is unsuccessful, the dispute ' +
                  'shall be submitted to binding arbitration in accordance with the rules of the American Arbitration Association.',
              }),
            ],
          }),

          new Paragraph({ children: [] }),

          new Paragraph({
            children: [
              new TextRun({ text: '15. ENTIRE AGREEMENT. ', bold: true }),
              new TextRun({
                text: 'This Agreement represents the entire agreement between the parties and supersedes all prior negotiations, representations, or agreements, whether written or oral.',
              }),
            ],
          }),

          new Paragraph({ children: [] }),

          new Paragraph({
            children: [
              new TextRun({ text: '16. GOVERNING LAW. ', bold: true }),
              new TextRun({
                text: 'This Agreement shall be governed by the laws of the Commonwealth of Massachusetts.',
              }),
            ],
          }),

          new Paragraph({ children: [] }),

          new Paragraph({
            children: [
              new TextRun({ text: '17. SEVERABILITY. ', bold: true }),
              new TextRun({
                text: 'If any provision of this Agreement is held to be invalid or unenforceable, the remaining provisions shall remain in full force and effect.',
              }),
            ],
          }),

          new Paragraph({ children: [] }),

          new Paragraph({
            children: [
              new TextRun({ text: '18. AMENDMENT. ', bold: true }),
              new TextRun({
                text: 'This Agreement may only be amended in writing signed by both parties.',
              }),
            ],
          }),

          new Paragraph({ children: [] }),

          // ==================
          // SECTION 19: SIGNATORIES
          // ==================
          new Paragraph({
            children: [
              new TextRun({ text: '19. SIGNATORIES. ', bold: true }),
              new TextRun({
                text: `This Agreement shall be signed by Dani Merino-Garcia, VP Research, on behalf of Project InnerSpace, ` +
                  `and by ${contractorName}, on behalf of the Contractor.`,
              }),
            ],
          }),

          new Paragraph({ children: [] }),

          new Paragraph({
            children: [new TextRun({ text: 'This Agreement is effective as of the date first above written.' })],
          }),

          new Paragraph({ children: [] }),
          new Paragraph({ children: [] }),

          new Paragraph({
            children: [new TextRun({ text: 'Daniel Merino-Garcia.\t\t\t\t\t\t\t\tDate' })],
          }),
          new Paragraph({
            children: [new TextRun({ text: 'Project InnerSpace' })],
          }),

          new Paragraph({ children: [] }),
          new Paragraph({ children: [] }),

          new Paragraph({
            children: [new TextRun({ text: `${contractorName}\t\t\t\t\t\t\tDate` })],
          }),
          new Paragraph({
            children: [new TextRun({ text: contractorEmail })],
          }),

          // ==================
          // PAGE BREAK → ANNEX 1
          // ==================
          new Paragraph({
            children: [new PageBreak()],
          }),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'ANNEX 1', bold: true, size: 28 })],
          }),

          new Paragraph({ children: [] }),

          new Paragraph({
            children: [
              new TextRun({
                text: `This Annex 1 attachment supplements the Grant Agreement executed by and between Project InnerSpace, Inc. ` +
                  `and Contractor on ${timeline.effectiveDate} (the "Agreement"). Unless otherwise stated in this Annex, all terms of ` +
                  `the Agreement shall apply to this Annex in full force and effect. Unless otherwise defined herein, all capitalized ` +
                  `terms used in this Annex shall have the meaning ascribed to them in the Agreement. Notwithstanding anything to the ` +
                  `contrary in the Agreement, any inconsistency between the Terms and Conditions and this Annex will be resolved in ` +
                  `favor of this Annex.`,
              }),
            ],
          }),

          new Paragraph({ children: [] }),

          new Paragraph({
            children: [new TextRun({ text: 'Project Name', bold: true })],
          }),
          new Paragraph({
            children: [new TextRun({ text: `The Future of Geothermal Energy in ${stateName} Report: ${chapterName}` })],
          }),

          new Paragraph({ children: [] }),

          new Paragraph({
            children: [
              new TextRun({ text: 'Project Start Date: ', bold: true }),
              new TextRun({ text: timeline.effectiveDate }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Project End Date: ', bold: true }),
              new TextRun({ text: `Publication approval or ${timeline.finalApprovalDate}, whichever is earlier` }),
            ],
          }),

          new Paragraph({ children: [] }),

          new Paragraph({
            children: [new TextRun({ text: 'Milestones', bold: true })],
          }),
          new Paragraph({
            children: [new TextRun({ text: `[M1] ${timeline.expertQDate}: Written answers of chapter "expert" questions` })],
          }),
          new Paragraph({
            children: [new TextRun({ text: `[M2] ${timeline.firstDraftDate}: Contractor Review of InnerSpace's First Internal Draft` })],
          }),
          new Paragraph({
            children: [new TextRun({ text: `[M3] ${timeline.reviewReturnDate}: Delivery of contractor review and edits` })],
          }),
          new Paragraph({
            children: [new TextRun({ text: `[M4] ${timeline.finalApprovalDate}: Approval of publication-ready report` })],
          }),

          new Paragraph({ children: [] }),

          new Paragraph({
            children: [
              new TextRun({
                text: 'Interim meetings will be held throughout the project to ensure it remains on track. The frequency will be agreed ' +
                  'upon by the Contractor and a Project InnerSpace assigned point of contact. Project InnerSpace may include peer ' +
                  'reviewers from the broader geothermal community throughout the course of the collaboration.',
              }),
            ],
          }),

          new Paragraph({ children: [] }),

          new Paragraph({
            children: [new TextRun({ text: 'Commitments/Outreach', bold: true })],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Project InnerSpace intends to disseminate the Project's results in various formats to reach the scientific, policy, " +
                  'and general audiences. Project InnerSpace requires the Contractor to be willing to present and/or engage in various ' +
                  'actions over the course of 6 months after publication.',
              }),
            ],
          }),

          new Paragraph({ children: [] }),

          new Paragraph({
            children: [new TextRun({ text: 'Potential engagements include, but are not limited to:' })],
          }),
          new Paragraph({
            children: [new TextRun({ text: 'Discussion of Project results with policymakers.' })],
          }),
          new Paragraph({
            children: [new TextRun({ text: 'Comment on subsequent peer review requests involving other Project InnerSpace-funded projects covering similar topics.' })],
          }),

          new Paragraph({ children: [] }),

          new Paragraph({
            children: [new TextRun({ text: 'Project Scope', bold: true })],
          }),
          // Split scope text into paragraphs by newlines
          ...scopeText.split('\n').filter(line => line.trim()).map(
            (line) => new Paragraph({ children: [new TextRun({ text: line.trim() })] })
          ),
        ],
      },
    ],
  });

  // Pack the document into a Blob
  const blob = await Packer.toBlob(doc);
  return blob;
}

// ============================================
// GOOGLE DRIVE UPLOAD
// ============================================

/**
 * Upload a generated contract DOCX to Google Drive contracts folder.
 * Returns the file ID and download URL.
 */
export async function uploadContractToDrive(
  blob: Blob,
  filename: string
): Promise<{ fileId: string; webViewLink: string } | null> {
  // Helper: attempt a single upload
  const tryUpload = async (token: string): Promise<Response> => {
    const metadata = {
      name: filename,
      parents: [CONTRACTS_FOLDER_ID],
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };

    const form = new FormData();
    form.append(
      'metadata',
      new Blob([JSON.stringify(metadata)], { type: 'application/json' })
    );
    form.append('file', blob, filename);

    return fetch(
      `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      }
    );
  };

  let token = await getGoogleTokenAsync();
  if (!token) {
    console.error('[ContractGenerator] No Google token available for Drive upload');
    return null;
  }

  try {
    console.log('[ContractGenerator] Uploading to Drive:', filename);

    let response = await tryUpload(token);

    // If 401, force a token refresh and retry once
    if (response.status === 401) {
      console.warn('[ContractGenerator] Drive upload got 401 — forcing token refresh and retry');
      try {
        const { refreshGoogleTokenNow } = await import('./tokenRefresh');
        const refreshed = await refreshGoogleTokenNow();
        if (refreshed) {
          token = refreshed;
          response = await tryUpload(token);
        }
      } catch (refreshErr) {
        console.error('[ContractGenerator] Token refresh failed during retry:', refreshErr);
      }
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('[ContractGenerator] Drive upload failed:', response.status, JSON.stringify(err));
      return null;
    }

    const result = await response.json();
    console.log('[ContractGenerator] Uploaded to Drive:', result.id, result.webViewLink);

    return {
      fileId: result.id,
      webViewLink: result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`,
    };
  } catch (error) {
    console.error('[ContractGenerator] Upload error:', error);
    return null;
  }
}

// ============================================
// HIGH-LEVEL CONTRACT GENERATION FLOW
// ============================================

export interface GeneratedContract {
  blob: Blob;
  filename: string;
  base64: string;
  mimeType: string;
  timeline: ContractTimeline;
  driveFileId?: string;
  driveWebViewLink?: string;
}

/**
 * Generate a contract and upload to Google Drive.
 * Returns the contract blob (for email attachment) and Drive upload info.
 */
export async function generateAndUploadContract(params: {
  contractorName: string;
  contractorEmail: string;
  state: GeodeState;
  chapterType: string;
  chapterName: string;
  chapterNum: string;
  chapterScopeText?: string;
  paymentAmount?: number;
}): Promise<GeneratedContract | null> {
  const stateInfo = GEODE_STATES.find(s => s.value === params.state);
  if (!stateInfo) {
    console.error('[ContractGenerator] Unknown state:', params.state);
    return null;
  }

  // Calculate timeline from DOE deadline
  const timeline = calculateContractTimeline(params.state);

  console.log('[ContractGenerator] Generating contract:', {
    contractor: params.contractorName,
    state: stateInfo.label,
    chapter: params.chapterName,
    timeline: timeline.timelineType,
    buffer: `${timeline.bufferDays} days before DOE deadline`,
  });

  // Build filename: InnerSpace_Agreement_{STATE}_{Chapter}_{Initials}.docx
  const initials = params.contractorName
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase())
    .join('');
  const chapterSlug = params.chapterName.replace(/\s+/g, '_');
  const filename = `InnerSpace_Agreement_${stateInfo.abbreviation}_${chapterSlug}_${initials}.docx`;

  try {
    // Generate DOCX
    const blob = await generateContractDocx({
      contractorName: params.contractorName,
      contractorEmail: params.contractorEmail,
      state: params.state,
      stateName: stateInfo.label,
      chapterName: params.chapterName,
      chapterType: params.chapterType,
      chapterNum: params.chapterNum,
      timeline,
      chapterScopeText: params.chapterScopeText,
      paymentAmount: params.paymentAmount,
    });

    console.log('[ContractGenerator] DOCX generated:', filename, `(${Math.round(blob.size / 1024)}KB)`);

    // Convert to base64 for email attachment
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    const result: GeneratedContract = {
      blob,
      filename,
      base64,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      timeline,
    };

    // Upload to Google Drive
    const driveResult = await uploadContractToDrive(blob, filename);
    if (driveResult) {
      result.driveFileId = driveResult.fileId;
      result.driveWebViewLink = driveResult.webViewLink;
      console.log('[ContractGenerator] Contract uploaded to Drive:', driveResult.webViewLink);
    } else {
      console.warn('[ContractGenerator] Drive upload failed — contract will still be attached to email');
    }

    return result;
  } catch (error) {
    console.error('[ContractGenerator] Generation failed:', error);
    return null;
  }
}
