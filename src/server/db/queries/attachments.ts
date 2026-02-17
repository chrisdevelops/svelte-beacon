import type { Client, Row } from '@libsql/client';
import { query, queryOne, execute } from '../helpers.js';
import type { Attachment, CreateAttachmentInput } from '../../types.js';

/**
 * Map a raw database Row to a typed Attachment object.
 */
function mapAttachment(row: Row): Attachment {
	return {
		id: row['id'] as string,
		task_id: row['task_id'] as string,
		type: row['type'] as string,
		filename: row['filename'] as string,
		path: row['path'] as string,
		mime_type: row['mime_type'] as string,
		size_bytes: Number(row['size_bytes']),
		created_at: row['created_at'] as string,
	};
}

/**
 * Create a new attachment record.
 */
export async function createAttachment(client: Client, data: CreateAttachmentInput): Promise<Attachment> {
	const id = crypto.randomUUID();

	await execute(
		client,
		`INSERT INTO attachments (id, task_id, type, filename, path, mime_type, size_bytes)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		[
			id,
			data.task_id,
			data.type,
			data.filename,
			data.path,
			data.mime_type,
			data.size_bytes,
		],
	);

	// Re-fetch to get server-assigned defaults (created_at)
	const row = await queryOne(client, 'SELECT * FROM attachments WHERE id = ?', [id]);
	if (!row) {
		throw new Error('Attachment creation failed: could not re-fetch created attachment');
	}
	return mapAttachment(row);
}

/**
 * Get a single attachment by ID.
 */
export async function getAttachment(client: Client, id: string): Promise<Attachment | null> {
	const row = await queryOne(client, 'SELECT * FROM attachments WHERE id = ?', [id]);
	return row ? mapAttachment(row) : null;
}

/**
 * Get all attachments for a given task, ordered by creation time ascending.
 */
export async function getAttachmentsByTaskId(client: Client, taskId: string): Promise<Attachment[]> {
	const rows = await query(
		client,
		'SELECT * FROM attachments WHERE task_id = ? ORDER BY created_at ASC',
		[taskId],
	);
	return rows.map(mapAttachment);
}
