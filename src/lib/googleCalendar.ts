// Google Calendar Integration
// Uses OAuth 2.0 implicit flow with a dedicated callback page + postMessage
// to avoid COOP issues with Google Identity Services popup

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Scopes requested - these MUST match what's registered in Google Cloud Console
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/drive.file',
].join(' ');

// Store the access token in memory
let accessToken: string | null = null;

// Initialize Google Auth - validates config, no library to load
export const initGoogleAuth = (): Promise<void> => {
  if (!GOOGLE_CLIENT_ID) {
    return Promise.reject(new Error('Google Client ID not configured.'));
  }
  return Promise.resolve();
};

// Start OAuth flow using a popup + dedicated callback page + postMessage
export const signInWithGoogle = (loginHint?: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!GOOGLE_CLIENT_ID) {
      reject(new Error('Google Client ID not configured'));
      return;
    }

    // CSRF protection
    const state = Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem('google_oauth_state', state);

    // Redirect to our own /oauth-callback.html page which uses postMessage
    const redirectUri = window.location.origin + '/oauth-callback.html';

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('include_granted_scopes', 'true');
    if (loginHint) {
      authUrl.searchParams.set('login_hint', loginHint);
    }

    console.log('[Google OAuth] Opening popup to:', authUrl.toString().substring(0, 100) + '...');
    console.log('[Google OAuth] Redirect URI:', redirectUri);

    // Open popup
    const w = 500, h = 600;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    const popup = window.open(
      authUrl.toString(),
      'google-oauth',
      `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`
    );

    if (!popup) {
      reject(new Error('Popup was blocked. Please allow popups for this site and try again.'));
      return;
    }

    let resolved = false;

    // Listen for postMessage from the callback page
    const handleMessage = (event: MessageEvent) => {
      // Only accept messages from our own origin
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'google-oauth-callback') return;

      resolved = true;
      window.removeEventListener('message', handleMessage);

      const { access_token, expires_in, error, error_description, state: returnedState } = event.data;

      if (error) {
        console.error('[Google OAuth] Error:', error, error_description);
        reject(new Error(`Google OAuth error: ${error} — ${error_description || 'Unknown'}`));
        return;
      }

      // Verify state
      const savedState = sessionStorage.getItem('google_oauth_state');
      if (returnedState !== savedState) {
        console.error('[Google OAuth] State mismatch');
        reject(new Error('OAuth state mismatch. Please try again.'));
        return;
      }
      sessionStorage.removeItem('google_oauth_state');

      if (access_token) {
        console.log('[Google OAuth] Access token received via postMessage!');
        accessToken = access_token;
        localStorage.setItem('google_access_token', access_token);

        const expiresInSec = parseInt(expires_in || '3600', 10);
        localStorage.setItem('gmail_tokens', JSON.stringify({
          accessToken: access_token,
          expiresAt: Date.now() + expiresInSec * 1000,
        }));
        console.log('[Google OAuth] Tokens stored, expires in', expiresInSec, 'seconds');
        resolve(access_token);
      } else {
        reject(new Error('No access token received from Google.'));
      }
    };

    window.addEventListener('message', handleMessage);

    // Timeout after 2 minutes
    setTimeout(() => {
      if (!resolved) {
        window.removeEventListener('message', handleMessage);
        if (popup && !popup.closed) popup.close();
        reject(new Error('Google sign-in timed out. Please try again.'));
      }
    }, 120000);

    // Also poll for popup closed (as fallback — may not work due to COOP, that's OK)
    const closedCheck = setInterval(() => {
      try {
        if (popup.closed && !resolved) {
          clearInterval(closedCheck);
          window.removeEventListener('message', handleMessage);
          reject(new Error('Google sign-in popup was closed.'));
        }
      } catch {
        // COOP may block this — that's fine, timeout will catch it
      }
    }, 1000);
  });
};

// Get stored token — checks both in-memory and localStorage (SSO or standalone flow)
export const getGoogleToken = (): string | null => {
  if (accessToken) return accessToken;

  // Check gmail_tokens first (set by SSO flow with expiry info)
  const gmailTokensRaw = localStorage.getItem('gmail_tokens');
  if (gmailTokensRaw) {
    try {
      const gmailTokens = JSON.parse(gmailTokensRaw);
      if (gmailTokens.accessToken && gmailTokens.expiresAt > Date.now()) {
        return gmailTokens.accessToken;
      }
    } catch { /* ignore parse errors */ }
  }

  return localStorage.getItem('google_access_token');
};

// Check if connected (has a valid, non-expired token)
export const isGoogleConnected = (): boolean => {
  return !!getGoogleToken();
};

// Disconnect
export const disconnectGoogle = (): void => {
  accessToken = null;
  localStorage.removeItem('google_access_token');
  localStorage.removeItem('gmail_tokens');
};

// Fetch calendar events from Google
export const fetchGoogleCalendarEvents = async (
  timeMin: Date,
  timeMax: Date
): Promise<GoogleCalendarEvent[]> => {
  const token = getGoogleToken();
  if (!token) throw new Error('Not connected to Google');

  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
  });

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!response.ok) {
    if (response.status === 401) {
      disconnectGoogle();
      throw new Error('Google session expired. Please reconnect.');
    }
    throw new Error('Failed to fetch calendar events');
  }

  const data = await response.json();
  return data.items || [];
};

// Types
export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  location?: string;
  hangoutLink?: string;
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: string;
    organizer?: boolean;
  }>;
  status: string;
}

export const convertGoogleEvent = (
  googleEvent: GoogleCalendarEvent,
  userId: string
): {
  user_id: string;
  gcal_event_id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  location: string | null;
  meet_link: string | null;
  is_all_day: boolean;
  status: 'confirmed' | 'tentative' | 'cancelled';
  attendees: Array<{
    email: string;
    name?: string;
    response_status?: string;
    organizer?: boolean;
  }> | null;
} => {
  const isAllDay = !googleEvent.start.dateTime;
  const startTime = googleEvent.start.dateTime || `${googleEvent.start.date}T00:00:00Z`;
  const endTime = googleEvent.end.dateTime || `${googleEvent.end.date}T23:59:59Z`;

  return {
    user_id: userId,
    gcal_event_id: googleEvent.id,
    title: googleEvent.summary || 'Untitled Event',
    description: googleEvent.description || null,
    start_time: startTime,
    end_time: endTime,
    location: googleEvent.location || null,
    meet_link: googleEvent.hangoutLink || null,
    is_all_day: isAllDay,
    status: googleEvent.status === 'cancelled' ? 'cancelled' :
            googleEvent.status === 'tentative' ? 'tentative' : 'confirmed',
    attendees: googleEvent.attendees?.map(a => ({
      email: a.email,
      name: a.displayName,
      response_status: a.responseStatus as 'accepted' | 'declined' | 'tentative' | 'needsAction',
      organizer: a.organizer,
    })) || null,
  };
};
