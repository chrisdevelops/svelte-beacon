# Svelte Beacon Roadmap

Phased implementation plan. Each phase produces a working increment.
Check items off as they're completed. For full design details, see
`svelte-beacon-implementation-plan.md`.

**How to use this:** Pick the next unchecked item. Tell Claude Code
which agent to use (noted in parentheses). Work through the phase
sequentially — later items often depend on earlier ones.

---

## Phase 1 — Package Scaffold & Hook ✦ CURRENT

The foundation. After this phase: the hook intercepts requests, the
database initializes with migrations, and `npx beacon init` works.

Most of this is done via the scaffold. Remaining work:

- [ ] Wire `createDatabase()` into the hook's lazy init (replace TODO in `hook.ts`) — *(beacon-package-architect)*
- [ ] Verify migrations run on first request against real SQLite file — *(beacon-database)*
- [ ] Register placeholder API routes (GET /config, GET /tasks, POST /feedback) that return empty responses — *(beacon-package-architect)*
- [ ] Wire the router's `dispatch()` into `handleAPIRequest()` in the hook — *(beacon-package-architect)*
- [ ] Dashboard placeholder: serve a static HTML page ("Beacon is running") from the hook for `/__beacon/` — *(beacon-package-architect)*
- [ ] Write tests: hook passthrough, kill switch, API route interception, error boundary — *(beacon-package-architect)*
- [ ] Write tests: migrations on empty DB, idempotency, table verification — *(beacon-database)*
- [ ] Write tests: CLI init (directory creation, gitignore, idempotency) — *(use test patterns from beacon-testing skill)*
- [ ] Verify end-to-end: install in a test SvelteKit app, run `npx beacon init`, add hook + widget, start dev server, hit `/__beacon/` — *(manual)*

## Phase 2 — API + Minimal Widget

After this phase: a user can submit feedback through the widget, and
the task appears in the database.

- [ ] Implement task query functions: `createTask`, `getTask`, `listTasks` — *(beacon-database)*
- [ ] Implement attachment query functions: `createAttachment` — *(beacon-database)*
- [ ] Implement `POST /feedback` handler (validate, create task, return 201) — *(beacon-package-architect)*
- [ ] Implement `GET /tasks` handler (list with pagination) — *(beacon-package-architect)*
- [ ] Implement `GET /tasks/:id` handler — *(beacon-package-architect)*
- [ ] Implement `GET /config` handler (return widget feature flags from resolved config) — *(beacon-package-architect)*
- [ ] Build widget internals: FloatingButton, FeedbackForm, TypeSelector, PrioritySelector — *(beacon-widget)*
- [ ] Build widget shared state (`shared-state.svelte.ts`) — *(beacon-widget)*
- [ ] Build widget style injection (`styles.ts` + `styles.css`) — *(beacon-widget)*
- [ ] Wire Beacon.svelte: shadow root creation, mount BeaconWidget, inject styles — *(beacon-widget)*
- [ ] Implement metadata collection (URL, viewport, user agent, dark mode, timestamp) — *(beacon-widget)*
- [ ] Implement form submission flow (validate → fetch → success/error states) — *(beacon-widget)*
- [ ] Build SuccessMessage and ErrorMessage components — *(beacon-widget)*
- [ ] Config fetch on mount (`GET /__beacon/api/config`) — *(beacon-widget)*
- [ ] Write tests: all query functions, feedback handler, widget form behavior — *(beacon-database, beacon-widget)*
- [ ] Verify end-to-end: submit feedback via widget, check it exists in DB — *(manual)*

## Phase 3 — Dashboard Core

After this phase: a developer can view and manage all tasks through
a real dashboard served by the handle hook.

- [ ] Implement `PATCH /tasks/:id` handler (status transitions, field updates) — *(beacon-package-architect)*
- [ ] Implement `DELETE /tasks/:id` handler — *(beacon-package-architect)*
- [ ] Implement `updateTask`, `deleteTask` query functions — *(beacon-database)*
- [ ] Implement activity logging: `createActivity` query, log on status change — *(beacon-database)*
- [ ] Build dashboard TaskTable component (sortable columns, status badges) — *(beacon-dashboard)*
- [ ] Build FilterBar (status, type, priority filters) — *(beacon-dashboard)*
- [ ] Build SearchInput (description text search) — *(beacon-dashboard)*
- [ ] Build Pagination component — *(beacon-dashboard)*
- [ ] Build TaskDrawer (slide-over panel) — *(beacon-dashboard)*
- [ ] Build TaskOverview tab (description, metadata, status dropdown) — *(beacon-dashboard)*
- [ ] Build StatusBadge, PriorityBadge, TypeBadge components — *(beacon-dashboard)*
- [ ] Build StatusDropdown (valid transitions only) — *(beacon-dashboard)*
- [ ] Wire dashboard data fetching (`+page.ts` load functions using `api.ts`) — *(beacon-dashboard)*
- [ ] Build the dashboard with adapter-static, wire serving into hook — *(beacon-package-architect)*
- [ ] Write tests: update/delete handlers, dashboard component rendering — *(beacon-database, beacon-dashboard)*
- [ ] Verify end-to-end: submit feedback, view in dashboard, change status — *(manual)*

## Phase 4 — Auth System

After this phase: the dashboard is protected in deployed mode,
widget submission remains public.

