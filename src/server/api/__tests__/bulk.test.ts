import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Client } from '@libsql/client';
import { createTestDB } from '../../../../test/helpers.js';
import { createBeaconAPIEvent } from '../../../../test/mocks/request-event.js';
import { defaultConfig, createTaskData } from '../../../../test/mocks/factories.js';
import { handleBulkUpdate, handleBulkDelete } from '../bulk.js';
import { createTask, getTask, updateTask } from '../../db/queries/tasks.js';
import { getActivityByTaskId } from '../../db/queries/activity.js';

let db: Client;

beforeEach(async () => {
	db = await createTestDB();
});

afterEach(() => {
	db.close();
});

describe('POST /tasks/bulk-update', () => {
	it('returns 400 for invalid JSON', async () => {
		const event = createBeaconAPIEvent('POST', '/tasks/bulk-update', {
			headers: { 'content-type': 'text/plain' },
		});
		// Override the request with non-JSON body
		Object.defineProperty(event, 'request', {
			value: new Request('http://localhost/__beacon/api/tasks/bulk-update', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: 'not-json',
			}),
		});

		const response = await handleBulkUpdate(event, db, defaultConfig, {});
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Invalid JSON body');
	});

	it('returns 400 when ids is not an array', async () => {
		const event = createBeaconAPIEvent('POST', '/tasks/bulk-update', {
			body: { ids: 'not-an-array', status: 'backlog' },
		});

		const response = await handleBulkUpdate(event, db, defaultConfig, {});
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('ids must be an array');
	});

	it('returns 400 when ids is empty', async () => {
		const event = createBeaconAPIEvent('POST', '/tasks/bulk-update', {
			body: { ids: [], status: 'backlog' },
		});

		const response = await handleBulkUpdate(event, db, defaultConfig, {});
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('ids must not be empty');
	});

	it('returns 400 when ids has more than 100 items', async () => {
		const ids = Array.from({ length: 101 }, (_, i) => `id-${i}`);
		const event = createBeaconAPIEvent('POST', '/tasks/bulk-update', {
			body: { ids, status: 'backlog' },
		});

		const response = await handleBulkUpdate(event, db, defaultConfig, {});
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('ids must not exceed 100 items');
	});

	it('returns 400 for invalid status', async () => {
		const event = createBeaconAPIEvent('POST', '/tasks/bulk-update', {
			body: { ids: ['some-id'], status: 'invalid-status' },
		});

		const response = await handleBulkUpdate(event, db, defaultConfig, {});
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toContain('status must be one of');
	});

	it('updates tasks with valid transitions', async () => {
		const task1 = await createTask(db, createTaskData({ description: 'Task 1' }));
		const task2 = await createTask(db, createTaskData({ description: 'Task 2' }));

		// new -> backlog is a valid transition
		const event = createBeaconAPIEvent('POST', '/tasks/bulk-update', {
			body: { ids: [task1.id, task2.id], status: 'backlog' },
		});

		const response = await handleBulkUpdate(event, db, defaultConfig, {});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.updated).toBe(2);
		expect(body.skipped).toBe(0);

		// Verify tasks were actually updated
		const updated1 = await getTask(db, task1.id);
		const updated2 = await getTask(db, task2.id);
		expect(updated1!.status).toBe('backlog');
		expect(updated2!.status).toBe('backlog');
	});

	it('skips tasks with invalid transitions', async () => {
		const task1 = await createTask(db, createTaskData({ description: 'Task 1' }));
		const task2 = await createTask(db, createTaskData({ description: 'Task 2' }));

		// new -> done is NOT a valid transition
		const event = createBeaconAPIEvent('POST', '/tasks/bulk-update', {
			body: { ids: [task1.id, task2.id], status: 'done' },
		});

		const response = await handleBulkUpdate(event, db, defaultConfig, {});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.updated).toBe(0);
		expect(body.skipped).toBe(2);

		// Verify tasks were NOT updated
		const unchanged1 = await getTask(db, task1.id);
		const unchanged2 = await getTask(db, task2.id);
		expect(unchanged1!.status).toBe('new');
		expect(unchanged2!.status).toBe('new');
	});

	it('skips nonexistent task IDs gracefully', async () => {
		const task = await createTask(db, createTaskData({ description: 'Real task' }));

		const event = createBeaconAPIEvent('POST', '/tasks/bulk-update', {
			body: { ids: [task.id, 'nonexistent-id'], status: 'backlog' },
		});

		const response = await handleBulkUpdate(event, db, defaultConfig, {});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.updated).toBe(1);
		expect(body.skipped).toBe(1);
	});

	it('creates activity records for each updated task', async () => {
		const task1 = await createTask(db, createTaskData({ description: 'Task 1' }));
		const task2 = await createTask(db, createTaskData({ description: 'Task 2' }));

		// new -> backlog is a valid transition
		const event = createBeaconAPIEvent('POST', '/tasks/bulk-update', {
			body: { ids: [task1.id, task2.id], status: 'backlog' },
		});

		await handleBulkUpdate(event, db, defaultConfig, {});

		const activity1 = await getActivityByTaskId(db, task1.id);
		const activity2 = await getActivityByTaskId(db, task2.id);

		expect(activity1).toHaveLength(1);
		expect(activity1[0]!.action).toBe('status_change');
		expect(activity1[0]!.new_value).toBe('backlog');
		expect(activity1[0]!.actor).toBe('user');

		expect(activity2).toHaveLength(1);
		expect(activity2[0]!.action).toBe('status_change');
		expect(activity2[0]!.new_value).toBe('backlog');
	});
});

