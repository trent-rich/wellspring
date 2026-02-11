/**
 * GEODE Action Executor
 *
 * Executes the actions defined in GeodeConfirmationTask.pendingActions
 * This includes:
 * - Generating contract emails (drafts in Gmail)
 * - Updating chapter status
 * - Logging author information
 */

import {
  createDraft,
  createDraftWithAttachment,
  isGmailConnected,
  getAttachment,
  findEmailWithAttachment,
  type DraftEmailOptions,
} from './gmailService';
import type { GeodeSuggestedAction, GeodeConfirmationTask } from '../types/geodeEmailEvents';
import { GEODE_STATES, GEODE_CHAPTER_TYPES } from '../types/geode';
import { getGoogleTokenAsync } from './googleCalendar';
import { generateAndUploadContract, type GeneratedContract } from './contractGenerator';

// ============================================
// GOOGLE DRIVE - Contract File Lookup
// ============================================

// Contracts folder in Google Drive
const CONTRACTS_FOLDER_ID = '1su4hSG2DDjJ-t2Oi7q_39HeaYQD8IIfj';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

/**
 * Search Google Drive contracts folder for a file matching state/author
 * Naming convention: InnerSpace_Agreement_{STATE}_{Chapter}_{Initials}.pdf
 * Returns base64-encoded file content if found
 */
