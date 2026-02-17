import type { Client, Row } from '@libsql/client';
import { query, queryOne, execute } from '../helpers.js';
import type { Activity, CreateActivityInput } from '../../types.js';

/**
 * Map a raw database Row to a typed Activity object.
 */
function mapActivity(row: Row): Activity {
	return {
		id: row['id'] as string,
		task_id: row['task_id'] as string,
		actor: row['actor'] as string,
		action: row['action'] as string,
		old_value: (row['old_value'] as string | null) ?? null,
		new_value: (row['new_value'] as string | null) ?? null,
		created_at: row['created_at'] as string,
	};
}

/**
 * Create a new activity record.
 */
export async function createActivity(client: Client, data: CreateActivityInput): Promise<Activity> {
	const id = crypto.randomUUID();

	await execute(
		client,
		`INSERT INTO activity (id, task_id, actor, action, old_value, new_value)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		[
			id,
			data.task_id,
			data.actor,
			data.action,
			data.old_value ?? null,
			data.new_value ?? null,
		],
	);

	const row = await queryOne(client, 'SELECT * FROM activity WHERE id = ?', [id]);
	if (!row) {
		throw new Error('Activity creation failed: could not re-fetch created activity');
	}
	return mapActivity(row);
}

/**
 * Get all activity entries for a task, ordered by created_at ascending.
 */
export async function getActivityByTaskId(client: Client, taskId: string): Promise<Activity[]> {
	const rows = await query(
		client,
		'SELECT * FROM activity WHERE task_id = ? ORDER BY created_at ASC',
		[taskId],
	);
	return rows.map(mapActivity);
}