describe('POST /tasks/bulk-delete', () => {
	it('returns 400 for invalid JSON', async () => {
		const event = createBeaconAPIEvent('POST', '/tasks/bulk-delete', {
			headers: { 'content-type': 'text/plain' },
		});
		Object.defineProperty(event, 'request', {
			value: new Request('http://localhost/__beacon/api/tasks/bulk-delete', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: 'not-json',
			}),
		});

		const response = await handleBulkDelete(event, db, defaultConfig, {});
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Invalid JSON body');
	});

	it('returns 400 when ids is not an array', async () => {
		const event = createBeaconAPIEvent('POST', '/tasks/bulk-delete', {
			body: { ids: 'not-an-array' },
		});

		const response = await handleBulkDelete(event, db, defaultConfig, {});
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('ids must be an array');
	});

	it('deletes existing tasks', async () => {
		const task1 = await createTask(db, createTaskData({ description: 'Delete 1' }));
		const task2 = await createTask(db, createTaskData({ description: 'Delete 2' }));

		const event = createBeaconAPIEvent('POST', '/tasks/bulk-delete', {
			body: { ids: [task1.id, task2.id] },
		});

		const response = await handleBulkDelete(event, db, defaultConfig, {});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.deleted).toBe(2);

		// Verify tasks were actually deleted
		const fetched1 = await getTask(db, task1.id);
		const fetched2 = await getTask(db, task2.id);
		expect(fetched1).toBeNull();
		expect(fetched2).toBeNull();
	});

	it('returns deleted: 0 for nonexistent IDs', async () => {
		const event = createBeaconAPIEvent('POST', '/tasks/bulk-delete', {
			body: { ids: ['nonexistent-1', 'nonexistent-2'] },
		});

		const response = await handleBulkDelete(event, db, defaultConfig, {});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.deleted).toBe(0);
	});

	it('handles mix of existing and nonexistent IDs', async () => {
		const task = await createTask(db, createTaskData({ description: 'Real task' }));

		const event = createBeaconAPIEvent('POST', '/tasks/bulk-delete', {
			body: { ids: [task.id, 'nonexistent-id'] },
		});

		const response = await handleBulkDelete(event, db, defaultConfig, {});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.deleted).toBe(1);

		const fetched = await getTask(db, task.id);
		expect(fetched).toBeNull();
	});
});