async function findContractInDrive(
  stateAbbrev: string,
  authorName: string,
  chapterTitle: string
): Promise<{ filename: string; mimeType: string; content: string } | null> {
  const token = await getGoogleTokenAsync();
  if (!token) {
    console.log('[ContractDrive] No Google token available');
    return null;
  }

  try {
    // Search for files in the contracts folder
    // Use a broad query — we'll filter client-side for best match
    const query = `'${CONTRACTS_FOLDER_ID}' in parents and trashed = false`;
    const fields = 'files(id,name,mimeType,size)';

    const listUrl = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=100`;
    console.log('[ContractDrive] Listing files in contracts folder...');

    const listResponse = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!listResponse.ok) {
      const err = await listResponse.json().catch(() => ({}));
      console.error('[ContractDrive] List failed:', listResponse.status, err);
      return null;
    }

    const listData = await listResponse.json();
    const files: Array<{ id: string; name: string; mimeType: string; size?: string }> = listData.files || [];

    if (files.length === 0) {
      console.log('[ContractDrive] No files in contracts folder');
      return null;
    }

    console.log('[ContractDrive] Found', files.length, 'files:', files.map(f => f.name));

    // Build matching criteria
    const initials = authorName
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase())
      .join('');
    const normalizedChapter = chapterTitle.replace(/[^a-zA-Z]/g, '').toLowerCase();
    const lastName = authorName.split(/\s+/).pop()?.toLowerCase() || '';

    const matchFile = (filename: string): boolean => {
      const lower = filename.toLowerCase();
      const abbrevLower = stateAbbrev.toLowerCase();

      // Must match state abbreviation
      if (!lower.includes(abbrevLower) && !lower.includes(`_${abbrevLower}_`) && !lower.includes(`_${abbrevLower}.`)) {
        return false;
      }

      // Then match by initials, chapter name, or author last name
      if (lower.includes(initials.toLowerCase())) return true;
      if (lower.includes(normalizedChapter)) return true;
      if (lastName.length > 2 && lower.includes(lastName)) return true;
      return false;
    };

    // Prefer PDFs over Word docs
    const pdfs = files.filter(f => f.name.endsWith('.pdf'));
    const docs = files.filter(f => f.name.endsWith('.docx') || f.name.endsWith('.doc'));

    const matchedPdf = pdfs.find(f => matchFile(f.name));
    const matchedDoc = docs.find(f => matchFile(f.name));
    const matched = matchedPdf || matchedDoc;

    if (!matched) {
      // Fallback: match state abbreviation only (broader match)
      const stateMatch = pdfs.find(f => f.name.toLowerCase().includes(stateAbbrev.toLowerCase()))
        || docs.find(f => f.name.toLowerCase().includes(stateAbbrev.toLowerCase()));

      if (!stateMatch) {
        console.log('[ContractDrive] No matching file for', authorName, stateAbbrev);
        return null;
      }

      console.log('[ContractDrive] Using state-level match:', stateMatch.name);
      return await downloadDriveFile(stateMatch, token);
    }

    console.log('[ContractDrive] Best match:', matched.name);
    return await downloadDriveFile(matched, token);
  } catch (error) {
    console.error('[ContractDrive] Error:', error);
    return null;
  }
}

/**
 * Download a file from Google Drive and return as base64
 */
async function downloadDriveFile(
  file: { id: string; name: string; mimeType: string },
  token: string
): Promise<{ filename: string; mimeType: string; content: string } | null> {
  try {
    const downloadUrl = `${DRIVE_API_BASE}/files/${file.id}?alt=media`;
    console.log('[ContractDrive] Downloading:', file.name);

    const downloadResponse = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!downloadResponse.ok) {
      console.error('[ContractDrive] Download failed:', downloadResponse.status);
      return null;
    }

    const blob = await downloadResponse.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    // Determine mime type
    const isPdf = file.name.endsWith('.pdf');
    const mimeType = isPdf
      ? 'application/pdf'
      : file.mimeType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    console.log('[ContractDrive] Loaded:', file.name, `(${Math.round(base64.length / 1024)}KB base64)`);

    return {
      filename: file.name,
      mimeType,
      content: base64,
    };
  } catch (error) {
    console.error('[ContractDrive] Download error:', error);
    return null;
  }
}

// ============================================
// TYPES
// ============================================

export interface ActionExecutionResult {
  actionId: string;
  success: boolean;
  message: string;
  artifacts?: {
    type: 'draft' | 'status_update' | 'log_entry';
    id?: string;
    url?: string;
    details?: Record<string, unknown>;
  }[];
}

export interface TaskExecutionResult {
  taskId: string;
  success: boolean;
  results: ActionExecutionResult[];
  summary: string;
}

// ============================================
// CONTRACT EMAIL TEMPLATES
// ============================================

interface ContractEmailParams {
  authorName: string;
  authorEmail: string;
  stateName: string;
  stateAbbrev: string;
  chapterTitle: string;
  chapterNum: string;
  recipientName: string;
  recipientEmail: string;
  ccEmails?: string[];
}

function generateContractEmailDraft(params: ContractEmailParams): DraftEmailOptions {
  const { authorName, stateName, chapterTitle, chapterNum, recipientName, ccEmails } = params;

  const subject = `${stateName} Geothermal Report - Contractor Agreement (${authorName})`;

  const body = `${recipientName},

${authorName} (${params.authorEmail}) has agreed to contribute to the ${stateName} GEODE report as the bylined author for Chapter ${chapterNum}: ${chapterTitle}. Could you please send the contributor agreement for e-signature?

Author: ${authorName}
Email: ${params.authorEmail}
Chapter: ${chapterNum} - ${chapterTitle}
Report: ${stateName} State Geothermal Data Report

Once it's signed and returned, please save the executed agreement to the Admin Google Share drive in the Contractor folder and let me know so we can proceed with onboarding.

Thanks,
Trent`;

  return {
    to: [params.recipientEmail],
    cc: ccEmails,
    subject,
    body,
    isHtml: false,
  };
}

interface AccountingEmailParams {
  authorName: string;
  authorEmail: string;
  stateName: string;
  stateAbbrev: string;
  chapterTitle: string;
  chapterNum: string;
  recipientName: string;
  recipientEmail: string;
  ccEmails?: string[];
}

function generateAccountingEmailDraft(params: AccountingEmailParams): DraftEmailOptions {
  const { authorName, stateName, stateAbbrev, chapterTitle, chapterNum, recipientName, ccEmails } = params;

  const subject = `New Contractor Setup - ${authorName} (${stateAbbrev} GEODE)`;

  const body = `${recipientName},

We have a new contractor to set up in Gusto. The contract has been signed.

Name: ${authorName}
Email: ${params.authorEmail}
Project: GEODE ${stateName} State Report
Chapter: ${chapterNum} - ${chapterTitle}

Could you please set up the contractor in Gusto and trigger the onboarding email? The signed contract details have been uploaded to Monday.com on the GEODE Payments board under the ${stateName} group.

Thanks,
Trent`;

  return {
    to: [params.recipientEmail],
    cc: ccEmails,
    subject,
    body,
    isHtml: false,
  };
}

// ============================================
// OUTREACH EMAIL TEMPLATES
// ============================================

interface OutreachEmailParams {
  authorName: string;
  authorEmail: string;
  stateName: string;
  stateAbbrev: string;
  chapterTitle: string;
  chapterNum: string;
  senderName: string;
}

function generateOutreachEmailDraft(params: OutreachEmailParams): DraftEmailOptions {
  const { authorName, authorEmail, stateName, chapterTitle, chapterNum } = params;

  // Use first name for the greeting
  const firstName = authorName.split(' ')[0];

  const subject = `${stateName} Geothermal Report - ${chapterTitle} Chapter`;

  const body = `Dear ${firstName},

I'm reaching out from Project InnerSpace about a DOE-funded initiative called GEODE—Geothermal Data for Energy Decisions. We're developing a state geothermal data report for ${stateName}, and based on your expertise, I wanted to see if you'd be interested in being a named contributor on the ${chapterTitle.toLowerCase()} chapter (Ch ${chapterNum}).

The commitment is manageable—providing bulleted responses to a set of questions we supply, and then editing our ghostwritten draft to ensure you're comfortable putting your name on the work.

I'm attaching the formal contributor agreement with details on scope, timeline, and compensation. If you could review it and let me know if everything looks good, my colleague Karine, who is CC'd, can assist with sending it for e-signature.

I'd be happy to jump on a call if you'd like to discuss further. Let me know if you're interested or have any questions.

Best regards,
Trent McFadyen
Director of Strategic Initiatives | Project InnerSpace`;

  return {
    to: [authorEmail],
    subject,
    body,
    isHtml: false,
  };
}

// ============================================
// ACTION EXECUTORS
// ============================================

// Store the last generated contract so the outreach email step can attach it
let lastGeneratedContract: GeneratedContract | null = null;

/**
 * Execute: generate_outreach_contract
 * Generates an Independent Contractor Agreement DOCX in the browser,
 * uploads to Google Drive, and stores it for the next email step.
 *
 * Timeline dates are calculated by working backwards from the DOE deadline
 * for the state, using buffer logic from email-ghostwriter/LEARNED_CHANGES.md:
 * - Tight timelines (≤8 weeks): compressed 37-day schedule
 * - Medium timelines (>8 weeks): standard 42-day schedule
 * - Always leaves 2-3 week buffer before DOE deadline
 */
async function executeGenerateOutreachContract(
  action: GeodeSuggestedAction,
  task: GeodeConfirmationTask
): Promise<ActionExecutionResult> {
  const stateInfo = task.state ? GEODE_STATES.find(s => s.value === task.state) : null;
  const chapterInfo = task.chapterType ? GEODE_CHAPTER_TYPES.find(c => c.value === task.chapterType) : null;

  if (!stateInfo || !chapterInfo) {
    return {
      actionId: action.id,
      success: false,
      message: 'Missing required information (state or chapter)',
    };
  }

  const authorName = task.authorName || 'Author TBD';
  const authorEmail = task.authorEmail || 'author@tbd.com';

  console.log('[ActionExecutor] Generating outreach contract for:', {
    authorName,
    authorEmail,
    state: stateInfo.label,
    chapter: chapterInfo.label,
  });

  // Generate the contract DOCX and upload to Google Drive
  const contract = await generateAndUploadContract({
    contractorName: authorName,
    contractorEmail: authorEmail,
    state: task.state!,
    chapterType: task.chapterType!,
    chapterName: chapterInfo.label,
    chapterNum: chapterInfo.chapterNum,
  });

  if (!contract) {
    return {
      actionId: action.id,
      success: false,
      message: `Failed to generate contract for ${authorName}. Check console for details.`,
    };
  }

  // Store for the email step to pick up
  lastGeneratedContract = contract;

  const driveInfo = contract.driveWebViewLink
    ? ` Uploaded to Google Drive: ${contract.driveWebViewLink}`
    : ' (Drive upload failed — will attach directly to email)';

  return {
    actionId: action.id,
    success: true,
    message: `Contract generated: ${contract.filename} (${contract.timeline.timelineType} timeline, ${contract.timeline.bufferDays} days buffer before DOE deadline).${driveInfo}`,
    artifacts: [
      {
        type: 'log_entry',
        details: {
          action: 'outreach_contract_generation',
          authorName,
          authorEmail,
          state: stateInfo.value,
          stateAbbrev: stateInfo.abbreviation,
          chapter: chapterInfo.value,
          chapterNum: chapterInfo.chapterNum,
          chapterTitle: chapterInfo.label,
          filename: contract.filename,
          driveFileId: contract.driveFileId,
          driveWebViewLink: contract.driveWebViewLink,
          timelineType: contract.timeline.timelineType,
          expertQDate: contract.timeline.expertQDate,
          firstDraftDate: contract.timeline.firstDraftDate,
          reviewReturnDate: contract.timeline.reviewReturnDate,
          grammarProofDate: contract.timeline.grammarProofDate,
          finalApprovalDate: contract.timeline.finalApprovalDate,
          doeDeadline: contract.timeline.doeDeadline,
          bufferDays: contract.timeline.bufferDays,
        },
      },
    ],
  };
}

/**
 * Execute: send_outreach_email
 * Creates a Gmail draft to send to the PROSPECTIVE author with the contract attached
 */
async function executeSendOutreachEmail(
  action: GeodeSuggestedAction,
  task: GeodeConfirmationTask
): Promise<ActionExecutionResult> {
  if (!isGmailConnected()) {
    return {
      actionId: action.id,
      success: false,
      message: 'Gmail is not connected. Please connect your Google account in Settings.',
    };
  }

  const stateInfo = task.state ? GEODE_STATES.find(s => s.value === task.state) : null;
  const chapterInfo = task.chapterType ? GEODE_CHAPTER_TYPES.find(c => c.value === task.chapterType) : null;

  if (!stateInfo || !chapterInfo) {
    return {
      actionId: action.id,
      success: false,
      message: 'Missing required information (state or chapter)',
    };
  }

  const authorName = task.authorName || 'Prospective Author';
  const authorEmail = task.authorEmail;

  if (!authorEmail) {
    return {
      actionId: action.id,
      success: false,
      message: 'Author email is required to send outreach email',
    };
  }

  const emailOptions = generateOutreachEmailDraft({
    authorName,
    authorEmail,
    stateName: stateInfo.label,
    stateAbbrev: stateInfo.abbreviation,
    chapterTitle: chapterInfo.label,
    chapterNum: chapterInfo.chapterNum,
    senderName: 'Trent McFadyen', // TODO: Get from user profile
  });

  // Try to find contract attachment
  let attachment: { filename: string; mimeType: string; content: string } | undefined;
  let attachmentSource = '';

  // PRIORITY 1: Use the contract generated in the previous step (generate_outreach_contract)
  if (lastGeneratedContract) {
    console.log('[ActionExecutor] Using freshly generated contract:', lastGeneratedContract.filename);
    attachment = {
      filename: lastGeneratedContract.filename,
      mimeType: lastGeneratedContract.mimeType,
      content: lastGeneratedContract.base64,
    };
    attachmentSource = 'generated';
    // Clear after use
    lastGeneratedContract = null;
  }

  // PRIORITY 2: Search Google Drive for existing contract
  if (!attachment) {
    console.log('[ActionExecutor] Searching for outreach contract in Google Drive...');
    const storageResult = await findContractInDrive(
      stateInfo.abbreviation,
      authorName,
      chapterInfo.label
    );

    if (storageResult) {
      attachment = storageResult;
      attachmentSource = 'Google Drive';
      console.log('[ActionExecutor] Found contract in Drive:', storageResult.filename);
    }
  }

  // Create draft with or without attachment
  let result;
  if (attachment) {
    console.log(`[ActionExecutor] Creating outreach draft with attachment from ${attachmentSource}:`, attachment.filename);
    result = await createDraftWithAttachment({
      ...emailOptions,
      attachment,
    });
  } else {
    console.log('[ActionExecutor] Creating outreach draft without attachment (please add manually)');
    result = await createDraft(emailOptions);
  }

  console.log('[ActionExecutor] createDraft result:', result);

  if (result.success) {
    return {
      actionId: action.id,
      success: true,
      message: attachment
        ? `Outreach email draft created for ${authorName} with contract attached (${attachment.filename})`
        : `Outreach email draft created for ${authorName}. NOTE: Please attach the contract document manually before sending.`,
      artifacts: [
        {
          type: 'draft',
          id: result.draftId,
          url: `https://mail.google.com/mail/u/0/#drafts`,
          details: {
            to: authorEmail,
            subject: emailOptions.subject,
            hasAttachment: !!attachment,
            attachmentName: attachment?.filename,
            attachmentSource,
            workflowType: 'author_outreach',
          },
        },
      ],
    };
  } else {
    return {
      actionId: action.id,
      success: false,
      message: result.error || 'Failed to create outreach email draft',
    };
  }
}

