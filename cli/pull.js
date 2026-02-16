/**
 * Pull tasks from a remote Beacon instance.
 *
 * @param {object} options
 * @param {string} options.cwd - Working directory
 * @param {string} [options.from] - Remote URL (e.g., https://staging.myapp.com)
 * @param {string} [options.token] - Auth token for remote instance
 * @param {string} [options.task] - Specific task public_id to pull
 * @param {typeof fetch} [options.fetch] - Fetch override for testing
 * @param {object} [options.console] - Console override for testing
 */
export async function runPull({
	cwd,
	from,
	token,
	task,
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
	}

	if (!from) {
		con.error('Error: --from <url> is required');
		con.error('Usage: npx beacon pull --from https://staging.myapp.com [--token <token>] [--task <id>]');
		process.exit(1);
	}

	// TODO: Implement pull logic
	// 1. Fetch tasks from remote /__beacon/api/tasks/export
	// 2. Decode base64 attachments
	// 3. Write to local .beacon/storage/
	// 4. Upsert into local database
	// 5. Update .beacon/config.json lastSyncAt

	con.log(`Pulling from ${from}...`);
	con.log('Pull command not yet implemented.');
}
