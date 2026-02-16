import { describe, it, expect } from 'vitest';
import { beacon } from '../hook.js';
import {
	createMockEvent,
	createBeaconAPIEvent,
	createTrackableResolve,
} from '../../../test/mocks/request-event.js';

// Helper: create a handle hook with sensible test defaults
function createHook(overrides: Record<string, unknown> = {}) {
	return beacon({
		enabled: true,
		mode: 'development',
		database: 'file::memory:',
		...overrides,
	});
}

// -- Kill switch --

describe('kill switch', () => {
	it('passes through all beacon requests when disabled', async () => {
		const handle = createHook({ enabled: false });
		const event = createMockEvent({ path: '/__beacon/api/config' });
		const tracker = createTrackableResolve();

		const response = await handle({ event, resolve: tracker.resolve });

		expect(tracker.called).toBe(true);
		expect(response.status).toBe(200);
	});

	it('passes through non-beacon requests when disabled', async () => {
		const handle = createHook({ enabled: false });
		const event = createMockEvent({ path: '/app/page' });
		const tracker = createTrackableResolve();

		const response = await handle({ event, resolve: tracker.resolve });

		expect(tracker.called).toBe(true);
		expect(response.status).toBe(200);
	});
});

// -- Fast passthrough --

describe('fast passthrough', () => {
	it('calls resolve() for non-beacon paths', async () => {
		const handle = createHook();
		const event = createMockEvent({ path: '/' });
		const tracker = createTrackableResolve();

		await handle({ event, resolve: tracker.resolve });

		expect(tracker.called).toBe(true);
		expect(tracker.calledWith).toBe(event);
	});

	it('does not call resolve() for beacon paths', async () => {
		const handle = createHook();
		const event = createMockEvent({ path: '/__beacon/' });
		const tracker = createTrackableResolve();

		await handle({ event, resolve: tracker.resolve });

		expect(tracker.called).toBe(false);
	});
});

// -- API interception --

describe('API interception', () => {
	it('GET /config returns 200 with widget config and mode', async () => {
		const handle = createHook();
		const event = createBeaconAPIEvent('GET', '/config');
		const tracker = createTrackableResolve();

		const response = await handle({ event, resolve: tracker.resolve });
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('application/json');
		expect(body.mode).toBe('development');
		expect(body.widget).toBeDefined();
		expect(body.widget.position).toBe('bottom-right');
	});

	it('GET /tasks returns empty paginated list', async () => {
		const handle = createHook();
		const event = createBeaconAPIEvent('GET', '/tasks');
		const tracker = createTrackableResolve();

		const response = await handle({ event, resolve: tracker.resolve });
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

	it('POST /feedback returns 400 for invalid body', async () => {
		const handle = createHook();
		const event = createBeaconAPIEvent('POST', '/feedback', {
			body: { description: 'test' },
		});
		const tracker = createTrackableResolve();

		const response = await handle({ event, resolve: tracker.resolve });
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Validation failed');
		expect(body.fields).toBeDefined();
	});

	it('POST /feedback returns 201 for valid submission', async () => {
		const handle = createHook();
		const event = createBeaconAPIEvent('POST', '/feedback', {
			body: {
				type: 'bug',
				priority: 'medium',
				description: 'Something is broken',
			},
		});
		const tracker = createTrackableResolve();

		const response = await handle({ event, resolve: tracker.resolve });
		const body = await response.json();

		expect(response.status).toBe(201);
		expect(body.id).toBeDefined();
		expect(body.public_id).toBe(1);
	});

	it('returns 404 for unknown API routes', async () => {
		const handle = createHook();
		const event = createBeaconAPIEvent('GET', '/nonexistent');
		const tracker = createTrackableResolve();

		const response = await handle({ event, resolve: tracker.resolve });
		const body = await response.json();

		expect(response.status).toBe(404);
		expect(body.error).toBe('Not found');
	});

	it('returns 405 for wrong method on existing route', async () => {
		const handle = createHook();
		const event = createBeaconAPIEvent('DELETE', '/config');
		const tracker = createTrackableResolve();

		const response = await handle({ event, resolve: tracker.resolve });
		const body = await response.json();

		expect(response.status).toBe(405);
		expect(body.error).toBe('Method not allowed');
	});
});

// -- Dashboard interception --

describe('dashboard interception', () => {
	it('returns 200 HTML at /__beacon/', async () => {
		const handle = createHook();
		const event = createMockEvent({ path: '/__beacon/' });
		const tracker = createTrackableResolve();

		const response = await handle({ event, resolve: tracker.resolve });

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('text/html');
		expect(response.headers.get('Cache-Control')).toBe('no-cache');

		const html = await response.text();
		expect(html).toContain('Beacon Dashboard');
		expect(html).toContain('development');
	});

	it('returns HTML for dashboard sub-paths (SPA fallback)', async () => {
		const handle = createHook();
		const event = createMockEvent({ path: '/__beacon/tasks/123' });
		const tracker = createTrackableResolve();

		const response = await handle({ event, resolve: tracker.resolve });

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('text/html');
	});

	it('includes mode in dashboard HTML', async () => {
		const handle = createHook({ mode: 'deployed' });
		const event = createMockEvent({ path: '/__beacon/' });
		const tracker = createTrackableResolve();

		const response = await handle({ event, resolve: tracker.resolve });
		const html = await response.text();

		expect(html).toContain('deployed');
	});
});

// -- Error boundary --

describe('error boundary', () => {
	it('returns 500 JSON when DB initialization fails', async () => {
		const handle = createHook({ database: 'file:/nonexistent/path/db.sqlite' });
		const event = createBeaconAPIEvent('GET', '/config');
		const tracker = createTrackableResolve();

		const response = await handle({ event, resolve: tracker.resolve });

		expect(response.status).toBe(500);
		expect(response.headers.get('Content-Type')).toBe('application/json');

		const body = await response.json();
		expect(body.error).toBe('Internal Beacon error');
	});

	it('never throws — always returns a Response', async () => {
		const handle = createHook({ database: 'file:/nonexistent/path/db.sqlite' });
		const event = createMockEvent({ path: '/__beacon/' });
		const tracker = createTrackableResolve();

		// Should not throw
		const response = await handle({ event, resolve: tracker.resolve });
		expect(response).toBeInstanceOf(Response);
	});
});

// -- Lazy initialization --

describe('lazy initialization', () => {
	it('does not initialize DB for non-beacon requests', async () => {
		// Uses an invalid DB path — would fail if DB were initialized
		const handle = createHook({ database: 'file:/nonexistent/path/db.sqlite' });
		const event = createMockEvent({ path: '/app/page' });
		const tracker = createTrackableResolve();

		// Should succeed because DB is never touched
		const response = await handle({ event, resolve: tracker.resolve });
		expect(response.status).toBe(200);
		expect(tracker.called).toBe(true);
	});
});
