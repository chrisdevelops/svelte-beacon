# Serving Static Assets & Dashboard

## Table of Contents

- Dashboard serving strategy
- Resolving file paths within node_modules
- Content-type detection
- Caching headers
- Serving user-uploaded files (screenshots, attachments)
- SPA fallback routing

---

## Dashboard Serving Strategy

The dashboard is a standalone SvelteKit app that's pre-built during the
svelte-beacon package's build step. The compiled output (HTML, JS, CSS)
ships inside the published npm package. The handle hook serves these files
when requests match `/__beacon/*` (non-API paths).

The dashboard build output looks like:

```
node_modules/svelte-beacon/dashboard/
├── index.html            # SPA entry point
├── assets/
│   ├── app-[hash].js     # Application bundle
│   ├── app-[hash].css    # Styles
│   └── chunks/           # Code-split chunks
└── _app/                 # SvelteKit internals (if applicable)
```

### Finding the Dashboard Directory

The package needs to know where its own files are at runtime. Use
`import.meta.url` or `createRequire` to resolve paths relative to the
package, not the host app's working directory:

```typescript
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Resolve the directory where this module lives
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Dashboard files are at a known relative path from this module
const DASHBOARD_DIR = join(__dirname, '..', 'dashboard');
```

This works regardless of where the host app is installed, because the path
is relative to the package's own files in node_modules — not relative to
`process.cwd()`.

---

## Dashboard Request Handler

```typescript
import { readFile, stat } from 'fs/promises';
import { join, extname } from 'path';

export async function handleDashboard(
  event: RequestEvent,
  db: Database,
  config: ResolvedConfig
): Promise<Response> {
  const { pathname } = event.url;

  // Strip the Beacon prefix to get the internal path
  // /__beacon/assets/app.js → /assets/app.js
  // /__beacon/ → /
  // /__beacon/tasks/14 → /tasks/14
  let internalPath = pathname.slice(ROUTE_PREFIX.length) || '/';

  // Try to serve a static file first
  const staticResponse = await tryServeStatic(internalPath, DASHBOARD_DIR);
  if (staticResponse) return staticResponse;

  // If no static file matches, serve index.html (SPA fallback)
  // This allows client-side routing to work for paths like /tasks/14
  return serveFile(join(DASHBOARD_DIR, 'index.html'), 'text/html');
}
```

The two-step approach: first try to serve the exact file requested, then
fall back to `index.html` for SPA client-side routing. This is the same
pattern nginx uses with `try_files $uri $uri/ /index.html`.

---

## Static File Serving

```typescript
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':  'font/ttf',
  '.otf':  'font/otf',
  '.map':  'application/json',
};

async function tryServeStatic(
  internalPath: string,
  baseDir: string
): Promise<Response | null> {
  // Security: prevent path traversal
  const safePath = internalPath.replace(/\.\./g, '');
  const filePath = join(baseDir, safePath);

  // Ensure the resolved path is still within baseDir
  if (!filePath.startsWith(baseDir)) {
    return null;
  }

  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) return null;

    return serveFile(filePath);
  } catch {
    return null; // File doesn't exist
  }
}

async function serveFile(
  filePath: string,
  forceMimeType?: string
): Promise<Response> {
  const content = await readFile(filePath);
  const ext = extname(filePath);
  const contentType = forceMimeType || MIME_TYPES[ext] || 'application/octet-stream';

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Length': String(content.byteLength),
  };

  // Cache hashed assets aggressively, don't cache HTML
  if (ext === '.html') {
    headers['Cache-Control'] = 'no-cache';
  } else if (filePath.includes('[hash]') || /\.[a-f0-9]{8,}\./.test(filePath)) {
    // Hashed filenames are immutable
    headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  } else {
    headers['Cache-Control'] = 'public, max-age=3600';
  }

  return new Response(content, { headers });
}
```

### Path Traversal Prevention

The `safePath` check is critical. Without it, a request to
`/__beacon/../../../etc/passwd` would read files outside the dashboard
directory. Two layers of defense:

1. Strip `..` segments from the path
2. Verify the resolved absolute path starts with the base directory

Both checks are necessary. The string replacement catches obvious cases,
the prefix check catches edge cases with URL encoding or platform-specific
path behavior.

---

## Serving User-Uploaded Files

Screenshots and attachments are stored in `.beacon/storage/`. These need
a separate handler because they live in a different directory from the
dashboard assets:

```typescript
// GET /__beacon/api/attachments/:id
route('GET', '/attachments/:id', async (event, db, config, params) => {
  const attachment = db.getAttachment(params.id);
  if (!attachment) return errorResponse(404, 'Attachment not found');

  const storagePath = join(process.cwd(), '.beacon', 'storage', attachment.path);

  // Security: verify path is within storage directory
  const storageDir = join(process.cwd(), '.beacon', 'storage');
  if (!storagePath.startsWith(storageDir)) {
    return errorResponse(403, 'Invalid attachment path');
  }

  try {
    return await serveFile(storagePath, attachment.mime_type);
  } catch {
    return errorResponse(404, 'Attachment file missing');
  }
});
```

Note this uses `process.cwd()` (the host app's working directory) to find
`.beacon/storage/`, unlike the dashboard which uses `import.meta.url` to
find files relative to the package. These are different directories.

---

## SPA Fallback Routing

The dashboard uses client-side routing. When a user navigates to
`/__beacon/tasks/14` and refreshes the page, the server receives a request
for `/tasks/14` (relative to the Beacon prefix). There's no file at that
path — it's a client-side route.

The fallback serves `index.html` for any path that doesn't match a static
file. The SPA's JavaScript router then takes over and renders the correct
view:

```
Request: GET /__beacon/tasks/14
  ↓
Strip prefix: /tasks/14
  ↓
Try static: .../dashboard/tasks/14 → doesn't exist
  ↓
Fallback: serve .../dashboard/index.html
  ↓
Browser loads HTML, JS executes
  ↓
SPA router sees /tasks/14, renders TaskDetail component
```

This is standard SPA behavior — the same pattern used by every single-page
app deployed behind nginx, Apache, or any other static server.

### Routes That Should NOT Fallback

API routes (`/__beacon/api/*`) are handled by the API router and should
never reach the dashboard handler. If an API route doesn't match, the
API router returns a 404 JSON response — it doesn't fall through to
serve `index.html`.

The dispatch order in the main handler ensures this:

```typescript
// API routes checked first
if (pathname.startsWith(API_PREFIX)) {
  return handleAPI(event, db, config);
}

// Dashboard routes (with SPA fallback) checked second
return handleDashboard(event, db, config);
```

---

## Development vs Production Serving

In development (`mode: 'development'`), the dashboard files are served from
node_modules as described above. The only difference from production is:

- `Cache-Control: no-cache` on all files (faster iteration during development)
- Error messages include full details

In production (`mode: 'deployed'`), hashed assets get long cache headers
and error messages are sanitized.

The serving code is the same — no separate development server, no Vite
middleware, no hot module replacement for the dashboard. When developing
the dashboard itself (as a contributor to svelte-beacon), you'd run the
dashboard's own dev server independently, then build and test it through
the handle hook.
