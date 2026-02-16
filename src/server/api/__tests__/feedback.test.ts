import { describe, it, expect, beforeEach } from 'vitest';
import type { Client } from '@libsql/client';
import { createTestDB } from '../../../../test/helpers.js';
import { createBeaconAPIEvent } from '../../../../test/mocks/request-event.js';
import { defaultConfig } from '../../../../test/mocks/factories.js';
import { handleCreateFeedback } from '../feedback.js';
import { getTask } from '../../db/queries/tasks.js';

let db: Client;

beforeEach(async () => {
	db = await createTestDB();
});

describe('POST /feedback', () => {
	it('returns 201 with id and public_id on valid submission', async () => {
		const event = createBeaconAPIEvent('POST', '/feedback', {
			body: {
				type: 'bug',
				priority: 'medium',
				description: 'Button does not work',
			},
		});

		const response = await handleCreateFeedback(event, db, defaultConfig);
		const body = await response.json();

		expect(response.status).toBe(201);
		expect(body.id).toBeDefined();
		expect(body.public_id).toBe(1);
	});

	it('creates a task with status new and origin local', async () => {
		const event = createBeaconAPIEvent('POST', '/feedback', {
			body: {
				type: 'feature',
				priority: 'high',
				description: 'Add dark mode',
			},
		});

		const response = await handleCreateFeedback(event, db, defaultConfig);
		const body = await response.json();
		const task = await getTask(db, body.id);

		expect(task).not.toBeNull();
		expect(task!.status).toBe('new');
		expect(task!.origin).toBe('local');
		expect(task!.type).toBe('feature');
		expect(task!.priority).toBe('high');
		expect(task!.description).toBe('Add dark mode');
	});

	it('returns 400 with field errors for missing required fields', async () => {
		const event = createBeaconAPIEvent('POST', '/feedback', {
			body: {},
		});

		const response = await handleCreateFeedback(event, db, defaultConfig);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Validation failed');
		expect(body.fields.description).toBeDefined();
		expect(body.fields.type).toBeDefined();
		expect(body.fields.priority).toBeDefined();
	});

	it('returns 400 for invalid type value', async () => {
		const event = createBeaconAPIEvent('POST', '/feedback', {
			body: {
				type: 'invalid',
				priority: 'medium',
				description: 'Test',
			},
		});

		const response = await handleCreateFeedback(event, db, defaultConfig);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.fields.type).toContain('must be one of');
	});

	it('returns 400 for invalid priority value', async () => {
		const event = createBeaconAPIEvent('POST', '/feedback', {
			body: {
				type: 'bug',
				priority: 'urgent',
				description: 'Test',
			},
		});

		const response = await handleCreateFeedback(event, db, defaultConfig);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.fields.priority).toContain('must be one of');
	});

	it('returns 400 for description exceeding 10000 chars', async () => {
		const event = createBeaconAPIEvent('POST', '/feedback', {
			body: {
				type: 'bug',
				priority: 'low',
				description: 'x'.repeat(10001),
			},
		});

		const response = await handleCreateFeedback(event, db, defaultConfig);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.fields.description).toContain('at most 10000');
	});

	it('returns 400 for invalid JSON body', async () => {
		const url = new URL('http://localhost/__beacon/api/feedback');
		const request = new Request(url, {
			method: 'POST',
			headers: { 'Content-Type': 'text/plain' },
			body: 'not json',
		});
		const event = {
			url,
			request,
			params: {},
			route: { id: null },
			locals: {},
		} as unknown as Parameters<import('@sveltejs/kit').Handle>[0]['event'];

		const response = await handleCreateFeedback(event, db, defaultConfig);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Invalid JSON body');
	});

	it('stores route and metadata when provided', async () => {
		const event = createBeaconAPIEvent('POST', '/feedback', {
			body: {
				type: 'bug',
				priority: 'medium',
				description: 'Broken layout',
				route: '/dashboard',
				metadata: { viewport: '1920x1080' },
			},
		});

		const response = await handleCreateFeedback(event, db, defaultConfig);
		const body = await response.json();
		const task = await getTask(db, body.id);

		expect(task!.route).toBe('/dashboard');
		expect(task!.metadata).toEqual({ viewport: '1920x1080' });
	});

	it('handles optional email as null when not required', async () => {
		const event = createBeaconAPIEvent('POST', '/feedback', {
			body: {
				type: 'bug',
				priority: 'low',
				description: 'No email',
			},
		});

		const response = await handleCreateFeedback(event, db, defaultConfig);
		const body = await response.json();
		const task = await getTask(db, body.id);

		expect(response.status).toBe(201);
		expect(task!.user_email).toBeNull();
	});

	it('requires email when config.widget.requireEmail is true', async () => {
		const config = {
			...defaultConfig,
			widget: { ...defaultConfig.widget, requireEmail: true },
		};
		const event = createBeaconAPIEvent('POST', '/feedback', {
			body: {
				type: 'bug',
				priority: 'low',
				description: 'Missing email',
			},
		});

		const response = await handleCreateFeedback(event, db, config);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.fields.email).toContain('required');
	});

	it('accepts email when config.widget.requireEmail is true', async () => {
		const config = {
			...defaultConfig,
			widget: { ...defaultConfig.widget, requireEmail: true },
		};
		const event = createBeaconAPIEvent('POST', '/feedback', {
			body: {
				type: 'bug',
				priority: 'low',
				description: 'With email',
				email: 'user@example.com',
			},
		});

		const response = await handleCreateFeedback(event, db, config);
		const body = await response.json();
		const task = await getTask(db, body.id);

		expect(response.status).toBe(201);
		expect(task!.user_email).toBe('user@example.com');
	});
});
