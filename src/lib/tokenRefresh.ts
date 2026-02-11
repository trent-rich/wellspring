/**
 * Google Token Refresh Service
 *
 * Handles silent refresh of Google OAuth access tokens using the stored
 * refresh token. This allows Wellspring to maintain Google API access
 * indefinitely without requiring the user to re-authenticate.
 *
 * The refresh token is encrypted in localStorage using the Web Crypto API
 * with a key derived from the user's Supabase session ID.
 *
 * Flow:
 * 1. On SSO sign-in, authStore captures provider_refresh_token
 * 2. This module encrypts and stores it
 * 3. A background timer proactively refreshes the access token ~5 minutes before expiry
 * 4. If the access token is already expired, callers can use refreshGoogleTokenNow()
 */

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET;
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const ENCRYPTED_RT_KEY = 'google_rt_enc';
const ENCRYPTION_KEY_SALT = 'wellspring-rt-salt-v1';

// Background refresh timer
let refreshTimerId: ReturnType<typeof setTimeout> | null = null;
let isRefreshing = false;

// ============================================
// ENCRYPTION HELPERS (Web Crypto API)
// ============================================

/**
 * Derive an AES-GCM encryption key from a passphrase (user's Supabase user ID).
 * This ensures the refresh token is only decryptable by the same user session.
 */
async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(ENCRYPTION_KEY_SALT),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptToken(token: string, userId: string): Promise<string> {
  const key = await deriveKey(userId);
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(token)
  );

  // Store as base64: iv + encrypted data
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

async function decryptToken(encryptedB64: string, userId: string): Promise<string | null> {
  try {
    const key = await deriveKey(userId);
    const combined = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));

    const iv = combined.slice(0, 12);
    const data = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('[TokenRefresh] Decryption failed:', error);
    return null;
  }
}

// ============================================
// REFRESH TOKEN STORAGE
// ============================================

/**
 * Store the Google refresh token (encrypted).
 * Call this immediately after capturing provider_refresh_token from Supabase.
 */
export async function storeRefreshToken(refreshToken: string, userId: string): Promise<void> {
  try {
    const encrypted = await encryptToken(refreshToken, userId);
    localStorage.setItem(ENCRYPTED_RT_KEY, encrypted);
    // Also store the userId hash so we know which key to use for decryption
    localStorage.setItem('google_rt_uid', userId);
    console.log('[TokenRefresh] Refresh token encrypted and stored');
  } catch (error) {
    console.error('[TokenRefresh] Failed to store refresh token:', error);
    // Fallback: don't store at all if encryption fails (better than storing plaintext)
  }
}

/**
 * Retrieve and decrypt the stored refresh token.
 */
async function getStoredRefreshToken(): Promise<string | null> {
  const encrypted = localStorage.getItem(ENCRYPTED_RT_KEY);
  const userId = localStorage.getItem('google_rt_uid');

  if (!encrypted || !userId) {
    // Check for legacy unencrypted token and migrate
    const legacyToken = localStorage.getItem('google_refresh_token');
    if (legacyToken && userId) {
      console.log('[TokenRefresh] Migrating legacy unencrypted refresh token...');
      await storeRefreshToken(legacyToken, userId);
      localStorage.removeItem('google_refresh_token');
      return legacyToken;
    }
    return null;
  }

  return await decryptToken(encrypted, userId);
}

/**
 * Clear stored refresh token (on sign out).
 */
export function clearRefreshToken(): void {
  localStorage.removeItem(ENCRYPTED_RT_KEY);
  localStorage.removeItem('google_rt_uid');
  localStorage.removeItem('google_refresh_token'); // legacy cleanup
  stopBackgroundRefresh();
  console.log('[TokenRefresh] Refresh token cleared');
}

// ============================================
// TOKEN REFRESH
// ============================================

/**
 * Use the stored refresh token to get a fresh Google access token.
 * Updates localStorage with the new token and expiry.
 * Returns the new access token, or null if refresh failed.
 */
