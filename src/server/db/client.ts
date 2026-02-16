import { createClient, type Client } from '@libsql/client';
import type { ResolvedConfig } from '../config.js';
import { runMigrations } from './migrations.js';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

/**
 * Create and initialize the database client.
 * Called once by the handle hook's lazy initialization.
 */
export async function createDatabase(config: ResolvedConfig): Promise<Client> {
	// Ensure the .beacon directory exists for local file URLs
	if (config.database.startsWith('file:') && !config.database.includes(':memory:')) {
		const dbPath = config.database.replace('file:', '');
		const dir = dirname(dbPath);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
	}

	const client = createClient({
		url: config.database,
		authToken: config.databaseAuthToken,
	});

	await runMigrations(client);

	return client;
}
