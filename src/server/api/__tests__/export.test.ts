import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Client } from '@libsql/client';
import { createTestDB } from '../../../../test/helpers.js';
import { createBeaconAPIEvent } from '../../../../test/mocks/request-event.js';
import { defaultConfig, createTaskData } from '../../../../test/mocks/factories.js';
import { createTask } from '../../db/queries/tasks.js';
import { createAdminNote } from '../../db/queries/admin-notes.js';
import { handleExportTasks, handleExportTask } from '../export.js';

let db: Client;

beforeEach(async () => {
	db = await createTestDB();
});

afterEach(() => {
	db.close();
});

describe('GET /tasks/export', () => {
	it('returns envelope with correct structure', async () => {
		await createTask(db, createTaskData({ description: 'Export test' }));

		const event = createBeaconAPIEvent('GET', '/tasks/export');
		const response = await handleExportTasks(event, db, defaultConfig);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.version).toBe(1);
		expect(body.exported_at).toBeDefined();
		expect(typeof body.exported_at).toBe('string');
		expect(body.source).toBe('http://localhost');
		expect(body.tasks).toHaveLength(1);
	});

	it('returns empty tasks array when no tasks exist', async () => {
		const event = createBeaconAPIEvent('GET', '/tasks/export');
		const response = await handleExportTasks(event, db, defaultConfig);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.version).toBe(1);
		expect(body.tasks).toEqual([]);
	});

	it('filters by status query param', async () => {
		await createTask(db, createTaskData({ description: 'New task' }));

		// Tasks are created with status 'new', so filtering by 'backlog' should return none
		const event = createBeaconAPIEvent('GET', '/tasks/export', {
			query: { status: 'backlog' },
		});
		const response = await handleExportTasks(event, db, defaultConfig);
		const body = await response.json();

		expect(body.tasks).toHaveLength(0);

		// Filtering by 'new' should return the task
		const event2 = createBeaconAPIEvent('GET', '/tasks/export', {
			query: { status: 'new' },
		});
		const response2 = await handleExportTasks(event2, db, defaultConfig);
		const body2 = await response2.json();

		expect(body2.tasks).toHaveLength(1);
	});

	it('filters by public_id query param', async () => {
		const task = await createTask(db, createTaskData({ description: 'Target' }));
		await createTask(db, createTaskData({ description: 'Other' }));

		const event = createBeaconAPIEvent('GET', '/tasks/export', {
			query: { public_id: String(task.public_id) },
		});
		const response = await handleExportTasks(event, db, defaultConfig);
		const body = await response.json();

		expect(body.tasks).toHaveLength(1);
		expect(body.tasks[0].public_id).toBe(task.public_id);
		expect(body.tasks[0].description).toBe('Target');
	});

	it('returns 400 for non-numeric public_id', async () => {
		const event = createBeaconAPIEvent('GET', '/tasks/export', {
			query: { public_id: 'abc' },
		});
		const response = await handleExportTasks(event, db, defaultConfig);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('public_id must be a number');
	});
});

describe('GET /tasks/:id/export', () => {
	it('returns envelope with one task', async () => {
		const task = await createTask(db, createTaskData({ description: 'Single export' }));

		const event = createBeaconAPIEvent('GET', `/tasks/${task.id}/export`);
		const response = await handleExportTask(event, db, defaultConfig, { id: task.id });
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.version).toBe(1);
		expect(body.exported_at).toBeDefined();
		expect(body.source).toBe('http://localhost');
		expect(body.tasks).toHaveLength(1);
		expect(body.tasks[0].description).toBe('Single export');
		expect(body.tasks[0].public_id).toBe(task.public_id);
	});

	it('returns 404 for nonexistent task', async () => {
		const event = createBeaconAPIEvent('GET', '/tasks/nonexistent/export');
		const response = await handleExportTask(event, db, defaultConfig, { id: 'nonexistent' });
		const body = await response.json();

		expect(response.status).toBe(404);
		expect(body.error).toBe('Task not found');
	});

	it('includes admin notes in export', async () => {
		const task = await createTask(db, createTaskData({ description: 'Notes test' }));

		await createAdminNote(db, {
			task_id: task.id,
			content: 'First note',
			author_email: 'admin@example.com',
		});
		await createAdminNote(db, {
			task_id: task.id,
			content: 'Second note',
			author_email: null,
		});

		const event = createBeaconAPIEvent('GET', `/tasks/${task.id}/export`);
		const response = await handleExportTask(event, db, defaultConfig, { id: task.id });
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.tasks[0].admin_notes).toHaveLength(2);
		expect(body.tasks[0].admin_notes[0].content).toBe('First note');
		expect(body.tasks[0].admin_notes[0].author_email).toBe('admin@example.com');
		expect(body.tasks[0].admin_notes[1].content).toBe('Second note');
		expect(body.tasks[0].admin_notes[1].author_email).toBeNull();
	});
});
