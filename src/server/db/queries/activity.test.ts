import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Client } from '@libsql/client';
import { createTestDB } from '../../../../test/helpers.js';
import { createTaskData } from '../../../../test/mocks/factories.js';
import { createTask } from './tasks.js';
import { createActivity, getActivityByTaskId } from './activity.js';

describe('activity queries', () => {
	let db: Client;

	beforeEach(async () => {
		db = await createTestDB();
	});

	afterEach(() => {
		db.close();
	});

	describe('createActivity', () => {
		it('creates activity with all fields', async () => {
			const task = await createTask(db, createTaskData());

			const activity = await createActivity(db, {
				task_id: task.id,
				actor: 'user',
				action: 'status_change',
				old_value: 'new',
				new_value: 'backlog',
			});

			expect(activity.id).toBeDefined();
			expect(activity.task_id).toBe(task.id);
			expect(activity.actor).toBe('user');
			expect(activity.action).toBe('status_change');
			expect(activity.old_value).toBe('new');
			expect(activity.new_value).toBe('backlog');
			expect(activity.created_at).toBeDefined();
		});

		it('creates activity with null optional fields', async () => {
			const task = await createTask(db, createTaskData());

			const activity = await createActivity(db, {
				task_id: task.id,
				actor: 'system',
				action: 'created',
			});

			expect(activity.old_value).toBeNull();
			expect(activity.new_value).toBeNull();
		});
	});

	describe('getActivityByTaskId', () => {
		it('returns empty array when no activity exists', async () => {
			const task = await createTask(db, createTaskData());

			const result = await getActivityByTaskId(db, task.id);

			expect(result).toEqual([]);
		});

		it('returns activities ordered by created_at ascending', async () => {
			const task = await createTask(db, createTaskData());

			await createActivity(db, {
				task_id: task.id,
				actor: 'user',
				action: 'status_change',
				old_value: 'new',
				new_value: 'backlog',
			});

			// Small delay to ensure different timestamps
			await new Promise((r) => setTimeout(r, 50));

			await createActivity(db, {
				task_id: task.id,
				actor: 'user',
				action: 'status_change',
				old_value: 'backlog',
				new_value: 'ai_working',
			});

			const result = await getActivityByTaskId(db, task.id);

			expect(result).toHaveLength(2);
			expect(result[0]!.old_value).toBe('new');
			expect(result[1]!.old_value).toBe('backlog');
		});

		it('only returns activity for the given task', async () => {
			const task1 = await createTask(db, createTaskData());
			const task2 = await createTask(db, createTaskData());

			await createActivity(db, {
				task_id: task1.id,
				actor: 'user',
				action: 'status_change',
				old_value: 'new',
				new_value: 'backlog',
			});

			await createActivity(db, {
				task_id: task2.id,
				actor: 'user',
				action: 'status_change',
				old_value: 'new',
				new_value: 'closed',
			});

			const result = await getActivityByTaskId(db, task1.id);

			expect(result).toHaveLength(1);
			expect(result[0]!.task_id).toBe(task1.id);
		});
	});
});
