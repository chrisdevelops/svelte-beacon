# Svelte Beacon Conventions

Project-wide guidelines for TypeScript, Svelte 5, and SvelteKit as they
apply specifically to this package. For general Svelte documentation, use
the Svelte MCP server (`list-sections` → `get-documentation`). This
document covers what we've *chosen* for this project.

---

## TypeScript

### Strictness

TypeScript strict mode is enabled. All code must pass `tsc --noEmit`
with zero errors.

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "moduleResolution": "bundler",
    "target": "ES2022",
    "module": "ES2022"
  }
}
```

### Type Conventions

**Prefer interfaces for object shapes, types for unions and intersections:**

```typescript
// Object shapes → interface
interface Task {
  id: string;
  type: TaskType;
  priority: Priority;
  status: Status;
  description: string;
}

// Unions → type
type TaskType = 'bug' | 'feature' | 'content' | 'accessibility' | 'performance' | 'other';
type Priority = 'low' | 'medium' | 'high' | 'critical';
type Status = 'new' | 'backlog' | 'ai_working' | 'blocked' | 'needs_review' | 'done' | 'closed';
```

**Use string literal unions for constrained values, not enums:**

```typescript
// YES
type Priority = 'low' | 'medium' | 'high' | 'critical';

// NO
enum Priority { Low, Medium, High, Critical }
```

Enums add runtime code and complicate serialization. String literals
are transparent in JSON and debuggable in logs.

**Explicit return types on exported functions:**

```typescript
// YES — return type documented
export async function getTask(db: Client, id: string): Promise<Task | null> {

// NO — return type inferred (fine for private functions, not exports)
export async function getTask(db: Client, id: string) {
```

Internal/private functions can rely on inference. Exported functions
always declare their return type — this is documentation and a
compile-time contract.

**Use `unknown` over `any`:**

```typescript
// YES — forces type narrowing
function parseJSON(text: string): unknown {
  return JSON.parse(text);
}

// NO — silently defeats type checking
function parseJSON(text: string): any {
```

### Null Handling

**Prefer `null` over `undefined` for intentional absence:**

```typescript
// YES — explicit "no value"
function getTask(db: Client, id: string): Promise<Task | null>

// NO — ambiguous (missing or not yet loaded?)
function getTask(db: Client, id: string): Promise<Task | undefined>
```

Use `undefined` only for optional parameters and optional object
properties (where TypeScript expects it). Use `null` for return values
that mean "not found" or "not available."

**Always handle the null case — never use non-null assertion (`!`):**

```typescript
// YES
const task = await getTask(db, id);
if (!task) return json({ error: 'Not found' }, { status: 404 });

// NO
const task = await getTask(db, id);
return json(task!); // crashes if null
```

### Error Handling

**Use try/catch for async operations. Never let errors propagate silently:**

```typescript
// YES
try {
  const result = await db.execute(query);
  return result.rows;
} catch (err) {
  console.error('Query failed:', err);
  throw new DatabaseError('Failed to fetch tasks', { cause: err });
}

// NO
const result = await db.execute(query); // unhandled rejection if fails
```

**Custom error classes for domain-specific errors:**

```typescript
export class BeaconError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'BeaconError';
  }
}

export class DatabaseError extends BeaconError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DatabaseError';
  }
}
```

**API handlers return Response objects, never throw:**

```typescript
// YES — handler catches errors and returns proper HTTP responses
export async function handleGetTask(event, db, config, params): Promise<Response> {
  try {
    const task = await getTask(db, params.id);
    if (!task) return json({ error: 'Not found' }, { status: 404 });
    return json(task);
  } catch (err) {
    return json({ error: 'Internal error' }, { status: 500 });
  }
}
```

### Import Conventions

**Use explicit file extensions in relative imports:**

```typescript
// YES
import { getTask } from './queries/tasks.js';

// NO
import { getTask } from './queries/tasks';
```

This is required for ESM compatibility and `moduleResolution: 'bundler'`.

**Use type-only imports where possible:**

```typescript
import type { Client } from '@libsql/client';
import type { RequestEvent } from '@sveltejs/kit';
```

This ensures types are erased at compile time and never end up in the
runtime bundle.

---

## Svelte 5

### Runes

This project uses Svelte 5 runes exclusively. No legacy `$:` reactive
declarations, no `export let` props, no `createEventDispatcher`.

**`$state` for mutable reactive values:**

```svelte
<script lang="ts">
  let count = $state(0);
  let items = $state<string[]>([]);
</script>
```

Arrays and objects can be mutated directly — no reassignment needed:

```typescript
items.push('new item'); // reactive in Svelte 5
```

**`$derived` for computed values:**

```svelte
<script lang="ts">
  let items = $state<Task[]>([]);
  let openCount = $derived(items.filter(t => t.status !== 'closed').length);
