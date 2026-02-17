# Svelte Beacon Roadmap

Phased implementation plan. Each phase produces a working increment.
Check items off as they're completed. For full design details, see
`svelte-beacon-implementation-plan.md`.

**How to use this:** Pick the next unchecked item. Tell Claude Code
which agent to use (noted in parentheses). Work through the phase
sequentially — later items often depend on earlier ones.

---

## Phase 1 — Package Scaffold & Hook ✅

The foundation. After this phase: the hook intercepts requests, the
database initializes with migrations, and `npx beacon init` works.

Most of this is done via the scaffold. Remaining work:

- [x] Wire `createDatabase()` into the hook's lazy init (replace TODO in `hook.ts`) — *(beacon-package-architect)*
- [x] Verify migrations run on first request against real SQLite file — *(beacon-database)*
- [x] Register placeholder API routes (GET /config, GET /tasks, POST /feedback) that return empty responses — *(beacon-package-architect)*
- [x] Wire the router's `dispatch()` into `handleAPIRequest()` in the hook — *(beacon-package-architect)*
- [x] Dashboard placeholder: serve a static HTML page ("Beacon is running") from the hook for `/__beacon/` — *(beacon-package-architect)*
- [x] Write tests: hook passthrough, kill switch, API route interception, error boundary — *(beacon-package-architect)*
- [x] Write tests: migrations on empty DB, idempotency, table verification — *(beacon-database)*
- [x] Write tests: CLI init (directory creation, gitignore, idempotency) — *(use test patterns from beacon-testing skill)*
- [ ] Verify end-to-end: install in a test SvelteKit app, run `npx beacon init`, add hook + widget, start dev server, hit `/__beacon/` — *(manual)*

## Phase 2 — API + Minimal Widget ✅

After this phase: a user can submit feedback through the widget, and
the task appears in the database.

- [x] Implement task query functions: `createTask`, `getTask`, `listTasks` — *(beacon-database)*
- [x] Implement attachment query functions: `createAttachment` — *(beacon-database)*
- [x] Implement `POST /feedback` handler (validate, create task, return 201) — *(beacon-package-architect)*
- [x] Implement `GET /tasks` handler (list with pagination) — *(beacon-package-architect)*
- [x] Implement `GET /tasks/:id` handler — *(beacon-package-architect)*
- [x] Implement `GET /config` handler (return widget feature flags from resolved config) — *(beacon-package-architect)*
- [x] Build widget internals: FloatingButton, FeedbackForm, TypeSelector, PrioritySelector — *(beacon-widget)*
- [x] Build widget shared state (`shared-state.svelte.ts`) — *(beacon-widget)*
- [x] Build widget style injection (`styles.ts` + `styles.css`) — *(beacon-widget)*
- [x] Wire Beacon.svelte: shadow root creation, mount BeaconWidget, inject styles — *(beacon-widget)*
- [x] Implement metadata collection (URL, viewport, user agent, dark mode, timestamp) — *(beacon-widget)*
- [x] Implement form submission flow (validate → fetch → success/error states) — *(beacon-widget)*
- [x] Build SuccessMessage and ErrorMessage components — *(beacon-widget)*
- [x] Config fetch on mount (`GET /__beacon/api/config`) — *(beacon-widget)*
- [x] Write tests: query functions and API handlers — *(beacon-database, beacon-package-architect)*
- [x] Write tests: widget form behavior — *(beacon-widget)*
- [ ] Verify end-to-end: submit feedback via widget, check it exists in DB — *(manual)*

## Phase 3 — Dashboard Core ✅

After this phase: a developer can view and manage all tasks through
a real dashboard served by the handle hook.

- [x] Implement `PATCH /tasks/:id` handler (status transitions, field updates) — *(beacon-package-architect)*
- [x] Implement `DELETE /tasks/:id` handler — *(beacon-package-architect)*
- [x] Implement `updateTask`, `deleteTask` query functions — *(beacon-database)*
- [x] Implement activity logging: `createActivity` query, log on status change — *(beacon-database)*
- [x] Build dashboard TaskTable component (sortable columns, status badges) — *(beacon-dashboard)*
- [x] Build FilterBar (status, type, priority filters) — *(beacon-dashboard)*
- [x] Build SearchInput (description text search) — *(beacon-dashboard)*
- [x] Build Pagination component — *(beacon-dashboard)*
- [x] Build TaskDrawer (slide-over panel) — *(beacon-dashboard)*
- [x] Build TaskOverview tab (description, metadata, status dropdown) — *(beacon-dashboard)*
- [x] Build StatusBadge, PriorityBadge, TypeBadge components — *(beacon-dashboard)*
- [x] Build StatusDropdown (valid transitions only) — *(beacon-dashboard)*
- [x] Wire dashboard data fetching (`+page.ts` load functions using `api.ts`) — *(beacon-dashboard)*
- [x] Build the dashboard with adapter-static, wire serving into hook — *(beacon-package-architect)*
- [x] Write tests: update/delete handlers ✅, dashboard component rendering — *(beacon-database, beacon-dashboard)*
- [ ] Verify end-to-end: submit feedback, view in dashboard, change status — *(manual)*

## Phase 4 — Auth System ✅

After this phase: the dashboard is protected in deployed mode,
widget submission remains public.

