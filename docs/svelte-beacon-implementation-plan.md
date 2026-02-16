# Svelte Beacon: Implementation Plan

## 1. Vision & Scope

### Core Purpose

Svelte Beacon is a developer tool for Svelte/SvelteKit applications that captures user feedback in context and bridges the gap between how users describe problems and how developers need to understand them. It sits at the moment someone notices something — a bug, a confusing interaction, a missing feature — and captures that observation with full context. AI structures the feedback for developers, and the same AI can later action it.

Installable as an npm package (`svelte-beacon`), it integrates through SvelteKit's `handle` hook and a single widget component. The entire system can be added in two lines of code and removed just as easily.

### What Problem Does This Solve?

Users notice problems but lack the language or context to report them effectively. Developers receive vague feedback scattered across channels — Slack messages, emails, verbal reports — and spend more time interrogating reporters than fixing issues. Feedback dies in the gap between observation and action.

Beacon closes that gap. It captures feedback where it happens, uses AI to translate user language into developer language, and provides AI-powered tools to execute the resulting tasks.

### Key Constraints

- **Single developer workflow** — no multi-user coordination, no concurrent AI tasks
- **Local-first** — SQLite database, local file storage, optional cloud AI (Anthropic API)
- **Zero file pollution** — everything lives in `node_modules` and `.beacon/`, nothing in the user's `src/` directory
- **Two integration points only** — handle hook + widget component
- **Sequential AI processing** — one Claude Code task at a time, manually triggered

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                             SVELTE BEACON                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐           │
│  │    WIDGET    │    │    DASHBOARD     │    │    AI LAYERS     │           │
│  │  (Svelte 5)  │    │  (Pre-built SPA) │    │                  │           │
│  │              │    │  Served via hook  │    │  Layer 1: Widget │           │
│  │  Renders in  │    │  at /__beacon/*   │    │  (Anthropic API) │           │
│  │  user's app  │    │                  │    │                  │           │
│  └──────┬───────┘    └────────┬─────────┘    │  Layer 2: Agent  │           │
│         │                     │              │  (Claude Code    │           │
│         │                     │              │   CLI, local)    │           │
│         └─────────┬───────────┘              └────────┬─────────┘           │
│                   │                                   │                     │
│          ┌────────┴────────────────────────────────────┘                     │
│          │                                                                   │
│  ┌───────┴──────────────────────────┐                                       │
│  │         HANDLE HOOK              │                                       │
│  │  Intercepts /__beacon/* routes   │                                       │
│  │                                  │                                       │
│  │  ┌────────────┐  ┌───────────┐   │                                       │
│  │  │  REST API  │  │  SQLite   │   │                                       │
│  │  │  Endpoints │  │  via      │   │                                       │
│  │  │            │  │  libsql   │   │                                       │
│  │  └────────────┘  └───────────┘   │                                       │
│  └──────────────────────────────────┘                                       │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Widget | Svelte 5 (Runes) | Latest reactivity model, compiles to vanilla JS |
| Dashboard | Pre-built SvelteKit SPA | Self-contained, served through handle hook, no file pollution |
| Handle Hook | SvelteKit `handle` | Intercepts requests, serves dashboard + API from node_modules |
| Database | SQLite via `@libsql/client` | Zero setup locally, Turso-compatible for production, no native binaries |
| Styling | Shadow DOM + scoped CSS | Widget styles fully isolated from host app |
| AI Layer 1 | Anthropic API | Widget-side description assist, lightweight API call |
| AI Layer 2 | Claude Code CLI | Local agent execution, file system access, code generation |
| Auth | Magic Links (Resend / console) | Passwordless, simple admin separation, production only |
| Storage | Local filesystem (`.beacon/`) | Screenshots, attachments, logs |

---

## 3. Installation & Integration

### How It Works

Svelte Beacon integrates through exactly two touchpoints in the user's project. Everything else — the dashboard, API endpoints, database, static assets — lives inside the `svelte-beacon` package in `node_modules` and is served through the handle hook interceptor.

### Installation

```bash
# Install the package
npm install -D svelte-beacon

# Run initialization (creates .beacon/ directory, updates .gitignore)
npx beacon init
```

The `init` command:

1. Creates the `.beacon/` directory structure
2. Appends `.beacon/` to `.gitignore`
3. Prints instructions for the two integration points (does not auto-modify source files)

### Integration Point 1: Handle Hook

```typescript
// src/hooks.server.ts
import { beacon } from 'svelte-beacon/server';
import { sequence } from '@sveltejs/kit/hooks';
import { dev } from '$app/environment';

export const handle = sequence(
  beacon({
    enabled: true,
    mode: dev ? 'development' : 'deployed',
    adminEmails: ['dev@example.com'],
  }),
  // ... other hooks
);
```

The handle function checks every incoming request. If the path starts with `/__beacon/`, it routes to Beacon's internal handler (API endpoints, dashboard pages, static assets). Otherwise it calls `resolve(event)` and passes through to the user's app with zero overhead.

### Integration Point 2: Widget Component

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import { Beacon } from 'svelte-beacon';
</script>

<Beacon />
<slot />
```

The widget renders a floating action button and feedback form within the user's app. All styles are isolated via Shadow DOM to prevent leakage in either direction.

### Uninstallation

```bash
npx beacon teardown
```

This removes the `.beacon/` directory and reminds the developer to remove the two integration lines. Source files are never auto-modified.

```bash
npm uninstall svelte-beacon
```

### What Each Piece Owns

| Concern | Location | Managed By |
|---------|----------|------------|
| Dashboard UI | `node_modules/svelte-beacon/dashboard/` | Package (pre-built SPA) |
| API endpoints | `node_modules/svelte-beacon/server/` | Package (handle hook) |
| Database | `.beacon/beacon.db` | Local filesystem |
| Screenshots/attachments | `.beacon/storage/` | Local filesystem |
| Config | `.beacon/config.json` | Developer-editable |
| Project context | Generated on-demand | Ephemeral (not persisted) |

---

## 4. Handle Hook Internals

### Route Interception

The handle hook intercepts all requests matching the `/__beacon/` prefix:

```typescript
// Simplified internal structure
import { ROUTE_PREFIX, API_PREFIX } from './constants.js';
// ROUTE_PREFIX = '/__beacon'
// API_PREFIX = '/__beacon/api'

export function beacon(config: BeaconConfig) {
  // Resolve configuration (mode defaults + explicit overrides)
  const resolved = resolveConfig(config);

  // Early exit: kill switch
  if (!resolved.enabled) {
    return async ({ event, resolve }) => resolve(event);
  }

  // Initialize database + run migrations (once on startup)
  const db = initDatabase(resolved);

  return async ({ event, resolve }) => {
    const { pathname } = event.url;

    // API routes
    if (pathname.startsWith(API_PREFIX)) {
      return handleAPI(event, db, resolved);
    }

    // Dashboard pages and static assets
    if (pathname.startsWith(ROUTE_PREFIX)) {
      // Auth check for dashboard (deployed mode only)
      if (resolved.mode === 'deployed' && !pathname.includes('/auth/')) {
        const session = await validateSession(event, db);
        if (!session) {
          return redirectToLogin(event);
        }
      }
      return serveDashboard(event, resolved);
    }

    // Not a Beacon route — pass through
    return resolve(event);
  };
}
```

### Dashboard Serving

The dashboard is built as a standalone SvelteKit SPA during the package's publish/build step. The compiled output (HTML, JS, CSS) is included in the published package. The handle hook serves these static files when requests match `/__beacon/*` (non-API paths).

This means the dashboard:

- Has no dependency on the user's SvelteKit build pipeline
- Cannot be affected by the user's Tailwind config, global CSS, or layout files
- Upgrades automatically when the package is updated
- Requires zero files in the user's `src/` directory

### API Routing

API endpoints are handled within the hook. The internal router maps paths to handlers:

```
POST   /__beacon/api/feedback          → Submit feedback (public)
GET    /__beacon/api/tasks              → List tasks (filterable, sortable)
GET    /__beacon/api/tasks/:id          → Get task detail
PATCH  /__beacon/api/tasks/:id          → Update task (status, notes, priority)
DELETE /__beacon/api/tasks/:id          → Delete task
POST   /__beacon/api/auth/magic-link    → Request magic link
GET    /__beacon/api/auth/verify        → Verify magic link token
POST   /__beacon/api/auth/logout        → Clear session
POST   /__beacon/api/ai/start/:id       → Start AI agent on task
POST   /__beacon/api/ai/stop/:id        → Stop AI agent
POST   /__beacon/api/ai/unblock/:id     → Answer AI's question
GET    /__beacon/api/ai/logs/:id        → Stream AI logs (SSE)
GET    /__beacon/api/attachments/:id    → Serve screenshot/attachment
GET    /__beacon/api/tasks/:id/export   → Export task for sync (authenticated)
GET    /__beacon/api/tasks/export       → Bulk export (authenticated, filterable)
```

---

## 5. Configuration System

### Modes & Kill Switch

The system has three operational states:

| State | Widget | Routes/API | Database | Use Case |
|-------|--------|------------|----------|----------|
| `enabled: false` | Renders nothing | Passthrough (zero overhead) | Not initialized | Fully disabled without uninstalling |
| `enabled: true`, mode: `development` | Full features, no auth | Open access on localhost | Local `.beacon/beacon.db` | Active development, local testing |
| `enabled: true`, mode: `deployed` | Scoped features, auth required | Protected by magic link | Persistent (Turso or VPS file) | Staging, beta, or production feedback |

### Configuration Resolution

The `mode` sets sensible defaults. Explicit widget options override mode defaults:

```typescript
beacon({
  enabled: true,
  mode: dev ? 'development' : 'deployed',
  adminEmails: ['dev@example.com'],

  // Database connection (local file or Turso URL)
  database: dev
    ? 'file:.beacon/beacon.db'
    : process.env.BEACON_DATABASE_URL,

  // Override mode defaults per-feature
  widget: {
    screenshot: true,        // on even in deployed mode
    elementSelector: true,   // on even in deployed mode
    aiAssist: false,         // off even in development
    requireEmail: false,     // anonymous submissions allowed
    position: 'bottom-right',
  },

  // AI agent configuration
  ai: {
    maxDurationMinutes: 30,
    requireTestsForBugs: true,
  },
})
```

Mode defaults:

```typescript
const MODE_DEFAULTS = {
  development: {
    screenshot: true,
    elementSelector: true,
    aiAssist: true,
    requireEmail: false,
    requireAuth: false,
  },
  deployed: {
    screenshot: false,
    elementSelector: false,
    aiAssist: false,
    requireEmail: true,
    requireAuth: true,
  },
};
```

The resolution logic: mode sets the base, explicit options win. This allows developers to opt-in to any feature in any mode.

### Environment Variables

```bash
# .env.local

# Admin access (required for deployed mode)
ADMIN_EMAILS=dev@example.com

# Email for magic links (deployed mode)
RESEND_API_KEY=re_...
# Leave blank in development — magic links print to console

# AI Layer 1: Widget assist (Anthropic API)
ANTHROPIC_API_KEY=sk-ant-...

# AI Layer 2: Agent (Claude Code CLI must be installed locally)
# No env var needed — uses local CLI installation

# Production database (deployed mode)
BEACON_DATABASE_URL=libsql://your-db.turso.io
BEACON_DATABASE_AUTH_TOKEN=...

# Optional: PR creation
GITHUB_TOKEN=ghp_...
```

### Local Config File (`.beacon/config.json`)

```json
{
  "ai": {
    "maxFilesPerTask": 10,
    "maxDurationMinutes": 30,
    "requireTestsForBugs": true
  },
  "sync": {
    "productionUrl": "https://staging.myapp.com",
    "lastSyncAt": null
  }
}
```

---

## 6. Widget Specifications

### Purpose

Capture contextual feedback from users during development or beta testing. Translate user observations into structured, developer-ready task descriptions using AI.

### Style Isolation

The widget renders inside a Shadow DOM container to guarantee complete style isolation:

```svelte
<!-- Beacon.svelte (simplified) -->
<script>
  import { onMount } from 'svelte';

  let shadowHost: HTMLDivElement;

  onMount(() => {
    const shadow = shadowHost.attachShadow({ mode: 'open' });
    // Mount widget Svelte component inside shadow root
    // Inject scoped stylesheet into shadow root
  });
</script>

<div bind:this={shadowHost}></div>
```

This ensures:
- Widget styles cannot leak into the host application
- Host application styles cannot break the widget
- Works regardless of the user's CSS framework, Tailwind config, or global resets
- No class name collisions

### Submission Target

The widget submits to a hardcoded, static endpoint. No configuration needed:

```typescript
// Internal constant shared between widget and hook
export const ROUTE_PREFIX = '/__beacon';
export const API_PREFIX = `${ROUTE_PREFIX}/api`;
const SUBMIT_URL = '/__beacon/api/feedback';
```

Because the handle hook intercepts `/__beacon/*` on the same origin, relative URLs work automatically — no environment variables, no props, no configuration to mismatch.

### Feature Tiers

Features are implemented in stages. Each tier builds on the previous:

**Tier 1 (MVP):**
- Floating action button (bottom-right, configurable position)
- Expandable form panel with: text description, type selector (bug / feature / content / accessibility / performance / other), priority selector (low / medium / high / critical)
- Automatic metadata capture on submission: current route/URL, browser and OS (via User-Agent), viewport dimensions, timestamp, dark mode preference, referrer
- Submit to `/__beacon/api/feedback`
- Success confirmation, form collapse

**Tier 2:**
- Screenshot capture via `html2canvas` or Screen Capture API
- Element selection mode: hover highlighting over DOM elements, click to capture CSS selector path, element dimensions and position recorded
- Optional email input for follow-up (required in deployed mode if configured)

**Tier 3:**
- AI-assisted description: user writes rough description, clicks "Improve with AI", Anthropic API rewrites it as a structured task description with suggested type and priority
- Canvas-based screenshot annotation: brush, arrow, text, shapes, color picker, undo/redo
- File attachments (images, text files, config snippets)

### Widget Props

```svelte
<Beacon
  enabled={true}
  position="bottom-right"
/>
```

Most configuration flows through the handle hook config. The widget reads feature flags from a lightweight config endpoint (`GET /__beacon/api/config`) on mount, which the hook generates from the resolved configuration. This means the developer configures once in `hooks.server.ts` and the widget reflects those settings automatically.

---

## 7. Dashboard Specifications

### Purpose

View, manage, and act on feedback tasks. Control the AI agent. Groom tasks with technical details before triggering AI execution.

### Serving Strategy

The dashboard is built as a standalone SvelteKit application during the `svelte-beacon` package's build/publish step. The compiled static output (HTML, JS, CSS, assets) ships inside the npm package. The handle hook serves these files when requests match `/__beacon/*` (excluding API routes).

The dashboard:
- Is completely self-contained — its own Svelte components, its own styles, its own bundle
- Communicates with the backend exclusively through the `/__beacon/api/*` endpoints
- Operates identically whether served locally or from a production deployment
- Updates automatically when the package is updated via `npm update`

### Views

**Task List (default view):**
- Table of all tasks, sortable by: date, priority, status, type
- Filterable by: status, type, priority, route
- Quick status badges with color coding
- Bulk actions (mark done, delete)
- Search by description text

**Task Detail (slide-over drawer):**
- Tabbed interface:
  - **Overview**: Full description, metadata, type, priority, status dropdown
  - **Media**: Screenshots (annotated and raw), attachments, element selector visualization
  - **AI Status**: Current agent state, progress phases, log stream, blocked question display, controls (Start / Stop / Unblock)
  - **Admin Notes**: Technical grooming notes added by developers, context for AI agent
  - **Activity**: Audit trail of all changes (status transitions, note additions, AI events)

**Login (deployed mode only):**
- Email input for magic link request
- "Check your email" confirmation
- Console output fallback in development

### Real-Time Updates

Server-sent events (SSE) stream AI agent progress to the dashboard:

```
GET /__beacon/api/ai/logs/:taskId
→ event: progress
→ event: blocked
→ event: complete
→ event: error
```

The dashboard listens to this stream when viewing a task that has an active AI session.

### Auth in Deployed Mode

In deployed mode, all dashboard routes require an authenticated session. The handle hook checks for a valid session cookie before serving dashboard pages. If missing, it redirects to the login flow. API endpoints for task management also require authentication. The feedback submission endpoint (`POST /__beacon/api/feedback`) remains public — users need to submit feedback without logging in.

Admin detection: if the authenticated email matches an entry in the `adminEmails` config array, the session is flagged as admin. Admin-only features: triggering AI agent, deleting tasks, accessing export endpoints.

---

## 8. Data Model

### Database

SQLite via `@libsql/client`. In development, this is a local file at `.beacon/beacon.db`. In deployed mode, it can be a local file on a VPS with persistent storage or a Turso instance accessed via connection URL.

The `.beacon/` directory is added to `.gitignore` during initialization. The database, screenshots, and logs are local development/deployment artifacts.

### Schema Versioning & Migrations

The database uses an append-only migration system. A `_beacon_meta` table tracks the current schema version. On every startup, the handle hook checks the version and runs any pending migrations in a transaction.

```sql
-- Always exists from first initialization
CREATE TABLE IF NOT EXISTS _beacon_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

Migrations are defined as an ordered array in code. Each has a version number, description, and `up` function. They run sequentially, wrapped in a transaction. If any migration fails, the entire batch rolls back.

**Migration rules:**
- Migrations are append-only — never edit a published migration
- Each migration runs in a transaction for safety
- The version number is stored in `_beacon_meta` after each successful migration
- Migrations run automatically on startup; the developer does nothing

### Core Tables (Migration v1)

**tasks**
```
id              TEXT PRIMARY KEY        -- Internal UUID
public_id       INTEGER UNIQUE          -- Human-readable (#1, #2, #14)
origin          TEXT DEFAULT 'local'    -- 'local' or production URL
remote_id       TEXT                    -- Task ID on production instance (for synced tasks)
type            TEXT NOT NULL           -- bug, feature, content, accessibility, performance, other
priority        TEXT NOT NULL           -- low, medium, high, critical
status          TEXT NOT NULL           -- new, backlog, ai_working, blocked, needs_review, done, closed
description     TEXT                    -- User's description (or AI-enhanced version)
route           TEXT                    -- URL/route where feedback was submitted
element_selector TEXT                   -- CSS selector path if element was selected
metadata        TEXT                    -- JSON: browser, OS, viewport, dark mode, etc.
ai_branch       TEXT                    -- Git branch name created by agent
ai_pr_url       TEXT                    -- PR URL if created
ai_blocked_reason TEXT                  -- Question from AI agent when blocked
user_email      TEXT                    -- Submitter's email (optional)
created_at      TEXT DEFAULT (datetime('now'))
updated_at      TEXT DEFAULT (datetime('now'))
```

**attachments**
```
id              TEXT PRIMARY KEY
task_id         TEXT REFERENCES tasks(id) ON DELETE CASCADE
type            TEXT                    -- screenshot, annotation, element_capture, file
filename        TEXT
path            TEXT                    -- Relative path within .beacon/storage/
mime_type       TEXT
size_bytes      INTEGER
created_at      TEXT DEFAULT (datetime('now'))
```

**admin_notes**
```
id              TEXT PRIMARY KEY
task_id         TEXT REFERENCES tasks(id) ON DELETE CASCADE
content         TEXT
author_email    TEXT
created_at      TEXT DEFAULT (datetime('now'))
updated_at      TEXT DEFAULT (datetime('now'))
```

**ai_logs**
```
id              TEXT PRIMARY KEY
task_id         TEXT REFERENCES tasks(id) ON DELETE CASCADE
level           TEXT                    -- info, progress, blocked, error, complete
message         TEXT
metadata        TEXT                    -- JSON: phase, files_changed, etc.
created_at      TEXT DEFAULT (datetime('now'))
```

**activity**
```
id              TEXT PRIMARY KEY
task_id         TEXT REFERENCES tasks(id) ON DELETE CASCADE
actor           TEXT                    -- email, 'system', or 'ai-agent'
action          TEXT                    -- status_changed, note_added, ai_started, etc.
old_value       TEXT
new_value       TEXT
created_at      TEXT DEFAULT (datetime('now'))
```

**sessions** (deployed mode)
```
id              TEXT PRIMARY KEY        -- Session token
email           TEXT NOT NULL
is_admin        INTEGER DEFAULT 0
expires_at      TEXT NOT NULL
created_at      TEXT DEFAULT (datetime('now'))
```

**magic_links** (deployed mode)
```
id              TEXT PRIMARY KEY
email           TEXT NOT NULL
token           TEXT UNIQUE NOT NULL
used            INTEGER DEFAULT 0
expires_at      TEXT NOT NULL
created_at      TEXT DEFAULT (datetime('now'))
```

### JSON Metadata Column Strategy

The `metadata` column on tasks stores a JSON blob for contextual information that doesn't need to be queried directly. This avoids a migration every time a new piece of context is captured. Use typed columns for things that need filtering/sorting (status, type, priority, route) and JSON for everything else:

```json
{
  "browser": "Chrome 121",
  "os": "macOS 14.3",
  "viewport": { "width": 1440, "height": 900 },
  "darkMode": true,
  "language": "en-US",
  "devicePixelRatio": 2,
  "referrer": "/products",
  "timestamp": "2025-02-15T10:30:00Z"
}
```

---

## 9. AI Integration

### Two-Layer Architecture

AI operates in two completely separate layers with no shared code and no direct coupling. The only connection is the task record in SQLite. Layer 1 writes a structured task. Layer 2 reads it later.

This separation means:
- Layer 1 works even if Claude Code is not installed
- Layer 2 works on manually created tasks (no AI assist required)
- Each layer can be enabled/disabled independently
- Each layer can ship and evolve independently

### Layer 1: Widget AI Assist (Anthropic API)

**Purpose:** Help users articulate feedback in a way developers can act on.

**How it works:**
1. User writes a rough description in the widget
2. User clicks "Improve with AI"
3. Widget sends description + screenshot (if captured) + metadata to `POST /__beacon/api/ai/assist`
4. Server proxies to Anthropic API (developer's API key, never exposed to client)
5. Response returns: improved description, suggested type, suggested priority
6. User reviews and accepts/edits before submitting

**Prompt strategy:** The AI is instructed to preserve the user's intent while restructuring for clarity. It should identify the type of feedback (bug, feature, etc.) and extract actionable details. It should write the description in a way that a developer — or a future AI agent — can understand and act on.

**This is a stateless API call.** No file system access, no code analysis, no memory. It runs via the Anthropic API, not Claude Code.

### Layer 2: Agent AI (Claude Code CLI)

**Purpose:** Execute development tasks on the local machine using the project codebase.

**How it works:**
1. Developer views a task in the dashboard, adds grooming notes if needed
2. Developer clicks "Start AI"
3. Server spawns Claude Code as a child process with a constructed prompt
4. Agent reads the codebase, analyzes the task, plans, implements, tests
5. Progress streams to the dashboard via SSE
6. If blocked (needs clarification), agent outputs a BLOCKED marker with a question
7. Developer answers via the dashboard, agent resumes
8. On completion: agent creates branch, commits, pushes, optionally creates PR
9. Task status → `needs_review`

**Process management:**
```typescript
import { spawn } from 'child_process';

async function startAgent(taskId: string, db: Database) {
  const task = db.getTask(taskId);
  const attachments = db.getAttachments(taskId);
  const notes = db.getAdminNotes(taskId);
  const projectContext = generateProjectContext(); // Generated fresh each time

  const prompt = buildPrompt(task, attachments, notes, projectContext);

  const process = spawn('claude', [
    '--print',
    '--output-format', 'stream-json',
    '--max-turns', '50',
    prompt,
  ]);

  // Parse stdout for structured markers: PROGRESS, BLOCKED, COMPLETE
  // Write parsed events to ai_logs table
  // Stream events to connected SSE clients
}
```

**Project context injection:** Generated dynamically on-demand when an agent task starts. Never persisted as a stale cache. The generator scans:
- Framework and dependency versions (package.json)
- Project structure (key directories, route patterns)
- Design system in use (component library, CSS framework)
- Test patterns (test runner, file conventions, existing test examples)
- TypeScript configuration
- Relevant SvelteKit conventions (load functions, form actions, hooks)

**Agent task modes:**

| Mode | Focus | Rules |
|------|-------|-------|
| Bug | Root cause analysis, minimal fix, regression test | Write failing test first, fix, verify |
| Feature | Working implementation matching project patterns | MVP scope, follow existing conventions |
| Content | Precise text changes | Literal interpretation, minimal code change |
| Accessibility | WCAG compliance, keyboard nav, screen readers | ARIA attributes, automated + manual checks |
| Performance | Measurable improvement | Before/after metrics required |
| UX | Responsive design, interaction polish | Match design system, test viewports |

**Structured output markers** (Claude Code outputs these for the dashboard to parse):

```
[BEACON:PROGRESS] {"phase": "analyzing", "message": "Reading component structure..."}
[BEACON:PROGRESS] {"phase": "implementing", "message": "Updating LoginForm.svelte..."}
[BEACON:BLOCKED] {"question": "The form has two submit buttons — should I fix the primary or secondary?"}
[BEACON:COMPLETE] {"branch": "beacon/fix-14-login-button", "files_changed": 3, "tests_added": 1}
```

**Verification checklist** (agent runs before marking complete):
- TypeScript compiles without errors
- All existing tests pass
- New tests pass (if applicable)
- No linting errors introduced
- Changes are scoped to the task (no unrelated modifications)

---

## 10. Authentication System

### Development Mode

No authentication. The dashboard is accessible on localhost. If you can run the dev server, you have access. This matches how existing dev tools work (Drizzle Studio, Prisma Studio, Storybook).

### Deployed Mode

Magic link authentication protects the dashboard while keeping feedback submission public.

**Flow:**
1. User navigates to `/__beacon/` → redirected to `/__beacon/login`
2. Enters email → `POST /__beacon/api/auth/magic-link`
3. Server generates a signed JWT, sends via email (Resend in production, `console.log` in development)
4. User clicks link → `GET /__beacon/api/auth/verify?token=...`
5. Server verifies token (single use, 15-minute expiry), creates session
6. Session cookie set (HttpOnly, SameSite=Strict, 7-day expiry)
7. Redirected to dashboard

**Admin detection:** If the authenticated email appears in the `adminEmails` config array, the session's `is_admin` flag is set to `true`. Admin-only capabilities: AI agent control, task deletion, export endpoints.

**Public endpoints (no auth required):**
- `POST /__beacon/api/feedback` — feedback submission from widget
- `GET /__beacon/api/config` — widget configuration (feature flags)

---

## 11. Production-to-Local Sync

### The Problem

In production/staging, users submit feedback to the deployed instance. The AI agent (Claude Code) runs on the developer's local machine and needs access to the task data. These are separate environments.

### Design: One-Way Sync

Production and local are two separate instances of Beacon, each with their own database. Data flows strictly downward:

```
Production (collecting feedback)
    │
    │  npx beacon pull
    ▼
Local (development + AI execution)
```

This is intentionally one-directional. Work done locally (branches, PRs) flows to the codebase via git, not back into the production database. The production task is resolved when the fix deploys and the developer marks it done in the production dashboard.

This avoids all hard problems of bidirectional sync: conflict resolution, eventual consistency, merge logic. None of that exists here.

### Export Endpoint (Production Side)

The production instance exposes authenticated export endpoints:

```
GET /__beacon/api/tasks/:id/export     → Single task with attachments
GET /__beacon/api/tasks/export?status=backlog&since=2025-02-01  → Bulk export
```

Response format:

```json
{
  "version": 1,
  "exported_at": "2025-02-15T10:30:00Z",
  "source": "https://staging.myapp.com",
  "tasks": [
    {
      "id": "prod-abc123",
      "public_id": 14,
      "description": "Login button unresponsive on mobile Safari...",
      "type": "bug",
      "priority": "high",
      "status": "backlog",
      "route": "/login",
      "element_selector": "form.login > button[type=submit]",
      "metadata": { "browser": "Safari 17", "viewport": { "width": 375, "height": 812 } },
      "admin_notes": [
        { "content": "Confirmed reproducible on iOS 17.2", "author_email": "dev@example.com" }
      ],
      "attachments": [
        {
          "filename": "screenshot-login.png",
          "type": "screenshot",
          "mime_type": "image/png",
          "data": "base64..."
        }
      ]
    }
  ]
}
```

### Pull CLI (Local Side)

```bash
# Pull all backlog tasks from production
npx beacon pull --from https://staging.myapp.com

# Pull a specific task
npx beacon pull --from https://staging.myapp.com --task 14

# Pull tasks updated since last sync
npx beacon pull --from https://staging.myapp.com --since last
```

The pull command:
1. Authenticates against the production instance (API token or session)
2. Downloads task data and attachments
3. Writes attachment files to `.beacon/storage/`
4. Inserts or updates tasks in the local database (deduplication via `origin` + `remote_id`)
5. Records sync timestamp in `.beacon/config.json`

### Task Identity & Deduplication

Every task has an `origin` field and `remote_id`:

- Tasks created locally: `origin = 'local'`, `remote_id = null`
- Tasks pulled from production: `origin = 'https://staging.myapp.com'`, `remote_id = 'prod-abc123'`

The `origin` + `remote_id` pair is the deduplication key. Pulling the same task again (e.g., after developer adds grooming notes in production) updates the existing local record rather than creating a duplicate.

### AI Agent Doesn't Care About Origin

Once a task is in the local database, the AI agent works identically regardless of whether the task was created locally or synced from production. The agent sees a description, metadata, attachments, and grooming notes — origin is irrelevant. This means the AI integration is built once and works for all task sources.

---

## 12. Database Hosting in Production

### Goal

When Beacon runs in deployed mode (staging/production), the SQLite database needs to persist across deploys. The approach depends on the hosting platform.

### Option A: VPS or Persistent Filesystem (Simplest)

Platforms with persistent filesystems — Railway, Fly.io, DigitalOcean, any traditional VPS — can store SQLite as a regular file. No additional services needed.

```bash
# .env (production)
BEACON_DATABASE_URL=file:/data/beacon.db
```

Mount a persistent volume at `/data/` (Railway volumes, Fly volumes, or just a directory on a VPS). SQLite handles concurrent reads and single-writer access without issue for a feedback tool's workload.

**Fly.io example:**
```toml
# fly.toml
[mounts]
  source = "beacon_data"
  destination = "/data"
```

**Railway:** Attach a volume in the dashboard, reference the mount path in the env var.

**Cost:** Free tier or ~$0–5/month depending on platform.

### Option B: Turso (Free Tier, Managed)

Turso provides hosted SQLite (libSQL) with a generous free tier (500 databases, 9GB storage, 25M row reads/month). Since Beacon uses `@libsql/client`, switching from local file to Turso is a connection string change:

```bash
# .env (production with Turso)
BEACON_DATABASE_URL=libsql://your-db-name.turso.io
BEACON_DATABASE_AUTH_TOKEN=eyJ...
```

No code changes — the `@libsql/client` driver handles both local files and remote Turso connections with the same API.

**Free tier limits (as of writing):** More than sufficient for a feedback collection tool. A busy beta with hundreds of submissions per month wouldn't approach these limits.

### Option C: Ephemeral Hosting (Vercel, Netlify, Cloudflare)

These platforms don't provide persistent filesystems. Options:

- **Use Turso** (recommended) — managed libSQL, free tier, works via HTTP
- **Use Cloudflare D1** — if deploying to Cloudflare, D1 is a natural fit (requires adapter)
- **Avoid local file SQLite** — it will be lost on every deploy

### Recommendation

For most developers: start with **Turso free tier** for deployed mode. It's zero-maintenance, free, and the `@libsql/client` driver makes the transition from local file transparent. The developer changes one environment variable and everything works.

The `@libsql/client` setup:

```typescript
import { createClient } from '@libsql/client';

function initDatabase(config: ResolvedConfig) {
  const client = createClient(
    config.database.startsWith('libsql://')
      ? { url: config.database, authToken: config.databaseAuthToken }
      : { url: config.database }  // local file
  );

  runMigrations(client);
  return client;
}
```

---

## 13. File Structure

### Package Structure (inside node_modules/svelte-beacon)

```
svelte-beacon/
├── dist/
│   ├── server/
│   │   ├── index.js            # beacon() handle hook export
│   │   ├── api/                # API route handlers
│   │   ├── db/                 # Database init, migrations, queries
│   │   ├── auth/               # Session management, magic links
│   │   └── ai/                 # Claude Code spawning, log parsing
│   ├── widget/
│   │   ├── Beacon.svelte       # Widget component (Shadow DOM wrapper)
│   │   └── internal/           # Widget sub-components (form, screenshot, etc.)
│   └── dashboard/
│       ├── index.html          # Pre-built dashboard SPA entry
│       ├── assets/             # JS, CSS bundles
│       └── _app/               # SvelteKit build output
├── cli/
│   ├── init.js                 # npx beacon init
│   ├── teardown.js             # npx beacon teardown
│   └── pull.js                 # npx beacon pull
├── package.json
└── README.md
```

### User's Project (after installation)

```
my-app/
├── src/
│   ├── hooks.server.ts         # +4 lines (import + beacon() in sequence)
│   └── routes/
│       └── +layout.svelte      # +2 lines (import + <Beacon />)
├── .beacon/                    # Created by npx beacon init
│   ├── beacon.db               # SQLite database (gitignored)
│   ├── storage/
│   │   ├── screenshots/        # Captured screenshots
│   │   └── attachments/        # User-uploaded files
│   └── config.json             # Local configuration overrides
├── .gitignore                  # .beacon/ appended by init
└── .env.local                  # API keys, admin emails
```

Note: Zero files added to `src/`. The only changes to the user's existing files are the import lines in `hooks.server.ts` and `+layout.svelte`.

---

## 14. Key Workflows

### Feedback Submission

1. User clicks the Beacon floating button → form panel expands
2. User writes description, selects type and priority
3. Optionally: captures screenshot, selects element, uses AI assist
4. Submits → `POST /__beacon/api/feedback` with form data + metadata
5. Handle hook routes to API handler
6. Handler saves task to SQLite, stores attachments to `.beacon/storage/`
7. Returns task ID and public ID (#14)
8. Widget shows success confirmation, collapses

### AI-Assisted Description (Layer 1)

1. User writes rough description in widget
2. Clicks "Improve with AI"
3. Widget sends `POST /__beacon/api/ai/assist` with description + screenshot + metadata
4. Server calls Anthropic API with structured prompt
5. Returns: improved description, suggested type, suggested priority
6. Widget populates fields with suggestions — user can accept, edit, or discard
7. User submits the final version

### AI Task Execution (Layer 2)

1. Developer opens task in dashboard, reviews details
2. Adds grooming notes (technical context, approach guidance, constraints)
3. Clicks "Start AI" → `POST /__beacon/api/ai/start/:id`
4. Server generates fresh project context, builds prompt from task + notes + context
5. Spawns Claude Code CLI as child process
6. Progress streams via SSE to dashboard in real-time
7. If blocked: status → `blocked`, question displayed in dashboard, agent waits
8. Developer types answer → `POST /__beacon/api/ai/unblock/:id` → agent resumes
9. On complete: agent pushes branch, creates PR (if GitHub token configured)
10. Task status → `needs_review`, PR URL recorded
11. Developer reviews PR, merges, marks task `done`

### Production-to-Local Sync

1. Users submit feedback on the deployed app
2. Developer reviews tasks in the production dashboard
3. Developer grooms tasks (adds technical notes, sets priority)
4. Developer marks tasks as `backlog` (ready for work)
5. On local machine: `npx beacon pull --from https://staging.myapp.com`
6. Tasks and attachments sync to local `.beacon/` database
7. Developer opens local dashboard, sees synced tasks alongside local tasks
8. Triggers AI agent on synced task — works identically to local tasks

### Magic Link Auth (Deployed Mode)

1. User navigates to `/__beacon/` → redirected to `/__beacon/login`
2. Enters email → `POST /__beacon/api/auth/magic-link`
3. Server generates JWT (15-min expiry, single use), sends via Resend
4. User clicks link → `GET /__beacon/api/auth/verify?token=...`
5. Server verifies token, creates session record, sets HttpOnly cookie (7-day expiry)
6. Redirected to dashboard with appropriate role (user or admin)

---

## 15. Success Criteria

### Functional

- [ ] Package installable via `npm install -D svelte-beacon` + `npx beacon init`
- [ ] Two integration points only: handle hook + widget component
- [ ] Widget captures feedback with automatic metadata
- [ ] Dashboard displays tasks in sortable, filterable table
- [ ] Dashboard served entirely through handle hook (zero files in user's src/)
- [ ] Status workflow: new → backlog → ai_working → blocked → needs_review → done → closed
- [ ] AI Layer 1: widget description assist via Anthropic API
- [ ] AI Layer 2: Claude Code executes tasks with progress streaming
- [ ] Block/resume flow for ambiguous AI tasks
- [ ] PRs created automatically on agent completion
- [ ] Production-to-local sync via `npx beacon pull`
- [ ] Kill switch (`enabled: false`) disables everything with zero overhead

### Quality

- [ ] Widget styles fully isolated via Shadow DOM
- [ ] AI produces working, tested code for >80% of well-groomed tasks
- [ ] Dashboard updates in real-time during AI execution via SSE
- [ ] Zero external infrastructure required for development mode
- [ ] Clean uninstall: remove two imports + `npm uninstall` + delete `.beacon/`
- [ ] Database migrations run automatically and transparently

### Production Readiness

- [ ] Deployed mode with magic link auth
- [ ] Feature opt-in allows any widget feature in any mode
- [ ] SQLite works with both local files and Turso
- [ ] Export API enables production-to-local sync
- [ ] Zero runtime cost when `enabled: false`

---

## 16. Implementation Phases

| Phase | Focus | Deliverable | Ship Criteria |
|-------|-------|-------------|---------------|
| **1** | Package scaffold & hook | npm package structure, handle hook interceptor, database init + migrations, `npx beacon init` CLI, placeholder dashboard page ("Beacon is running") | Hook intercepts requests, database initializes, init command works |
| **2** | API + minimal widget | Feedback submission endpoint, text-based widget (description, type, priority, auto-metadata), Shadow DOM isolation | User can submit feedback, task appears in database |
| **3** | Dashboard core | Task list table (sort/filter), task detail drawer, status management, served through handle hook | Developer can view and manage all tasks |
| **4** | Auth system | Magic links (Resend + console fallback), session management, admin detection, route protection | Dashboard protected in deployed mode, widget submission public |
| **5** | Widget enhancements | Screenshot capture, element selection, improved form UX | Visual context captured with feedback |
| **6** | AI Layer 1 | Widget AI assist for description, type, and priority suggestions | Users get structured descriptions from rough input |
| **7** | AI Layer 2 | Claude Code agent integration, progress streaming via SSE, block/resume, branch/PR creation | Developer triggers AI, watches progress, reviews output |
| **8** | Sync & production | Export API, `npx beacon pull` CLI, Turso support, config for deployed mode, feature opt-in | Full dev-to-production workflow operational |
| **9** | Polish | Annotation tools, admin notes, activity log, agent modes, verification checklist, documentation | Production-quality tool with comprehensive docs |

Each phase produces a working increment. After Phase 3, you have a functional feedback collection and management tool. After Phase 7, you have the full AI-powered development workflow. Phases 8-9 extend reach and polish.

---

## 17. Decisions Log

| Decision | Alternative Considered | Rationale |
|----------|----------------------|-----------|
| Handle hook integration | Routes in user's src/ directory | Zero file pollution, clean install/uninstall, automatic upgrades |
| Pre-built dashboard SPA | Runtime-rendered from user's SvelteKit | Self-contained, no dependency on user's build pipeline or styles |
| `@libsql/client` | `better-sqlite3`, `sql.js` | No native binaries, works local + Turso, async-compatible |
| Shadow DOM for widget | Scoped CSS, CSS prefix | Strongest isolation guarantee, immune to host app's CSS framework |
| Static submission URL | Configurable endpoint prop | Zero configuration, no mismatch possible, relative path just works |
| Append-only migrations | ORM-managed schema, manual SQL | Simple, transparent, safe with transaction wrapping |
| Two AI layers (API + CLI) | Single AI system | Independent deployment, either works without the other |
| On-demand project context | Cached context file | Project structure changes during development, stale cache causes bugs |
| One-way sync | Bidirectional sync | Eliminates conflict resolution, merge logic, eventual consistency |
| Magic links | Passwords, OAuth | Passwordless, no reset flow, no external auth dependencies |
| SQLite | PostgreSQL | Zero setup locally, Turso for production, single-user workload |
| Sequential AI (no queue) | Task queue system | Single developer, explicit control, review between tasks |
| SSE for AI logs | WebSocket | Simpler, one-way sufficient for log streaming, auto-reconnect |
| Dev dependency install | Global install | Scoped to project, version-locked, visible in package.json |
| Feature opt-in per mode | Rigid mode bundles | Developers can enable screenshot in production if needed |
| `enabled` kill switch | `{#if dev}` only | Supports runtime toggle without rebuild, deployed-mode on/off |