</script>
```

Use `$derived.by()` for multi-statement computations:

```svelte
<script lang="ts">
  let filteredTasks = $derived.by(() => {
    let result = items;
    if (statusFilter) result = result.filter(t => t.status === statusFilter);
    if (search) result = result.filter(t => t.description.includes(search));
    return result;
  });
</script>
```

**`$effect` for side effects. Use sparingly:**

```svelte
<script lang="ts">
  let taskId = $state('');

  $effect(() => {
    // Runs when taskId changes
    if (taskId) fetchTaskDetails(taskId);
  });
</script>
```

Rules for `$effect`:
- Don't use `$effect` to synchronize state — use `$derived` instead
- Don't write to `$state` variables inside `$effect` unless necessary
  (creates a dependency cycle risk)
- Always return a cleanup function if the effect creates subscriptions,
  timers, or event listeners

**`$props` for component inputs:**

```svelte
<script lang="ts">
  interface Props {
    task: Task;
    onclose: () => void;
    compact?: boolean;
  }

  let { task, onclose, compact = false }: Props = $props();
</script>
```

Always define a `Props` interface for TypeScript. Destructure with
defaults for optional props.

**`$bindable` for two-way binding:**

```svelte
<script lang="ts">
  interface Props {
    value: string;
  }

  let { value = $bindable('') }: Props = $props();
</script>
```

Use sparingly — prefer callback props (`onchange`) over `$bindable`
for most cases.

### Shared Reactive State

For state shared across components (especially across the Shadow DOM
boundary), use `.svelte.ts` files:

```typescript
// shared-state.svelte.ts
export function createWidgetState(config: WidgetConfig) {
  let formOpen = $state(false);
  let submitting = $state(false);
  let screenshot = $state<Blob | null>(null);

  return {
    get formOpen() { return formOpen; },
    set formOpen(v: boolean) { formOpen = v; },
    get submitting() { return submitting; },
    get screenshot() { return screenshot; },
    set screenshot(v: Blob | null) { screenshot = v; },
  };
}
```

This pattern is required for the widget because props passed to
`mount()` are not automatically reactive. The state object returned
by the factory function *is* reactive because it uses `$state` internally
and exposes getters/setters.

### Event Handling

**Use callback props instead of events:**

```svelte
<!-- Parent -->
<TaskRow task={task} onclick={() => openDrawer(task.id)} />

<!-- TaskRow.svelte -->
<script lang="ts">
  let { task, onclick }: Props = $props();
</script>
<tr onclick={onclick}>...</tr>
```

This replaces Svelte 4's `createEventDispatcher` + `on:click`. Callback
props are type-safe and explicit.

**Svelte 5 event syntax:**

```svelte
<!-- YES — Svelte 5 -->
<button onclick={handleClick}>

