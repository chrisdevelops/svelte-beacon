import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Client } from '@libsql/client';
import { createTestDB } from '../../../../test/helpers.js';
import { createTaskData } from '../../../../test/mocks/factories.js';
import { createTask, getTask, listTasks, updateTask, deleteTask, updateTaskAIFields, bulkUpdateStatus, bulkDeleteTasks } from './tasks.js';
import { createAttachment } from './attachments.js';
import { createActivity } from './activity.js';
import { VALID_TRANSITIONS } from '../../constants.js';

describe('task queries', () => {
	let db: Client;

	beforeEach(async () => {
		db = await createTestDB();
	});

	afterEach(() => {
		db.close();
	});

	describe('createTask', () => {
		it('assigns auto-incrementing public_id', async () => {
			const task1 = await createTask(db, createTaskData());
			const task2 = await createTask(db, createTaskData());

			expect(task1.public_id).toBe(1);
			expect(task2.public_id).toBe(2);
		});

		it('defaults status to new', async () => {
			const task = await createTask(db, createTaskData());

			expect(task.status).toBe('new');
		});

		it('stores and returns parsed metadata', async () => {
			const metadata = { browser: 'Safari', viewport: { w: 1024, h: 768 } };
			const task = await createTask(db, createTaskData({
				metadata: JSON.stringify(metadata),
			}));

			expect(task.metadata).toEqual(metadata);
		});

		it('handles null optional fields', async () => {
			const task = await createTask(db, {
				type: 'bug',
				priority: 'high',
				description: 'Minimal task',
			});

			expect(task.route).toBeNull();
			expect(task.metadata).toBeNull();
			expect(task.user_email).toBeNull();
			expect(task.element_selector).toBeNull();
		});

		it('sets origin to local by default', async () => {
			const task = await createTask(db, createTaskData());

			expect(task.origin).toBe('local');
		});

		it('accepts custom origin', async () => {
			const task = await createTask(db, createTaskData({
				origin: 'https://staging.example.com',
				remote_id: 'abc-123',
			}));

			expect(task.origin).toBe('https://staging.example.com');
			expect(task.remote_id).toBe('abc-123');
		});
	});

	describe('getTask', () => {
		it('returns null for nonexistent id', async () => {
			const result = await getTask(db, 'nonexistent-id');

			expect(result).toBeNull();
		});

		it('returns full task with parsed metadata', async () => {
			const metadata = { key: 'value', nested: { a: 1 } };
			const created = await createTask(db, createTaskData({
				metadata: JSON.stringify(metadata),
			}));

			const fetched = await getTask(db, created.id);

			expect(fetched).not.toBeNull();
			expect(fetched!.id).toBe(created.id);
			expect(fetched!.public_id).toBe(created.public_id);
			expect(fetched!.type).toBe(created.type);
			expect(fetched!.priority).toBe(created.priority);
			expect(fetched!.status).toBe('new');
			expect(fetched!.metadata).toEqual(metadata);
			expect(fetched!.created_at).toBeDefined();
			expect(fetched!.updated_at).toBeDefined();
		});
	});

	describe('updateTask', () => {
		it('updates a single field', async () => {
			const task = await createTask(db, createTaskData({ priority: 'low' }));

			const updated = await updateTask(db, task.id, { priority: 'high' });

			expect(updated).not.toBeNull();
			expect(updated!.priority).toBe('high');
			expect(updated!.type).toBe(task.type); // unchanged
		});

		it('updates multiple fields', async () => {
			const task = await createTask(db, createTaskData({
				type: 'bug',
				priority: 'low',
				description: 'Original',
			}));

			const updated = await updateTask(db, task.id, {
				type: 'feature',
				priority: 'critical',
				description: 'Updated',
			});

			expect(updated).not.toBeNull();
			expect(updated!.type).toBe('feature');
			expect(updated!.priority).toBe('critical');
			expect(updated!.description).toBe('Updated');
		});

		it('updates status', async () => {
			const task = await createTask(db, createTaskData());

			const updated = await updateTask(db, task.id, { status: 'backlog' });

			expect(updated).not.toBeNull();
			expect(updated!.status).toBe('backlog');
		});

		it('returns null for nonexistent task', async () => {
			const result = await updateTask(db, 'nonexistent', { priority: 'high' });

			expect(result).toBeNull();
		});

		it('updates updated_at timestamp', async () => {
			const task = await createTask(db, createTaskData());

			// Set created_at/updated_at to the past so the update is distinguishable
			await db.execute({
				sql: "UPDATE tasks SET updated_at = '2020-01-01 00:00:00' WHERE id = ?",
				args: [task.id],
			});

			const updated = await updateTask(db, task.id, { priority: 'high' });

			expect(updated).not.toBeNull();
			expect(updated!.updated_at).not.toBe('2020-01-01 00:00:00');
		});
	});

	describe('deleteTask', () => {
		it('deletes an existing task', async () => {
			const task = await createTask(db, createTaskData());

			const { deleted } = await deleteTask(db, task.id);

			expect(deleted).toBe(true);

			const fetched = await getTask(db, task.id);
			expect(fetched).toBeNull();
		});

		it('returns false for nonexistent task', async () => {
			const { deleted } = await deleteTask(db, 'nonexistent');

			expect(deleted).toBe(false);
		});

		it('cascades to attachments', async () => {
			const task = await createTask(db, createTaskData());
			await createAttachment(db, {
				task_id: task.id,
				type: 'screenshot',
				filename: 'test.png',
				path: 'screenshots/test.png',
				mime_type: 'image/png',
				size_bytes: 1024,
			});

			await deleteTask(db, task.id);

			const result = await db.execute({
				sql: 'SELECT COUNT(*) as count FROM attachments WHERE task_id = ?',
				args: [task.id],
			});
			expect(Number(result.rows[0]!['count'])).toBe(0);
		});

		it('cascades to activity', async () => {
			const task = await createTask(db, createTaskData());
			await createActivity(db, {
				task_id: task.id,
				actor: 'user',
				action: 'status_change',
				old_value: 'new',
				new_value: 'backlog',
			});

			await deleteTask(db, task.id);

			const result = await db.execute({
				sql: 'SELECT COUNT(*) as count FROM activity WHERE task_id = ?',
				args: [task.id],
			});
			expect(Number(result.rows[0]!['count'])).toBe(0);
		});
	});

	describe('listTasks', () => {
		it('returns empty paginated result when no tasks', async () => {
			const result = await listTasks(db);

			expect(result.items).toHaveLength(0);
			expect(result.pagination.total).toBe(0);
			expect(result.pagination.page).toBe(1);
			expect(result.pagination.totalPages).toBe(0);
		});

		it('returns tasks after creation', async () => {
			await createTask(db, createTaskData());
			await createTask(db, createTaskData());

			const result = await listTasks(db);

			expect(result.items).toHaveLength(2);
			expect(result.pagination.total).toBe(2);
		});

		it('filters by status', async () => {
			const task = await createTask(db, createTaskData());
			await createTask(db, createTaskData());

			// Manually update one task's status to 'backlog'
			await db.execute({
				sql: "UPDATE tasks SET status = 'backlog' WHERE id = ?",
				args: [task.id],
			});

			const result = await listTasks(db, { status: 'backlog' });

			expect(result.items).toHaveLength(1);
			expect(result.items[0]!.id).toBe(task.id);
		});

		it('filters by type', async () => {
			await createTask(db, createTaskData({ type: 'bug' }));
			await createTask(db, createTaskData({ type: 'feature' }));
			await createTask(db, createTaskData({ type: 'feature' }));

			const result = await listTasks(db, { type: 'feature' });

			expect(result.items).toHaveLength(2);
			for (const item of result.items) {
				expect(item.type).toBe('feature');
			}
		});

		it('filters by priority', async () => {
			await createTask(db, createTaskData({ priority: 'low' }));
			await createTask(db, createTaskData({ priority: 'high' }));
			await createTask(db, createTaskData({ priority: 'high' }));

			const result = await listTasks(db, { priority: 'high' });

			expect(result.items).toHaveLength(2);
			for (const item of result.items) {
				expect(item.priority).toBe('high');
			}
		});

		it('searches description with LIKE', async () => {
			await createTask(db, createTaskData({ description: 'Login button broken' }));
			await createTask(db, createTaskData({ description: 'Header misaligned' }));
			await createTask(db, createTaskData({ description: 'Another button issue' }));

			const result = await listTasks(db, { search: 'button' });

			expect(result.items).toHaveLength(2);
		});

		it('sorts by public_id ascending', async () => {
			await createTask(db, createTaskData({ description: 'First' }));
			await createTask(db, createTaskData({ description: 'Second' }));
			await createTask(db, createTaskData({ description: 'Third' }));

			const result = await listTasks(db, { sort: 'public_id', order: 'asc' });

			expect(result.items[0]!.description).toBe('First');
			expect(result.items[1]!.description).toBe('Second');
			expect(result.items[2]!.description).toBe('Third');
		});

		it('paginates correctly', async () => {
			for (let i = 0; i < 5; i++) {
				await createTask(db, createTaskData());
			}

			const result = await listTasks(db, { page: 1, limit: 2 });

			expect(result.items).toHaveLength(2);
			expect(result.pagination.total).toBe(5);
			expect(result.pagination.totalPages).toBe(3);
			expect(result.pagination.page).toBe(1);
			expect(result.pagination.limit).toBe(2);
		});

		it('clamps limit to max 100', async () => {
			const result = await listTasks(db, { limit: 200 });

			expect(result.pagination.limit).toBe(100);
		});

		it('defaults to created_at desc sort', async () => {
			const task1 = await createTask(db, createTaskData({ description: 'First created' }));
			// Small delay to ensure different timestamps
			await new Promise((r) => setTimeout(r, 50));
			const task2 = await createTask(db, createTaskData({ description: 'Second created' }));

			const result = await listTasks(db);

			// desc order: most recent first
			expect(result.items[0]!.id).toBe(task2.id);
			expect(result.items[1]!.id).toBe(task1.id);
		});

		it('includes attachment_count', async () => {
			const task = await createTask(db, createTaskData());

			// Insert attachment rows directly via the attachment query function
			await createAttachment(db, {
				task_id: task.id,
				type: 'screenshot',
				filename: 'test1.png',
				path: 'screenshots/test1.png',
				mime_type: 'image/png',
				size_bytes: 1024,
			});
			await createAttachment(db, {
				task_id: task.id,
				type: 'screenshot',
				filename: 'test2.png',
				path: 'screenshots/test2.png',
				mime_type: 'image/png',
				size_bytes: 2048,
			});

			const result = await listTasks(db);

			expect(result.items).toHaveLength(1);
			expect(result.items[0]!.attachment_count).toBe(2);
		});
	});

	describe('updateTaskAIFields', () => {
		it('updates ai_branch field', async () => {
			const task = await createTask(db, createTaskData());

			const updated = await updateTaskAIFields(db, task.id, {
				ai_branch: 'beacon/bug-1-fix-login',
			});

			expect(updated).not.toBeNull();
			expect(updated!.ai_branch).toBe('beacon/bug-1-fix-login');
			expect(updated!.ai_pr_url).toBeNull();
			expect(updated!.ai_blocked_reason).toBeNull();
		});

		it('updates multiple AI fields at once', async () => {
			const task = await createTask(db, createTaskData());

			const updated = await updateTaskAIFields(db, task.id, {
				ai_branch: 'beacon/feature-2-add-auth',
				ai_pr_url: 'https://github.com/org/repo/pull/42',
			});

			expect(updated).not.toBeNull();
			expect(updated!.ai_branch).toBe('beacon/feature-2-add-auth');
			expect(updated!.ai_pr_url).toBe('https://github.com/org/repo/pull/42');
		});

		it('clears AI fields by setting to null', async () => {
			const task = await createTask(db, createTaskData());
			await updateTaskAIFields(db, task.id, {
				ai_branch: 'beacon/bug-1-fix',
				ai_blocked_reason: 'Need more info',
			});

			const updated = await updateTaskAIFields(db, task.id, {
				ai_blocked_reason: null,
			});

			expect(updated).not.toBeNull();
			expect(updated!.ai_branch).toBe('beacon/bug-1-fix');
			expect(updated!.ai_blocked_reason).toBeNull();
		});

		it('returns null for nonexistent task', async () => {
			const result = await updateTaskAIFields(db, 'nonexistent-id', {
				ai_branch: 'beacon/test',
			});
			expect(result).toBeNull();
		});
	});

	describe('bulkUpdateStatus', () => {
		it('updates multiple tasks with valid transitions', async () => {
			const task1 = await createTask(db, createTaskData());
			const task2 = await createTask(db, createTaskData());

			// new -> backlog is valid
			const result = await bulkUpdateStatus(db, [task1.id, task2.id], 'backlog', VALID_TRANSITIONS);

			expect(result.updated).toEqual([task1.id, task2.id]);
			expect(result.skipped).toEqual([]);

			const updated1 = await getTask(db, task1.id);
			const updated2 = await getTask(db, task2.id);
			expect(updated1!.status).toBe('backlog');
			expect(updated2!.status).toBe('backlog');
		});

		it('skips tasks with invalid transitions', async () => {
			const task = await createTask(db, createTaskData());

			// new -> done is NOT valid
			const result = await bulkUpdateStatus(db, [task.id], 'done', VALID_TRANSITIONS);

			expect(result.updated).toEqual([]);
			expect(result.skipped).toEqual([task.id]);

			const unchanged = await getTask(db, task.id);
			expect(unchanged!.status).toBe('new');
		});

		it('skips nonexistent task IDs', async () => {
			const result = await bulkUpdateStatus(db, ['nonexistent-1', 'nonexistent-2'], 'backlog', VALID_TRANSITIONS);

			expect(result.updated).toEqual([]);
			expect(result.skipped).toEqual(['nonexistent-1', 'nonexistent-2']);
		});

		it('handles mix of valid, invalid, and nonexistent', async () => {
			const validTask = await createTask(db, createTaskData());
			const invalidTask = await createTask(db, createTaskData());

			// Put invalidTask into 'backlog' state first so new->backlog won't apply to it
			await updateTask(db, invalidTask.id, { status: 'backlog' });

			// Attempt backlog for all: validTask (new->backlog OK), invalidTask (backlog->backlog NOT in transitions), nonexistent
			const result = await bulkUpdateStatus(
				db,
				[validTask.id, invalidTask.id, 'nonexistent'],
				'backlog',
				VALID_TRANSITIONS,
			);

			expect(result.updated).toEqual([validTask.id]);
			expect(result.skipped).toContain(invalidTask.id);
			expect(result.skipped).toContain('nonexistent');
		});

		it('updates updated_at timestamp', async () => {
			const task = await createTask(db, createTaskData());

			// Set updated_at to the past
			await db.execute({
				sql: "UPDATE tasks SET updated_at = '2020-01-01 00:00:00' WHERE id = ?",
				args: [task.id],
			});

			await bulkUpdateStatus(db, [task.id], 'backlog', VALID_TRANSITIONS);

			const updated = await getTask(db, task.id);
			expect(updated!.updated_at).not.toBe('2020-01-01 00:00:00');
		});
	});

	describe('bulkDeleteTasks', () => {
		it('deletes multiple existing tasks', async () => {
			const task1 = await createTask(db, createTaskData());
			const task2 = await createTask(db, createTaskData());

			const result = await bulkDeleteTasks(db, [task1.id, task2.id]);

			expect(result.deleted).toBe(2);

			const fetched1 = await getTask(db, task1.id);
			const fetched2 = await getTask(db, task2.id);
			expect(fetched1).toBeNull();
			expect(fetched2).toBeNull();
		});

		it('returns deleted: 0 for empty ids array', async () => {
			const result = await bulkDeleteTasks(db, []);

			expect(result.deleted).toBe(0);
		});

		it('returns deleted: 0 for nonexistent IDs', async () => {
			const result = await bulkDeleteTasks(db, ['nonexistent-1', 'nonexistent-2']);

			expect(result.deleted).toBe(0);
		});

		it('handles mix of existing and nonexistent', async () => {
			const task = await createTask(db, createTaskData());

			const result = await bulkDeleteTasks(db, [task.id, 'nonexistent']);

			expect(result.deleted).toBe(1);

			const fetched = await getTask(db, task.id);
			expect(fetched).toBeNull();
		});

		it('cascades to related data', async () => {
			const task = await createTask(db, createTaskData());
			await createAttachment(db, {
				task_id: task.id,
				type: 'screenshot',
				filename: 'test.png',
				path: 'screenshots/test.png',
				mime_type: 'image/png',
				size_bytes: 1024,
			});
			await createActivity(db, {
				task_id: task.id,
				actor: 'user',
				action: 'status_change',
				old_value: 'new',
				new_value: 'backlog',
			});

			await bulkDeleteTasks(db, [task.id]);

			const attachments = await db.execute({
				sql: 'SELECT COUNT(*) as count FROM attachments WHERE task_id = ?',
				args: [task.id],
			});
			expect(Number(attachments.rows[0]!['count'])).toBe(0);

			const activities = await db.execute({
				sql: 'SELECT COUNT(*) as count FROM activity WHERE task_id = ?',
				args: [task.id],
			});
			expect(Number(activities.rows[0]!['count'])).toBe(0);
		});
	});
});
