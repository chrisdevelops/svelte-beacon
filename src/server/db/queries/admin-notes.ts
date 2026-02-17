import type { Client, Row } from '@libsql/client';
import { query, queryOne, execute } from '../helpers.js';
import type { AdminNote, CreateAdminNoteInput } from '../../types.js';

/**
 * Map a raw database Row to a typed AdminNote object.
 */
function mapAdminNote(row: Row): AdminNote {
	return {
		id: row['id'] as string,
		task_id: row['task_id'] as string,
		content: row['content'] as string,
		author_email: (row['author_email'] as string | null) ?? null,
		created_at: row['created_at'] as string,
	};
}

/**
 * Create a new admin note.
 */
export async function createAdminNote(client: Client, data: CreateAdminNoteInput): Promise<AdminNote> {
	const id = crypto.randomUUID();

	await execute(
		client,
		`INSERT INTO admin_notes (id, task_id, content, author_email)
		 VALUES (?, ?, ?, ?)`,
		[
			id,
			data.task_id,
			data.content,
			data.author_email ?? null,
		],
	);

	const row = await queryOne(client, 'SELECT * FROM admin_notes WHERE id = ?', [id]);
	if (!row) {
		throw new Error('Admin note creation failed: could not re-fetch created note');
	}
	return mapAdminNote(row);
}

/**
 * Get all admin notes for a task, ordered by created_at ascending.
 */
export async function getAdminNotesByTaskId(client: Client, taskId: string): Promise<AdminNote[]> {
	const rows = await query(
		client,
		'SELECT * FROM admin_notes WHERE task_id = ? ORDER BY created_at ASC',
		[taskId],
	);
	return rows.map(mapAdminNote);
}

/**
 * Delete all admin notes for a task.
 * Used during re-import to replace notes with fresh data.
 */
export async function deleteAdminNotesByTaskId(client: Client, taskId: string): Promise<void> {
	await execute(
		client,
		'DELETE FROM admin_notes WHERE task_id = ?',
		[taskId],
	);
}
