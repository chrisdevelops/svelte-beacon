import type { Client } from '@libsql/client';
import type { ResolvedConfig } from '../config.js';
import { route, json } from '../router.js';
import { listTasks, getTask, updateTask, deleteTask } from '../db/queries/tasks.js';
import { getAttachmentsByTaskId } from '../db/queries/attachments.js';
import { getActivityByTaskId, createActivity } from '../db/queries/activity.js';
import { getAdminNotesByTaskId } from '../db/queries/admin-notes.js';
import { TASK_TYPES, PRIORITY_LEVELS, TASK_STATUSES, VALID_TRANSITIONS } from '../constants.js';
import type { ListTasksParams, UpdateTaskInput } from '../types.js';
import {
	optionalEnum,
	optionalString,
	collectErrors,
	validateStatusTransition,
} from './validate.js';

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
		const activity = await getActivityByTaskId(db, id);
		const adminNotes = await getAdminNotesByTaskId(db, id);

		return json({
			...task,
			attachments: attachments.map((a) => ({
				...a,
				url: `/__beacon/api/attachments/${a.id}`,
			})),
			admin_notes: adminNotes,
			activity,
		});
	} catch (err) {
		console.error('[beacon] Failed to get task:', err);
		return json({ error: 'Failed to get task' }, { status: 500 });
	}
}

export async function handleUpdateTask(
	event: RequestEvent,
	db: Client,
	_config: ResolvedConfig,
	params: Record<string, string>,
): Promise<Response> {
	const { id } = params;
	if (!id) {
		return json({ error: 'Task ID is required' }, { status: 400 });
	}

	let body: Record<string, unknown>;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const validated = collectErrors({
		status: optionalEnum(body.status, 'status', TASK_STATUSES),
		type: optionalEnum(body.type, 'type', TASK_TYPES),
		priority: optionalEnum(body.priority, 'priority', PRIORITY_LEVELS),
		description: optionalString(body.description, 'description', { maxLength: 10000 }),
	});

	if (!validated.valid) {
		return json({ error: 'Validation failed', details: validated.errors }, { status: 400 });
	}

	const { values } = validated;

	// Check that at least one field was provided
	const updates: UpdateTaskInput = {};
	let hasUpdate = false;

	if (values.status !== null) {
		updates.status = values.status;
		hasUpdate = true;
	}
	if (values.type !== null) {
		updates.type = values.type;
		hasUpdate = true;
	}
	if (values.priority !== null) {
		updates.priority = values.priority;
		hasUpdate = true;
	}
	if (values.description !== null) {
		updates.description = values.description;
		hasUpdate = true;
	}

	if (!hasUpdate) {
		return json({ error: 'No fields to update' }, { status: 400 });
	}

	try {
		// Fetch existing task for transition validation
		const existing = await getTask(db, id);
		if (!existing) {
			return json({ error: 'Task not found' }, { status: 404 });
		}

		// Validate status transition if status is changing
		if (updates.status !== undefined) {
			const transition = validateStatusTransition(
				existing.status,
				updates.status,
				VALID_TRANSITIONS,
			);
			if (!transition.valid) {
				return json({ error: transition.error }, { status: 409 });
			}
		}

		const updated = await updateTask(db, id, updates);
		if (!updated) {
			return json({ error: 'Task not found' }, { status: 404 });
		}

		// Log activity for status changes
		if (updates.status !== undefined) {
			await createActivity(db, {
				task_id: id,
				actor: 'user',
				action: 'status_change',
				old_value: existing.status,
				new_value: updates.status,
			});
		}

		const attachments = await getAttachmentsByTaskId(db, id);
		const activity = await getActivityByTaskId(db, id);
		const adminNotes = await getAdminNotesByTaskId(db, id);

		return json({
			...updated,
			attachments: attachments.map((a) => ({
				...a,
				url: `/__beacon/api/attachments/${a.id}`,
			})),
			admin_notes: adminNotes,
			activity,
		});
	} catch (err) {
		console.error('[beacon] Failed to update task:', err);
		return json({ error: 'Failed to update task' }, { status: 500 });
	}
}

export async function handleDeleteTask(
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
		const { deleted } = await deleteTask(db, id);
		if (!deleted) {
			return json({ error: 'Task not found' }, { status: 404 });
		}

		return new Response(null, { status: 204 });
	} catch (err) {
		console.error('[beacon] Failed to delete task:', err);
		return json({ error: 'Failed to delete task' }, { status: 500 });
	}
}

// NOTE: When adding GET /tasks/export in Phase 8, register it BEFORE
// GET /tasks/:id so the literal path matches before the :id parameter.
route('GET', '/tasks', handleListTasks, { requireAuth: true });
route('PATCH', '/tasks/:id', handleUpdateTask, { requireAuth: true });
route('DELETE', '/tasks/:id', handleDeleteTask, { requireAuth: true });
route('GET', '/tasks/:id', handleGetTask, { requireAuth: true });
