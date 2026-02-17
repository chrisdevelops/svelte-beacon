import type { Handle } from '@sveltejs/kit';
import type { Client } from '@libsql/client';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import type { BeaconOptions, ResolvedConfig } from './config.js';
import { resolveConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { dispatch } from './router.js';
import './api/index.js';

const BEACON_PREFIX = '/__beacon';
const API_PREFIX = '/__beacon/api';

// Resolve the dashboard directory relative to the package root.
// At runtime this file is at dist/server/hook.js, so go up two levels
// to reach the package root, then into dist/dashboard/.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DASHBOARD_DIR = join(__dirname, '..', 'dashboard');

const MIME_TYPES: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'application/javascript; charset=utf-8',
	'.mjs': 'application/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.otf': 'font/otf',
};

/**
 * Create a SvelteKit handle hook that intercepts /__beacon/* requests.
 *
 * Usage in hooks.server.ts:
 * ```ts
 * import { beacon } from 'svelte-beacon/server';
 * import { sequence } from '@sveltejs/kit/hooks';
 *
 * export const handle = sequence(
 *   beacon({ enabled: true, mode: 'development' }),
 *   // ... other hooks
 * );
 * ```
 */
export function beacon(options: BeaconOptions): Handle {
	const config = resolveConfig(options);

	// Lazy-initialized database client
	let db: Client | null = null;
	let initPromise: Promise<Client> | null = null;

	async function getDB(): Promise<Client> {
		if (db) return db;
		if (initPromise) return initPromise;

		initPromise = initializeDatabase(config).then((client) => {
			db = client;
			return client;
		});

		return initPromise;
	}

	return async ({ event, resolve }) => {
		// Kill switch — pure passthrough
		if (!config.enabled) {
			return resolve(event);
		}

		// Fast passthrough — non-Beacon requests skip all logic
		if (!event.url.pathname.startsWith(BEACON_PREFIX)) {
			return resolve(event);
		}

		// Outer error boundary — never crash the host app
		try {
			const database = await getDB();

			// API routes
			if (event.url.pathname.startsWith(API_PREFIX)) {
				return await handleAPIRequest(event, database, config);
			}

			// Dashboard routes
			return await handleDashboardRequest(event, database, config);
		} catch (err) {
			console.error('[beacon] Unhandled error:', err);
			return new Response(
				JSON.stringify({ error: 'Internal Beacon error' }),
				{
					status: 500,
					headers: { 'Content-Type': 'application/json' },
				},
			);
		}
	};
}

async function initializeDatabase(config: ResolvedConfig): Promise<Client> {
	return createDatabase(config);
}

async function handleAPIRequest(
	event: Parameters<Handle>[0]['event'],
	db: Client,
	config: ResolvedConfig,
): Promise<Response> {
	return dispatch(event, db, config);
}

async function handleDashboardRequest(
	event: Parameters<Handle>[0]['event'],
	_db: Client,
	_config: ResolvedConfig,
): Promise<Response> {
	const { pathname } = event.url;

	// Strip the /__beacon prefix to get the internal file path.
	// /__beacon/            -> /
	// /__beacon             -> /
	// /__beacon/_app/x.js   -> /_app/x.js
	const internalPath = pathname.slice(BEACON_PREFIX.length) || '/';

	// Security: reject any path containing ".." to prevent directory traversal.
	if (internalPath.includes('..')) {
		return new Response('Forbidden', { status: 403 });
	}

	// Determine whether this looks like a static file request (has a file extension).
	const ext = extname(internalPath);

	// If the path has a file extension, try to serve it as a static file.
	if (ext) {
		const filePath = normalize(join(DASHBOARD_DIR, internalPath));

		// Double-check the resolved path is still inside the dashboard directory.
		if (!filePath.startsWith(DASHBOARD_DIR)) {
			return new Response('Forbidden', { status: 403 });
		}

		try {
			const content = await readFile(filePath);
			const contentType = MIME_TYPES[ext] || 'application/octet-stream';

			// Hashed assets (e.g., app-abc123de.js) get immutable caching.
			// Pattern: a dot followed by 8+ hex characters followed by a dot.
			const isHashed = /\.[a-f0-9]{8,}\./.test(filePath);

			return new Response(content, {
				headers: {
					'Content-Type': contentType,
					'Content-Length': String(content.byteLength),
					'Cache-Control': isHashed
						? 'public, max-age=31536000, immutable'
						: 'public, max-age=3600',
				},
			});
		} catch {
			return new Response('Not Found', { status: 404 });
		}
	}

	// For paths without extensions (SPA routes like /tasks/14), serve index.html.
	try {
		const indexPath = join(DASHBOARD_DIR, 'index.html');
		const content = await readFile(indexPath);

		return new Response(content, {
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
				'Content-Length': String(content.byteLength),
				'Cache-Control': 'no-cache',
			},
		});
	} catch {
		return new Response('Dashboard not found. The package may not have been built correctly.', {
			status: 500,
			headers: { 'Content-Type': 'text/plain' },
		});
	}
}
