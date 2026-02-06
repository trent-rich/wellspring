/**
 * Google Drive Service
 *
 * Handles uploading files to Google Drive for contract storage.
 * Uses the same OAuth token as Gmail/Calendar.
 */

import { getGoogleToken, isGoogleConnected } from './googleCalendar';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

// Admin Drive folder for contractor contracts
// Per SOP: Save to Admin Google Share drive in the Contractor folder
export const CONTRACTOR_CONTRACTS_FOLDER_ID = ''; // TODO: Set this to the actual folder ID

// ============================================
// TYPES
// ============================================

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  webContentLink?: string;
  parents?: string[];
  createdTime?: string;
  modifiedTime?: string;
}

export interface DriveUploadResult {
  success: boolean;
  file?: DriveFile;
  error?: string;
}

// ============================================
// HELPERS
// ============================================

async function driveFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getGoogleToken();
  if (!token) {
    throw new Error('Not connected to Google. Please connect in Settings.');
  }

  const response = await fetch(`${DRIVE_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Google session expired. Please reconnect in Settings.');
    }
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(error.error?.message || `Drive API error: ${response.status}`);
  }

  return response.json();
}

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Check if Drive is connected (same as Gmail/Calendar)
 */
export function isDriveConnected(): boolean {
  return isGoogleConnected();
}

/**
 * List files in a folder
 */
export async function listFiles(folderId: string, pageSize = 100): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    pageSize: String(pageSize),
    fields: 'files(id, name, mimeType, webViewLink, webContentLink, parents, createdTime, modifiedTime)',
  });

  const response = await driveFetch<{ files: DriveFile[] }>(`/files?${params}`);
  return response.files || [];
}

/**
 * Get file metadata
 */
export async function getFile(fileId: string): Promise<DriveFile> {
  const params = new URLSearchParams({
    fields: 'id, name, mimeType, webViewLink, webContentLink, parents, createdTime, modifiedTime',
  });

  return driveFetch<DriveFile>(`/files/${fileId}?${params}`);
}

/**
 * Upload a file to Google Drive
 *
 * @param filename - Name for the file in Drive
 * @param content - Base64 encoded file content
 * @param mimeType - MIME type of the file
 * @param folderId - Optional folder ID to upload to
 */
export async function uploadFile(
  filename: string,
  content: string,
  mimeType: string,
  folderId?: string
): Promise<DriveUploadResult> {
  const token = getGoogleToken();
  if (!token) {
    return {
      success: false,
      error: 'Not connected to Google. Please connect in Settings.',
    };
  }

  try {
    // Create file metadata
    const metadata: { name: string; mimeType: string; parents?: string[] } = {
      name: filename,
      mimeType,
    };

    if (folderId) {
      metadata.parents = [folderId];
    }

    // Create multipart request body
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadataString = JSON.stringify(metadata);

    // Build the multipart body
    const requestBody = new Blob([
      delimiter,
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      metadataString,
      delimiter,
      `Content-Type: ${mimeType}\r\n`,
      'Content-Transfer-Encoding: base64\r\n\r\n',
      content,
      closeDelimiter,
    ]);

    const response = await fetch(
      `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,webContentLink,parents`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: requestBody,
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        return {
          success: false,
          error: 'Google session expired. Please reconnect in Settings.',
        };
      }
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      return {
        success: false,
        error: error.error?.message || `Upload failed: ${response.status}`,
      };
    }

    const file = await response.json();
    return {
      success: true,
      file,
    };
  } catch (error) {
    console.error('[DriveService] Upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload file',
    };
  }
}

/**
 * Create a folder in Google Drive
 */
export async function createFolder(
  name: string,
  parentFolderId?: string
): Promise<DriveUploadResult> {
  const token = getGoogleToken();
  if (!token) {
    return {
      success: false,
      error: 'Not connected to Google. Please connect in Settings.',
    };
  }

  try {
    const metadata: { name: string; mimeType: string; parents?: string[] } = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
    };

    if (parentFolderId) {
      metadata.parents = [parentFolderId];
    }

    const response = await fetch(`${DRIVE_API_BASE}/files?fields=id,name,mimeType,webViewLink`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    });

    if (!response.ok) {
      if (response.status === 401) {
        return {
          success: false,
          error: 'Google session expired. Please reconnect in Settings.',
        };
      }
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      return {
        success: false,
        error: error.error?.message || `Failed to create folder: ${response.status}`,
      };
    }

    const file = await response.json();
    return {
      success: true,
      file,
    };
  } catch (error) {
    console.error('[DriveService] Create folder error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create folder',
    };
  }
}

/**
 * Search for files by name
 */
export async function searchFiles(
  query: string,
  folderId?: string
): Promise<DriveFile[]> {
  let searchQuery = `name contains '${query}' and trashed = false`;
  if (folderId) {
    searchQuery += ` and '${folderId}' in parents`;
  }

  const params = new URLSearchParams({
    q: searchQuery,
    pageSize: '20',
    fields: 'files(id, name, mimeType, webViewLink, webContentLink, parents, createdTime, modifiedTime)',
  });

  const response = await driveFetch<{ files: DriveFile[] }>(`/files?${params}`);
  return response.files || [];
}

/**
 * Get a shareable link for a file (sets to "anyone with link can view")
 */
export async function getShareableLink(fileId: string): Promise<string | null> {
  const token = getGoogleToken();
  if (!token) {
    return null;
  }

  try {
    // Create a public permission
    await fetch(`${DRIVE_API_BASE}/files/${fileId}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
      }),
    });

    // Get the web view link
    const file = await getFile(fileId);
    return file.webViewLink || null;
  } catch (error) {
    console.error('[DriveService] Error getting shareable link:', error);
    return null;
  }
}
