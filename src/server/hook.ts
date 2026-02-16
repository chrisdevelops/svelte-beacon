import type { Handle } from '@sveltejs/kit';
import type { Client } from '@libsql/client';
import type { BeaconOptions, ResolvedConfig } from './config.js';
import { resolveConfig } from './config.js';

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
	// TODO: Implement with createDatabase from db/client.ts
	// This will be implemented by the beacon-database agent
	const { createClient } = await import('@libsql/client');

	const client = createClient({
		url: config.database,
		authToken: config.databaseAuthToken,
	});

	// Run migrations
	// TODO: await runMigrations(client);

	return client;
}

async function handleAPIRequest(
	event: Parameters<Handle>[0]['event'],
	db: Client,
	config: ResolvedConfig,
): Promise<Response> {
	// TODO: Implement API router dispatch
	// This will be implemented by the beacon-package-architect agent
	return new Response(
		JSON.stringify({ error: 'Not implemented' }),
		{
			status: 501,
			headers: { 'Content-Type': 'application/json' },
		},
	);
}

async function handleDashboardRequest(
	event: Parameters<Handle>[0]['event'],
	db: Client,
	config: ResolvedConfig,
): Promise<Response> {
	// TODO: Serve pre-built dashboard files
	// This will be implemented by the beacon-package-architect agent
	return new Response('Dashboard not built yet', {
		status: 503,
		headers: { 'Content-Type': 'text/plain' },
	});
}
