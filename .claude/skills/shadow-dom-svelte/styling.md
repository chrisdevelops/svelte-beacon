# Styling Inside Shadow DOM

## Table of Contents

- The style isolation problem
- adoptedStyleSheets (primary method)
- Inline `<style>` fallback
- Building the widget stylesheet
- CSS custom properties (the one thing that crosses the boundary)
- The `:host` selector
- Avoiding inherited style leakage
- Font loading

---

## The Style Isolation Problem

CSS in `document.head` — including Svelte's default scoped styles — has
no effect inside shadow DOM. When you compile a Svelte component normally,
its styles end up in `<style>` tags in the document head. If that component
is mounted into a shadow root, those styles won't apply.

There are two consequences:
1. Widget styles must be injected directly into the shadow root
2. The widget must ship its own complete stylesheet (cannot rely on any
   CSS from the host app)

---

## adoptedStyleSheets (Primary Method)

`adoptedStyleSheets` is the modern way to inject styles into a shadow root.
It uses constructable `CSSStyleSheet` objects which are memory-efficient
(one stylesheet instance can be shared across multiple shadow roots).

```typescript
// src/widget/internal/styles.ts

import widgetCSS from './styles.css?inline';

// Create the stylesheet once (module-level singleton)
let sheet: CSSStyleSheet | null = null;

function getSheet(): CSSStyleSheet {
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(widgetCSS);
  }
  return sheet;
}

export function injectStyles(shadowRoot: ShadowRoot): void {
  shadowRoot.adoptedStyleSheets = [getSheet()];
}
```

The `?inline` import suffix (Vite feature) imports the CSS file content
as a string at build time. This means the CSS is bundled into the
JavaScript and doesn't require a separate HTTP request.

### Why Not `<style>` Tags?

Inline `<style>` elements work too, but `adoptedStyleSheets` has
advantages:
- The same `CSSStyleSheet` object is shared if multiple widgets mount
  (no duplication)
- Style updates can be made programmatically (useful for theming)
- Slightly better performance for parsing

### Browser Support

`adoptedStyleSheets` is supported in all modern browsers (Chrome 73+,
Firefox 101+, Safari 16.4+). For Beacon's target audience (developers
using modern SvelteKit), this is a non-issue.

---

## Inline `<style>` Fallback

If for some reason `adoptedStyleSheets` is not available, fall back to
injecting a `<style>` element:

```typescript
export function injectStyles(shadowRoot: ShadowRoot): void {
  if ('adoptedStyleSheets' in shadowRoot) {
    shadowRoot.adoptedStyleSheets = [getSheet()];
  } else {
    // Fallback: inject a <style> element
    const style = document.createElement('style');
    style.textContent = widgetCSS;
    shadowRoot.prepend(style);
  }
}
```

---

## Building the Widget Stylesheet

The widget's CSS lives in `src/widget/internal/styles.css`. This is a
plain CSS file — not processed by the host's Tailwind, PostCSS, or any
other build tool.

### Structure

```css
/* src/widget/internal/styles.css */

/* === Reset === */
/* Minimal reset for shadow DOM — only what the widget needs */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* === Host positioning === */
:host {
  /* Position the shadow host in the viewport */
  position: fixed;
  z-index: 2147483647; /* Maximum z-index */
  pointer-events: none;
  /* Cover full viewport for the form overlay */
  inset: 0;
}

/* === Root container === */
.beacon-root {
  pointer-events: auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
               Oxygen, Ubuntu, Cantarell, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: #1a1a1a;
  -webkit-font-smoothing: antialiased;
}

/* === Floating button === */
.beacon-fab {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  /* ... */
}

/* === Form panel === */
.beacon-panel {
  position: fixed;
  bottom: 88px;
  right: 20px;
  width: 380px;
  max-height: calc(100vh - 108px);
  /* ... */
}

/* ... remaining widget styles ... */
```

### Key Rules

1. **Set `font-family` explicitly on the root container.** The shadow DOM
   inherits `font-family` from the host page's body. If the host uses a
   custom font, the widget will too — which may look wrong. Setting an
   explicit font-family on `.beacon-root` overrides the inheritance.

2. **Set `font-size` explicitly.** Same reason — the host might have a
   different base font size. Use `px` units, not `rem` or `em`, because
   `rem` is relative to the host page's root font size, which you don't
   control.

