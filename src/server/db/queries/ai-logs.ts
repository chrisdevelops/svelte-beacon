import type { Client, InValue, Row } from '@libsql/client';
import { query, queryOne, execute } from '../helpers.js';
import { safeParseJSON } from '../helpers.js';
import type { AILog, CreateAILogInput } from '../../types.js';

/**
 * Map a raw database Row to a typed AILog object.
 */
function mapAILog(row: Row): AILog {
	return {
		id: row['id'] as string,
		task_id: (row['task_id'] as string | null) ?? null,
		level: row['level'] as string,
		message: row['message'] as string,
		metadata: safeParseJSON(row['metadata']) as Record<string, unknown> | null,
		created_at: row['created_at'] as string,
	};
}

/**
 * Create a new AI log record.
 */
export async function createAILog(client: Client, data: CreateAILogInput): Promise<AILog> {
	const id = crypto.randomUUID();

	await execute(
		client,
		`INSERT INTO ai_logs (id, task_id, level, message, metadata)
		 VALUES (?, ?, ?, ?, ?)`,
		[
			id,
			data.task_id ?? null,
			data.level,
			data.message,
			data.metadata ? JSON.stringify(data.metadata) : null,
		],
	);

	const row = await queryOne(client, 'SELECT * FROM ai_logs WHERE id = ?', [id]);
	if (!row) {
		throw new Error('AI log creation failed: could not re-fetch created log');
	}
	return mapAILog(row);
}

export interface GetAILogsOptions {
	since?: string;
	limit?: number;
}

/**
 * Get AI logs for a specific task, ordered by created_at ascending.
 * Supports optional `since` timestamp filter and result `limit`.
 */
export async function getAILogsByTaskId(
	client: Client,
	taskId: string,
	opts?: GetAILogsOptions,
): Promise<AILog[]> {
	const conditions = ['task_id = ?'];
	const args: InValue[] = [taskId];

	if (opts?.since) {
		conditions.push('created_at > ?');
		args.push(opts.since);
	}

	let sql = `SELECT * FROM ai_logs WHERE ${conditions.join(' AND ')} ORDER BY created_at ASC`;

	if (opts?.limit !== undefined) {
		sql += ' LIMIT ?';
		args.push(opts.limit);
	}

	const rows = await query(client, sql, args);
	return rows.map(mapAILog);
}
