import { describe, it, expect } from 'vitest';
import { createTestDB } from '../../../../test/helpers.js';
import { runMigrations } from '../migrations.js';

describe('migrations', () => {
	it('all migrations run on empty DB', async () => {
		const db = await createTestDB();
		// createTestDB() calls runMigrations internally.
		// If we reach this point, all migrations succeeded.
		expect(db).toBeDefined();
		db.close();
	});

	it('schema version is recorded', async () => {
		const db = await createTestDB();
		const result = await db.execute(
			`SELECT value FROM _beacon_meta WHERE key = 'schema_version'`,
		);
		expect(result.rows).toHaveLength(1);
		expect(result.rows[0].value).toBe('1');
		db.close();
	});

	it('all expected tables exist', async () => {
		const db = await createTestDB();
		const result = await db.execute(
			`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
		);
		const tables = result.rows.map((r) => r.name as string);

		expect(tables).toEqual([
			'_beacon_meta',
			'activity',
			'admin_notes',
			'ai_logs',
			'attachments',
			'magic_links',
			'sessions',
			'tasks',
		]);
		db.close();
	});

	it('all expected indexes exist', async () => {
		const db = await createTestDB();
		const result = await db.execute(
			`SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name`,
		);
		const indexes = result.rows.map((r) => r.name as string);

		expect(indexes).toEqual([
			'idx_activity_task_id',
			'idx_admin_notes_task_id',
			'idx_ai_logs_task_id',
			'idx_attachments_task_id',
			'idx_magic_links_token',
			'idx_sessions_expires_at',
			'idx_tasks_created_at',
			'idx_tasks_origin_remote',
			'idx_tasks_priority',
			'idx_tasks_status',
			'idx_tasks_type',
		]);
		db.close();
	});

	it('trigger exists', async () => {
		const db = await createTestDB();
		const result = await db.execute(
			`SELECT name FROM sqlite_master WHERE type='trigger'`,
		);
		const triggers = result.rows.map((r) => r.name as string);

		expect(triggers).toEqual(['tasks_public_id_auto']);
		db.close();
	});

	it('idempotency — running migrations twice causes no error', async () => {
		const db = await createTestDB();

		// Run migrations again on an already-migrated database
		await runMigrations(db);

		const result = await db.execute(
			`SELECT value FROM _beacon_meta WHERE key = 'schema_version'`,
		);
		expect(result.rows).toHaveLength(1);
		expect(result.rows[0].value).toBe('1');
		db.close();
	});

	it('trigger auto-assigns public_id', async () => {
		const db = await createTestDB();

		await db.execute({
			sql: `INSERT INTO tasks (id, public_id, type, priority, description) VALUES (?, ?, ?, ?, ?)`,
			args: ['test-1', 0, 'bug', 'medium', 'Test task'],
		});

		const result = await db.execute(
			`SELECT public_id FROM tasks WHERE id = 'test-1'`,
		);
		expect(Number(result.rows[0].public_id)).toBe(1);
		db.close();
	});
});