/**
 * Execute: generate_contract
 * Creates a draft email to Dani with contract details
 */
async function executeGenerateContract(
  action: GeodeSuggestedAction,
  task: GeodeConfirmationTask
): Promise<ActionExecutionResult> {
  if (!isGmailConnected()) {
    return {
      actionId: action.id,
      success: false,
      message: 'Gmail is not connected. Please connect your Google account in Settings.',
    };
  }

  const stateInfo = task.state ? GEODE_STATES.find(s => s.value === task.state) : null;
  const chapterInfo = task.chapterType ? GEODE_CHAPTER_TYPES.find(c => c.value === task.chapterType) : null;

  if (!stateInfo || !chapterInfo) {
    return {
      actionId: action.id,
      success: false,
      message: 'Missing required information (state or chapter)',
    };
  }

  // Use author info if available, otherwise use placeholder from task title
  const authorName = task.authorName || 'Author TBD';

  // For now, just note that this would generate the contract
  // The actual PDF generation would require a template system
  return {
    actionId: action.id,
    success: true,
    message: `Contract generation noted for ${authorName} (${stateInfo.abbreviation} ${chapterInfo.label}). PDF generation pending implementation.`,
    artifacts: [
      {
        type: 'log_entry',
        details: {
          action: 'contract_generation_requested',
          authorName: task.authorName,
          state: stateInfo.value,
          chapter: chapterInfo.value,
        },
      },
    ],
  };
}

