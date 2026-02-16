# Svelte Beacon

Svelte Beacon is an npm package (`svelte-beacon`) for SvelteKit
applications that captures contextual user feedback and provides
AI-assisted resolution. It integrates via a handle hook and a single
widget component — two lines of code to add, two lines to remove.

## Quick Context

- **What:** Feedback collection widget + task management dashboard +
  AI agent, delivered as a single npm package
- **How:** SvelteKit handle hook intercepts `/__beacon/*` routes, serves
  the dashboard and REST API from within `node_modules`
- **Where:** Everything lives in the package and `.beacon/` directory —
  zero files in the host's `src/`
- **Database:** SQLite via `@libsql/client` (local file or Turso)
- **AI:** Two independent layers — Anthropic API for widget assist,
  Claude Code CLI for task execution

## MCP Tools

### Svelte MCP Server

Use the Svelte MCP server for Svelte and SvelteKit documentation:

1. **Always call `list-sections` first** to discover available docs
2. **Call `get-documentation`** with relevant sections for the task
3. **Call `svelte-autofixer`** on all Svelte code before finalizing

The MCP server provides current Svelte 5 and SvelteKit documentation.
Use it instead of guessing about API details, rune syntax, or SvelteKit
conventions. Our project conventions (below) override when they conflict.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system
diagram, request flow, package boundaries, database schema, status
workflow, AI integration details, and sync model.

Key things every agent should know:

- The package has **three compilation targets** (server via tsc, widget
  via svelte-package, dashboard via adapter-static) that never
  cross-import
- The handle hook provides **fast passthrough** (one `startsWith` check),
  **lazy initialization**, and an **outer error boundary** — it must
  never crash the host app
- The widget renders in **Shadow DOM** for complete style isolation
- The dashboard is a **standalone SvelteKit SPA** that communicates
  only through `/__beacon/api/*`
- AI Layer 1 (Anthropic API) and Layer 2 (Claude Code CLI) **share no
  code** — they are completely independent

## Conventions

See [docs/CONVENTIONS.md](docs/CONVENTIONS.md) for the full set of
TypeScript, Svelte 5, and SvelteKit guidelines. Key points:

### TypeScript
- Strict mode enabled, zero tolerance for `any`
- String literal unions over enums
- Explicit return types on all exported functions
- `null` for intentional absence, `undefined` for optional params
- Type-only imports (`import type { ... }`)
- File extensions in relative imports (`.js`)

### Svelte 5
- Runes exclusively — `$state`, `$derived`, `$effect`, `$props`
- No legacy patterns (`$:`, `export let`, `createEventDispatcher`,
  `on:event`)
- Callback props for events (`onclick`, `onchange`, `onclose`)
- `.svelte.ts` files for shared reactive state
- CSS transitions in the widget (not `transition:` directive)
- SSR-safe: browser APIs only in `onMount` or `$effect`

### Naming
- Files: `kebab-case.ts`, `PascalCase.svelte`
- CSS in widget: `.beacon-` prefix, `--beacon-` custom properties
- Database: `snake_case` tables and columns
- API routes: `/__beacon/api/kebab-case`

## Agents

Each agent owns a specific domain. Use the right agent for the task:

| Agent | Domain | Skills |
|---|---|---|
| `beacon-package-architect` | Package structure, build pipeline, handle hook, CLI, exports | sveltekit-handle-hook, beacon-api-patterns |
| `beacon-database` | Schema, migrations, queries, client init, export/import | libsql-migrations, beacon-testing |
| `beacon-widget` | Widget UI, Shadow DOM, styles, screenshots, element selection | shadow-dom-svelte, beacon-testing |
| `beacon-dashboard` | Dashboard SPA, task list, drawer, AI controls, auth UI | beacon-testing |
| `beacon-ai-bridge` | AI Layer 1 (Anthropic proxy), Layer 2 (Claude Code agent), SSE | beacon-testing |

### When Multiple Agents Apply

