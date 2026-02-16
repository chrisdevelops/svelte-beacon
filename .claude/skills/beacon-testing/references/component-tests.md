# Component & E2E Tests

## Table of Contents

- Widget component testing strategy
- Testing shadow DOM mounting
- Testing form submission
- Dashboard testing
- E2E tests with Playwright

---

## Widget Component Testing Strategy

The widget has two testing layers:

1. **Unit tests** (Vitest + jsdom): Test the internal components in
   isolation (FeedbackForm, FloatingButton) without shadow DOM
2. **Integration tests** (Vitest browser mode or Playwright): Test the
   full Beacon.svelte wrapper with actual shadow DOM creation

The split exists because jsdom doesn't support `attachShadow` reliably.
Internal components work fine in jsdom since they're just Svelte
components. The shadow DOM wrapper needs a real browser.

### Internal Component Tests (Vitest + jsdom)

```typescript
// src/widget/__tests__/feedback-form.test.ts

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import FeedbackForm from '../internal/FeedbackForm.svelte';

describe('FeedbackForm', () => {
  it('renders with default state', () => {
    const { getByPlaceholderText, getByText } = render(FeedbackForm, {
      props: { onsubmit: vi.fn(), onclose: vi.fn() },
    });

    expect(getByPlaceholderText('Describe the issue...')).toBeTruthy();
    expect(getByText('Submit')).toBeTruthy();
  });

  it('disables submit when description is empty', () => {
    const { getByText } = render(FeedbackForm, {
      props: { onsubmit: vi.fn(), onclose: vi.fn() },
    });

    const submitBtn = getByText('Submit') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });

  it('calls onsubmit with form data', async () => {
    const onsubmit = vi.fn();
    // Mock fetch for the API call
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'task-1' }),
    }));

    const { getByPlaceholderText, getByText } = render(FeedbackForm, {
      props: { onsubmit, onclose: vi.fn() },
    });

    const textarea = getByPlaceholderText('Describe the issue...');
    await fireEvent.input(textarea, { target: { value: 'Test description' } });

    const submitBtn = getByText('Submit');
    await fireEvent.click(submitBtn);

    // Wait for the async submission
    await vi.waitFor(() => {
      expect(onsubmit).toHaveBeenCalled();
    });

    vi.restoreAllMocks();
  });

  it('shows error on failed submission', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Server error' }),
    }));

    const { getByPlaceholderText, getByText, findByRole } = render(FeedbackForm, {
      props: { onsubmit: vi.fn(), onclose: vi.fn() },
    });

    const textarea = getByPlaceholderText('Describe the issue...');
    await fireEvent.input(textarea, { target: { value: 'Test' } });
    await fireEvent.click(getByText('Submit'));

    const alert = await findByRole('alert');
    expect(alert.textContent).toContain('Server error');

    vi.restoreAllMocks();
  });

  it('calls onclose when cancel is clicked', async () => {
    const onclose = vi.fn();
    const { getByText } = render(FeedbackForm, {
      props: { onsubmit: vi.fn(), onclose },
    });

    await fireEvent.click(getByText('Cancel'));
    expect(onclose).toHaveBeenCalled();
  });
});
```

### Type Selector Tests

```typescript
describe('TypeSelector', () => {
  it('renders all task types', () => {
    const { getByText } = render(TypeSelector, {
      props: { value: 'bug', onchange: vi.fn() },
    });

    expect(getByText('Bug')).toBeTruthy();
    expect(getByText('Feature')).toBeTruthy();
    expect(getByText('Content')).toBeTruthy();
  });

  it('highlights the selected type', () => {
    const { getByText } = render(TypeSelector, {
      props: { value: 'bug', onchange: vi.fn() },
    });

    const bugOption = getByText('Bug').closest('button');
    expect(bugOption?.classList.contains('selected')).toBe(true);
  });
});
```

---

## Testing Shadow DOM Mounting

Shadow DOM tests require a real browser because jsdom's `attachShadow`
implementation is incomplete. Use Vitest browser mode or Playwright.

### Vitest Browser Mode

```typescript
// src/widget/__tests__/beacon-shadow.browser.test.ts
// Note: .browser.test.ts files run in real browser via Vitest browser mode

import { describe, it, expect } from 'vitest';

describe('Beacon shadow DOM', () => {
  it('creates a shadow root on mount', async () => {
    // Dynamically import to avoid SSR issues
    const { mount, unmount } = await import('svelte');
    const { default: Beacon } = await import('../Beacon.svelte');

    const container = document.createElement('div');
    document.body.appendChild(container);

    const instance = mount(Beacon, {
      target: container,
      props: { enabled: true },
    });

    const host = container.querySelector('[data-beacon-host]');
    expect(host).not.toBeNull();
    expect(host!.shadowRoot).not.toBeNull();

    await unmount(instance);
    container.remove();
  });

  it('isolates styles from host page', async () => {
    // Add a global style that would break the widget without shadow DOM
    const style = document.createElement('style');
    style.textContent = 'button { background: red !important; }';
    document.head.appendChild(style);

    const { mount, unmount } = await import('svelte');
    const { default: Beacon } = await import('../Beacon.svelte');

    const container = document.createElement('div');
    document.body.appendChild(container);

    const instance = mount(Beacon, {
      target: container,
      props: { enabled: true },
    });

    const host = container.querySelector('[data-beacon-host]');
    const shadow = host!.shadowRoot!;
    const fab = shadow.querySelector('.beacon-fab') as HTMLElement;

    if (fab) {
      const computed = getComputedStyle(fab);
      // The global red !important should NOT affect the shadow DOM button
      expect(computed.backgroundColor).not.toBe('rgb(255, 0, 0)');
    }

    await unmount(instance);
    container.remove();
    style.remove();
  });

  it('renders nothing when disabled', async () => {
    const { mount, unmount } = await import('svelte');
    const { default: Beacon } = await import('../Beacon.svelte');

    const container = document.createElement('div');
    document.body.appendChild(container);

    const instance = mount(Beacon, {
      target: container,
      props: { enabled: false },
    });

    const host = container.querySelector('[data-beacon-host]');
    expect(host).toBeNull();

    await unmount(instance);
    container.remove();
  });
});
```

