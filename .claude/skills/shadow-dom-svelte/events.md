# Events Across the Shadow Boundary

## Table of Contents

- How DOM events interact with shadow DOM
- Event retargeting
- Form submission inside shadow DOM
- Custom events with `composed: true`
- Keyboard events and focus management
- Click-outside detection
- Communication between shadow and light DOM

---

## How DOM Events Interact with Shadow DOM

Standard DOM events (click, input, change, keydown, etc.) bubble through
the shadow DOM boundary by default. When an event crosses the boundary,
the browser modifies its `target` property — this is called "retargeting."

Events that **do** cross the shadow boundary (composed: true by default):
- `click`, `dblclick`, `mousedown`, `mouseup`, `mousemove`
- `touchstart`, `touchend`, `touchmove`
- `keydown`, `keyup`, `keypress`
- `input`, `change`
- `focus`, `blur`, `focusin`, `focusout`
- `scroll`, `wheel`
- `pointerdown`, `pointerup`, `pointermove`

Events that **do not** cross (composed: false by default):
- `submit` (form submission)
- `reset` (form reset)
- `slotchange`

This is critical for Beacon: the widget uses `fetch()` for form submission,
not native `<form>` submission, specifically because `submit` events don't
cross the shadow boundary.

---

## Event Retargeting

When an event crosses the shadow boundary, its `target` is retargeted to
the shadow host. Listeners on the host or ancestors see the shadow host
as the target, not the actual element inside the shadow DOM.

```
Shadow DOM:  <button class="beacon-fab"> ← actual click target
Shadow host: <div data-beacon-host>      ← what external listeners see
```

This means:
- Event delegation on the host app's elements will see clicks on the
  widget as coming from the shadow host element, not from internal
  buttons
- The widget's internal event handlers work normally — retargeting
  only affects listeners outside the shadow root

---

## Form Submission Inside Shadow DOM

**Do not use native `<form>` submission.** The `submit` event does not
cross the shadow boundary, so `event.preventDefault()` handlers in the
host can't intercept it, and SvelteKit's form actions won't work.

Instead, handle form submission with explicit event handlers and `fetch()`:

```svelte
<!-- FeedbackForm.svelte (inside shadow DOM) -->
<script lang="ts">
  let { onsubmit, onclose } = $props();

  let description = $state('');
  let type = $state('bug');
  let priority = $state('medium');
  let submitting = $state(false);
  let error = $state<string | null>(null);

  async function handleSubmit() {
    if (!description.trim()) return;

    submitting = true;
    error = null;

    try {
      const res = await fetch('/__beacon/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          priority,
          description: description.trim(),
          route: window.location.pathname,
          metadata: collectMetadata(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        error = data.error || 'Submission failed';
        return;
      }

      // Success — notify parent and reset
      onsubmit?.();
      description = '';
      type = 'bug';
      priority = 'medium';
    } catch (err) {
      error = 'Network error — check your connection';
    } finally {
      submitting = false;
    }
  }
</script>

<!-- No <form> element — just a div with a button handler -->
<div class="beacon-form">
  <textarea bind:value={description} placeholder="Describe the issue..." />

  <!-- ... type and priority selectors ... -->

  <div class="beacon-form-actions">
    <button onclick={onclose} type="button">Cancel</button>
    <button
      onclick={handleSubmit}
      disabled={submitting || !description.trim()}
    >
      {submitting ? 'Submitting...' : 'Submit'}
    </button>
  </div>

  {#if error}
    <div class="beacon-error" role="alert">{error}</div>
  {/if}
</div>
```

### Why Not `<form>`?

Even with `event.preventDefault()`, using a `<form>` inside shadow DOM
creates problems:
- If JavaScript fails, the form would submit natively to the current
  page URL, causing a full-page navigation
- The `submit` event doesn't propagate to the light DOM, making it
  invisible to the host app's error monitoring
- Some browser extensions intercept form submissions, which could
  interfere with Beacon's feedback flow

Using explicit `onclick` handlers + `fetch()` is more predictable.

---

## Custom Events with `composed: true`

When the widget needs to communicate something to the host app (e.g.,
"feedback was submitted successfully"), it dispatches a custom event
with `composed: true` so it crosses the shadow boundary:

```typescript
// Inside a shadow DOM component
function notifyHost(detail: unknown) {
  const event = new CustomEvent('beacon:submit', {
    bubbles: true,
    composed: true,    // ← Required to cross shadow boundary
    detail,
  });

  // Dispatch from the shadow host element, not from an internal element
  // This ensures the event's path includes the host app's DOM tree
  hostEl.dispatchEvent(event);
}
```

The host app can listen for these events:

```svelte
<!-- In the host app -->
<Beacon on:beacon:submit={(e) => console.log('Feedback submitted', e.detail)} />
```

Or using standard DOM listeners:

```typescript
document.querySelector('[data-beacon-host]')
  ?.addEventListener('beacon:submit', (e) => {
    console.log('Feedback submitted', e.detail);
  });
```

### Naming Convention

Prefix all custom events with `beacon:` to avoid collisions:
- `beacon:submit` — feedback was submitted
- `beacon:open` — form panel opened
- `beacon:close` — form panel closed

---

## Keyboard Events and Focus Management

### Focus Trapping

When the feedback form panel is open, focus should be trapped within the
panel to prevent tabbing into the host app behind it:

```svelte
<script lang="ts">
  let panelEl: HTMLDivElement;

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onclose?.();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = panelEl.querySelectorAll<HTMLElement>(
      'button, textarea, input, select, [tabindex]:not([tabindex="-1"])'
    );

    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  bind:this={panelEl}
  class="beacon-panel"
  role="dialog"
  aria-label="Submit feedback"
  onkeydown={handleKeydown}
>
  <!-- ... form content ... -->
</div>
```

### Focus Inside Shadow DOM

`document.activeElement` returns the shadow host when focus is inside
the shadow root. To get the actually-focused element inside shadow DOM,
chain through `shadowRoot.activeElement`:

```typescript
function getActiveElement(root: Document | ShadowRoot = document): Element | null {
  const active = root.activeElement;
  if (active?.shadowRoot) {
    return getActiveElement(active.shadowRoot);
  }
  return active;
}
```

### Initial Focus

When the form panel opens, move focus to the first interactive element
(the description textarea):

```svelte
<script lang="ts">
  import { tick } from 'svelte';

  let textareaEl: HTMLTextAreaElement;

  // Focus the textarea when the panel appears
  $effect(() => {
    if (formOpen) {
      tick().then(() => textareaEl?.focus());
    }
  });
</script>
```

---

## Click-Outside Detection

Detecting clicks outside the form panel requires listening on the shadow
root, not on `document`, because click events are retargeted at the
shadow boundary:

```typescript
function handleShadowRootClick(event: MouseEvent) {
  const panel = shadow?.querySelector('.beacon-panel');
  if (panel && !panel.contains(event.target as Node)) {
    // Click was outside the panel but inside the shadow root
    closeForm();
  }
}

// Listen on the shadow root itself
shadow?.addEventListener('click', handleShadowRootClick);
```

For clicks outside the shadow root entirely (on the host app), listen
on `document` with `{ capture: true }` since the retargeted event will
have the shadow host as its target:

```typescript
function handleDocumentClick(event: MouseEvent) {
  const target = event.target as Element;
  if (target.closest('[data-beacon-host]')) return; // Click was inside widget
  closeForm();
}

document.addEventListener('click', handleDocumentClick, { capture: true });

// Clean up in onDestroy
return () => {
  document.removeEventListener('click', handleDocumentClick, { capture: true });
};
```

---

## Communication Between Shadow and Light DOM

### Shadow → Light (Widget to Host App)

Custom events with `composed: true` (described above). Use sparingly —
the widget should be mostly self-contained.

### Light → Shadow (Host App to Widget)

Props passed through the wrapper component. The wrapper's `$effect`
watches host-side prop changes and updates the shared reactive state
that the shadow-mounted components consume (see `references/lifecycle.md`).

### Shadow → Server (Widget to Beacon API)

Direct `fetch()` calls to `/__beacon/api/*` endpoints. These are
same-origin requests that the handle hook intercepts. No CORS issues,
no additional configuration.

```typescript
// Inside any shadow DOM component
const response = await fetch('/__beacon/api/config');
const config = await response.json();
```

This is the primary communication channel — the widget talks to the
server, not to the host app's Svelte stores or state.
