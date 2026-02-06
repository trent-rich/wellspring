# Email Processor & Ralph AI Integration PRD

## Overview
Build an automated email-to-task pipeline for the Watershed Command Center. This system will fetch emails from Gmail, use AI to extract actionable tasks, and create tasks in the Supabase database.

## Tech Stack
- React 18 + TypeScript + Vite (existing app)
- Supabase (PostgreSQL, Auth, Edge Functions)
- Google Gmail API
- Claude API for AI task extraction
- Zustand for state management

## Existing Infrastructure
- Google OAuth already configured (Client ID: 888136833202-81oi811u43obkgnqrgqc1meajnvk8fns.apps.googleusercontent.com)
- Gmail readonly scope already requested during OAuth
- Supabase connected with tasks table ready
- User authentication working

## Features to Build

### Feature 1: Gmail Email Fetcher Service
- [ ] Create `src/lib/gmailService.ts` with functions to:
  - Fetch recent emails from Gmail API using the existing OAuth token
  - Parse email metadata (from, to, subject, date, thread ID)
  - Extract email body (prefer plain text, fallback to HTML stripped)
  - Filter emails by date range and unread status
  - Store the Gmail access token in localStorage after OAuth
- [ ] Add Gmail API types to `src/types/gmail.ts`
- [ ] Test fetching emails and logging them to console

### Feature 2: AI Task Extractor
- [ ] Create `src/lib/taskExtractor.ts` with functions to:
  - Send email content to Claude API for analysis
  - Extract action items, deadlines, and priority from email
  - Categorize tasks (email_reply, action, meeting_schedule, review, decision)
  - Return structured task data matching the Task type
- [ ] Create environment variable for Claude API key (VITE_ANTHROPIC_API_KEY)
- [ ] Handle rate limiting and errors gracefully

### Feature 3: Email Processor Integration
- [ ] Create `src/lib/emailProcessor.ts` that orchestrates:
  - Fetching new emails since last sync
  - Running each email through task extractor
  - Creating tasks in Supabase via taskStore
  - Tracking processed email IDs to avoid duplicates
- [ ] Store last sync timestamp and processed email IDs in localStorage
- [ ] Add sync status and controls to Settings page

### Feature 4: Ralph AI Dashboard Widget
- [ ] Add "Ralph AI" section to Dashboard showing:
  - Last sync time
  - Number of emails processed
  - Number of tasks created
  - Manual "Process Emails" button
- [ ] Show recent AI-extracted tasks with source email preview

### Feature 5: Background Sync (Optional Enhancement)
- [ ] Add periodic background sync option (every 15 minutes)
- [ ] Add toggle in Settings to enable/disable auto-sync
- [ ] Show notification when new tasks are created

## File Structure
```
src/
  lib/
    gmailService.ts      # Gmail API integration
    taskExtractor.ts     # Claude AI task extraction
    emailProcessor.ts    # Orchestration layer
  types/
    gmail.ts             # Gmail API types
  components/
    RalphWidget.tsx      # Dashboard widget for Ralph AI
```

## Environment Variables Needed
```
VITE_ANTHROPIC_API_KEY=sk-ant-...  # Claude API key for task extraction
```

## Success Criteria
1. User can click "Sync Emails" and see their Gmail inbox processed
2. Action items from emails automatically become tasks
3. Tasks show source (email) and link back to original thread
4. No duplicate tasks created from same email
5. Dashboard shows Ralph AI status and recent activity
