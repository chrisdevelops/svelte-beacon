# DOM Access: Screenshots and Element Selection

## Table of Contents

- The light DOM / shadow DOM split for captures
- Screenshot capture strategy
- Element selector mode
- Metadata collection
- Known limitations and workarounds

---

## The Light DOM / Shadow DOM Split for Captures

Screenshots and element selection operate on the **host app's light DOM**,
not inside the shadow DOM. This is intentional — users are reporting bugs
about the host app, not about the Beacon widget itself.

The workflow:
1. User clicks "take screenshot" or "select element" in the widget (shadow DOM)
2. The widget hides itself temporarily
3. The capture/selection operates on the light DOM
4. The result is passed back into the shadow DOM widget
5. The widget reappears

This means the screenshot/selection code runs in the light DOM context
with access to `document.body`, not inside the shadow root.

---

## Screenshot Capture Strategy

### html2canvas Limitations

`html2canvas` works by reading the DOM tree and re-rendering it onto a
`<canvas>`. It handles shadow DOM poorly — elements inside shadow roots
may be invisible or misrendered. However, since the Beacon widget IS the
shadow DOM content and the host app is light DOM, this works in our favor:

- ✅ `html2canvas(document.body)` captures the host app correctly
- ✅ The widget is invisible to `html2canvas` (it's in shadow DOM)
- ❌ If the host app itself uses shadow DOM components, those may not
  render correctly in the screenshot

### Implementation

```typescript
// src/widget/internal/screenshot.ts

export async function captureScreenshot(): Promise<Blob | null> {
  // Dynamically import html2canvas to avoid bundling it when unused
  const { default: html2canvas } = await import('html2canvas');

  // Hide the widget during capture
  const host = document.querySelector('[data-beacon-host]') as HTMLElement;
  if (host) host.style.display = 'none';

  try {
    const canvas = await html2canvas(document.body, {
      // Respect the viewport size
      windowWidth: document.documentElement.clientWidth,
      windowHeight: document.documentElement.clientHeight,
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
      // Scroll to capture the current viewport, not the full page
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      x: window.scrollX,
      y: window.scrollY,
      // Performance settings
      scale: window.devicePixelRatio || 1,
      useCORS: true,
      allowTaint: false,
      logging: false,
    });

    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob),
        'image/png',
        0.92
      );
    });
  } finally {
    // Always restore the widget
    if (host) host.style.display = '';
  }
}
```

### Alternative: Screen Capture API

The Screen Capture API (`getDisplayMedia`) captures the actual rendered
output including shadow DOM, CSS animations, and video elements. However,
it requires a user permission prompt, which is disruptive for quick
feedback.

```typescript
export async function captureViaScreenAPI(): Promise<Blob | null> {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser' },
      preferCurrentTab: true,  // Chrome 94+: prefer current tab
    });

    const track = stream.getVideoTracks()[0];
    const imageCapture = new ImageCapture(track);
    const bitmap = await imageCapture.grabFrame();

    // Stop the stream immediately
    track.stop();

    // Convert to blob
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);

    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  } catch {
    // User denied permission or API not available
    return null;
  }
}
```

Beacon offers both options and defaults to `html2canvas` for
frictionless captures, with the Screen Capture API as an opt-in for
higher-fidelity screenshots.

---

## Element Selector Mode

The element selector lets users hover over elements in the host app and
click to select one. This captures the element's CSS selector path,
dimensions, and position for the feedback task.

### Overlay Architecture

The selector creates a transparent overlay in the **light DOM** (not in
the shadow root) that covers the entire viewport. Mouse events on this
overlay are used to detect which element the user is hovering over by
using `document.elementFromPoint` with the overlay temporarily hidden.

```typescript
// src/widget/internal/element-selector.ts

export function startElementSelector(
  onSelect: (info: ElementInfo) => void,
  onCancel: () => void
): () => void {
  // Create overlay in light DOM
  const overlay = document.createElement('div');
  overlay.setAttribute('data-beacon-overlay', '');
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483646',  // One below the widget
    cursor: 'crosshair',
    // Transparent but catches all mouse events
    background: 'transparent',
  });

  // Highlight element (also in light DOM)
  const highlight = document.createElement('div');
  highlight.setAttribute('data-beacon-highlight', '');
  Object.assign(highlight.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: '2147483646',
    border: '2px solid #6366f1',
    borderRadius: '2px',
    background: 'rgba(99, 102, 241, 0.1)',
    transition: 'all 50ms ease-out',
    display: 'none',
  });

  document.body.appendChild(overlay);
  document.body.appendChild(highlight);

  let hoveredElement: Element | null = null;

  function handleMouseMove(event: MouseEvent) {
    // Temporarily hide overlay to find the real element underneath
    overlay.style.pointerEvents = 'none';
    const el = document.elementFromPoint(event.clientX, event.clientY);
    overlay.style.pointerEvents = '';

    if (!el || el === document.body || el === document.documentElement) {
      highlight.style.display = 'none';
      hoveredElement = null;
      return;
    }

    // Skip Beacon's own elements
    if (el.closest('[data-beacon-host]') ||
        el.closest('[data-beacon-overlay]') ||
        el.closest('[data-beacon-highlight]')) {
      highlight.style.display = 'none';
      hoveredElement = null;
      return;
    }

    hoveredElement = el;

    // Position the highlight over the hovered element
    const rect = el.getBoundingClientRect();
    Object.assign(highlight.style, {
      display: 'block',
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  }

  function handleClick(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    if (hoveredElement) {
      onSelect({
        selector: generateSelector(hoveredElement),
        tagName: hoveredElement.tagName.toLowerCase(),
        rect: hoveredElement.getBoundingClientRect().toJSON(),
        textContent: hoveredElement.textContent?.slice(0, 200) ?? '',
      });
    }

    cleanup();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onCancel();
      cleanup();
    }
  }

  overlay.addEventListener('mousemove', handleMouseMove);
  overlay.addEventListener('click', handleClick);
  document.addEventListener('keydown', handleKeydown);

  function cleanup() {
    overlay.remove();
    highlight.remove();
    document.removeEventListener('keydown', handleKeydown);
  }

  // Return cleanup function for external cancellation
  return cleanup;
}
```

### CSS Selector Generation

Generate a selector path that uniquely identifies the element:

```typescript
export interface ElementInfo {
  selector: string;
  tagName: string;
  rect: DOMRectInit;
  textContent: string;
}

function generateSelector(el: Element): string {
  // If the element has a unique ID, use it
  if (el.id) return `#${CSS.escape(el.id)}`;

  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();

    // Add class names (limit to avoid huge selectors)
    const classes = Array.from(current.classList)
      .filter(c => !c.startsWith('svelte-'))  // Skip Svelte hash classes
      .slice(0, 3);

    if (classes.length > 0) {
      selector += '.' + classes.map(c => CSS.escape(c)).join('.');
    }

    // Add nth-child if needed for uniqueness
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        s => s.tagName === current!.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    parts.unshift(selector);
    current = current.parentElement;
  }

  return parts.join(' > ');
}
```

---

## Metadata Collection

The widget automatically collects contextual metadata on feedback
submission. This runs in the light DOM context:

```typescript
export function collectMetadata(): Record<string, unknown> {
  return {
    url: window.location.href,
    route: window.location.pathname,
    referrer: document.referrer || null,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    darkMode: window.matchMedia('(prefers-color-scheme: dark)').matches,
    timestamp: new Date().toISOString(),
    // Screen info
    screen: {
      width: screen.width,
      height: screen.height,
    },
  };
}
```

This data is serialized as JSON and stored in the task's `metadata` column.

---

## Known Limitations and Workarounds

### html2canvas Inside Shadow DOM

**Problem:** `html2canvas` cannot capture content inside shadow DOM roots.
If the host app uses web components with shadow DOM, those parts will
be blank or missing in the screenshot.

**Workaround:** None that's reliable. Document this as a known limitation.
The Screen Capture API alternative captures the actual rendered output
and doesn't have this problem.

### `document.elementFromPoint` and Shadow DOM

**Problem:** `document.elementFromPoint()` returns the shadow host, not
the element inside the shadow root.

**For Beacon:** This is actually correct behavior — the element selector
should select host app elements, not internal shadow DOM elements.
However, if the host app uses shadow DOM components, the user can only
select the shadow host, not individual elements inside it.

### CSS Transitions and Animations

**Problem:** CSS transitions defined in the widget's stylesheet work
normally inside shadow DOM. However, Svelte's built-in `transition:`
directive may not work correctly because Svelte's transition code may
append temporary styles to `document.head` instead of the shadow root.

**Workaround:** Use CSS transitions in the widget's stylesheet instead
of Svelte's `transition:` directive:

```css
/* In styles.css */
.beacon-panel {
  transform: translateY(10px);
  opacity: 0;
  transition: transform 200ms ease-out, opacity 200ms ease-out;
}

.beacon-panel.open {
  transform: translateY(0);
  opacity: 1;
}
```

```svelte
<!-- Instead of transition:fly -->
<div class="beacon-panel" class:open={formOpen}>
  <!-- ... -->
</div>
```

### Popovers and Portals

**Problem:** Svelte components that use portals (rendering into
`document.body`) will render outside the shadow DOM, losing style
isolation.

**Workaround:** Don't use portals. Keep all UI within the shadow root.
For dropdowns and tooltips, use CSS `position: fixed` within the shadow
DOM — this works because the shadow root doesn't create a new stacking
context for `position: fixed`.

### Form Autofill and Password Managers

**Problem:** Browser autofill and password managers may not detect form
fields inside shadow DOM.

**For Beacon:** Not a concern — the widget's form is a feedback form
with a textarea, not a login form. The only field that could benefit
from autofill is the optional email input, and missing autofill there
is an acceptable trade-off for style isolation.

### Drag and Drop

**Problem:** Drag events work across shadow DOM boundaries, but
`dataTransfer` operations may behave unexpectedly.

**For Beacon:** File attachment via drag-and-drop should use a drop zone
inside the shadow root. The `dragover` and `drop` events propagate
correctly. Test thoroughly if implementing drag-and-drop file upload.
