import type { Client, InValue } from '@libsql/client';
import { readFile } from 'fs/promises';
import { query, queryOne } from '../helpers.js';
import type { ExportedTask, ExportedAttachment, ExportTasksParams } from '../../types.js';
import { safeParseJSON } from '../helpers.js';
import { getAdminNotesByTaskId } from './admin-notes.js';
import { getAttachmentsByTaskId } from './attachments.js';

/**
 * Read a file from disk and return its contents as a base64 string.
 * Returns null if the file cannot be read.
 */
async function readFileAsBase64(path: string): Promise<string | null> {
	try {
		const buffer = await readFile(path);
		return buffer.toString('base64');
	} catch {
		return null;
	}
}

/**
 * Export a single task with its admin notes and attachments (base64-encoded).
 * Returns null if the task doesn't exist.
 */
export async function exportTask(client: Client, id: string): Promise<ExportedTask | null> {
	const row = await queryOne(client, 'SELECT * FROM tasks WHERE id = ?', [id]);
	if (!row) return null;

	const notes = await getAdminNotesByTaskId(client, id);
	const attachments = await getAttachmentsByTaskId(client, id);

	const exportedAttachments: ExportedAttachment[] = [];
	for (const att of attachments) {
		const data = await readFileAsBase64(att.path);
		if (data !== null) {
			exportedAttachments.push({
				filename: att.filename,
				type: att.type,
				mime_type: att.mime_type,
				data,
			});
		}
	}

	return {
		public_id: Number(row['public_id']),
		type: row['type'] as string,
		priority: row['priority'] as string,
		status: row['status'] as string,
		description: row['description'] as string,
		route: (row['route'] as string | null) ?? null,
		element_selector: (row['element_selector'] as string | null) ?? null,
		metadata: safeParseJSON(row['metadata']) as Record<string, unknown> | null,
		user_email: (row['user_email'] as string | null) ?? null,
		created_at: row['created_at'] as string,
		updated_at: row['updated_at'] as string,
		admin_notes: notes.map((n) => ({
			content: n.content,
			author_email: n.author_email,
		})),
		attachments: exportedAttachments,
	};
}

/**
 * Export multiple tasks with optional filters.
 */
export async function exportTasks(client: Client, params: ExportTasksParams = {}): Promise<ExportedTask[]> {
	const conditions: string[] = [];
	const args: InValue[] = [];

	if (params.status) {
		conditions.push('status = ?');
		args.push(params.status);
	}
	if (params.since) {
		conditions.push('updated_at >= ?');
		args.push(params.since);
	}
	if (params.public_id !== undefined) {
		conditions.push('public_id = ?');
		args.push(params.public_id);
	}

	const whereClause = conditions.length > 0
		? 'WHERE ' + conditions.join(' AND ')
		: '';

	const rows = await query(
		client,
		`SELECT id FROM tasks ${whereClause} ORDER BY created_at ASC`,
		args,
	);

	const tasks: ExportedTask[] = [];
	for (const row of rows) {
		const exported = await exportTask(client, row['id'] as string);
		if (exported) {
			tasks.push(exported);
		}
	}

	return tasks;
}
