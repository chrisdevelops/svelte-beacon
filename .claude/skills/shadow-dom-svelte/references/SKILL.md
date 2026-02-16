---
name: shadow-dom-svelte
description: >
  Patterns for rendering Svelte 5 components inside Shadow DOM with full style
  isolation. Use this skill when working on the Beacon widget component
  (Beacon.svelte), mounting sub-components into the shadow root, injecting
  stylesheets, handling events across the shadow boundary, capturing screenshots,
  selecting DOM elements, or debugging style isolation issues. Also use when
  working with the FloatingButton, FeedbackForm, ScreenshotCapture, or
  ElementSelector components. This skill captures working patterns and known
  gotchas that are poorly documented elsewhere.
---

# Shadow DOM + Svelte 5

This skill covers the patterns for rendering Svelte 5 components inside
Shadow DOM, as used by the svelte-beacon widget. Shadow DOM provides
complete style isolation between the widget and the host application — no
style leakage in either direction, no class name collisions, no dependency
on the host's CSS framework.

## Why Shadow DOM (Not Svelte Scoped Styles)

Svelte's built-in scoped styles add hashed class names to prevent collisions,
but they don't prevent the host app's styles from affecting Beacon's
elements. A global `button { all: unset }` or a Tailwind preflight reset
would break the widget. Shadow DOM provides true encapsulation — a hard
boundary that CSS cannot cross (except for inherited properties like
`font-family` and `color`, which is actually desirable).

## Architecture Overview

The widget uses a **host-in-light, components-in-shadow** pattern:

```
<div>                           ← Light DOM (host app sees this)
  #shadow-root (open)           ← Shadow boundary
    <style>...</style>          ← Widget styles (isolated)
    <div class="beacon-root">   ← Shadow DOM (host app can't style this)
      <FloatingButton />
      <FeedbackForm />
    </div>
</div>
```

The outer `<div>` (called the "shadow host") lives in the host app's DOM
tree. Everything inside the shadow root is invisible to the host's CSS.
The widget's own styles live inside the shadow root and cannot leak out.

## Key Concepts

### Svelte 5's `mount()` Accepts a ShadowRoot

Svelte 5's `mount()` function signature is:

```typescript
mount(component, {
  target: Document | Element | ShadowRoot,
  props?: Record<string, any>,
  intro?: boolean,
  context?: Map<any, any>,
})
```

The `target` parameter explicitly accepts a `ShadowRoot`. This is the
foundation of the entire approach — you create a shadow root, then tell
Svelte to render into it.

### Styles Must Be Inside the Shadow Root

CSS in `document.head` has no effect inside shadow DOM. Widget styles
must be injected directly into the shadow root, either via:

1. A `<style>` element appended to the shadow root
2. `adoptedStyleSheets` on the shadow root (preferred)

Beacon uses `adoptedStyleSheets` for the main stylesheet and inline
`<style>` elements only as a fallback for browsers that don't support
constructable stylesheets (effectively none in 2025+).

### Events Cross the Shadow Boundary (With Caveats)

Standard DOM events bubble across the shadow boundary. Custom events
do too, but only if created with `{ composed: true, bubbles: true }`.
Form submission events do NOT cross the boundary — the widget handles
form submission internally via `fetch()`, not native form submission.

## References

| I need to... | Read... |
|---|---|
| Understand the mount/unmount lifecycle | `references/lifecycle.md` |
| Inject styles into the shadow root | `references/styling.md` |
| Handle events across the boundary | `references/events.md` |
| Take screenshots or select elements | `references/dom-access.md` |