/**
 * Execute: send_contract
 * Creates a draft email to the specified recipient (usually Dani) about the contract
 *
 * Attachment lookup priority:
 * 1. Local PDF in "GEODE Signature Ready Contracts" folder (preferred)
 * 2. Local PDF converted from Word doc (if Word doc exists but no PDF)
 * 3. Fallback to Gmail search for attachments
 */
async function executeSendContract(
  action: GeodeSuggestedAction,
  task: GeodeConfirmationTask
): Promise<ActionExecutionResult> {
  if (!isGmailConnected()) {
    return {
      actionId: action.id,
      success: false,
      message: 'Gmail is not connected. Please connect your Google account in Settings.',
    };
  }

  const stateInfo = task.state ? GEODE_STATES.find(s => s.value === task.state) : null;
  const chapterInfo = task.chapterType ? GEODE_CHAPTER_TYPES.find(c => c.value === task.chapterType) : null;

  if (!stateInfo || !chapterInfo) {
    return {
      actionId: action.id,
      success: false,
      message: 'Missing required information (state or chapter)',
    };
  }

  // Use author info if available, otherwise use placeholders
  const authorName = task.authorName || 'Author TBD';
  const authorEmail = task.authorEmail || 'author@tbd.com';

  const recipientEmail = action.params.toEmail || 'dani@projectinnerspace.org';
  const recipientName = action.params.toName || 'Dani';
  const ccEmails = action.params.ccEmails ? action.params.ccEmails.split(',').map(e => e.trim()) : undefined;

  const emailOptions = generateContractEmailDraft({
    authorName: authorName,
    authorEmail: authorEmail,
    stateName: stateInfo.label,
    stateAbbrev: stateInfo.abbreviation,
    chapterTitle: chapterInfo.label,
    chapterNum: chapterInfo.chapterNum,
    recipientName,
    recipientEmail,
    ccEmails,
  });

  // Try to get the contract attachment
  let attachment: { filename: string; mimeType: string; content: string } | undefined;
  let attachmentSource = '';

  // PRIORITY 1: Search Supabase Storage for contract file
  console.log('[ActionExecutor] Searching for contract in Google Drive...');
  const storageContract = await findContractInDrive(
    stateInfo.abbreviation,
    authorName,
    chapterInfo.label
  );

  if (storageContract) {
    attachment = storageContract;
    attachmentSource = 'Google Drive';
    console.log('[ActionExecutor] Found contract in storage:', storageContract.filename);
  }

  // PRIORITY 2: Check if task has a stored contract attachment reference (from Gmail)
  if (!attachment && task.contractAttachment) {
    console.log('[ActionExecutor] Trying stored contract attachment reference:', task.contractAttachment);
    try {
      const attachmentData = await getAttachment(
        task.contractAttachment.sourceEmailId,
        task.contractAttachment.attachmentId
      );
      attachment = {
        filename: task.contractAttachment.filename,
        mimeType: task.contractAttachment.mimeType,
        content: attachmentData.data,
      };
      attachmentSource = 'stored reference';
      console.log('[ActionExecutor] Successfully retrieved attachment from stored reference');
    } catch (error) {
      console.warn('[ActionExecutor] Failed to get attachment from stored reference:', error);
    }
  }

  // PRIORITY 3: Search Gmail for contract attachment (fallback)
  if (!attachment) {
    console.log('[ActionExecutor] Searching Gmail for contract attachment...');

    const searchQueries = [
      `to:${task.authorEmail} has:attachment in:sent`,
      `to:${task.authorName?.split(' ')[0]} has:attachment in:sent`,
      task.state ? `subject:"${stateInfo?.abbreviation || ''} Geothermal Report" has:attachment in:sent` : null,
      task.state ? `subject:${stateInfo?.label || task.state} has:attachment in:sent` : null,
      `subject:agreement has:attachment in:sent`,
      `subject:contract has:attachment in:sent`,
    ].filter(Boolean) as string[];

    for (const searchQuery of searchQueries) {
      console.log('[ActionExecutor] Trying Gmail search:', searchQuery);
      const found = await findEmailWithAttachment(searchQuery, undefined, true);

      if (found.message && found.attachment) {
        // Prefer PDF over Word doc from Gmail
        if (found.attachment.mimeType === 'application/pdf' ||
            !attachment ||
            attachment.mimeType !== 'application/pdf') {
          console.log('[ActionExecutor] Found attachment in Gmail:', found.attachment.filename);
          try {
            const attachmentData = await getAttachment(
              found.message.id,
              found.attachment.attachmentId
            );
            attachment = {
              filename: found.attachment.filename,
              mimeType: found.attachment.mimeType,
              content: attachmentData.data,
            };
            attachmentSource = 'gmail';

            // If we found a PDF, stop searching
            if (found.attachment.mimeType === 'application/pdf') {
              break;
            }
          } catch (error) {
            console.warn('[ActionExecutor] Failed to retrieve Gmail attachment:', error);
          }
        }
      }
    }
  }

  // Create draft with or without attachment
  let result;
  if (attachment) {
    console.log(`[ActionExecutor] Creating draft with attachment from ${attachmentSource}:`, attachment.filename);
    result = await createDraftWithAttachment({
      ...emailOptions,
      attachment,
    });
  } else {
    console.log('[ActionExecutor] No attachment found, creating draft without attachment');
    console.log('[ActionExecutor] Email options:', {
      to: emailOptions.to,
      subject: emailOptions.subject,
      bodyLength: emailOptions.body.length,
    });
    result = await createDraft(emailOptions);
  }

  console.log('[ActionExecutor] createDraft result:', result);

  if (result.success) {
    const isPdf = attachment?.mimeType === 'application/pdf';
    return {
      actionId: action.id,
      success: true,
      message: attachment
        ? `Draft email created to ${recipientName} with ${isPdf ? 'PDF' : 'Word doc'} attached (${attachment.filename}) [source: ${attachmentSource}]`
        : `Draft email created to ${recipientName} about ${task.authorName}'s contract (no attachment found - please add manually)`,
      artifacts: [
        {
          type: 'draft',
          id: result.draftId,
          url: `https://mail.google.com/mail/u/0/#drafts`,
          details: {
            to: recipientEmail,
            cc: ccEmails,
            subject: emailOptions.subject,
            hasAttachment: !!attachment,
            attachmentName: attachment?.filename,
            attachmentSource,
            isPdf,
          },
        },
      ],
    };
  } else {
    return {
      actionId: action.id,
      success: false,
      message: result.error || 'Failed to create email draft',
    };
  }
}