3. **Use `px` for all sizing.** The widget must look identical regardless
   of the host's CSS. `rem` and `em` are relative to context you don't
   control. `px` is absolute.

4. **Use a minimal reset, not a full reset.** The shadow root starts
   with browser defaults — you don't inherit the host's Tailwind
   preflight or normalize.css. Reset only what you need.

5. **Maximum z-index on `:host`.** The widget should float above
   everything in the host app. `2147483647` is the maximum 32-bit
   integer, which is the highest z-index browsers support.

6. **`pointer-events: none` on `:host`, `auto` on interactive elements.**
   This lets click events pass through the shadow host to the page
   beneath, except where the widget's UI actually is.

---

## CSS Custom Properties (The One Thing That Crosses)

CSS custom properties (variables) defined on ancestors in the light DOM
are inherited into shadow DOM. This is a feature, not a bug — it enables
theming.

Beacon can optionally read custom properties set by the host app:

```css
/* In the widget's styles.css */
.beacon-fab {
  background-color: var(--beacon-accent, #6366f1);
  color: var(--beacon-accent-text, #ffffff);
}

.beacon-panel {
  border-radius: var(--beacon-radius, 12px);
}
```

The host developer can customize the widget's appearance:

```css
/* In the host app's global CSS */
:root {
  --beacon-accent: #e11d48;
  --beacon-accent-text: #ffffff;
  --beacon-radius: 8px;
}
```

### Rules for Custom Properties

- Always provide a fallback value: `var(--beacon-x, fallback)`
- Prefix all custom properties with `--beacon-` to avoid collisions
- Document which custom properties are supported in the README
- Keep the number small — don't make every color customizable

---

## The `:host` Selector

`:host` selects the shadow host element (the `<div data-beacon-host>`
in the light DOM) from within the shadow DOM's styles:

```css
/* Styles the outer <div> from inside the shadow root */
:host {
  position: fixed;
  z-index: 2147483647;
}

/* Conditional styling based on host attributes */
:host([data-beacon-position="bottom-left"]) .beacon-fab {
  left: 20px;
  right: auto;
}
```

`:host` only works inside shadow DOM. It has no effect in a normal
stylesheet.

---

## Avoiding Inherited Style Leakage

Some CSS properties are inherited by default and cross the shadow
boundary. The most common inherited properties that could cause issues:

| Property | Risk | Mitigation |
|----------|------|------------|
| `font-family` | Host's font applied to widget | Set explicitly on `.beacon-root` |
| `font-size` | Host's size affects widget | Set explicitly in `px` |
| `color` | Host's text color leaks in | Set explicitly on `.beacon-root` |
| `line-height` | Layout shifts | Set explicitly |
| `text-align` | Unexpected centering | Set explicitly where needed |
| `direction` | RTL host breaks layout | Set `direction: ltr` on `.beacon-root` |
| `visibility` | Host hiding content hides widget | Generally not an issue |
| `cursor` | Wrong cursor on hover | Set explicitly on interactive elements |

The pattern: set all potentially-inherited properties explicitly on the
widget's root container. This creates a clean baseline regardless of
what the host app does.

```css
.beacon-root {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: #1a1a1a;
  text-align: left;
  direction: ltr;
  letter-spacing: normal;
  word-spacing: normal;
  text-transform: none;
  text-indent: 0;
  text-shadow: none;
  white-space: normal;
}
```

---

## Font Loading

If the widget uses a custom font (e.g., Inter), it must be loaded
within the shadow root because `@font-face` declarations in the host's
stylesheets do affect the shadow DOM (font-face rules are document-
level, not scoped).

However, relying on the host's fonts is fragile. The safest approach is
to use system fonts (as shown above) so the widget has zero font loading
dependencies.

If a custom font is needed:

```css
/* Inside the widget's styles.css */
@font-face {
  font-family: 'BeaconFont';
  src: url('data:font/woff2;base64,...') format('woff2');
  font-display: swap;
}
```

Inlining the font as a base64 data URL keeps everything self-contained
but increases bundle size. Only do this for icon fonts or very small
typefaces — not full text fonts.

For icon fonts (used for the widget's icons), base64 inlining is
acceptable because icon fonts are typically small (5-15KB).
