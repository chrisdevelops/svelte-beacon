import type { Client } from '@libsql/client';
import type { ResolvedConfig } from '../config.js';
import { route, json } from '../router.js';
import { bulkUpdateStatus, bulkDeleteTasks } from '../db/queries/tasks.js';
import { createActivity } from '../db/queries/activity.js';
import { TASK_STATUSES, VALID_TRANSITIONS } from '../constants.js';
import { requiredEnum } from './validate.js';

type RequestEvent = Parameters<import('@sveltejs/kit').Handle>[0]['event'];

/**
 * Validate that ids is a non-empty array of strings with at most 100 items.
 * Returns null if valid, or an error message string if invalid.
 */
function validateIds(ids: unknown): string | null {
	if (!Array.isArray(ids)) {
		return 'ids must be an array';
	}
	if (ids.length === 0) {
		return 'ids must not be empty';
	}
	if (ids.length > 100) {
		return 'ids must not exceed 100 items';
	}
	for (const id of ids) {
		if (typeof id !== 'string') {
			return 'all ids must be strings';
		}
	}
	return null;
}

export async function handleBulkUpdate(
	event: RequestEvent,
	db: Client,
	_config: ResolvedConfig,
	_params: Record<string, string>,
): Promise<Response> {
	let body: Record<string, unknown>;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const idsError = validateIds(body.ids);
	if (idsError) {
		return json({ error: idsError }, { status: 400 });
	}
	const ids = body.ids as string[];

	const statusResult = requiredEnum(body.status, 'status', TASK_STATUSES);
	if (!statusResult.valid) {
		return json({ error: statusResult.error }, { status: 400 });
	}
	const status = statusResult.value;

	try {
		const result = await bulkUpdateStatus(db, ids, status, VALID_TRANSITIONS);

		// Log activity for each updated task
		for (const id of result.updated) {
			await createActivity(db, {
				task_id: id,
				actor: 'user',
				action: 'status_change',
				old_value: null,
				new_value: status,
			});
		}

		return json({ updated: result.updated.length, skipped: result.skipped.length });
	} catch (err) {
		console.error('[beacon] Failed to bulk update tasks:', err);
		return json({ error: 'Failed to bulk update tasks' }, { status: 500 });
	}
}

export async function handleBulkDelete(
	event: RequestEvent,
	db: Client,
	_config: ResolvedConfig,
	_params: Record<string, string>,
): Promise<Response> {
	let body: Record<string, unknown>;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const idsError = validateIds(body.ids);
	if (idsError) {
		return json({ error: idsError }, { status: 400 });
	}
	const ids = body.ids as string[];

	try {
		const result = await bulkDeleteTasks(db, ids);
		return json({ deleted: result.deleted });
	} catch (err) {
		console.error('[beacon] Failed to bulk delete tasks:', err);
		return json({ error: 'Failed to bulk delete tasks' }, { status: 500 });
	}
}

// Register bulk routes BEFORE tasks.ts so /tasks/bulk-update matches before /tasks/:id
route('POST', '/tasks/bulk-update', handleBulkUpdate, { requireAuth: true });
route('POST', '/tasks/bulk-delete', handleBulkDelete, { requireAuth: true });
