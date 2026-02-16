import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Client } from '@libsql/client';
import { createTestDB } from '../../../../test/helpers.js';
import { createTaskData } from '../../../../test/mocks/factories.js';
import { createTask, getTask, listTasks } from './tasks.js';
import { createAttachment } from './attachments.js';

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
});
