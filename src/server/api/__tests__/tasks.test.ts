import { describe, it, expect, beforeEach } from 'vitest';
import type { Client } from '@libsql/client';
import { createTestDB } from '../../../../test/helpers.js';
import { createBeaconAPIEvent } from '../../../../test/mocks/request-event.js';
import { defaultConfig, createTaskData } from '../../../../test/mocks/factories.js';
import { handleListTasks, handleGetTask, handleUpdateTask, handleDeleteTask } from '../tasks.js';
import { createTask } from '../../db/queries/tasks.js';
import { createAttachment } from '../../db/queries/attachments.js';

let db: Client;

beforeEach(async () => {
	db = await createTestDB();
});

describe('GET /tasks', () => {
	it('returns empty paginated list when no tasks exist', async () => {
		const event = createBeaconAPIEvent('GET', '/tasks');

		const response = await handleListTasks(event, db);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.items).toEqual([]);
		expect(body.pagination).toEqual({
			page: 1,
			limit: 50,
			total: 0,
			totalPages: 0,
		});
	});

	it('returns tasks after creation', async () => {
		await createTask(db, createTaskData({ description: 'First task' }));
		await createTask(db, createTaskData({ description: 'Second task' }));

		const event = createBeaconAPIEvent('GET', '/tasks');
		const response = await handleListTasks(event, db);
		const body = await response.json();

		expect(body.items).toHaveLength(2);
		expect(body.pagination.total).toBe(2);
	});

	it('filters by status', async () => {
		await createTask(db, createTaskData({ description: 'New task' }));

		const event = createBeaconAPIEvent('GET', '/tasks', {
			query: { status: 'backlog' },
		});
		const response = await handleListTasks(event, db);
		const body = await response.json();

		expect(body.items).toHaveLength(0);
		expect(body.pagination.total).toBe(0);
	});

	it('filters by type', async () => {
		await createTask(db, createTaskData({ type: 'bug', description: 'A bug' }));
		await createTask(db, createTaskData({ type: 'feature', description: 'A feature' }));

		const event = createBeaconAPIEvent('GET', '/tasks', {
			query: { type: 'bug' },
		});
		const response = await handleListTasks(event, db);
		const body = await response.json();

		expect(body.items).toHaveLength(1);
		expect(body.items[0].type).toBe('bug');
	});

	it('paginates correctly', async () => {
		for (let i = 0; i < 5; i++) {
			await createTask(db, createTaskData({ description: `Task ${i}` }));
		}

		const event = createBeaconAPIEvent('GET', '/tasks', {
			query: { page: '1', limit: '2' },
		});
		const response = await handleListTasks(event, db);
		const body = await response.json();

		expect(body.items).toHaveLength(2);
		expect(body.pagination).toEqual({
			page: 1,
			limit: 2,
			total: 5,
			totalPages: 3,
		});
	});

	it('searches description text', async () => {
		await createTask(db, createTaskData({ description: 'Login button broken' }));
		await createTask(db, createTaskData({ description: 'Dashboard loads slowly' }));

		const event = createBeaconAPIEvent('GET', '/tasks', {
			query: { search: 'button' },
		});
		const response = await handleListTasks(event, db);
		const body = await response.json();

		expect(body.items).toHaveLength(1);
		expect(body.items[0].description).toContain('button');
	});

	it('sorts by public_id ascending', async () => {
		const t1 = await createTask(db, createTaskData({ description: 'First' }));
		const t2 = await createTask(db, createTaskData({ description: 'Second' }));

		const event = createBeaconAPIEvent('GET', '/tasks', {
			query: { sort: 'public_id', order: 'asc' },
		});
		const response = await handleListTasks(event, db);
		const body = await response.json();

		expect(body.items[0].public_id).toBe(t1.public_id);
		expect(body.items[1].public_id).toBe(t2.public_id);
	});
});

