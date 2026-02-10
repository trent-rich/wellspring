// Google Calendar Integration
// This module handles OAuth and calendar sync using direct OAuth 2.0 implicit flow
// (bypasses Google Identity Services popup which is broken by COOP in modern Chrome)

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Scopes requested - these MUST match what's registered in Google Cloud Console
// OAuth consent screen > Data Access > Scopes
const SCOPES = [
  // Calendar - read events for task scheduling
  'https://www.googleapis.com/auth/calendar.readonly',

  // Gmail - read emails for task extraction, send emails directly (not just drafts)
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',      // Send emails directly from Wellspring
  'https://www.googleapis.com/auth/gmail.compose',   // Create drafts

  // Drive - file access for artifacts and docs
  'https://www.googleapis.com/auth/drive.file',
].join(' ');

// Store the access token
let accessToken: string | null = null;

// Initialize Google Auth - now a no-op since we use direct OAuth redirect
export const initGoogleAuth = (): Promise<void> => {
  console.log('[Google OAuth] initGoogleAuth called (no-op for redirect flow)');
  if (!GOOGLE_CLIENT_ID) {
    return Promise.reject(new Error('Google Client ID not configured. Please check your environment variables.'));
  }
  return Promise.resolve();
};

// Start OAuth flow using direct redirect-based implicit grant
// This avoids the Google Identity Services popup COOP issues entirely
export const signInWithGoogle = (loginHint?: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    console.log('[Google OAuth] Starting redirect-based OAuth flow...');

    if (!GOOGLE_CLIENT_ID) {
      reject(new Error('Google Client ID not configured'));
      return;
    }

    // Generate a random state parameter for CSRF protection
    const state = Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem('google_oauth_state', state);

    // Build the Google OAuth 2.0 authorization URL (implicit grant)
    const redirectUri = window.location.origin + '/settings';
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

    console.log('[Google OAuth] Redirect URI:', redirectUri);
    console.log('[Google OAuth] Opening OAuth window...');

    // Open in a popup window
    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      authUrl.toString(),
      'google-oauth',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
    );

    if (!popup) {
      reject(new Error('Popup was blocked. Please allow popups for this site.'));
      return;
    }

    // Poll the popup for the redirect with the token in the hash
    const pollInterval = setInterval(() => {
      try {
        // Check if popup was closed by user
        if (popup.closed) {
          clearInterval(pollInterval);
          reject(new Error('Google sign-in popup was closed.'));
          return;
        }

        // Try to read the popup's URL — this will throw cross-origin errors
        // until Google redirects back to our origin
        const popupUrl = popup.location.href;

        // Check if we've been redirected back to our site
        if (popupUrl.startsWith(window.location.origin)) {
          clearInterval(pollInterval);

          // Parse the hash fragment for the access token
          const hash = popup.location.hash.substring(1); // Remove the #
          popup.close();

          const params = new URLSearchParams(hash);
          const token = params.get('access_token');
          const expiresIn = parseInt(params.get('expires_in') || '3600', 10);
          const returnedState = params.get('state');
          const error = params.get('error');

          // Check for errors
          if (error) {
            const errorDesc = params.get('error_description') || 'Unknown error';
            console.error('[Google OAuth] Error from Google:', error, errorDesc);
            reject(new Error(`Google OAuth error: ${error} — ${errorDesc}`));
            return;
          }

          // Verify state parameter
          const savedState = sessionStorage.getItem('google_oauth_state');
          if (returnedState !== savedState) {
            console.error('[Google OAuth] State mismatch — possible CSRF');
            reject(new Error('OAuth state mismatch. Please try again.'));
            return;
          }
          sessionStorage.removeItem('google_oauth_state');

          if (token) {
            console.log('[Google OAuth] Access token received successfully!');
            accessToken = token;
            localStorage.setItem('google_access_token', token);

            // Store in gmail_tokens format for GEODE email executor
            const gmailTokens = {
              accessToken: token,
              expiresAt: Date.now() + (expiresIn * 1000),
            };
            localStorage.setItem('gmail_tokens', JSON.stringify(gmailTokens));
            console.log('[Google OAuth] Tokens stored in localStorage, expires in', expiresIn, 'seconds');

            resolve(token);
          } else {
            console.error('[Google OAuth] No access token in redirect');
            reject(new Error('No access token received from Google.'));
          }
        }
      } catch {
        // Cross-origin error is expected while popup is on Google's domain
        // Just keep polling
      }
    }, 500);

    // Timeout after 2 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      if (!popup.closed) {
        popup.close();
      }
      reject(new Error('Google sign-in timed out. Please try again.'));
    }, 120000);
  });
};

// Get stored token
export const getGoogleToken = (): string | null => {
  if (accessToken) return accessToken;
  return localStorage.getItem('google_access_token');
};

// Check if connected
export const isGoogleConnected = (): boolean => {
  return !!getGoogleToken();
};

// Disconnect
export const disconnectGoogle = (): void => {
  accessToken = null;
  localStorage.removeItem('google_access_token');
  localStorage.removeItem('gmail_tokens'); // Also clear gmail tokens for Ralph AI
};

// Fetch calendar events from Google
export const fetchGoogleCalendarEvents = async (
  timeMin: Date,
  timeMax: Date
): Promise<GoogleCalendarEvent[]> => {
  const token = getGoogleToken();
  if (!token) {
    throw new Error('Not connected to Google');
  }

  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
  });

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    if (response.status === 401) {
      // Token expired, clear it
      disconnectGoogle();
      throw new Error('Google session expired. Please reconnect.');
    }
    throw new Error('Failed to fetch calendar events');
  }

  const data = await response.json();
  return data.items || [];
};

// Types for Google Calendar API response
export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
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

// Convert Google event to our CalendarEvent format
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