---

## Dashboard Testing

The dashboard is a standalone SvelteKit app. It has its own test suite
that runs separately from the package tests.

### API Mocking for Dashboard Tests

The dashboard communicates with the Beacon API via `fetch()`. In tests,
mock the API responses:

```typescript
// dashboard/src/lib/__tests__/task-list.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import TaskList from '../components/TaskList.svelte';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      items: [
        {
          id: 'task-1',
          public_id: 1,
          type: 'bug',
          priority: 'high',
          status: 'new',
          description: 'Button broken',
          created_at: '2025-01-15T12:00:00Z',
          attachment_count: 1,
        },
      ],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    }),
  }));
});

describe('TaskList', () => {
  it('renders task rows', async () => {
    const { findByText } = render(TaskList);

    const description = await findByText('Button broken');
    expect(description).toBeTruthy();
  });

  it('shows empty state when no tasks', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
      }),
    } as Response);

    const { findByText } = render(TaskList);
    const emptyState = await findByText(/no tasks/i);
    expect(emptyState).toBeTruthy();
  });
});
```

---

## E2E Tests with Playwright

E2E tests install the package in a real SvelteKit app and run through
complete workflows in a browser.

### Test Fixture: Host App

Create a minimal SvelteKit app as a test fixture:

```
e2e/
├── fixture/                    # Minimal SvelteKit host app
│   ├── src/
│   │   ├── routes/
│   │   │   └── +layout.svelte  # Imports <Beacon />
│   │   └── hooks.server.ts     # Uses beacon() handle
│   ├── package.json            # Depends on svelte-beacon (local link)
│   └── svelte.config.js
├── feedback.spec.ts
├── dashboard.spec.ts
└── playwright.config.ts
```

The fixture app links to the local package build:

```json
// e2e/fixture/package.json
{
  "dependencies": {
    "svelte-beacon": "file:../../"
  }
}
```

### Playwright Configuration

```typescript
// e2e/playwright.config.ts

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  use: {
    baseURL: 'http://localhost:5173',
  },
  webServer: {
    command: 'cd fixture && npm run dev',
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
});
```

### Feedback Submission E2E

```typescript
// e2e/feedback.spec.ts

import { test, expect } from '@playwright/test';

test.describe('feedback submission', () => {
  test('submit feedback via widget', async ({ page }) => {
    await page.goto('/');

    // The widget renders in shadow DOM — use Playwright's shadow piercing
    const fab = page.locator('[data-beacon-host]')
      .locator('internal:shadow=.beacon-fab');
    await fab.click();

    // Fill the form inside shadow DOM
    const form = page.locator('[data-beacon-host]')
      .locator('internal:shadow=.beacon-panel');

    await form.locator('textarea').fill('E2E test bug report');
    await form.locator('button:has-text("Submit")').click();

    // Verify success state
    await expect(
      form.locator('.beacon-success')
    ).toBeVisible({ timeout: 5000 });
  });

  test('submitted task appears in dashboard', async ({ page }) => {
    // Submit feedback first
    await page.goto('/');
    const fab = page.locator('[data-beacon-host]')
      .locator('internal:shadow=.beacon-fab');
    await fab.click();

    const form = page.locator('[data-beacon-host]')
      .locator('internal:shadow=.beacon-panel');
    await form.locator('textarea').fill('Dashboard verification test');
    await form.locator('button:has-text("Submit")').click();

    // Navigate to dashboard
    await page.goto('/__beacon/');

    // Verify the task appears
    await expect(
      page.locator('text=Dashboard verification test')
    ).toBeVisible({ timeout: 5000 });
  });
});
```

### Shadow DOM in Playwright

Playwright can pierce shadow DOM boundaries using the `internal:shadow=`
prefix in locators, or by chaining `.locator()` calls from a shadow
host element.

Alternatively, use `page.evaluateHandle` to reach into the shadow root:

```typescript
const shadowContent = await page.evaluate(() => {
  const host = document.querySelector('[data-beacon-host]');
  return host?.shadowRoot?.querySelector('.beacon-fab')?.textContent;
});
```

### Dashboard E2E

```typescript
// e2e/dashboard.spec.ts

import { test, expect } from '@playwright/test';

test.describe('dashboard', () => {
  test('loads and displays task list', async ({ page }) => {
    await page.goto('/__beacon/');

    // Dashboard should render (served by handle hook)
    await expect(page.locator('h1')).toContainText(/beacon/i);
  });

  test('task detail opens in drawer', async ({ page }) => {
    // Prerequisite: create a task via API
    await page.request.post('/__beacon/api/feedback', {
      data: {
        type: 'bug',
        priority: 'high',
        description: 'Drawer test task',
      },
    });

    await page.goto('/__beacon/');
    await page.locator('text=Drawer test task').click();

    // Verify the detail drawer opens
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(page.locator('text=Drawer test task')).toBeVisible();
  });
});
```

### E2E Test Lifecycle

```typescript
test.beforeEach(async ({ request }) => {
  // Reset test data via a test-only endpoint (development mode only)
  // or by deleting and recreating the .beacon directory
});
```

For CI, the fixture app uses an in-memory or temp-file database so
tests start fresh on every run.
