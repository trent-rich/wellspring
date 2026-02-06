/**
 * Contract Service
 *
 * Handles local contract file management for GEODE author contracts:
 * - Searching for contracts by author/state/chapter
 * - Converting Word docs to PDF using Microsoft Word (macOS)
 * - Managing the contracts folder structure
 *
 * Folder Structure:
 * /email-ghostwriter/contracts/
 *   - Word docs (originals): InnerSpace_Agreement_{STATE}_{Chapter}_{AuthorInitials}.docx
 *   - GEODE Signature Ready Contracts/ (PDFs ready for Box Sign)
 */

// Base path for contracts
const CONTRACTS_BASE_PATH = '/Users/trentmcfadyen/Documents/Project InnerSpace/Watershed/email-ghostwriter/contracts';
const SIGNATURE_READY_SUBFOLDER = 'GEODE Signature Ready Contracts';

export interface ContractFile {
  filename: string;
  path: string;
  type: 'docx' | 'pdf';
  isSignatureReady: boolean;
}

export interface ContractSearchResult {
  found: boolean;
  wordDoc?: ContractFile;
  pdf?: ContractFile;
  signatureReadyPdf?: ContractFile;
}

/**
 * Build potential contract filenames based on author/state/chapter info
 * Contract naming convention: InnerSpace_Agreement_{STATE}_{Chapter}_{AuthorInitials}.docx
 */
function buildContractFilenames(
  authorName: string,
  stateAbbrev: string,
  chapterTitle: string
): string[] {
  // Get author initials (first letter of each word)
  const initials = authorName
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase())
    .join('');

  // Normalize chapter title for filename (remove spaces, special chars)
  const normalizedChapter = chapterTitle
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');

  // Generate possible filename patterns
  const patterns = [
    `InnerSpace_Agreement_${stateAbbrev}_${normalizedChapter}_${initials}`,
    `InnerSpace_Agreement_${stateAbbrev}_${chapterTitle.replace(/\s+/g, '_')}_${initials}`,
    `InnerSpace_Agreement_${stateAbbrev}_${initials}`,
  ];

  return patterns;
}

/**
 * Search for contract files in the contracts folder
 * Returns both Word doc and PDF versions if found
 */
export async function findContractFiles(
  authorName: string,
  stateAbbrev: string,
  chapterTitle: string
): Promise<ContractSearchResult> {
  const result: ContractSearchResult = { found: false };

  try {
    // Use Electron/Node APIs if available, otherwise use fetch to a local endpoint
    // For now, we'll call a shell script via the backend or use the file system API

    const possibleFilenames = buildContractFilenames(authorName, stateAbbrev, chapterTitle);
    console.log('[ContractService] Searching for contracts with patterns:', possibleFilenames);

    // We need to use a backend API or Electron IPC to access local files
    // For the web app, we'll store the contract paths and use them when creating drafts

    // Store search info for later use
    const searchInfo = {
      authorName,
      stateAbbrev,
      chapterTitle,
      possibleFilenames,
      basePath: CONTRACTS_BASE_PATH,
      signatureReadyPath: `${CONTRACTS_BASE_PATH}/${SIGNATURE_READY_SUBFOLDER}`,
    };

    // Check localStorage for cached contract mappings
    const cachedMappings = localStorage.getItem('contract_file_mappings');
    const mappings: Record<string, { wordDoc?: string; pdf?: string }> = cachedMappings
      ? JSON.parse(cachedMappings)
      : {};

    // Create a key for this author
    const authorKey = `${stateAbbrev}_${authorName.replace(/\s+/g, '_')}`;

    if (mappings[authorKey]) {
      const cached = mappings[authorKey];
      if (cached.wordDoc) {
        result.wordDoc = {
          filename: cached.wordDoc.split('/').pop() || '',
          path: cached.wordDoc,
          type: 'docx',
          isSignatureReady: false,
        };
      }
      if (cached.pdf) {
        result.pdf = {
          filename: cached.pdf.split('/').pop() || '',
          path: cached.pdf,
          type: 'pdf',
          isSignatureReady: cached.pdf.includes(SIGNATURE_READY_SUBFOLDER),
        };
        if (cached.pdf.includes(SIGNATURE_READY_SUBFOLDER)) {
          result.signatureReadyPdf = result.pdf;
        }
      }
      result.found = !!(result.wordDoc || result.pdf);
    }

    // Store search info for manual resolution if not found
    if (!result.found) {
      localStorage.setItem(`contract_search_${authorKey}`, JSON.stringify(searchInfo));
    }

    return result;
  } catch (error) {
    console.error('[ContractService] Error searching for contracts:', error);
    return result;
  }
}

/**
 * Register a contract file mapping (called when contract is created or manually located)
 */
export function registerContractFile(
  authorName: string,
  stateAbbrev: string,
  filePath: string,
  fileType: 'docx' | 'pdf'
): void {
  const cachedMappings = localStorage.getItem('contract_file_mappings');
  const mappings: Record<string, { wordDoc?: string; pdf?: string }> = cachedMappings
    ? JSON.parse(cachedMappings)
    : {};

  const authorKey = `${stateAbbrev}_${authorName.replace(/\s+/g, '_')}`;

  if (!mappings[authorKey]) {
    mappings[authorKey] = {};
  }

  if (fileType === 'docx') {
    mappings[authorKey].wordDoc = filePath;
  } else {
    mappings[authorKey].pdf = filePath;
  }

  localStorage.setItem('contract_file_mappings', JSON.stringify(mappings));
  console.log('[ContractService] Registered contract:', authorKey, fileType, filePath);
}

