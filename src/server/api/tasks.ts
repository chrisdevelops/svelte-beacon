import type { Client } from '@libsql/client';
import type { ResolvedConfig } from '../config.js';
import { route, json } from '../router.js';
import { listTasks, getTask } from '../db/queries/tasks.js';
import { getAttachmentsByTaskId } from '../db/queries/attachments.js';
import type { ListTasksParams } from '../types.js';

type RequestEvent = Parameters<import('@sveltejs/kit').Handle>[0]['event'];

export async function handleListTasks(
	event: RequestEvent,
	db: Client,
): Promise<Response> {
	const sp = event.url.searchParams;

	const params: ListTasksParams = {
		status: sp.get('status') || undefined,
		type: sp.get('type') || undefined,
		priority: sp.get('priority') || undefined,
		search: sp.get('search') || undefined,
		sort: sp.get('sort') || undefined,
		order: sp.get('order') === 'asc' ? 'asc' : sp.get('order') === 'desc' ? 'desc' : undefined,
		page: sp.has('page') ? parseInt(sp.get('page')!, 10) : undefined,
		limit: sp.has('limit') ? parseInt(sp.get('limit')!, 10) : undefined,
	};

	try {
		const result = await listTasks(db, params);
		return json(result);
	} catch (err) {
		console.error('[beacon] Failed to list tasks:', err);
		return json({ error: 'Failed to list tasks' }, { status: 500 });
	}
}

export async function handleGetTask(
	_event: RequestEvent,
	db: Client,
	_config: ResolvedConfig,
	params: Record<string, string>,
): Promise<Response> {
	const { id } = params;
	if (!id) {
		return json({ error: 'Task ID is required' }, { status: 400 });
	}

	try {
		const task = await getTask(db, id);
		if (!task) {
			return json({ error: 'Task not found' }, { status: 404 });
		}

		const attachments = await getAttachmentsByTaskId(db, id);

		return json({
			...task,
			attachments: attachments.map((a) => ({
				...a,
				url: `/__beacon/api/attachments/${a.id}`,
			})),
			// Placeholders for Phase 3
			admin_notes: [],
			activity: [],
		});
	} catch (err) {
		console.error('[beacon] Failed to get task:', err);
		return json({ error: 'Failed to get task' }, { status: 500 });
	}
}

// NOTE: When adding GET /tasks/export in Phase 8, register it BEFORE
// GET /tasks/:id so the literal path matches before the :id parameter.
route('GET', '/tasks', handleListTasks);
route('GET', '/tasks/:id', handleGetTask);