- [ ] Implement session query functions: `createSession`, `getSession`, `deleteExpiredSessions` — *(beacon-database)*
- [ ] Implement magic link query functions: `createMagicLink`, `consumeMagicLink` — *(beacon-database)*
- [ ] Implement auth middleware: validate session cookie, attach auth to request — *(beacon-package-architect)*
- [ ] Implement `POST /auth/magic-link` handler — *(beacon-package-architect)*
- [ ] Implement `GET /auth/verify` handler (consume token, create session, set cookie) — *(beacon-package-architect)*
- [ ] Wire auth middleware into API routes (skip for /feedback and /config) — *(beacon-package-architect)*
- [ ] Build LoginForm component — *(beacon-dashboard)*
- [ ] Build AuthGuard component (redirect to login if unauthenticated) — *(beacon-dashboard)*
- [ ] Wire auth guard into dashboard layout — *(beacon-dashboard)*
- [ ] Console fallback for magic links in development mode — *(beacon-package-architect)*
- [ ] Write tests: session CRUD, magic link consumption, auth middleware, protected routes — *(beacon-database, beacon-package-architect)*

## Phase 5 — Widget Enhancements

After this phase: feedback includes visual context (screenshots,
element selectors).

- [ ] Implement screenshot capture via html2canvas — *(beacon-widget)*
- [ ] Build ScreenshotCapture component (button, thumbnail preview, retake) — *(beacon-widget)*
- [ ] Implement element selector (light DOM overlay, hover detection, CSS path generation) — *(beacon-widget)*
- [ ] Build ElementSelector component (enter/exit mode, selected element badge) — *(beacon-widget)*
- [ ] Update submission flow: FormData with screenshot file for multipart — *(beacon-widget)*
- [ ] Update `POST /feedback` to handle multipart form data + file storage — *(beacon-package-architect)*
- [ ] Add optional email input field (shown based on config.requireEmail) — *(beacon-widget)*
- [ ] Build dashboard Media tab (screenshot viewer, element visualization) — *(beacon-dashboard)*
- [ ] Write tests: screenshot capture mock, element selector, multipart submission — *(beacon-widget)*

## Phase 6 — AI Layer 1

After this phase: users get AI-improved descriptions and type/priority
suggestions in the widget.

- [ ] Implement `POST /ai/assist` handler — *(beacon-ai-bridge)*
- [ ] Build prompt construction for description assist — *(beacon-ai-bridge)*
- [ ] Implement Anthropic API call with error handling — *(beacon-ai-bridge)*
- [ ] Implement `createAILog` query function — *(beacon-database)*
- [ ] Build AIAssist component (button, loading state, accept/reject suggestions) — *(beacon-widget)*
- [ ] Wire AIAssist into FeedbackForm — *(beacon-widget)*
- [ ] Write tests: assist handler with mocked Anthropic API, prompt construction — *(beacon-ai-bridge)*

## Phase 7 — AI Layer 2

After this phase: the developer can trigger an AI agent that implements
tasks with progress streaming.

- [ ] Implement agent lifecycle: `startAgent`, `stopAgent`, `getActiveAgent` — *(beacon-ai-bridge)*
- [ ] Implement Claude Code child process spawning — *(beacon-ai-bridge)*
- [ ] Implement structured output parser (PROGRESS, BLOCKED, COMPLETE markers) — *(beacon-ai-bridge)*
- [ ] Implement project context generator — *(beacon-ai-bridge)*
- [ ] Build agent prompt construction (task + notes + attachments + context + mode rules) — *(beacon-ai-bridge)*
- [ ] Implement SSE endpoint for log streaming — *(beacon-ai-bridge)*
- [ ] Implement `POST /ai/start/:id`, `POST /ai/stop/:id`, `POST /ai/unblock/:id` — *(beacon-ai-bridge)*
- [ ] Implement git integration (branch, commit, push, optional PR) — *(beacon-ai-bridge)*
- [ ] Implement verification checklist runner — *(beacon-ai-bridge)*
- [ ] Build dashboard TaskAIStatus tab — *(beacon-dashboard)*
- [ ] Build AIControls component (start/stop/unblock) — *(beacon-dashboard)*
- [ ] Build AILogStream component (SSE consumer, scrolling log view) — *(beacon-dashboard)*
- [ ] Write tests: agent lifecycle, output parser, SSE streaming — *(beacon-ai-bridge)*

## Phase 8 — Sync & Production

After this phase: full dev-to-production workflow operational.

- [ ] Implement `GET /tasks/export` handler (bulk export with filters) — *(beacon-package-architect)*
- [ ] Implement `exportTasks` query function — *(beacon-database)*
- [ ] Implement `importTask` query function (upsert via origin + remote_id) — *(beacon-database)*
- [ ] Implement `npx beacon pull` command — *(beacon-package-architect)*
- [ ] Add Turso connection support (auth token config) — *(beacon-database)*
- [ ] Write tests: export/import serialization, pull CLI with mocked remote — *(beacon-database)*

## Phase 9 — Polish

After this phase: production-quality tool.

- [ ] Build screenshot annotation canvas (brush, arrow, text, undo/redo) — *(beacon-widget)*
- [ ] Build admin notes tab in dashboard — *(beacon-dashboard)*
- [ ] Build activity log tab in dashboard — *(beacon-dashboard)*
- [ ] Implement bulk actions (multi-select, bulk status change, bulk delete) — *(beacon-dashboard)*
- [ ] Add file attachment support to widget — *(beacon-widget)*
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