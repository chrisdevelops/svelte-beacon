import type { Client } from '@libsql/client';
import { queryOne, execute } from '../helpers.js';
import type { Task, ImportTaskInput } from '../../types.js';
import type { TaskType, Priority, TaskStatus } from '../../constants.js';
import { safeParseJSON } from '../helpers.js';
import { createAdminNote, deleteAdminNotesByTaskId } from './admin-notes.js';

/**
 * Map a raw database Row to a typed Task object.
 */
function mapTask(row: Record<string, unknown>): Task {
	return {
		id: row['id'] as string,
		public_id: Number(row['public_id']),
		type: row['type'] as TaskType,
		priority: row['priority'] as Priority,
		status: row['status'] as TaskStatus,
		description: row['description'] as string,
		route: (row['route'] as string | null) ?? null,
		element_selector: (row['element_selector'] as string | null) ?? null,
		metadata: safeParseJSON(row['metadata']) as Record<string, unknown> | null,
		origin: row['origin'] as string,
		remote_id: (row['remote_id'] as string | null) ?? null,
		ai_branch: (row['ai_branch'] as string | null) ?? null,
		ai_pr_url: (row['ai_pr_url'] as string | null) ?? null,
		ai_blocked_reason: (row['ai_blocked_reason'] as string | null) ?? null,
		user_email: (row['user_email'] as string | null) ?? null,
		created_at: row['created_at'] as string,
		updated_at: row['updated_at'] as string,
	};
}

/**
 * Import (upsert) a task based on origin + remote_id.
 * If a task with the same origin+remote_id exists, update it.
 * If not, create a new task (local public_id auto-assigned).
 */
export async function importTask(client: Client, data: ImportTaskInput): Promise<Task> {
	// Check for existing task by origin + remote_id
	const existing = await queryOne(
		client,
		'SELECT * FROM tasks WHERE origin = ? AND remote_id = ?',
		[data.origin, data.remote_id],
	);

	if (existing) {
		// Update existing task
		const id = existing['id'] as string;
		await execute(
			client,
			`UPDATE tasks SET type = ?, priority = ?, status = ?, description = ?,
			 route = ?, element_selector = ?, metadata = ?, user_email = ?,
			 updated_at = datetime('now')
			 WHERE id = ?`,
			[
				data.type,
				data.priority,
				data.status,
				data.description,
				data.route ?? null,
				data.element_selector ?? null,
				data.metadata ?? null,
				data.user_email ?? null,
				id,
			],
		);

		const updated = await queryOne(client, 'SELECT * FROM tasks WHERE id = ?', [id]);
		if (!updated) {
			throw new Error('Import task update failed: could not re-fetch updated task');
		}
		return mapTask(updated);
	}

	// Create new task
	const id = crypto.randomUUID();
	await execute(
		client,
		`INSERT INTO tasks (id, public_id, type, priority, status, description,
		 route, element_selector, metadata, user_email, origin, remote_id)
		 VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			id,
			data.type,
			data.priority,
			data.status,
			data.description,
			data.route ?? null,
			data.element_selector ?? null,
			data.metadata ?? null,
			data.user_email ?? null,
			data.origin,
			data.remote_id,
		],
	);

	const created = await queryOne(client, 'SELECT * FROM tasks WHERE id = ?', [id]);
	if (!created) {
		throw new Error('Import task creation failed: could not re-fetch created task');
	}
	return mapTask(created);
}

/**
 * Create an attachment record for an imported task.
 * The caller is responsible for writing the file to disk.
 */
export async function importAttachment(
	client: Client,
	taskId: string,
	filePath: string,
	input: { filename: string; type: string; mime_type: string },
	sizeBytes: number,
): Promise<void> {
	const id = crypto.randomUUID();
	await execute(
		client,
		`INSERT INTO attachments (id, task_id, type, filename, path, mime_type, size_bytes)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		[id, taskId, input.type, input.filename, filePath, input.mime_type, sizeBytes],
	);
}

/**
 * Import an admin note for a task.
 */
export async function importAdminNote(
	client: Client,
	taskId: string,
	input: { content: string; author_email?: string | null },
): Promise<void> {
	await createAdminNote(client, {
		task_id: taskId,
		content: input.content,
		author_email: input.author_email ?? null,
	});
}

/**
 * Replace all admin notes for a task with new ones.
 * Used during re-import to avoid diffing.
 */
export async function replaceAdminNotes(
	client: Client,
	taskId: string,
	notes: Array<{ content: string; author_email?: string | null }>,
): Promise<void> {
	await deleteAdminNotesByTaskId(client, taskId);
	for (const note of notes) {
		await importAdminNote(client, taskId, note);
	}
}