/**
 * Get the expected paths for a contract
 */
export function getContractPaths(
  authorName: string,
  stateAbbrev: string,
  chapterTitle: string
): { wordDocPath: string; pdfPath: string; signatureReadyPdfPath: string } {
  const filenames = buildContractFilenames(authorName, stateAbbrev, chapterTitle);
  const baseFilename = filenames[0]; // Use primary pattern

  return {
    wordDocPath: `${CONTRACTS_BASE_PATH}/${baseFilename}.docx`,
    pdfPath: `${CONTRACTS_BASE_PATH}/${baseFilename}.pdf`,
    signatureReadyPdfPath: `${CONTRACTS_BASE_PATH}/${SIGNATURE_READY_SUBFOLDER}/${baseFilename}.pdf`,
  };
}

/**
 * Convert Word doc to PDF using Microsoft Word via AppleScript (macOS only)
 * This runs via a shell command on the backend
 */
export async function convertWordToPdf(
  wordDocPath: string,
  outputPdfPath?: string
): Promise<{ success: boolean; pdfPath?: string; error?: string }> {
  try {
    // The PDF output path defaults to same location with .pdf extension
    const pdfPath = outputPdfPath || wordDocPath.replace(/\.docx?$/i, '.pdf');

    // AppleScript to convert Word doc to PDF using Microsoft Word
    const appleScript = `
      tell application "Microsoft Word"
        activate
        open POSIX file "${wordDocPath}"
        delay 1
        set theDoc to active document
        save as theDoc file name "${pdfPath}" file format format PDF
        close theDoc saving no
      end tell
    `;

    // Store conversion request for backend processing
    const conversionRequest = {
      wordDocPath,
      pdfPath,
      appleScript,
      requestedAt: new Date().toISOString(),
    };

    // For now, store in localStorage and return instructions
    // In production, this would call a backend API
    const pendingConversions = JSON.parse(localStorage.getItem('pending_pdf_conversions') || '[]');
    pendingConversions.push(conversionRequest);
    localStorage.setItem('pending_pdf_conversions', JSON.stringify(pendingConversions));

    console.log('[ContractService] PDF conversion requested:', conversionRequest);

    // Return the expected path - actual conversion happens via backend/CLI
    return {
      success: true,
      pdfPath,
    };
  } catch (error) {
    console.error('[ContractService] Error requesting PDF conversion:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'PDF conversion failed',
    };
  }
}

/**
 * Read a local file as base64 (for email attachments)
 * This needs to go through a backend API since browsers can't access local files
 */
export async function readFileAsBase64(filePath: string): Promise<{
  success: boolean;
  data?: string;
  mimeType?: string;
  error?: string
}> {
  try {
    // Determine MIME type from extension
    const extension = filePath.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      doc: 'application/msword',
    };
    const mimeType = mimeTypes[extension || ''] || 'application/octet-stream';

    // For Electron apps, we could use Node.js fs module
    // For web apps, we need a backend endpoint

    // Check if we're in Electron
    if (typeof window !== 'undefined' && (window as any).electronAPI?.readFile) {
      const data = await (window as any).electronAPI.readFile(filePath);
      return { success: true, data, mimeType };
    }

    // For web app, try the local file server endpoint
    const response = await fetch(`/api/files/read?path=${encodeURIComponent(filePath)}`);
    if (response.ok) {
      const result = await response.json();
      return { success: true, data: result.data, mimeType };
    }

    // Fallback: store file path for manual handling
    console.warn('[ContractService] Cannot read local file in browser. File path:', filePath);
    return {
      success: false,
      error: `Browser cannot directly access local files. File is at: ${filePath}`,
    };
  } catch (error) {
    console.error('[ContractService] Error reading file:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to read file',
    };
  }
}

/**
 * Get contract folder paths
 */
export function getContractFolderPaths(): {
  basePath: string;
  signatureReadyPath: string;
} {
  return {
    basePath: CONTRACTS_BASE_PATH,
    signatureReadyPath: `${CONTRACTS_BASE_PATH}/${SIGNATURE_READY_SUBFOLDER}`,
  };
}

/**
 * List all contracts in the folder (via backend API)
 */
export async function listContracts(): Promise<{
  success: boolean;
  contracts?: ContractFile[];
  error?: string;
}> {
  try {
    // For web app, this would need a backend endpoint
    const response = await fetch('/api/files/list?path=' + encodeURIComponent(CONTRACTS_BASE_PATH));
    if (response.ok) {
      const result = await response.json();
      return { success: true, contracts: result.files };
    }

    // Fallback: return cached mappings
    const cachedMappings = localStorage.getItem('contract_file_mappings');
    if (cachedMappings) {
      const mappings = JSON.parse(cachedMappings);
      const contracts: ContractFile[] = [];

      for (const [, value] of Object.entries(mappings) as [string, { wordDoc?: string; pdf?: string }][]) {
        if (value.wordDoc) {
          contracts.push({
            filename: value.wordDoc.split('/').pop() || '',
            path: value.wordDoc,
            type: 'docx',
            isSignatureReady: false,
          });
        }
        if (value.pdf) {
          contracts.push({
            filename: value.pdf.split('/').pop() || '',
            path: value.pdf,
            type: 'pdf',
            isSignatureReady: value.pdf.includes(SIGNATURE_READY_SUBFOLDER),
          });
        }
      }

      return { success: true, contracts };
    }

    return { success: false, error: 'Cannot list contracts without backend API' };
  } catch (error) {
    console.error('[ContractService] Error listing contracts:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list contracts',
    };
  }
}
