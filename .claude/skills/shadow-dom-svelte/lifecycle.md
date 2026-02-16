# Shadow DOM Lifecycle

## Table of Contents

- The wrapper component (Beacon.svelte)
- Creating the shadow root
- Mounting into the shadow root
- Passing props and updating state
- Cleanup and unmounting
- The full pattern

---

## The Wrapper Component (Beacon.svelte)

`Beacon.svelte` is the public-facing component that host apps import. It
lives in the light DOM and acts as the bridge between the host's Svelte
application and the shadow-isolated widget internals.

The wrapper's job:
1. Create a shadow root on a host `<div>`
2. Mount the internal widget tree into that shadow root
3. Inject styles into the shadow root
4. Forward reactive props from the host into the shadow-mounted components
5. Clean up everything when the host component is destroyed

The wrapper itself renders almost nothing — just a single `<div>` that
becomes the shadow host.

---

## Creating the Shadow Root

Shadow root creation happens in `onMount` because it requires a DOM
element reference, which isn't available during SSR or before mount:

```svelte
<!-- Beacon.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { mount, unmount } from 'svelte';
  import BeaconWidget from './internal/BeaconWidget.svelte';
  import { widgetStyles } from './internal/styles.js';

  let { enabled = true, position = 'bottom-right' } = $props();

  let hostEl: HTMLDivElement;
  let widgetInstance: Record<string, any> | null = null;
  let shadow: ShadowRoot | null = null;

  onMount(() => {
    if (!enabled) return;

    // Create the shadow root (mode: 'open' for devtools access)
    shadow = hostEl.attachShadow({ mode: 'open' });

    // Inject styles (see references/styling.md for details)
    injectStyles(shadow);

    // Mount the widget tree into the shadow root
    widgetInstance = mount(BeaconWidget, {
      target: shadow,
      props: {
        position,
      },
    });

    // Cleanup on destroy
    return () => {
      if (widgetInstance) {
        unmount(widgetInstance);
        widgetInstance = null;
      }
    };
  });
</script>

<div bind:this={hostEl} data-beacon-host></div>
```

### Why `mode: 'open'`

Using `mode: 'open'` allows browser devtools to inspect the shadow DOM,
which is essential for development. It also allows `html2canvas` and
similar tools to access the DOM tree (though with limitations — see
`references/dom-access.md`).

Using `mode: 'closed'` would prevent devtools inspection and make
debugging extremely difficult. Since Beacon is a development tool,
there's no security benefit to a closed shadow root.

### The `data-beacon-host` Attribute

This attribute lets the screenshot and element selector features identify
the widget's host element in the light DOM, so they can exclude it from
captures and selections.

---

## Mounting into the Shadow Root

Svelte 5's `mount()` renders the component into the target, which can be
a `ShadowRoot`. The component tree behaves normally — runes, effects,
lifecycle hooks all work as expected.

```typescript
widgetInstance = mount(BeaconWidget, {
  target: shadow,
  props: { position },
});
```

The returned object contains any exports from the component. For the
widget, this is used to imperatively control visibility if needed.

### Multiple Components

You can mount multiple independent components into the same shadow root.
This is useful if parts of the widget have different lifecycles:

```typescript
// Mount the floating button (always visible)
const button = mount(FloatingButton, {
  target: shadow,
  props: { position, onclick: toggleForm },
});

// Mount the form panel (toggled on/off)
let form: Record<string, any> | null = null;

function toggleForm() {
  if (form) {
    unmount(form);
    form = null;
  } else {
    form = mount(FeedbackForm, {
      target: shadow,
      props: { onsubmit: handleSubmit, onclose: toggleForm },
    });
  }
}
```

However, for Beacon, the recommended approach is a single mount of
`BeaconWidget` which internally manages the button and form visibility
using Svelte's reactive `{#if}` blocks. This keeps the component tree
under Svelte's control and avoids manual mount/unmount choreography.

---

## Passing Props and Updating State

### Initial Props

Props are passed at mount time and consumed inside the shadow-mounted
component with `$props()` as usual:

```typescript
// In the wrapper (light DOM)
widgetInstance = mount(BeaconWidget, {
  target: shadow,
  props: { position, enabled },
});
```

```svelte
<!-- In BeaconWidget.svelte (shadow DOM) -->
<script lang="ts">
  let { position = 'bottom-right', enabled = true } = $props();
</script>
```

### Reactive Updates from the Host

This is a critical gotcha: **props passed to `mount()` are not
automatically reactive.** If the host changes `position`, the shadow-
mounted component won't see the update.