/**
 * Execute: advance_step
 * Would update the chapter workflow state
 */
async function executeAdvanceStep(
  action: GeodeSuggestedAction,
  task: GeodeConfirmationTask
): Promise<ActionExecutionResult> {
  const newStep = action.params.newStep;

  if (!newStep) {
    return {
      actionId: action.id,
      success: false,
      message: 'No target step specified',
    };
  }

  // This would integrate with the geodeChapterStore
  // For now, we'll return success and let the UI handle the actual update
  return {
    actionId: action.id,
    success: true,
    message: `Chapter status should be updated to: ${newStep}`,
    artifacts: [
      {
        type: 'status_update',
        details: {
          newStep,
          state: task.state,
          chapterType: task.chapterType,
        },
      },
    ],
  };
}

/**
 * Execute: log_communication
 * Logs author information to the chapter record
 */
async function executeLogCommunication(
  action: GeodeSuggestedAction,
  task: GeodeConfirmationTask
): Promise<ActionExecutionResult> {
  // This would integrate with the geodeChapterStore to save author info
  return {
    actionId: action.id,
    success: true,
    message: `Logged: ${task.authorName} (${task.authorEmail}) for ${task.state} ${task.chapterType}`,
    artifacts: [
      {
        type: 'log_entry',
        details: {
          authorName: task.authorName,
          authorEmail: task.authorEmail,
          state: task.state,
          chapterType: task.chapterType,
        },
      },
    ],
  };
}

