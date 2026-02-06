// Google Calendar Integration
// This module handles OAuth and calendar sync

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

// Initialize Google Identity Services
export const initGoogleAuth = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    console.log('[Google OAuth] Initializing Google Auth...');

    if (!GOOGLE_CLIENT_ID) {
      console.error('[Google OAuth] VITE_GOOGLE_CLIENT_ID is not set');
      reject(new Error('Google Client ID not configured. Please check your environment variables.'));
      return;
    }

    // Check if already loaded
    if (window.google?.accounts?.oauth2) {
      console.log('[Google OAuth] Google Identity Services already loaded');
      resolve();
      return;
    }

    // Check if script is already being loaded
    const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existingScript) {
      console.log('[Google OAuth] Script already exists, waiting for load...');
      // Wait for it to load
      const checkLoaded = setInterval(() => {
        if (window.google?.accounts?.oauth2) {
          clearInterval(checkLoaded);
          console.log('[Google OAuth] Google Identity Services loaded');
          resolve();
        }
      }, 100);
      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkLoaded);
        if (!window.google?.accounts?.oauth2) {
          reject(new Error('Timeout waiting for Google Identity Services to load'));
        }
      }, 10000);
      return;
    }

    // Load the Google Identity Services library
    console.log('[Google OAuth] Loading Google Identity Services script...');
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      console.log('[Google OAuth] Script loaded, waiting for window.google to be ready...');
      // Wait for window.google to be fully initialized (can take a moment after script loads)
      const waitForGoogle = setInterval(() => {
        if (window.google?.accounts?.oauth2) {
          clearInterval(waitForGoogle);
          console.log('[Google OAuth] Google Identity Services fully ready');
          resolve();
        }
      }, 50);
      // Timeout after 5 seconds
      setTimeout(() => {
        clearInterval(waitForGoogle);
        if (!window.google?.accounts?.oauth2) {
          console.error('[Google OAuth] window.google not available after script load');
          reject(new Error('Google Identity Services failed to initialize'));
        }
      }, 5000);
    };
    script.onerror = (error) => {
      console.error('[Google OAuth] Failed to load Google Identity Services:', error);
      reject(new Error('Failed to load Google Identity Services. Please check your network connection.'));
    };
    document.head.appendChild(script);
  });
};

// Cached token client to prevent multiple initializations
// This is crucial for React StrictMode which calls functions twice
let tokenClient: { requestAccessToken: () => void } | null = null;
let pendingResolve: ((token: string) => void) | null = null;
let pendingReject: ((error: Error) => void) | null = null;
let isOAuthInProgress = false;

// Start OAuth flow
// IMPORTANT: We cache the token client to prevent issues with React StrictMode
// calling this multiple times. Only one OAuth flow can be in progress at a time.
export const signInWithGoogle = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    console.log('[Google OAuth] Starting sign-in flow...');

    // Prevent multiple simultaneous OAuth flows
    if (isOAuthInProgress) {
      console.log('[Google OAuth] OAuth already in progress, ignoring duplicate call');
      // Store this as the pending resolver (latest caller wins)
      pendingResolve = resolve;
      pendingReject = reject;
      return;
    }

    if (!window.google) {
      console.error('[Google OAuth] Google Identity Services not loaded');
      reject(new Error('Google Identity Services not loaded'));
      return;
    }

    if (!GOOGLE_CLIENT_ID) {
      console.error('[Google OAuth] Google Client ID not configured');
      reject(new Error('Google Client ID not configured'));
      return;
    }

    console.log('[Google OAuth] Client ID:', GOOGLE_CLIENT_ID.substring(0, 20) + '...');
    console.log('[Google OAuth] Scopes:', SCOPES);

    // Store the resolve/reject for the callback to use
    pendingResolve = resolve;
    pendingReject = reject;
    isOAuthInProgress = true;

    try {
      // Create token client only once, reuse if already created
      if (!tokenClient) {
        console.log('[Google OAuth] Creating new token client...');
        tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: SCOPES,
          prompt: 'consent',  // Required to ensure callback fires (proven by /oauth-test.html)
          callback: (response: { access_token?: string; error?: string; error_description?: string; expires_in?: number }) => {
            console.log('[Google OAuth] Callback received:', {
              hasAccessToken: !!response.access_token,
              error: response.error,
              errorDescription: response.error_description,
            });

            isOAuthInProgress = false;

            if (response.error) {
              console.error('[Google OAuth] Error from Google:', response.error, response.error_description);
              if (pendingReject) {
                pendingReject(new Error(`${response.error}: ${response.error_description || 'Unknown error'}`));
                pendingReject = null;
                pendingResolve = null;
              }
              return;
            }

            if (response.access_token) {
              console.log('[Google OAuth] Access token received successfully');
              accessToken = response.access_token;
              // Store in localStorage for persistence
              localStorage.setItem('google_access_token', response.access_token);

              // Also store in gmail_tokens format for Ralph AI / email processor
              const expiresIn = response.expires_in || 3600; // Default 1 hour
              const gmailTokens = {
                accessToken: response.access_token,
                expiresAt: Date.now() + (expiresIn * 1000),
              };
              localStorage.setItem('gmail_tokens', JSON.stringify(gmailTokens));
              console.log('[Google OAuth] Tokens stored in localStorage');

              if (pendingResolve) {
                pendingResolve(response.access_token);
                pendingResolve = null;
                pendingReject = null;
              }
            } else {
              // No token and no error - shouldn't happen but handle it
              console.warn('[Google OAuth] No access token and no error');
              if (pendingReject) {
                pendingReject(new Error('Authentication failed - no token received'));
                pendingReject = null;
                pendingResolve = null;
              }
            }
          },
          error_callback: (error: { type: string; message?: string }) => {
            // Log but DO NOT reject - this fires even on success when popup closes
            console.log('[Google OAuth] error_callback fired (this is normal):', error);
            // We ignore this - the success callback is what matters
          },
        });
      } else {
        console.log('[Google OAuth] Reusing existing token client');
      }

      console.log('[Google OAuth] Requesting access token...');
      tokenClient.requestAccessToken();
    } catch (error) {
      console.error('[Google OAuth] Exception during OAuth flow:', error);
      isOAuthInProgress = false;
      reject(error instanceof Error ? error : new Error('Failed to initialize Google OAuth'));
    }
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

// Type declaration for Google Identity Services
declare global {
  interface Window {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            prompt?: string;
            callback: (response: { access_token?: string; error?: string; error_description?: string; expires_in?: number }) => void;
            error_callback?: (error: { type: string; message?: string }) => void;
          }) => {
            requestAccessToken: () => void;
          };
          revoke: (token: string, callback: () => void) => void;
        };
      };
    };
  }
}
