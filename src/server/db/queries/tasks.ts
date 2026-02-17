import type { Client, InValue, Row } from '@libsql/client';
import { query, queryOne, execute, safeParseJSON } from '../helpers.js';
import type { Task, TaskListItem, CreateTaskInput, UpdateTaskInput, UpdateTaskAIInput, ListTasksParams, PaginatedTasks } from '../../types.js';
import type { TaskType, Priority, TaskStatus } from '../../constants.js';

/**
 * Map a raw database Row to a typed Task object.
 */
function mapTask(row: Row): Task {
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
 * Map a raw database Row to a TaskListItem (omits metadata and element_selector, adds attachment_count).
 */
function mapTaskListItem(row: Row): TaskListItem {
	const task = mapTask(row);
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { metadata, element_selector, ...rest } = task;
	return {
		...rest,
		attachment_count: Number(row['attachment_count']),
	};
}

/**
 * Create a new task. The public_id is auto-assigned by a database trigger.
 */
export async function createTask(client: Client, data: CreateTaskInput): Promise<Task> {
	const id = crypto.randomUUID();

	await execute(
		client,
		`INSERT INTO tasks (id, public_id, type, priority, status, description, route, element_selector, metadata, user_email, origin, remote_id)
		 VALUES (?, 0, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?)`,
		[
			id,
			data.type,
			data.priority,
			data.description,
			data.route ?? null,
			data.element_selector ?? null,
			data.metadata ?? null,
			data.user_email ?? null,
			data.origin ?? 'local',
			data.remote_id ?? null,
		],
	);

	// Re-fetch to get the trigger-assigned public_id
	const task = await getTask(client, id);
	if (!task) {
		throw new Error('Task creation failed: could not re-fetch created task');
	}
	return task;
}

/**
 * Get a single task by its UUID.
 */
export async function getTask(client: Client, id: string): Promise<Task | null> {
	const row = await queryOne(client, 'SELECT * FROM tasks WHERE id = ?', [id]);
	return row ? mapTask(row) : null;
}

/**
 * Update a task by its UUID. Only provided fields are updated.
 * Returns the updated Task, or null if not found.
 */
export async function updateTask(client: Client, id: string, data: UpdateTaskInput): Promise<Task | null> {
	const setClauses: string[] = [];
	const args: InValue[] = [];

	if (data.status !== undefined) {
		setClauses.push('status = ?');
		args.push(data.status);
	}
	if (data.type !== undefined) {
		setClauses.push('type = ?');
		args.push(data.type);
	}
	if (data.priority !== undefined) {
		setClauses.push('priority = ?');
		args.push(data.priority);
	}
	if (data.description !== undefined) {
		setClauses.push('description = ?');
		args.push(data.description);
	}

	if (setClauses.length === 0) {
		return getTask(client, id);
	}

	setClauses.push("updated_at = datetime('now')");
	args.push(id);

	const { rowsAffected } = await execute(
		client,
		`UPDATE tasks SET ${setClauses.join(', ')} WHERE id = ?`,
		args,
	);

	if (rowsAffected === 0) {
		return null;
	}

	return getTask(client, id);
}

/**
 * Delete a task by its UUID.
 * Returns whether the task was found and deleted.
 */
export async function deleteTask(client: Client, id: string): Promise<{ deleted: boolean }> {
	const { rowsAffected } = await execute(
		client,
		'DELETE FROM tasks WHERE id = ?',
		[id],
	);
	return { deleted: rowsAffected > 0 };
}

/**
 * List tasks with filtering, sorting, and pagination.
 */
export async function listTasks(client: Client, params: ListTasksParams = {}): Promise<PaginatedTasks> {
	const page = Math.max(1, params.page ?? 1);
	const limit = Math.min(100, Math.max(1, params.limit ?? 50));
	const offset = (page - 1) * limit;

	// Whitelist sort columns to prevent SQL injection
	const ALLOWED_SORTS = ['created_at', 'updated_at', 'priority', 'public_id'] as const;
	const sort = ALLOWED_SORTS.includes(params.sort as typeof ALLOWED_SORTS[number])
		? params.sort!
		: 'created_at';
	const order = params.order === 'asc' ? 'ASC' : 'DESC';

	// Build WHERE clause dynamically from filters
	const conditions: string[] = [];
	const args: (string | number)[] = [];

	if (params.status) {
		conditions.push('t.status = ?');
		args.push(params.status);
	}
	if (params.type) {
		conditions.push('t.type = ?');
		args.push(params.type);
	}
	if (params.priority) {
		conditions.push('t.priority = ?');
		args.push(params.priority);
	}
	if (params.search) {
		conditions.push('t.description LIKE ?');
		args.push(`%${params.search}%`);
	}

	const whereClause = conditions.length > 0
		? 'WHERE ' + conditions.join(' AND ')
		: '';

	// Count total matching rows
	const countRow = await queryOne(
		client,
		`SELECT COUNT(*) as count FROM tasks t ${whereClause}`,
		args,
	);
	const total = Number(countRow?.['count'] ?? 0);

	// Fetch the page of results with attachment_count subquery
	const rows = await query(
		client,
		`SELECT t.*, (SELECT COUNT(*) FROM attachments WHERE task_id = t.id) as attachment_count
		 FROM tasks t
		 ${whereClause}
		 ORDER BY t.${sort} ${order}
		 LIMIT ? OFFSET ?`,
		[...args, limit, offset],
	);

	return {
		items: rows.map(mapTaskListItem),
		pagination: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit) || 0,
		},
	};
}