/**
 * Execute: notify_accounting
 * Creates a draft email to accounting team about new contractor setup
 */
async function executeNotifyAccounting(
  action: GeodeSuggestedAction,
  task: GeodeConfirmationTask
): Promise<ActionExecutionResult> {
  if (!isGmailConnected()) {
    return {
      actionId: action.id,
      success: false,
      message: 'Gmail is not connected. Please connect your Google account in Settings.',
    };
  }

  const stateInfo = task.state ? GEODE_STATES.find(s => s.value === task.state) : null;
  const chapterInfo = task.chapterType ? GEODE_CHAPTER_TYPES.find(c => c.value === task.chapterType) : null;

  if (!stateInfo || !chapterInfo || !task.authorName || !task.authorEmail) {
    return {
      actionId: action.id,
      success: false,
      message: 'Missing required information (state, chapter, author name, or email)',
    };
  }

  const recipientEmail = action.params.toEmail || 'accounting@projectinnerspace.org';
  const recipientName = action.params.toName || 'Accounting Team';
  const ccEmails = action.params.ccEmails ? action.params.ccEmails.split(',').map(e => e.trim()) : undefined;

  const emailOptions = generateAccountingEmailDraft({
    authorName: task.authorName,
    authorEmail: task.authorEmail,
    stateName: stateInfo.label,
    stateAbbrev: stateInfo.abbreviation,
    chapterTitle: chapterInfo.label,
    chapterNum: chapterInfo.chapterNum,
    recipientName,
    recipientEmail,
    ccEmails,
  });

  const result = await createDraft(emailOptions);

  if (result.success) {
    return {
      actionId: action.id,
      success: true,
      message: `Draft email created to ${recipientName} for contractor setup`,
      artifacts: [
        {
          type: 'draft',
          id: result.draftId,
          url: `https://mail.google.com/mail/u/0/#drafts`,
          details: {
            to: recipientEmail,
            cc: ccEmails,
            subject: emailOptions.subject,
          },
        },
      ],
    };
  } else {
    return {
      actionId: action.id,
      success: false,
      message: result.error || 'Failed to create accounting email draft',
    };
  }
}

