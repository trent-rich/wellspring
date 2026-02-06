# Watershed Command Center

An AI-powered unified task and coordination system where employees operate primarily through Command Center (not email clients). Built with humane design principles that protect embodied time and support Watershed's governance structure.

## Core Principles

- **Work is Translation**: AI converts inbound signals into structured candidates; humans confirm, modify, or reject
- **Governance is Legible**: Decisions, escalations, and gate checks are recorded as messages in a thread
- **Embodied Time is Protected**: Some time exists for presence; the system suppresses automation and urgency during these periods
- **Consent for Monitoring**: Meeting monitoring, transcription ingestion, and artifact processing require explicit opt-in
- **Silence is a Feature**: The system must sometimes *not* act to preserve regulation

## Features

### Task Management
- Unified task inbox mixing tasks, messages, judgment requests, and meeting interrupts
- Priority-based sorting with SLA tracking
- Cell-based routing (Thermal Commons, Political, Engineering, Narrative, Legal/Ethical)
- Hard gate enforcement for critical decisions
- Escalation management with rate limiting

### Calendar Integration
- Google Calendar sync
- Now/Next/Today schedule strip
- Meeting mode with task suppression
- Pre-read enforcement with compliance tracking
- Embodied time markers with settle buffers

### Ideas & Containment
- 72-hour idea containment period before execution
- Ripeness tracking with progress visualization
- Override capability with authority tracking
- Multi-destination routing to cells and SPVs

### Voice-First Operation
- Push-to-talk voice commands using macOS native speech
- Task opening by ID ("Open T-1234")
- Quick actions ("Complete task", "What's next?")
- Navigation commands

### Humane Throttles
- 72-hour idea-to-execution throttle
- Meeting-to-task cooling period (45 minutes default)
- Escalation backoff (max 1 per thread per 4 hours)
- Notification batching
- Judgment request budget (max 5 concurrent)
- Decision freeze window for hard gates

### Protected States
- **Normal**: Full functionality
- **Meeting Mode**: Task list dims, meeting-related tasks only
- **Embodied**: No nudges, no async conversion, no preread enforcement
- **Settle**: Suppress task urgency, silence notifications, gentle transition
- **Focus**: Suppress interrupts, minimize distractions

### Email Ghostwriter Integration
- AI-powered email drafts matching your writing style
- Quick refinement with natural language feedback
- Variation generation
- Integrated with task context

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **State Management**: Zustand with persistence
- **Backend**: Supabase (PostgreSQL, Auth, Realtime, Edge Functions)
- **UI Components**: Lucide icons, cmdk (command palette), Framer Motion
- **Voice**: Web Speech API (leverages macOS native speech)

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase account

### 1. Install Dependencies

```bash
cd watershed-command-center
npm install
```

### 2. Set Up Supabase

1. Create a new Supabase project at https://supabase.com
2. Run the migration files in order:
   ```bash
   # In Supabase SQL Editor:
   # 1. Run supabase/migrations/001_initial_schema.sql
   # 2. Run supabase/migrations/002_seed_actors.sql
   ```

### 3. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_GOOGLE_CLIENT_ID=your-google-client-id  # For calendar integration
VITE_ENABLE_VOICE=true
```

### 4. Run Development Server

```bash
npm run dev
```

Open http://localhost:3001 in your browser.

### 5. Create First User

Sign up with email/password. This creates:
- User record
- Default interrupt policy
- User state record

## Project Structure

```
watershed-command-center/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   ├── CommandPalette.tsx    # Cmd+K command palette
│   │   ├── EmailGhostwriter.tsx  # AI email drafting
│   │   ├── Layout.tsx            # Main app layout
│   │   ├── LoadingScreen.tsx
│   │   ├── MeetingMode.tsx       # Meeting mode panel
│   │   ├── PrereadEnforcement.tsx
│   │   ├── ScheduleStrip.tsx     # Now/Next/Today
│   │   ├── StateOverlay.tsx      # Protected state indicator
│   │   ├── TaskDetail.tsx        # Task drawer
│   │   ├── TaskStream.tsx        # Prioritized task list
│   │   └── VoiceInput.tsx        # Voice command input
│   ├── hooks/
│   │   └── useKeyboardShortcuts.ts
│   ├── lib/
│   │   ├── supabase.ts           # Supabase client
│   │   └── utils.ts              # Utility functions
│   ├── pages/
│   │   ├── CalendarPage.tsx
│   │   ├── Dashboard.tsx
│   │   ├── IdeasPage.tsx
│   │   ├── LoginPage.tsx
│   │   ├── SettingsPage.tsx
│   │   └── TasksPage.tsx
│   ├── store/
│   │   ├── authStore.ts          # Authentication state
│   │   ├── calendarStore.ts      # Calendar & events
│   │   ├── ideaStore.ts          # Ideas & containment
│   │   ├── messageStore.ts       # GasTown messages
│   │   ├── notificationStore.ts  # Notification batching
│   │   ├── taskStore.ts          # Tasks & realtime
│   │   └── userStateStore.ts     # Embodied states
│   ├── types/
│   │   └── index.ts              # TypeScript definitions
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql
│       └── 002_seed_actors.sql
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── vite.config.ts
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` | Open command palette |
| `G` | Go to Dashboard |
| `T` | Go to Tasks |
| `I` | Go to Ideas |
| `C` | Go to Calendar |
| `N` | New task |
| `⇧C` | Complete selected task |
| `⇧S` | Snooze selected task |
| `⌘⇧F` | Toggle focus mode |
| `Space` (hold) | Push-to-talk voice input |
| `Esc` | Close drawer/deselect |

## Voice Commands

- "Open T-1234" - Open task by ID
- "Complete T-1234" - Mark task complete
- "What's next?" - Go to task list
- "Start focus mode" - Enter focus mode
- "Go to calendar" - Navigate to calendar
- "Search [query]" - Search tasks

## Watershed Actors

The system includes pre-seeded actors for Watershed's organizational structure:

| Actor | Role |
|-------|------|
| `cell_1` | Thermal Commons Definition |
| `cell_2` | Political/Jurisdictional |
| `cell_3` | Engineering/Safety/Ops |
| `cell_4` | Narrative/Cultural |
| `cell_5` | Legal/Ethical/Containment |
| `cos` | Chief of Staff |
| `head_of_watershed` | Ultimate Authority |
| `reality_check` | Interrupt Authority |
| `ralph` | Personal Cognition Layer |
| `gastown` | Organizational Message Bus |

## Deployment

### Deploy to Vercel

1. Push to GitHub
2. Connect repo to Vercel
3. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_GOOGLE_CLIENT_ID`
4. Deploy

## Development Roadmap

### Phase 1 (MVP) ✅
- [x] Supabase schema
- [x] React app shell with routing
- [x] Task stream and detail drawer
- [x] Command palette
- [x] Schedule strip
- [x] Basic voice commands
- [x] Embodied states and settle buffer

### Phase 2 (Meetings)
- [x] Pre-read enforcement UI
- [x] Meeting mode UI
- [ ] Google Calendar OAuth integration
- [ ] Meeting artifact polling (when Meet API available)
- [ ] Meeting-to-task cooling period

### Phase 3 (Governance)
- [x] 72-hour idea throttle
- [x] Escalation backoff
- [x] Notification batching
- [ ] External commitment delay (two-step send)
- [ ] Reality Check interrupt SLA dashboard

### Future
- [ ] Gmail integration
- [ ] Slack integration
- [ ] Monday.com integration
- [ ] Full Email Ghostwriter style analysis

## License

Proprietary - Watershed/Abundance Energy

## Support

Contact the development team for issues or questions.
