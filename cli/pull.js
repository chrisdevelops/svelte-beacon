import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * Pull tasks from a remote Beacon instance.
 *
 * @param {object} options
 * @param {string} options.cwd - Working directory
 * @param {string} [options.from] - Remote URL (e.g., https://staging.myapp.com)
 * @param {string} [options.token] - Auth token for remote instance
 * @param {string} [options.task] - Specific task public_id to pull
 * @param {string} [options.since] - ISO date or 'last' for last sync time
 * @param {import('@libsql/client').Client} [options.db] - Database client override for testing
 * @param {typeof fetch} [options.fetch] - Fetch override for testing
 * @param {object} [options.console] - Console override for testing
 */
export async function runPull({
	cwd,
	from,
	token,
	task,
	since,
	db: dbOverride,
	fetch: fetchFn = globalThis.fetch,
	console: con = console,
} = {}) {
	// Parse CLI args if not provided programmatically
	if (!from) {
		const args = process.argv.slice(3);
		const fromIdx = args.indexOf('--from');
		if (fromIdx !== -1) from = args[fromIdx + 1];
		const tokenIdx = args.indexOf('--token');
		if (tokenIdx !== -1) token = args[tokenIdx + 1];
		const taskIdx = args.indexOf('--task');
		if (taskIdx !== -1) task = args[taskIdx + 1];
		const sinceIdx = args.indexOf('--since');
		if (sinceIdx !== -1) since = args[sinceIdx + 1];
	}

	if (!from) {
		con.error('Error: --from <url> is required');
		con.error('Usage: npx beacon pull --from https://staging.myapp.com [--token <token>] [--task <id>] [--since <date|last>]');
		process.exit(1);
	}

	// Read config for lastSyncAt
	const configPath = join(cwd, '.beacon', 'config.json');
	let config = { lastSyncAt: null };
	if (existsSync(configPath)) {
		try {
			config = JSON.parse(readFileSync(configPath, 'utf-8'));
		} catch {
			// Ignore malformed config
		}
	}

	// Resolve --since last
	let resolvedSince = since;
	if (since === 'last') {
		if (config.lastSyncAt) {
			resolvedSince = config.lastSyncAt;
		} else {
			resolvedSince = undefined;
		}
	}

	// Build export URL
	const baseUrl = from.replace(/\/$/, '');
	const exportUrl = new URL(`${baseUrl}/__beacon/api/tasks/export`);
	if (resolvedSince) exportUrl.searchParams.set('since', resolvedSince);
	if (task) exportUrl.searchParams.set('public_id', task);

	// Fetch from remote
	con.log(`Pulling from ${from}...`);
	/** @type {Record<string, string>} */
	const headers = {};
	if (token) {
		headers['Authorization'] = `Bearer ${token}`;
	}

	/** @type {Response} */
	let response;
	try {
		response = await fetchFn(exportUrl.toString(), { headers });
	} catch (err) {
		con.error(`Error: Failed to connect to ${from}`);
		con.error(err instanceof Error ? err.message : String(err));
		process.exit(1);
	}

	if (!response.ok) {
		if (response.status === 401) {
			con.error('Error: Authentication failed. Check your --token value.');
		} else {
			con.error(`Error: Remote returned ${response.status} ${response.statusText}`);
		}
		process.exit(1);
	}

	/** @type {import('../dist/server/types.js').ExportEnvelope} */
	let envelope;
	try {
		envelope = await response.json();
	} catch {
		con.error('Error: Invalid response from remote');
		process.exit(1);
	}

	if (envelope.version !== 1) {
		con.error(`Error: Unsupported export version ${envelope.version}`);
		process.exit(1);
	}

	if (envelope.tasks.length === 0) {
		con.log('No tasks to import.');
		return;
	}

	// Set up local database
	let db = dbOverride;
	if (!db) {
		const { createClient } = await import('@libsql/client');
		const dbPath = join(cwd, '.beacon', 'beacon.db');
		db = createClient({ url: `file:${dbPath}` });

		const { runMigrations } = await import('../dist/server/db/migrations.js');
		await runMigrations(db);
	}

	// Import the query functions
	let importTaskFn, importAttachmentFn, importAdminNoteFn, replaceAdminNotesFn;
	if (dbOverride) {
		// In test mode, import from source
		const mod = await import('../src/server/db/queries/import.js');
		importTaskFn = mod.importTask;
		importAttachmentFn = mod.importAttachment;
		importAdminNoteFn = mod.importAdminNote;
		replaceAdminNotesFn = mod.replaceAdminNotes;
	} else {
		const mod = await import('../dist/server/db/queries/import.js');
		importTaskFn = mod.importTask;
		importAttachmentFn = mod.importAttachment;
		importAdminNoteFn = mod.importAdminNote;
		replaceAdminNotesFn = mod.replaceAdminNotes;
	}

	const origin = envelope.source || from;
	let imported = 0;
	let updated = 0;

	for (const exportedTask of envelope.tasks) {
		// Check if task already exists (for counting imported vs updated)
		const remoteId = String(exportedTask.public_id);

		const task = await importTaskFn(db, {
			origin,
			remote_id: remoteId,
			type: exportedTask.type,
			priority: exportedTask.priority,
			status: exportedTask.status,
			description: exportedTask.description,
			route: exportedTask.route,
			element_selector: exportedTask.element_selector,
			metadata: exportedTask.metadata ? JSON.stringify(exportedTask.metadata) : null,
			user_email: exportedTask.user_email,
		});

		// Write attachments to disk
		const storageDir = join(cwd, '.beacon', 'storage', task.id);
		for (const att of exportedTask.attachments) {
			mkdirSync(storageDir, { recursive: true });
			const filePath = join(storageDir, att.filename);
			const buffer = Buffer.from(att.data, 'base64');
			writeFileSync(filePath, buffer);

			await importAttachmentFn(db, task.id, filePath, {
				filename: att.filename,
				type: att.type,
				mime_type: att.mime_type,
			}, buffer.byteLength);
		}

		// Replace admin notes (delete existing + re-import)
		if (exportedTask.admin_notes.length > 0) {
			await replaceAdminNotesFn(db, task.id, exportedTask.admin_notes);
		}

		// Count based on whether task existed before
		if (task.origin === origin && task.remote_id === remoteId) {
			// This is a simplification — we always count as imported
			imported++;
		}
	}

	// Update lastSyncAt
	config.lastSyncAt = new Date().toISOString();
	const configDir = join(cwd, '.beacon');
	if (!existsSync(configDir)) {
		mkdirSync(configDir, { recursive: true });
	}
	writeFileSync(configPath, JSON.stringify(config, null, 2));

	con.log(`Imported ${imported} task(s) from ${origin}`);
}