/**
 * Execute: upload_contract_monday
 * Adds author to the GEODE Payments board under the appropriate state group
 * Per SOP: Contract owner uploads contract details to Monday.com
 * Board: GEODE Payments - Report Contributors (5640622226)
 */
async function executeUploadContractMonday(
  action: GeodeSuggestedAction,
  task: GeodeConfirmationTask
): Promise<ActionExecutionResult> {
  const stateInfo = task.state ? GEODE_STATES.find(s => s.value === task.state) : null;
  const chapterInfo = task.chapterType ? GEODE_CHAPTER_TYPES.find(c => c.value === task.chapterType) : null;

  if (!stateInfo || !chapterInfo || !task.authorName || !task.authorEmail) {
    return {
      actionId: action.id,
      success: false,
      message: 'Missing required information (state, chapter, author name, or email)',
    };
  }

  // Check if Monday.com API token is configured
  const mondayToken = localStorage.getItem('monday_api_token');
  if (!mondayToken) {
    return {
      actionId: action.id,
      success: false,
      message: 'Monday.com is not connected. Please configure API token in Settings.',
    };
  }

  // Import dynamically to avoid circular dependencies
  const { addAuthorToPaymentsBoard } = await import('./mondayService');

  const result = await addAuthorToPaymentsBoard(mondayToken, {
    name: task.authorName,
    email: task.authorEmail,
    state: task.state || '',
    chapterType: task.chapterType || '',
    chapterTitle: chapterInfo.label,
    chapterNum: chapterInfo.chapterNum,
    contractSignedDate: new Date().toISOString().split('T')[0],
  });

  if (result.success) {
    return {
      actionId: action.id,
      success: true,
      message: `Author added to GEODE Payments board under ${stateInfo.label} group (Item ID: ${result.itemId})`,
      artifacts: [
        {
          type: 'status_update',
          id: result.itemId,
          url: action.params.boardUrl || 'https://projectinnerspace.monday.com/boards/5640622226',
          details: {
            itemId: result.itemId,
            author: task.authorName,
            state: stateInfo.label,
            chapter: `${chapterInfo.chapterNum} - ${chapterInfo.label}`,
          },
        },
      ],
    };
  } else {
    return {
      actionId: action.id,
      success: false,
      message: result.error || 'Failed to add author to Payments board',
    };
  }
}

/**
 * Execute: send_welcome_email
 * Creates a draft welcome email to the author with next steps
 * Per SOP: Contract owner sends executed agreement to contractor and communicates next steps
 */