/**
 * Update AI-specific fields on a task.
 * Keeps AI state changes separate from user-driven updateTask.
 * Returns the updated Task, or null if not found.
 */
/**
 * Bulk update the status of multiple tasks.
 * Each task is individually validated against the transition map.
 * Tasks that don't exist or have invalid transitions are skipped.
 */
export async function bulkUpdateStatus(
	client: Client,
	ids: string[],
	newStatus: TaskStatus,
	validTransitions: Record<TaskStatus, readonly TaskStatus[]>,
): Promise<{ updated: string[]; skipped: string[] }> {
	const updated: string[] = [];
	const skipped: string[] = [];

	for (const id of ids) {
		const task = await getTask(client, id);
		if (!task) {
			skipped.push(id);
			continue;
		}

		const allowed = validTransitions[task.status];
		if (!allowed || !allowed.includes(newStatus)) {
			skipped.push(id);
			continue;
		}

		await execute(
			client,
			"UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?",
			[newStatus, id],
		);
		updated.push(id);
	}

	return { updated, skipped };
}

/**
 * Bulk delete multiple tasks by their UUIDs.
 * Uses a single DELETE with IN clause for efficiency.
 */
export async function bulkDeleteTasks(
	client: Client,
	ids: string[],
): Promise<{ deleted: number }> {
	if (ids.length === 0) {
		return { deleted: 0 };
	}

	const placeholders = ids.map(() => '?').join(', ');
	const { rowsAffected } = await execute(
		client,
		`DELETE FROM tasks WHERE id IN (${placeholders})`,
		ids,
	);
	return { deleted: rowsAffected };
}

/**
 * Update AI-specific fields on a task.
 * Keeps AI state changes separate from user-driven updateTask.
 * Returns the updated Task, or null if not found.
 */
export async function updateTaskAIFields(
	client: Client,
	id: string,
	data: UpdateTaskAIInput,
): Promise<Task | null> {
	const setClauses: string[] = [];
	const args: InValue[] = [];

	if (data.ai_branch !== undefined) {
		setClauses.push('ai_branch = ?');
		args.push(data.ai_branch);
	}
	if (data.ai_pr_url !== undefined) {
		setClauses.push('ai_pr_url = ?');
		args.push(data.ai_pr_url);
	}
	if (data.ai_blocked_reason !== undefined) {
		setClauses.push('ai_blocked_reason = ?');
		args.push(data.ai_blocked_reason);
	}

	if (setClauses.length === 0) {
		return getTask(client, id);
	}

	setClauses.push("updated_at = datetime('now')");
	args.push(id);

	const { rowsAffected } = await execute(
		client,
		`UPDATE tasks SET ${setClauses.join(', ')} WHERE id = ?`,
		args,
	);

	if (rowsAffected === 0) {
		return null;
	}

	return getTask(client, id);
}
