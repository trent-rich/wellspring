// Google Calendar Integration
// This module handles OAuth and calendar sync

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',  // Required for creating drafts
  'https://www.googleapis.com/auth/drive.file',     // Required for uploading files to Drive
].join(' ');

// Store the access token
let accessToken: string | null = null;

// Initialize Google Identity Services
export const initGoogleAuth = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!GOOGLE_CLIENT_ID) {
      reject(new Error('Google Client ID not configured'));
      return;
    }

    // Load the Google Identity Services library
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
};

// Start OAuth flow
export const signInWithGoogle = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!window.google) {
      reject(new Error('Google Identity Services not loaded'));
      return;
    }

    if (!GOOGLE_CLIENT_ID) {
      reject(new Error('Google Client ID not configured'));
      return;
    }

    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: (response: { access_token?: string; error?: string; expires_in?: number }) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        if (response.access_token) {
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

          resolve(response.access_token);
        }
      },
    });

    client.requestAccessToken();
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
            callback: (response: { access_token?: string; error?: string }) => void;
          }) => {
            requestAccessToken: () => void;
          };
        };
      };
    };
  }
}
