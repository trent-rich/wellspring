// Gmail API Type Definitions

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId: string;
  internalDate: string;
  payload: GmailMessagePart;
  sizeEstimate: number;
  raw?: string;
}

export interface GmailMessagePart {
  partId?: string;
  mimeType: string;
  filename?: string;
  headers: GmailHeader[];
  body: GmailMessagePartBody;
  parts?: GmailMessagePart[];
}

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailMessagePartBody {
  attachmentId?: string;
  size: number;
  data?: string; // Base64 encoded
}

export interface GmailMessageList {
  messages?: GmailMessageRef[];
  nextPageToken?: string;
  resultSizeEstimate: number;
}

export interface GmailMessageRef {
  id: string;
  threadId: string;
}

export interface GmailThread {
  id: string;
  historyId: string;
  messages: GmailMessage[];
}

// Parsed email for easier consumption
export interface ParsedEmail {
  id: string;
  threadId: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  subject: string;
  date: Date;
  snippet: string;
  body: string;
  bodyHtml?: string;
  isUnread: boolean;
  labels: string[];
}

export interface EmailAddress {
  email: string;
  name?: string;
}

// Gmail API query parameters
export interface GmailListParams {
  maxResults?: number;
  pageToken?: string;
  q?: string; // Gmail search query
  labelIds?: string[];
  includeSpamTrash?: boolean;
}

// Token storage
export interface GmailTokens {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
}
