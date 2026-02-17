import { describe, it, expect, beforeEach } from 'vitest';
import type { Client } from '@libsql/client';
import { createTestDB } from '../../../../test/helpers.js';
import { createBeaconAPIEvent } from '../../../../test/mocks/request-event.js';
import { defaultConfig, createTaskData } from '../../../../test/mocks/factories.js';
import { handleCreateNote } from '../notes.js';
import { createTask } from '../../db/queries/tasks.js';

let db: Client;

beforeEach(async () => {
	db = await createTestDB();
});

describe('POST /tasks/:id/notes', () => {
	it('returns 400 for invalid JSON body', async () => {
		const task = await createTask(db, createTaskData());
		const event = createBeaconAPIEvent('POST', `/tasks/${task.id}/notes`, {
			headers: { 'content-type': 'text/plain' },
		});
		// Override the request to have a non-JSON body
		Object.defineProperty(event, 'request', {
			value: new Request(`http://localhost/__beacon/api/tasks/${task.id}/notes`, {
				method: 'POST',
				headers: { 'content-type': 'text/plain' },
				body: 'not json',
			}),
		});

		const response = await handleCreateNote(event, db, defaultConfig, { id: task.id });
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Invalid JSON body');
	});

	it('returns 400 for missing content', async () => {
		const task = await createTask(db, createTaskData());
		const event = createBeaconAPIEvent('POST', `/tasks/${task.id}/notes`, {
			body: {},
		});

		const response = await handleCreateNote(event, db, defaultConfig, { id: task.id });
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Validation failed');
		expect(body.details.content).toBe('content is required');
	});

	it('returns 400 for empty string content', async () => {
		const task = await createTask(db, createTaskData());
		const event = createBeaconAPIEvent('POST', `/tasks/${task.id}/notes`, {
			body: { content: '   ' },
		});

		const response = await handleCreateNote(event, db, defaultConfig, { id: task.id });
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Validation failed');
		expect(body.details.content).toBe('content is required');
	});

	it('returns 400 for content exceeding maxLength', async () => {
		const task = await createTask(db, createTaskData());
		const longContent = 'a'.repeat(10001);
		const event = createBeaconAPIEvent('POST', `/tasks/${task.id}/notes`, {
			body: { content: longContent },
		});

		const response = await handleCreateNote(event, db, defaultConfig, { id: task.id });
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Validation failed');
		expect(body.details.content).toBe('content must be at most 10000 characters');
	});

	it('returns 404 for nonexistent task', async () => {
		const event = createBeaconAPIEvent('POST', '/tasks/nonexistent/notes', {
			body: { content: 'A note' },
		});

		const response = await handleCreateNote(event, db, defaultConfig, { id: 'nonexistent' });
		const body = await response.json();

		expect(response.status).toBe(404);
		expect(body.error).toBe('Task not found');
	});

	it('returns 201 with full AdminNote object on success', async () => {
		const task = await createTask(db, createTaskData());
		const event = createBeaconAPIEvent('POST', `/tasks/${task.id}/notes`, {
			body: { content: 'This is an admin note' },
		});

		const response = await handleCreateNote(event, db, defaultConfig, { id: task.id });
		const body = await response.json();

		expect(response.status).toBe(201);
		expect(body.id).toEqual(expect.any(String));
		expect(body.task_id).toBe(task.id);
		expect(body.content).toBe('This is an admin note');
		expect(body.author_email).toBeNull();
		expect(body.created_at).toEqual(expect.any(String));
	});

	it('returns 201 with author_email from auth context when present', async () => {
		const task = await createTask(db, createTaskData());
		const event = createBeaconAPIEvent('POST', `/tasks/${task.id}/notes`, {
			body: { content: 'Note from authenticated user' },
			locals: { auth: { authenticated: true, email: 'admin@test.com' } },
		});

		const response = await handleCreateNote(event, db, defaultConfig, { id: task.id });
		const body = await response.json();

		expect(response.status).toBe(201);
		expect(body.task_id).toBe(task.id);
		expect(body.content).toBe('Note from authenticated user');
		expect(body.author_email).toBe('admin@test.com');
	});
});