To make updates reactive, use `$effect` in the wrapper to watch for
prop changes and re-mount or use a shared reactive store:

**Option A: Reactive store (recommended)**

```typescript
// shared-state.svelte.ts
export function createWidgetState(initial: { position: string }) {
  let position = $state(initial.position);
  let formOpen = $state(false);

  return {
    get position() { return position; },
    set position(v: string) { position = v; },
    get formOpen() { return formOpen; },
    set formOpen(v: boolean) { formOpen = v; },
  };
}
```

```svelte
<!-- Beacon.svelte -->
<script lang="ts">
  import { createWidgetState } from './internal/shared-state.svelte.js';

  let { position = 'bottom-right' } = $props();

  const widgetState = createWidgetState({ position });

  // Sync host prop changes into the shared state
  $effect(() => {
    widgetState.position = position;
  });

  onMount(() => {
    // Pass the reactive state object, not raw values
    widgetInstance = mount(BeaconWidget, {
      target: shadow,
      props: { state: widgetState },
    });
    // ...
  });
</script>
```

**Option B: Svelte context**

You can pass a `context` Map to `mount()` which child components access
via `getContext()`:

```typescript
const ctx = new Map();
ctx.set('beacon-state', widgetState);

widgetInstance = mount(BeaconWidget, {
  target: shadow,
  props: {},
  context: ctx,
});
```

```svelte
<!-- Inside BeaconWidget.svelte -->
<script lang="ts">
  import { getContext } from 'svelte';
  const state = getContext('beacon-state');
</script>
```

This is useful for deeply nested components that need access to shared
state without prop drilling.

---

## Cleanup and Unmounting

Proper cleanup prevents memory leaks. The wrapper must unmount all
shadow-mounted components when it's destroyed:

```typescript
onMount(() => {
  // ... setup ...

  return () => {
    // 1. Unmount Svelte components (triggers their onDestroy callbacks)
    if (widgetInstance) {
      unmount(widgetInstance);
      widgetInstance = null;
    }

    // 2. Clear adopted stylesheets
    if (shadow) {
      shadow.adoptedStyleSheets = [];
    }

    // 3. Remove any remaining DOM nodes from the shadow root
    // (unmount should handle this, but belt-and-suspenders)
    if (shadow) {
      while (shadow.firstChild) {
        shadow.removeChild(shadow.firstChild);
      }
    }

    shadow = null;
  };
});
```

### What Cleanup Covers

When `unmount()` is called on a Svelte 5 component:
- All `$effect` cleanup functions run
- All `onDestroy` callbacks fire
- Event listeners added by the component are removed
- The component's DOM nodes are removed from the shadow root

What you still need to handle manually:
- Global event listeners added with `window.addEventListener` or
  `document.addEventListener` inside the component
- Timers (`setTimeout`, `setInterval`)
- Fetch requests in flight (consider `AbortController`)

### When Does the Wrapper Unmount?

The wrapper unmounts when the host removes `<Beacon />` from its
template — typically never, since it lives in `+layout.svelte`. But the
kill switch (`enabled={false}`) can trigger a cleanup cycle via an
`$effect` that watches the `enabled` prop.

---

## The Full Pattern

Putting it all together:

```svelte
<!-- Beacon.svelte — the public API component -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { mount, unmount } from 'svelte';
  import BeaconWidget from './internal/BeaconWidget.svelte';
  import { createWidgetState } from './internal/shared-state.svelte.js';
  import { injectStyles } from './internal/styles.js';

  let { enabled = true, position = 'bottom-right' } = $props();

  let hostEl: HTMLDivElement;
  let widgetInstance: Record<string, any> | null = null;
  let shadow: ShadowRoot | null = null;

  const widgetState = createWidgetState({ position });

  // Sync host props into reactive state
  $effect(() => {
    widgetState.position = position;
  });

  onMount(() => {
    if (!enabled) return;

    shadow = hostEl.attachShadow({ mode: 'open' });
    injectStyles(shadow);

    widgetInstance = mount(BeaconWidget, {
      target: shadow,
      props: { state: widgetState },
    });

    return () => {
      if (widgetInstance) {
        unmount(widgetInstance);
        widgetInstance = null;
      }
      if (shadow) {
        shadow.adoptedStyleSheets = [];
      }
      shadow = null;
    };
  });

  // Handle enable/disable after initial mount
  $effect(() => {
    if (!enabled && widgetInstance && shadow) {
      unmount(widgetInstance);
      widgetInstance = null;
      shadow.adoptedStyleSheets = [];
    }
  });
</script>

{#if enabled}
  <div bind:this={hostEl} data-beacon-host></div>
{/if}
```