- [x] Implement session query functions: `createSession`, `getSession`, `deleteExpiredSessions` — *(beacon-database)*
- [x] Implement magic link query functions: `createMagicLink`, `consumeMagicLink` — *(beacon-database)*
- [x] Implement auth middleware: validate session cookie, attach auth to request — *(beacon-package-architect)*
- [x] Implement `POST /auth/magic-link` handler — *(beacon-package-architect)*
- [x] Implement `GET /auth/verify` handler (consume token, create session, set cookie) — *(beacon-package-architect)*
- [x] Wire auth middleware into API routes (skip for /feedback and /config) — *(beacon-package-architect)*
- [x] Build LoginForm component — *(beacon-dashboard)*
- [x] Build AuthGuard component (redirect to login if unauthenticated) — *(beacon-dashboard)*
- [x] Wire auth guard into dashboard layout — *(beacon-dashboard)*
- [x] Console fallback for magic links in development mode — *(beacon-package-architect)*
- [x] Write tests: session CRUD, magic link consumption, auth middleware, protected routes — *(beacon-database, beacon-package-architect)*

## Phase 5 — Widget Enhancements ✅

After this phase: feedback includes visual context (screenshots,
element selectors).

- [x] Implement screenshot capture via html2canvas — *(beacon-widget)*
- [x] Build ScreenshotCapture component (button, thumbnail preview, retake) — *(beacon-widget)*
- [x] Implement element selector (light DOM overlay, hover detection, CSS path generation) — *(beacon-widget)*
- [x] Build ElementSelector component (enter/exit mode, selected element badge) — *(beacon-widget)*
- [x] Update submission flow: FormData with screenshot file for multipart — *(beacon-widget)*
- [x] Update `POST /feedback` to handle multipart form data + file storage — *(beacon-package-architect)*
- [x] Add optional email input field (shown based on config.requireEmail) — *(beacon-widget)* *(already existed from Phase 2b)*
- [x] Build dashboard Media tab (screenshot viewer, element visualization) — *(beacon-dashboard)*
- [x] Write tests: screenshot capture mock, element selector, multipart submission — *(beacon-widget)*

## Phase 6 — AI Layer 1 ✅

After this phase: users get AI-improved descriptions and type/priority
suggestions in the widget.

- [x] Implement `POST /ai/assist` handler — *(beacon-ai-bridge)*
- [x] Build prompt construction for description assist — *(beacon-ai-bridge)*
- [x] Implement Anthropic API call with error handling — *(beacon-ai-bridge)*
- [x] Implement `createAILog` query function — *(beacon-database)*
- [x] Build AIAssist component (button, loading state, accept/reject suggestions) — *(beacon-widget)*
- [x] Wire AIAssist into FeedbackForm — *(beacon-widget)*
- [x] Write tests: assist handler with mocked Anthropic API, prompt construction — *(beacon-ai-bridge)*

## Phase 7 — AI Layer 2 ✅

After this phase: the developer can trigger an AI agent that implements
tasks with progress streaming.

- [x] Implement agent lifecycle: `startAgent`, `stopAgent`, `getActiveAgent` — *(beacon-ai-bridge)*
- [x] Implement Claude Code child process spawning — *(beacon-ai-bridge)*
- [x] Implement structured output parser (PROGRESS, BLOCKED, COMPLETE markers) — *(beacon-ai-bridge)*
- [x] Implement project context generator — *(beacon-ai-bridge)*
- [x] Build agent prompt construction (task + notes + attachments + context + mode rules) — *(beacon-ai-bridge)*
- [x] Implement SSE endpoint for log streaming — *(beacon-ai-bridge)*
- [x] Implement `POST /ai/start/:id`, `POST /ai/stop/:id`, `POST /ai/unblock/:id` — *(beacon-ai-bridge)*
- [x] Implement git integration (branch, commit, push, optional PR) — *(beacon-ai-bridge)*
- [x] Implement verification checklist runner — *(beacon-ai-bridge)*
- [x] Build dashboard TaskAIStatus tab — *(beacon-dashboard)*
- [x] Build AIControls component (start/stop/unblock) — *(beacon-dashboard)*
- [x] Build AILogStream component (SSE consumer, scrolling log view) — *(beacon-dashboard)*
- [x] Write tests: agent lifecycle, output parser, SSE streaming — *(beacon-ai-bridge)*

## Phase 8 — Sync & Production

After this phase: full dev-to-production workflow operational.

- [x] Implement `GET /tasks/export` handler (bulk export with filters) — *(beacon-package-architect)*
- [x] Implement `exportTasks` query function — *(beacon-database)*
- [x] Implement `importTask` query function (upsert via origin + remote_id) — *(beacon-database)*
- [x] Implement `npx beacon pull` command — *(beacon-package-architect)*
- [x] Add Turso connection support (auth token config) — *(beacon-database)*
- [x] Write tests: export/import serialization, pull CLI with mocked remote — *(beacon-database)*

## Phase 9 — Polish

After this phase: production-quality tool.

- [x] Build screenshot annotation canvas (brush, arrow, text, undo/redo) — *(beacon-widget)*
- [x] Build admin notes tab in dashboard — *(beacon-dashboard)*
- [x] Build activity log tab in dashboard — *(beacon-dashboard)*
- [x] Implement bulk actions (multi-select, bulk status change, bulk delete) — *(beacon-dashboard)*
- [x] Add file attachment support to widget — *(beacon-widget)*
- [ ] Write comprehensive E2E tests — *(all agents)*
- [ ] Write package documentation (README, API docs, configuration guide) — *(manual)*
- [ ] Performance audit: bundle size, startup latency, memory usage — *(manual)*

---

## Notes

- Phases 1–3 give you a usable feedback tool (no AI required)
- Phases 4–7 add auth and the full AI workflow
- Phases 8–9 extend to production and polish
- Each phase should be fully tested before moving to the next
- The agent noted in parentheses is the primary — complex tasks may
  involve multiple agents