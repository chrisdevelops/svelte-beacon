# Svelte Beacon Architecture

## System Overview

Svelte Beacon is an npm package (`svelte-beacon`) that integrates into a
SvelteKit application through two touchpoints:

1. A `handle` hook in `hooks.server.ts` that intercepts `/__beacon/*`
   requests
2. A `<Beacon />` component in the root layout that renders the feedback
   widget

Everything else — the REST API, SQLite database, pre-built dashboard,
AI integrations, CLI tools — lives inside the package and the `.beacon/`
directory. Nothing is written to the host project's `src/`.

```
Host SvelteKit Application
│
├── src/hooks.server.ts         ← Integration point 1: beacon() handle
├── src/routes/+layout.svelte   ← Integration point 2: <Beacon /> component
├── .beacon/                    ← Local data (gitignored)
│   ├── beacon.db               ← SQLite database
│   ├── config.json             ← Sync timestamps, local config
│   └── storage/
│       ├── screenshots/
│       └── attachments/
│
└── node_modules/svelte-beacon/ ← The package
    ├── dist/
    │   ├── server/             ← Compiled handle hook + API + DB
    │   ├── widget/             ← Compiled Svelte widget components
    │   └── dashboard/          ← Pre-built SvelteKit SPA
    └── cli/                    ← CLI commands (init, teardown, pull)
```

## Request Flow

Every HTTP request to the host application passes through the handle
hook. Beacon's hook runs first (via `sequence()`) and makes a routing
decision:

```
Incoming Request
  │
  ├── Path starts with /__beacon/api/*?
  │   YES → Route to Beacon REST API handler
  │         (returns JSON response, resolve() never called)
  │
  ├── Path starts with /__beacon/*?
  │   YES → Serve dashboard static files
  │         (returns HTML/JS/CSS, resolve() never called)
  │
  └── Any other path?
      YES → Pass through to host app via resolve(event)
            (Beacon is invisible, zero overhead)
```

The widget (client-side) communicates with the API via `fetch()` to
`/__beacon/api/*` on the same origin. No CORS, no configuration.

## Package Boundaries

### Three Compilation Targets

The package contains three independently compiled artifacts:

| Artifact | Source | Compiler | Output | Purpose |
|---|---|---|---|---|
| Server | `src/server/` | tsc | `dist/server/` | Handle hook, API, DB, auth, AI |
| Widget | `src/widget/` | svelte-package | `dist/widget/` | Svelte components for host app |
| Dashboard | `dashboard/` | SvelteKit + adapter-static | `dist/dashboard/` | Pre-built SPA served by hook |

These never cross-import. The server doesn't import widget components.
The widget doesn't import server modules. The dashboard is a completely
separate SvelteKit application.

### Package Exports

```json
{
  ".": {
    "svelte": "./dist/widget/index.js"
  },
  "./server": {
    "default": "./dist/server/index.js"
  }
}
```

Consumers use:
- `import { Beacon } from 'svelte-beacon'` — the widget
- `import { beacon } from 'svelte-beacon/server'` — the handle hook

### CLI Commands

```json
{
  "bin": {
    "beacon": "./cli/index.js"
  }
}
```

Three commands: `npx beacon init`, `npx beacon teardown`, `npx beacon pull`.
These are plain JavaScript files (no compilation needed) that operate on
the host project's filesystem.

## Component Architecture

### Handle Hook (`beacon()`)

The handle hook is the heart of the package. It provides:

- **Fast passthrough** — Non-beacon requests skip all Beacon logic with
  minimal overhead (one `startsWith` check)
- **Kill switch** — `enabled: false` makes the hook a pure passthrough
- **Lazy initialization** — Database client created on first Beacon
  request, not on server start
- **Config resolution** — Merges user options with mode-specific defaults
- **API dispatch** — Routes `/__beacon/api/*` to handler functions
- **Dashboard serving** — Serves pre-built SPA files for `/__beacon/*`
- **Auth middleware** — Session validation for deployed mode
- **Error boundary** — Catches all errors, never crashes the host app

### Widget (`<Beacon />`)

The widget renders inside a Shadow DOM container for complete style
isolation:

```
Host App DOM (light DOM)
│
└── <div data-beacon-host>
    └── #shadow-root (open)
        └── <div class="beacon-root">
            ├── <FloatingButton />
            └── <FeedbackForm />  (when open)
                ├── <TypeSelector />
                ├── <PrioritySelector />
                ├── <ScreenshotCapture />  (Tier 2)
                ├── <ElementSelector />    (Tier 2)
                ├── <AIAssist />           (Tier 3)
                └── Submit / Cancel
```

The public `<Beacon />` component lives in the light DOM. It creates
the shadow root in `onMount()`, mounts the internal component tree
into the shadow root, and injects styles via `adoptedStyleSheets`.

Props passed through `mount()` are not automatically reactive — the
widget uses a shared state object (`.svelte.ts` file with `$state`)
to propagate changes across the shadow boundary.

### Dashboard

A standalone SvelteKit SPA compiled with `adapter-static`:

- Base path: `/__beacon` (all routes and assets prefixed)
- SPA fallback: `index.html` (client-side routing)
- Data fetching: `/__beacon/api/*` via centralized `api.ts` client
- Auth: `AuthGuard` component redirects to login in deployed mode
- Real-time: SSE connection for AI log streaming

## Database Layer

SQLite via `@libsql/client`. Supports two modes:

- **Development:** Local file at `.beacon/beacon.db`
- **Deployed:** Local file on VPS or Turso instance via connection URL

### Schema (7 tables)

```
tasks              ← Core feedback records
  ├── attachments  ← Screenshots, files (CASCADE delete)
  ├── admin_notes  ← Developer grooming notes (CASCADE delete)
  ├── ai_logs      ← AI operation logs (CASCADE delete)
  └── activity     ← Audit trail (CASCADE delete)

sessions           ← Auth sessions (deployed mode)
magic_links        ← Magic link tokens (deployed mode)
_beacon_meta       ← Schema version tracking
```

Migrations are append-only, defined as a TypeScript array, and run
automatically on startup.

### Task Status Workflow

```
new → backlog → ai_working → blocked → ai_working → needs_review → done → closed
                    ↑                                      │
                    └──────────────────────────────────────┘
```

Valid transitions:

| From | To |
|---|---|
| new | backlog, closed |
| backlog | ai_working, closed |
| ai_working | blocked, needs_review, backlog |
| blocked | ai_working, backlog |
| needs_review | done, backlog, ai_working |
| done | closed, backlog |
| closed | backlog |

## AI Integration

Two completely independent layers:

### Layer 1: Widget Assist (Anthropic API)

Stateless API proxy. Widget sends rough description + metadata, server
calls Anthropic API, returns improved description with suggested type
and priority. No filesystem access, no child processes.

```
Widget → POST /__beacon/api/ai/assist → Anthropic API → Response
```

### Layer 2: Agent (Claude Code CLI)

Managed child process. Server spawns `claude` CLI with a constructed
prompt containing task data, admin notes, and fresh project context.
Output is parsed for structured markers (`[BEACON:PROGRESS]`,
`[BEACON:BLOCKED]`, `[BEACON:COMPLETE]`) and streamed to the dashboard
via SSE.

```
Dashboard → POST /__beacon/api/ai/start/:id
  → spawn claude CLI
  → parse stdout for markers
  → stream via SSE to dashboard
  → on complete: git branch + commit + push + optional PR
```

One agent task at a time (single-developer workflow).

## Production-to-Local Sync

One-way sync from deployed instances to local development:

```
Production (collecting feedback)
    │
    │  npx beacon pull --from https://staging.myapp.com
    ▼
Local (development + AI execution)
```

Tasks are deduplicated via `origin` + `remote_id`. Pulling the same
task again updates the existing local record. Attachments are decoded
from base64 and written to `.beacon/storage/`.

## Auth Model

- **Development mode:** No authentication. Dashboard accessible on
  localhost.
- **Deployed mode:** Magic link authentication. Session cookies with
  7-day expiry. Admin detection via `adminEmails` config array.
- **Always public:** `POST /__beacon/api/feedback` (widget submission)
  and `GET /__beacon/api/config` (widget feature flags).
