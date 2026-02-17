import type { Client } from '@libsql/client';
import type { ResolvedConfig } from '../config.js';
import { route, json } from '../router.js';
import { exportTask, exportTasks } from '../db/queries/export.js';
import type { ExportEnvelope, ExportTasksParams } from '../types.js';

type RequestEvent = Parameters<import('@sveltejs/kit').Handle>[0]['event'];

export async function handleExportTasks(
	event: RequestEvent,
	db: Client,
	config: ResolvedConfig,
): Promise<Response> {
	const sp = event.url.searchParams;

	const params: ExportTasksParams = {};

	const status = sp.get('status');
	if (status) params.status = status;

	const since = sp.get('since');
	if (since) params.since = since;

	const publicId = sp.get('public_id');
	if (publicId) {
		const parsed = parseInt(publicId, 10);
		if (isNaN(parsed)) {
			return json({ error: 'public_id must be a number' }, { status: 400 });
		}
		params.public_id = parsed;
	}

	try {
		const tasks = await exportTasks(db, params);

		const envelope: ExportEnvelope = {
			version: 1,
			exported_at: new Date().toISOString(),
			source: event.url.origin,
			tasks,
		};

		return json(envelope);
	} catch (err) {
		console.error('[beacon] Failed to export tasks:', err);
		return json({ error: 'Failed to export tasks' }, { status: 500 });
	}
}

export async function handleExportTask(
	event: RequestEvent,
	db: Client,
	config: ResolvedConfig,
	params: Record<string, string>,
): Promise<Response> {
	const { id } = params;
	if (!id) {
		return json({ error: 'Task ID is required' }, { status: 400 });
	}

	try {
		const task = await exportTask(db, id);
		if (!task) {
			return json({ error: 'Task not found' }, { status: 404 });
		}

		const envelope: ExportEnvelope = {
			version: 1,
			exported_at: new Date().toISOString(),
			source: event.url.origin,
			tasks: [task],
		};

		return json(envelope);
	} catch (err) {
		console.error('[beacon] Failed to export task:', err);
		return json({ error: 'Failed to export task' }, { status: 500 });
	}
}

// Register export routes BEFORE tasks.ts so /tasks/export matches before /tasks/:id
route('GET', '/tasks/export', handleExportTasks, { requireAuth: true });
route('GET', '/tasks/:id/export', handleExportTask, { requireAuth: true });