describe('GET /tasks/:id', () => {
	it('returns 404 for nonexistent task', async () => {
		const event = createBeaconAPIEvent('GET', '/tasks/nonexistent');

		const response = await handleGetTask(event, db, defaultConfig, { id: 'nonexistent' });
		const body = await response.json();

		expect(response.status).toBe(404);
		expect(body.error).toBe('Task not found');
	});

	it('returns full task detail', async () => {
		const task = await createTask(db, createTaskData({
			description: 'Detail test',
			route: '/page',
		}));

		const event = createBeaconAPIEvent('GET', `/tasks/${task.id}`);
		const response = await handleGetTask(event, db, defaultConfig, { id: task.id });
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.id).toBe(task.id);
		expect(body.description).toBe('Detail test');
		expect(body.route).toBe('/page');
		expect(body.attachments).toEqual([]);
		expect(body.admin_notes).toEqual([]);
		expect(body.activity).toEqual([]);
	});

	it('returns parsed metadata', async () => {
		const task = await createTask(db, createTaskData({
			description: 'Metadata test',
			metadata: JSON.stringify({ browser: 'Chrome' }),
		}));

		const event = createBeaconAPIEvent('GET', `/tasks/${task.id}`);
		const response = await handleGetTask(event, db, defaultConfig, { id: task.id });
		const body = await response.json();

		expect(body.metadata).toEqual({ browser: 'Chrome' });
	});

	it('returns real activity data', async () => {
		const task = await createTask(db, createTaskData({ description: 'Activity test' }));

		// Create some activity via direct import
		const { createActivity } = await import('../../db/queries/activity.js');
		await createActivity(db, {
			task_id: task.id,
			actor: 'user',
			action: 'status_change',
			old_value: 'new',
			new_value: 'backlog',
		});

		const event = createBeaconAPIEvent('GET', `/tasks/${task.id}`);
		const response = await handleGetTask(event, db, defaultConfig, { id: task.id });
		const body = await response.json();

		expect(body.activity).toHaveLength(1);
		expect(body.activity[0].action).toBe('status_change');
		expect(body.activity[0].old_value).toBe('new');
		expect(body.activity[0].new_value).toBe('backlog');
	});

	it('includes attachments with URLs', async () => {
		const task = await createTask(db, createTaskData({ description: 'Attachment test' }));
		const attachment = await createAttachment(db, {
			task_id: task.id,
			type: 'screenshot',
			filename: 'screenshot.png',
			path: '/storage/screenshots/screenshot.png',
			mime_type: 'image/png',
			size_bytes: 12345,
		});

		const event = createBeaconAPIEvent('GET', `/tasks/${task.id}`);
		const response = await handleGetTask(event, db, defaultConfig, { id: task.id });
		const body = await response.json();

		expect(body.attachments).toHaveLength(1);
		expect(body.attachments[0].id).toBe(attachment.id);
		expect(body.attachments[0].url).toBe(`/__beacon/api/attachments/${attachment.id}`);
	});
});