If a task spans domains (e.g., adding a new API endpoint that requires
a new database query and a dashboard UI update), break it into
sub-tasks per agent domain. The agent responsible for the API contract
(`beacon-package-architect` or `beacon-api-patterns`) should define
the interface first, then `beacon-database` implements the query and
`beacon-dashboard` consumes it.

## Skills

Skills provide reusable patterns and reference documentation:

| Skill | Location | Purpose |
|---|---|---|
| `sveltekit-handle-hook` | `.claude/skills/sveltekit-handle-hook/` | Handle hook routing, middleware, error handling |
| `beacon-api-patterns` | `.claude/skills/beacon-api-patterns/` | REST API contracts, request/response patterns |
| `libsql-migrations` | `.claude/skills/libsql-migrations/` | @libsql/client API, migrations, query patterns |
| `shadow-dom-svelte` | `.claude/skills/shadow-dom-svelte/` | Shadow DOM lifecycle, styling, events, DOM access |
| `beacon-testing` | `.claude/skills/beacon-testing/` | Test infrastructure, mock factories, all test layers |

**Always read the relevant SKILL.md before starting work.** Skills
contain hard-won patterns that prevent common mistakes.

## Task System

Tasks are managed in `.claude/tasks/{status}/{slug}/TASK.md` with YAML
frontmatter. Statuses: `backlog`, `in-progress`, `review`, `done`.

When asked to create tasks, generate downloadable TASK.md files.
Propose a summary table first, create files on approval. Each task
includes: description, requirements, acceptance criteria, and the
agent(s) responsible.

## Project Structure

```
svelte-beacon/
├── CLAUDE.md                   ← You are here
├── docs/
│   ├── ARCHITECTURE.md         ← System design reference
│   └── CONVENTIONS.md          ← TypeScript/Svelte/SvelteKit guidelines
├── src/
│   ├── server/                 ← Handle hook + API + DB + AI
│   │   ├── index.ts            ← Export: beacon()
│   │   ├── config.ts
│   │   ├── router.ts
│   │   ├── auth/
│   │   ├── api/
│   │   ├── db/
│   │   │   ├── client.ts
│   │   │   ├── migrations.ts
│   │   │   ├── helpers.ts
│   │   │   └── queries/
│   │   └── ai/
│   │       ├── layer1/         ← Anthropic API proxy
│   │       └── layer2/         ← Claude Code agent
│   └── widget/                 ← Svelte 5 widget components
│       ├── index.ts            ← Export: Beacon
│       ├── Beacon.svelte       ← Shadow DOM wrapper
│       └── internal/
├── dashboard/                  ← Standalone SvelteKit SPA
│   ├── svelte.config.js
│   └── src/
├── cli/                        ← CLI commands (init, teardown, pull)
├── test/                       ← Shared test helpers and mocks
├── e2e/                        ← Playwright E2E tests
├── .claude/
│   ├── agents/                 ← Sub-agent definitions
│   ├── skills/                 ← Skill reference documentation
│   └── tasks/                  ← Task management
├── package.json
├── vitest.config.ts
└── tsconfig.json
```

## Non-Negotiable Rules

These apply to all agents, all code, all changes:

1. **Never crash the host app.** The outer error boundary in the handle
   hook catches everything. Beacon errors produce error responses, not
   uncaught exceptions.

2. **Never modify the host's source files.** No writing to `src/`, no
   modifying `package.json`, no touching config files. CLI `init`
   only creates `.beacon/` and appends to `.gitignore`.

3. **Never edit a published migration.** Schema changes are always
   new migrations with the next version number.

4. **Never leak styles across the Shadow DOM boundary.** Widget styles
   stay in the shadow root. Host styles don't affect the widget.

5. **Always use parameterized queries.** No string interpolation in SQL.

6. **Always test.** Every query function, every API handler, every
   CLI command gets a test. Use in-memory databases for speed.

7. **Keep the two AI layers independent.** Layer 1 and Layer 2 share
   no code, no types, no imports.
