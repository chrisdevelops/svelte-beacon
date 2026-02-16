---
name: beacon-testing
description: >
  Testing strategy and patterns for svelte-beacon. Use this skill when writing
  unit tests, integration tests, or end-to-end tests for any part of the
  package: handle hook routing, API handlers, database queries, migrations,
  CLI commands, the widget component, or the dashboard. Also use when setting
  up test infrastructure, creating mock factories, or debugging test failures.
  Testing an npm package that integrates via a SvelteKit handle hook is
  fundamentally different from testing a normal SvelteKit app — this skill
  captures the patterns that make it work.
---

# Beacon Testing Strategy

svelte-beacon is an npm package, not a SvelteKit application. This changes
how every layer is tested:

- The **handle hook** runs against mock `RequestEvent` objects, not real
  HTTP requests
- The **database** uses in-memory SQLite (`file::memory:`) for isolation
  and speed
- The **API handlers** are tested as functions, not via network calls
- The **CLI** runs against temp directories, not the real filesystem
- The **widget** needs a simulated host app with a shadow DOM
- The **dashboard** is a standalone SvelteKit app tested separately

## Tooling

| Tool | Purpose | Environment |
|------|---------|-------------|
| Vitest | Unit + integration tests | Node (`environment: 'node'`) |
| @testing-library/svelte | Component rendering | jsdom or browser mode |
| Playwright | E2E tests | Real browser |
| @libsql/client | In-memory test databases | Node |

### Vitest Configuration

```typescript
// vitest.config.ts (package root)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Server-side tests (handle hook, API, DB, CLI) run in Node
    environment: 'node',
    include: ['src/**/*.test.ts', 'cli/**/*.test.ts'],
    // Each test file gets a fresh module context
    isolate: true,
    // Increase timeout for DB-heavy tests
    testTimeout: 10_000,
    // Setup file for common helpers
    setupFiles: ['./test/setup.ts'],
  },
});
```

## Test Organization

```
svelte-beacon/
├── src/
│   ├── server/
│   │   ├── __tests__/           # or co-located .test.ts files
│   │   │   ├── hook.test.ts     # Handle hook routing
│   │   │   ├── router.test.ts   # API router dispatch
│   │   │   └── config.test.ts   # Config resolution
│   │   ├── api/
│   │   │   ├── feedback.test.ts # Feedback endpoint
│   │   │   ├── tasks.test.ts    # Task CRUD endpoints
│   │   │   └── auth.test.ts     # Auth endpoints
│   │   └── db/
│   │       ├── migrations.test.ts
│   │       └── queries.test.ts
│   └── widget/
│       └── __tests__/
│           └── widget.test.ts   # Component tests
├── cli/
│   └── __tests__/
│       ├── init.test.ts
│       ├── teardown.test.ts
│       └── pull.test.ts
├── test/
│   ├── setup.ts                 # Global test setup
│   ├── factories.ts             # Mock data factories
│   ├── mocks/                   # Mock implementations
│   │   ├── request-event.ts     # SvelteKit RequestEvent mock
│   │   └── fetch.ts             # Fetch mock for widget tests
│   └── fixtures/                # Static test data
│       └── sample-screenshot.png
├── e2e/                         # Playwright E2E tests
│   ├── feedback.spec.ts
│   └── dashboard.spec.ts
└── vitest.config.ts
```

## References

| I need to... | Read... |
|---|---|
| Test handle hook or API handlers | `references/server-tests.md` |
| Test database queries or migrations | `references/database-tests.md` |
| Test CLI commands | `references/cli-tests.md` |
| Test the widget component | `references/component-tests.md` |
| Create mock data or helpers | `references/server-tests.md` — Mock factories |

## Testing Principles for Beacon

1. **Fresh database per test.** Every test that touches the database
   creates its own in-memory client. No shared state between tests.

2. **Test the contract, not the implementation.** API tests verify
   request → response. Database tests verify query → result. Don't test
   internal function call order.

3. **No network in unit tests.** API handlers are called as functions
   with mock `RequestEvent` objects. `fetch()` is never called in
   server-side unit tests.

4. **Real filesystem only in CLI tests.** CLI tests use `os.tmpdir()`
   and clean up after themselves. Everything else uses in-memory data.

5. **Mock the boundary, not the internals.** Mock `@libsql/client` when
   testing handlers. Mock handlers when testing the router. Don't mock
   five layers deep.