describe('PATCH /tasks/:id', () => {
	it('returns 400 when id is missing', async () => {
		const event = createBeaconAPIEvent('PATCH', '/tasks/', {
			body: { status: 'backlog' },
		});

		const response = await handleUpdateTask(event, db, defaultConfig, {});
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Task ID is required');
	});

	it('returns 404 for nonexistent task', async () => {
		const event = createBeaconAPIEvent('PATCH', '/tasks/nonexistent', {
			body: { priority: 'high' },
		});

		const response = await handleUpdateTask(event, db, defaultConfig, { id: 'nonexistent' });
		const body = await response.json();

		expect(response.status).toBe(404);
		expect(body.error).toBe('Task not found');
	});

	it('returns 400 for empty body', async () => {
		const task = await createTask(db, createTaskData());
		const event = createBeaconAPIEvent('PATCH', `/tasks/${task.id}`, {
			body: {},
		});

		const response = await handleUpdateTask(event, db, defaultConfig, { id: task.id });
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('No fields to update');
	});

	it('updates priority field', async () => {
		const task = await createTask(db, createTaskData({ priority: 'low' }));
		const event = createBeaconAPIEvent('PATCH', `/tasks/${task.id}`, {
			body: { priority: 'critical' },
		});

		const response = await handleUpdateTask(event, db, defaultConfig, { id: task.id });
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.priority).toBe('critical');
	});

	it('updates type field', async () => {
		const task = await createTask(db, createTaskData({ type: 'bug' }));
		const event = createBeaconAPIEvent('PATCH', `/tasks/${task.id}`, {
			body: { type: 'feature' },
		});

		const response = await handleUpdateTask(event, db, defaultConfig, { id: task.id });
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.type).toBe('feature');
	});

	it('updates description field', async () => {
		const task = await createTask(db, createTaskData({ description: 'Original' }));
		const event = createBeaconAPIEvent('PATCH', `/tasks/${task.id}`, {
			body: { description: 'Updated description' },
		});

		const response = await handleUpdateTask(event, db, defaultConfig, { id: task.id });
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.description).toBe('Updated description');
	});

	it('performs valid status transition', async () => {
		const task = await createTask(db, createTaskData());
		// new -> backlog is a valid transition
		const event = createBeaconAPIEvent('PATCH', `/tasks/${task.id}`, {
			body: { status: 'backlog' },
		});

		const response = await handleUpdateTask(event, db, defaultConfig, { id: task.id });
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.status).toBe('backlog');
	});

	it('returns 409 for invalid status transition', async () => {
		const task = await createTask(db, createTaskData());
		// new -> done is NOT a valid transition
		const event = createBeaconAPIEvent('PATCH', `/tasks/${task.id}`, {
			body: { status: 'done' },
		});

		const response = await handleUpdateTask(event, db, defaultConfig, { id: task.id });
		const body = await response.json();

		expect(response.status).toBe(409);
		expect(body.error).toContain('Cannot transition');
	});

	it('creates activity record on status change', async () => {
		const task = await createTask(db, createTaskData());
		const event = createBeaconAPIEvent('PATCH', `/tasks/${task.id}`, {
			body: { status: 'backlog' },
		});

		await handleUpdateTask(event, db, defaultConfig, { id: task.id });

		// Verify activity was created
		const { getActivityByTaskId } = await import('../../db/queries/activity.js');
		const activities = await getActivityByTaskId(db, task.id);

		expect(activities).toHaveLength(1);
		expect(activities[0]!.action).toBe('status_change');
		expect(activities[0]!.old_value).toBe('new');
		expect(activities[0]!.new_value).toBe('backlog');
		expect(activities[0]!.actor).toBe('user');
	});

	it('does not create activity for non-status updates', async () => {
		const task = await createTask(db, createTaskData());
		const event = createBeaconAPIEvent('PATCH', `/tasks/${task.id}`, {
			body: { priority: 'high' },
		});

		await handleUpdateTask(event, db, defaultConfig, { id: task.id });

		const { getActivityByTaskId } = await import('../../db/queries/activity.js');
		const activities = await getActivityByTaskId(db, task.id);

		expect(activities).toHaveLength(0);
	});

	it('returns full TaskDetail shape with attachments, activity, and admin_notes', async () => {
		const task = await createTask(db, createTaskData());
		const attachment = await createAttachment(db, {
			task_id: task.id,
			type: 'screenshot',
			filename: 'shot.png',
			path: '/storage/shot.png',
			mime_type: 'image/png',
			size_bytes: 100,
		});

		// Status change to generate activity
		const event = createBeaconAPIEvent('PATCH', `/tasks/${task.id}`, {
			body: { status: 'backlog' },
		});

		const response = await handleUpdateTask(event, db, defaultConfig, { id: task.id });
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.status).toBe('backlog');
		expect(body.attachments).toHaveLength(1);
		expect(body.attachments[0].id).toBe(attachment.id);
		expect(body.attachments[0].url).toBe(`/__beacon/api/attachments/${attachment.id}`);
		expect(body.activity).toHaveLength(1);
		expect(body.activity[0].action).toBe('status_change');
		expect(body.admin_notes).toEqual([]);
	});

	it('returns 400 for invalid enum value', async () => {
		const task = await createTask(db, createTaskData());
		const event = createBeaconAPIEvent('PATCH', `/tasks/${task.id}`, {
			body: { priority: 'super-ultra-high' },
		});

		const response = await handleUpdateTask(event, db, defaultConfig, { id: task.id });

		expect(response.status).toBe(400);
	});
});

describe('DELETE /tasks/:id', () => {
	it('returns 400 when id is missing', async () => {
		const event = createBeaconAPIEvent('DELETE', '/tasks/');

		const response = await handleDeleteTask(event, db, defaultConfig, {});
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Task ID is required');
	});

	it('deletes an existing task', async () => {
		const task = await createTask(db, createTaskData());
		const event = createBeaconAPIEvent('DELETE', `/tasks/${task.id}`);

		const response = await handleDeleteTask(event, db, defaultConfig, { id: task.id });

		expect(response.status).toBe(204);
	});

	it('returns 404 for nonexistent task', async () => {
		const event = createBeaconAPIEvent('DELETE', '/tasks/nonexistent');

		const response = await handleDeleteTask(event, db, defaultConfig, { id: 'nonexistent' });
		const body = await response.json();

		expect(response.status).toBe(404);
		expect(body.error).toBe('Task not found');
	});
});