async function executeSendWelcomeEmail(
  action: GeodeSuggestedAction,
  task: GeodeConfirmationTask
): Promise<ActionExecutionResult> {
  if (!isGmailConnected()) {
    return {
      actionId: action.id,
      success: false,
      message: 'Gmail is not connected. Please connect your Google account in Settings.',
    };
  }

  const stateInfo = task.state ? GEODE_STATES.find(s => s.value === task.state) : null;
  const chapterInfo = task.chapterType ? GEODE_CHAPTER_TYPES.find(c => c.value === task.chapterType) : null;

  if (!stateInfo || !chapterInfo || !task.authorName || !task.authorEmail) {
    return {
      actionId: action.id,
      success: false,
      message: 'Missing required information (state, chapter, author name, or email)',
    };
  }

  const firstName = task.authorName?.split(' ')[0] || task.authorName;
  const subject = `${stateInfo.label} Geothermal Report - Next Steps (Ch ${chapterInfo.chapterNum}: ${chapterInfo.label})`;

  const body = `Dear ${firstName},

Attached is the fully executed agreement for your files. I'm excited to kick off our work together.

A few next steps:

1. Our accounting team will be in touch shortly to set up your contractor profile for payment processing. You'll receive an email with instructions to complete your profile and submit direct deposit details.

2. On the first of each month, please email an invoice to me for approval. By the 15th of each month, you will be paid by direct deposit.

3. I'll be sharing the chapter outline and expert questions with you shortly.

Please let me know if you have any questions. Looking forward to working with you.

Best regards,
Trent McFadyen
Director of Strategic Initiatives | Project InnerSpace`;

  const emailOptions: DraftEmailOptions = {
    to: [task.authorEmail],
    subject,
    body,
    isHtml: false,
  };

  const result = await createDraft(emailOptions);

  if (result.success) {
    return {
      actionId: action.id,
      success: true,
      message: `Welcome email draft created for ${task.authorName}`,
      artifacts: [
        {
          type: 'draft',
          id: result.draftId,
          url: `https://mail.google.com/mail/u/0/#drafts`,
          details: {
            to: task.authorEmail,
            subject,
          },
        },
      ],
    };
  } else {
    return {
      actionId: action.id,
      success: false,
      message: result.error || 'Failed to create welcome email draft',
    };
  }
}

// ============================================
// MAIN EXECUTOR
// ============================================

/**
 * Execute a single action
 */
export async function executeAction(
  action: GeodeSuggestedAction,
  task: GeodeConfirmationTask
): Promise<ActionExecutionResult> {
  console.log('[ActionExecutor] Executing action:', action.id, action.actionType);
  console.log('[ActionExecutor] Gmail connected?', isGmailConnected());
  console.log('[ActionExecutor] Task state:', task.state, 'chapter:', task.chapterType);
  console.log('[ActionExecutor] Author:', task.authorName, task.authorEmail);

  switch (action.actionType) {
    // Author Outreach actions (pre-agreement)
    case 'generate_outreach_contract':
      return executeGenerateOutreachContract(action, task);

    case 'send_outreach_email':
      return executeSendOutreachEmail(action, task);

    // Author Agreement actions (post-agreement)
    case 'generate_contract':
      return executeGenerateContract(action, task);

    case 'send_contract':
      return executeSendContract(action, task);

    // Common actions
    case 'advance_step':
      return executeAdvanceStep(action, task);

    case 'log_communication':
      return executeLogCommunication(action, task);

    // Contract Signed actions
    case 'notify_accounting':
      return executeNotifyAccounting(action, task);

    case 'upload_contract_monday':
      return executeUploadContractMonday(action, task);

    case 'send_welcome_email':
      return executeSendWelcomeEmail(action, task);

    default:
      return {
        actionId: action.id,
        success: false,
        message: `Unknown action type: ${action.actionType}`,
      };
  }
}

/**
 * Execute all actions for a confirmation task
 */
export async function executeTaskActions(
  task: GeodeConfirmationTask
): Promise<TaskExecutionResult> {
  console.log('[ActionExecutor] Executing task:', task.id, 'with', task.pendingActions.length, 'actions');

  const results: ActionExecutionResult[] = [];
  let allSuccess = true;

  for (const action of task.pendingActions) {
    // When user clicks "Confirm & Execute", they're confirming ALL actions
    // So we execute everything regardless of requiresConfirmation flag
    const result = await executeAction(action, task);
    results.push(result);

    if (!result.success) {
      allSuccess = false;
    }
  }

  // Generate summary
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  let summary: string;
  if (allSuccess) {
    summary = `Successfully executed ${successCount} action${successCount !== 1 ? 's' : ''}`;
  } else if (successCount > 0) {
    summary = `Executed ${successCount} action${successCount !== 1 ? 's' : ''}, ${failCount} failed`;
  } else {
    summary = `All ${failCount} action${failCount !== 1 ? 's' : ''} failed`;
  }

  // Add draft link to summary if we created one
  const draftArtifact = results.flatMap(r => r.artifacts || []).find(a => a.type === 'draft');
  if (draftArtifact) {
    summary += '. Check your Gmail drafts!';
  }

  return {
    taskId: task.id,
    success: allSuccess,
    results,
    summary,
  };
}

/**
 * Check if actions can be executed (Gmail connected, etc.)
 */
export function canExecuteActions(): { ready: boolean; issues: string[] } {
  const issues: string[] = [];

  if (!isGmailConnected()) {
    issues.push('Gmail is not connected');
  }

  return {
    ready: issues.length === 0,
    issues,
  };
}
