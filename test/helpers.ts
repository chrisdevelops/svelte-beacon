import { createClient, type Client } from '@libsql/client';
import { runMigrations } from '../src/server/db/migrations.js';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Create a fresh in-memory database with all migrations applied.
 * Use in beforeEach() for complete test isolation.
 */
export async function createTestDB(): Promise<Client> {
	const db = createClient({ url: 'file::memory:' });
	await runMigrations(db);
	return db;
}

/**
 * Create a temporary directory for CLI tests.
 * Returns the path — caller must clean up with removeTempDir().
 */
export async function createTempDir(): Promise<string> {
	return mkdtemp(join(tmpdir(), 'beacon-test-'));
}

/**
 * Remove a temporary directory.
 */
export async function removeTempDir(dir: string): Promise<void> {
	await rm(dir, { recursive: true, force: true });
}
