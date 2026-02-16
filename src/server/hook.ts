import type { Handle } from '@sveltejs/kit';
import type { Client } from '@libsql/client';
import type { BeaconOptions, ResolvedConfig } from './config.js';
import { resolveConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { dispatch } from './router.js';
import './api/index.js';

const BEACON_PREFIX = '/__beacon';
const API_PREFIX = '/__beacon/api';

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
	config: ResolvedConfig,
): Promise<Response> {
	const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Beacon Dashboard</title></head>
<body>
<h1>Beacon Dashboard</h1>
<p>Mode: ${config.mode}</p>
<p>API: /__beacon/api</p>
</body>
</html>`;

	return new Response(html, {
		status: 200,
		headers: {
			'Content-Type': 'text/html',
			'Cache-Control': 'no-cache',
		},
	});
}
