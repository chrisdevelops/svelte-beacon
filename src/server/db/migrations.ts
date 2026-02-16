import type { Client } from '@libsql/client';

export interface Migration {
	version: number;
	description: string;
	statements: string[];
}

export const migrations: Migration[] = [
	{
		version: 1,
		description: 'Initial schema',
		statements: [
			// Tasks — core feedback records
			`CREATE TABLE tasks (
				id TEXT PRIMARY KEY,
				public_id INTEGER NOT NULL,
				type TEXT NOT NULL,
				priority TEXT NOT NULL,
				status TEXT NOT NULL DEFAULT 'new',
				description TEXT,
				route TEXT,
				element_selector TEXT,
				metadata TEXT,
				origin TEXT NOT NULL DEFAULT 'local',
				remote_id TEXT,
				ai_branch TEXT,
				ai_pr_url TEXT,
				ai_blocked_reason TEXT,
				user_email TEXT,
				created_at TEXT NOT NULL DEFAULT (datetime('now')),
				updated_at TEXT NOT NULL DEFAULT (datetime('now'))
			)`,

			// Auto-increment trigger for public_id
			`CREATE TRIGGER tasks_public_id_auto
				AFTER INSERT ON tasks
				WHEN NEW.public_id = 0
			BEGIN
				UPDATE tasks SET public_id = (
					SELECT COALESCE(MAX(public_id), 0) + 1 FROM tasks WHERE id != NEW.id
				) WHERE id = NEW.id;
			END`,

			// Attachments
			`CREATE TABLE attachments (
				id TEXT PRIMARY KEY,
				task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
				type TEXT NOT NULL,
				filename TEXT NOT NULL,
				path TEXT NOT NULL,
				mime_type TEXT NOT NULL,
				size_bytes INTEGER NOT NULL DEFAULT 0,
				created_at TEXT NOT NULL DEFAULT (datetime('now'))
			)`,

			// Admin notes
			`CREATE TABLE admin_notes (
				id TEXT PRIMARY KEY,
				task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
				content TEXT NOT NULL,
				author_email TEXT,
				created_at TEXT NOT NULL DEFAULT (datetime('now'))
			)`,

			// AI logs
			`CREATE TABLE ai_logs (
				id TEXT PRIMARY KEY,
				task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
				level TEXT NOT NULL,
				message TEXT NOT NULL,
				metadata TEXT,
				created_at TEXT NOT NULL DEFAULT (datetime('now'))
			)`,

			// Activity audit trail
			`CREATE TABLE activity (
				id TEXT PRIMARY KEY,
				task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
				actor TEXT NOT NULL,
				action TEXT NOT NULL,
				old_value TEXT,
				new_value TEXT,
				created_at TEXT NOT NULL DEFAULT (datetime('now'))
			)`,

			// Sessions (deployed mode)
			`CREATE TABLE sessions (
				id TEXT PRIMARY KEY,
				email TEXT NOT NULL,
				is_admin INTEGER NOT NULL DEFAULT 0,
				expires_at TEXT NOT NULL,
				created_at TEXT NOT NULL DEFAULT (datetime('now'))
			)`,

			// Magic links (deployed mode)
			`CREATE TABLE magic_links (
				id TEXT PRIMARY KEY,
				email TEXT NOT NULL,
				token TEXT NOT NULL UNIQUE,
				used INTEGER NOT NULL DEFAULT 0,
				expires_at TEXT NOT NULL,
				created_at TEXT NOT NULL DEFAULT (datetime('now'))
			)`,

			// Indexes
			`CREATE INDEX idx_tasks_status ON tasks(status)`,
			`CREATE INDEX idx_tasks_type ON tasks(type)`,
			`CREATE INDEX idx_tasks_priority ON tasks(priority)`,
			`CREATE INDEX idx_tasks_created_at ON tasks(created_at)`,
			`CREATE UNIQUE INDEX idx_tasks_origin_remote ON tasks(origin, remote_id)`,
			`CREATE INDEX idx_attachments_task_id ON attachments(task_id)`,
			`CREATE INDEX idx_admin_notes_task_id ON admin_notes(task_id)`,
			`CREATE INDEX idx_ai_logs_task_id ON ai_logs(task_id)`,
			`CREATE INDEX idx_activity_task_id ON activity(task_id)`,
			`CREATE INDEX idx_sessions_expires_at ON sessions(expires_at)`,
			`CREATE INDEX idx_magic_links_token ON magic_links(token)`,
		],
	},
];

/**
 * Run pending migrations against the database.
 * Safe to call on every startup — only runs migrations newer than the current version.
 */
export async function runMigrations(client: Client): Promise<void> {
	// Ensure meta table exists
	await client.execute(
		`CREATE TABLE IF NOT EXISTS _beacon_meta (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		)`,
	);

	// Get current schema version
	const result = await client.execute(
		`SELECT value FROM _beacon_meta WHERE key = 'schema_version'`,
	);

	const currentVersion = result.rows.length > 0
		? parseInt(result.rows[0]?.value as string, 10)
		: 0;

	// Find pending migrations
	const pending = migrations.filter((m) => m.version > currentVersion);

	if (pending.length === 0) return;

	// Run each migration
	for (const migration of pending) {
		try {
			await client.migrate([
				...migration.statements.map((sql) => ({ sql, args: [] })),
				{
					sql: `INSERT OR REPLACE INTO _beacon_meta (key, value) VALUES ('schema_version', ?)`,
					args: [String(migration.version)],
				},
			]);
		} catch (err) {
			throw new Error(
				`Migration v${migration.version} (${migration.description}) failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}
}