<!-- NO — Svelte 4 legacy -->
<button on:click={handleClick}>
```

### Component Conventions

**One component per file. File name matches component name:**

```
StatusBadge.svelte    ← exports StatusBadge
TaskDrawer.svelte     ← exports TaskDrawer
```

**Prefer `{#snippet}` over separate components for small template fragments:**

```svelte
{#snippet badge(status: string)}
  <span class="badge" data-status={status}>{status}</span>
{/snippet}

{@render badge(task.status)}
```

Use snippets for repeated template patterns within the same component.
Extract to a separate component file when the snippet needs its own
state, grows beyond ~20 lines, or is used by multiple parent components.

**No Svelte `transition:` directives in the widget:**

The widget renders inside Shadow DOM where Svelte's transition system
can be unreliable. Use CSS transitions and animations instead:

```css
.beacon-panel {
  transform: translateY(100%);
  transition: transform 200ms ease-out;
}
.beacon-panel.open {
  transform: translateY(0);
}
```

The dashboard (standard SvelteKit SPA) can use `transition:` normally.

### SSR Considerations

**The widget must handle SSR gracefully.** The `<Beacon />` wrapper
component renders nothing on the server and creates the shadow root
only in `onMount()`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  let mounted = $state(false);

  onMount(() => {
    mounted = true;
    // Shadow DOM creation here
  });
</script>

{#if mounted}
  <div bind:this={hostEl} data-beacon-host></div>
{/if}
```

Never use `document`, `window`, `navigator`, or other browser APIs
at the top level of a component script — always guard with `onMount`
or `$effect` (which only runs client-side).

---

## SvelteKit

### Handle Hook Patterns

The handle hook is the foundation. Follow these patterns:

**Fast passthrough for non-Beacon requests:**

```typescript
export function beacon(options: BeaconOptions) {
  return async ({ event, resolve }) => {
    if (!event.url.pathname.startsWith('/__beacon')) {
      return resolve(event);  // Immediate, no overhead
    }
    // ... Beacon logic
  };
}
```

**Lazy initialization:**

```typescript
let db: Client | null = null;

async function getDB(config: ResolvedConfig): Promise<Client> {
  if (!db) {
    db = await createDatabase(config);
  }
  return db;
}
```

The database client is created on the first Beacon request, not on
server start. This means Beacon adds zero startup latency.

**Error boundary — never crash the host app:**

```typescript
try {
  // All Beacon logic wrapped
  return await handleBeaconRequest(event, db, config);
} catch (err) {
  console.error('[beacon] Unhandled error:', err);
  return new Response('Beacon error', { status: 500 });
}
```

### API Response Conventions

All API endpoints return JSON via the `Response` constructor:

```typescript
// Success
return new Response(JSON.stringify(data), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

// Helper
function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}
```

Do not use SvelteKit's `json()` helper from `@sveltejs/kit` in the
handle hook API handlers — that function is designed for `+server.ts`
endpoints. Write your own lightweight `json()` helper.

Error responses always include an `error` field:

```json
{ "error": "Task not found" }
```

List endpoints always include a `pagination` object:

```json
{
  "items": [...],
  "pagination": { "page": 1, "limit": 50, "total": 142, "totalPages": 3 }
}
```

### File Organization

```
src/
├── server/                 ← Server-side code (handle hook + API)
│   ├── index.ts            ← Public export: beacon()
│   ├── config.ts           ← Config resolution
│   ├── router.ts           ← API route dispatch
│   ├── auth/               ← Authentication middleware + handlers
│   ├── api/                ← API endpoint handlers
│   ├── db/                 ← Database layer
│   │   ├── client.ts       ← Connection management
│   │   ├── migrations.ts   ← Schema migrations
│   │   ├── helpers.ts      ← Query utilities
│   │   └── queries/        ← Typed query functions
│   └── ai/                 ← AI integration
│       ├── layer1/         ← Widget assist (Anthropic API)
│       └── layer2/         ← Agent (Claude Code CLI)
├── widget/                 ← Client-side widget components
│   ├── index.ts            ← Public export: Beacon
│   ├── Beacon.svelte       ← Shadow DOM wrapper
│   └── internal/           ← All internal components + styles
└── (no shared imports between server/ and widget/)
```

### Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| Files | kebab-case | `magic-links.ts`, `task-drawer.svelte` |
| Svelte components | PascalCase | `TaskDrawer.svelte`, `StatusBadge.svelte` |
| TypeScript interfaces | PascalCase | `Task`, `AdminNote`, `ResolvedConfig` |
| Type aliases (unions) | PascalCase | `TaskType`, `Priority`, `Status` |
| Functions | camelCase | `createTask`, `handleListTasks` |
| Constants | UPPER_SNAKE_CASE | `STATUS_TRANSITIONS`, `DEFAULT_CONFIG` |
| CSS classes (widget) | beacon- prefix | `.beacon-fab`, `.beacon-panel` |
| CSS custom properties | --beacon- prefix | `--beacon-accent` |
| API routes | kebab-case | `/__beacon/api/ai/assist` |
| Database tables | snake_case | `admin_notes`, `magic_links` |
| Database columns | snake_case | `task_id`, `created_at` |

---

## Testing

### Test File Location

Co-locate test files with source when there's a 1:1 relationship. Use
`__tests__/` directories for tests that span multiple modules:

```
src/server/db/queries/tasks.ts
src/server/db/queries/tasks.test.ts     ← co-located

src/server/__tests__/hook.test.ts       ← spans multiple modules
```

### Test File Naming

- Unit/integration: `*.test.ts`
- Browser component tests: `*.browser.test.ts`
- E2E: `*.spec.ts`

### Test Style

Use `describe` / `it` blocks. Write test names as behavioral assertions:

```typescript
describe('createTask', () => {
  it('assigns sequential public_ids', async () => { ... });
  it('stores metadata as JSON', async () => { ... });
  it('defaults status to new', async () => { ... });
});
```

### What to Test

- Every exported function
- Every API handler (happy path + error cases + edge cases)
- Every database query function
- Every CLI command (filesystem effects)
- Widget component behavior (rendering, submission, error states)

### What NOT to Test

- Internal implementation details (private function call order)
- Third-party library behavior (libsql, html2canvas)
- Svelte's reactivity system itself

---

## Dependencies

### Guiding Principle: Fewer Dependencies

This is an npm package that users install into their projects. Every
dependency becomes their dependency. Minimize the dependency tree:

- **Runtime dependencies:** Only `@libsql/client` (required for SQLite)
- **Peer dependencies:** `svelte`, `@sveltejs/kit` (the host provides)
- **Dev dependencies:** Everything else (Vitest, TypeScript, etc.)

Before adding a dependency, ask:
1. Can we implement this in <100 lines?
2. Does this dependency pull in a large sub-tree?
3. Is this dependency well-maintained and stable?
4. Will this conflict with versions the host app might use?

### No Tailwind in the Widget

The widget manages its own CSS via Shadow DOM and `adoptedStyleSheets`.
It cannot use Tailwind because the host app's Tailwind config and build
pipeline are not available to the widget at runtime.

The dashboard may use lightweight CSS tooling but should prefer plain
CSS with Svelte scoped styles to keep the package size small.