export async function refreshGoogleTokenNow(): Promise<string | null> {
  if (isRefreshing) {
    console.log('[TokenRefresh] Already refreshing, waiting...');
    // Wait for the in-progress refresh to complete
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (!isRefreshing) {
          clearInterval(check);
          const gmailTokensRaw = localStorage.getItem('gmail_tokens');
          if (gmailTokensRaw) {
            try {
              const gmailTokens = JSON.parse(gmailTokensRaw);
              resolve(gmailTokens.accessToken || null);
              return;
            } catch { /* fall through */ }
          }
          resolve(null);
        }
      }, 200);
      // Safety timeout
      setTimeout(() => {
        clearInterval(check);
        resolve(null);
      }, 15000);
    });
  }

  isRefreshing = true;

  try {
    const refreshToken = await getStoredRefreshToken();
    if (!refreshToken) {
      console.log('[TokenRefresh] No refresh token available');
      return null;
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      console.error('[TokenRefresh] Missing Google client credentials');
      return null;
    }

    console.log('[TokenRefresh] Refreshing Google access token...');

    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('[TokenRefresh] Refresh failed:', response.status, err);

      // If refresh token is invalid/revoked, clear it
      if (response.status === 400 && err.error === 'invalid_grant') {
        console.warn('[TokenRefresh] Refresh token revoked or expired — user must re-authenticate');
        clearRefreshToken();
      }
      return null;
    }

    const data = await response.json();
    const newAccessToken = data.access_token;
    const expiresInSec = data.expires_in || 3600;

    // Store the fresh token
    localStorage.setItem('google_access_token', newAccessToken);
    localStorage.setItem('gmail_tokens', JSON.stringify({
      accessToken: newAccessToken,
      expiresAt: Date.now() + expiresInSec * 1000,
    }));

    console.log(`[TokenRefresh] Access token refreshed, expires in ${expiresInSec}s`);

    // Schedule the next refresh
    scheduleNextRefresh(expiresInSec);

    return newAccessToken;
  } catch (error) {
    console.error('[TokenRefresh] Error during refresh:', error);
    return null;
  } finally {
    isRefreshing = false;
  }
}

// ============================================
// BACKGROUND REFRESH TIMER
// ============================================

/**
 * Schedule the next token refresh ~5 minutes before expiry.
 */
function scheduleNextRefresh(expiresInSec: number): void {
  // Clear any existing timer
  if (refreshTimerId) {
    clearTimeout(refreshTimerId);
    refreshTimerId = null;
  }

  // Refresh 5 minutes before expiry (or immediately if < 5 min remaining)
  const refreshInMs = Math.max((expiresInSec - 300) * 1000, 10000);

  console.log(`[TokenRefresh] Next refresh scheduled in ${Math.round(refreshInMs / 60000)} minutes`);

  refreshTimerId = setTimeout(async () => {
    console.log('[TokenRefresh] Background refresh triggered');
    await refreshGoogleTokenNow();
  }, refreshInMs);
}

/**
 * Start the background refresh timer.
 * Call this on app initialization after auth is ready.
 * Checks the current token's remaining lifetime and schedules accordingly.
 */
export function startBackgroundRefresh(): void {
  const gmailTokensRaw = localStorage.getItem('gmail_tokens');
  if (!gmailTokensRaw) {
    console.log('[TokenRefresh] No token to track — skipping background refresh setup');
    return;
  }

  try {
    const gmailTokens = JSON.parse(gmailTokensRaw);
    const expiresAt = gmailTokens.expiresAt || 0;
    const remainingSec = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));

    if (remainingSec <= 0) {
      // Token already expired — refresh immediately
      console.log('[TokenRefresh] Token already expired — refreshing now');
      refreshGoogleTokenNow();
    } else if (remainingSec <= 300) {
      // Token expires within 5 minutes — refresh soon
      console.log(`[TokenRefresh] Token expires in ${remainingSec}s — refreshing in 10s`);
      refreshTimerId = setTimeout(() => refreshGoogleTokenNow(), 10000);
    } else {
      // Token still valid — schedule refresh before expiry
      scheduleNextRefresh(remainingSec);
    }
  } catch {
    console.log('[TokenRefresh] Could not parse token data — skipping');
  }
}

/**
 * Stop the background refresh timer.
 */
export function stopBackgroundRefresh(): void {
  if (refreshTimerId) {
    clearTimeout(refreshTimerId);
    refreshTimerId = null;
    console.log('[TokenRefresh] Background refresh stopped');
  }
}

/**
 * Check if we have a refresh token stored (meaning silent refresh is possible).
 */
export function hasRefreshToken(): boolean {
  return !!(localStorage.getItem(ENCRYPTED_RT_KEY) || localStorage.getItem('google_refresh_token'));
}
