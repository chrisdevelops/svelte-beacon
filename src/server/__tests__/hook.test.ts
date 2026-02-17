import { describe, it, expect, vi, beforeEach } from 'vitest';
import { beacon } from '../hook.js';
import {
	createMockEvent,
	createBeaconAPIEvent,
	createTrackableResolve,
} from '../../../test/mocks/request-event.js';

// Mock node:fs/promises so dashboard tests don't need real files on disk.
vi.mock('node:fs/promises', () => ({
	readFile: vi.fn(),
}));

import { readFile } from 'node:fs/promises';
const mockReadFile = vi.mocked(readFile);

// Default mock dashboard HTML served when readFile is called.
const MOCK_DASHBOARD_HTML = '<!DOCTYPE html><html><body>Beacon Dashboard</body></html>';

beforeEach(() => {
	mockReadFile.mockReset();
	// By default, readFile resolves with mock dashboard HTML for any path
	// ending in index.html, and rejects for all other paths.
	mockReadFile.mockImplementation(async (filePath) => {
		const p = String(filePath);
		if (p.endsWith('index.html')) {
			return Buffer.from(MOCK_DASHBOARD_HTML);
		}
		throw Object.assign(new Error(`ENOENT: no such file or directory, open '${p}'`), { code: 'ENOENT' });
	});
});

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
	it('returns 200 HTML at /__beacon/ (serves index.html)', async () => {
		const handle = createHook();
		const event = createMockEvent({ path: '/__beacon/' });
		const tracker = createTrackableResolve();

		const response = await handle({ event, resolve: tracker.resolve });

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
		expect(response.headers.get('Cache-Control')).toBe('no-cache');

		const html = await response.text();
		expect(html).toContain('Beacon Dashboard');
	});

	it('returns HTML for dashboard sub-paths (SPA fallback)', async () => {
		const handle = createHook();
		const event = createMockEvent({ path: '/__beacon/tasks/123' });
		const tracker = createTrackableResolve();

		const response = await handle({ event, resolve: tracker.resolve });

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
		expect(response.headers.get('Cache-Control')).toBe('no-cache');
	});

	it('serves static files with correct MIME type', async () => {
		const mockCss = Buffer.from('body { color: red; }');
		mockReadFile.mockImplementation(async (filePath) => {
			const p = String(filePath);
			if (p.endsWith('.css')) return mockCss;
			throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
		});

		const handle = createHook();
		const event = createMockEvent({ path: '/__beacon/_app/style.css' });
		const tracker = createTrackableResolve();

		const response = await handle({ event, resolve: tracker.resolve });

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('text/css; charset=utf-8');
		expect(response.headers.get('Content-Length')).toBe(String(mockCss.byteLength));
	});

	it('returns immutable cache headers for hashed assets', async () => {
		const mockJs = Buffer.from('console.log("app")');
		mockReadFile.mockImplementation(async (filePath) => {
			const p = String(filePath);
			if (p.endsWith('.js')) return mockJs;
			throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
		});

		const handle = createHook();
		const event = createMockEvent({ path: '/__beacon/_app/immutable/app.abc12345de.js' });
		const tracker = createTrackableResolve();

		const response = await handle({ event, resolve: tracker.resolve });

		expect(response.status).toBe(200);
		expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
	});

	it('returns 404 for missing static files', async () => {
		mockReadFile.mockRejectedValue(
			Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
		);

		const handle = createHook();
		const event = createMockEvent({ path: '/__beacon/nonexistent.js' });
		const tracker = createTrackableResolve();

		const response = await handle({ event, resolve: tracker.resolve });

		expect(response.status).toBe(404);
	});

	it('returns 403 for path traversal attempts', async () => {
		const handle = createHook();
		// Construct an event where pathname bypasses URL normalization.
		// Real URL constructors normalize ".." away, but we test the
		// defense-in-depth check by injecting a pathname directly.
		const event = createMockEvent({ path: '/__beacon/foo' });
		// Override the url.pathname to include ".." (simulating a non-standard client)
		Object.defineProperty(event.url, 'pathname', {
			value: '/__beacon/../../../etc/passwd.js',
			writable: false,
		});
		const tracker = createTrackableResolve();

		const response = await handle({ event, resolve: tracker.resolve });

		expect(response.status).toBe(403);
	});

	it('returns 500 with message when index.html is missing', async () => {
		mockReadFile.mockRejectedValue(
			Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
		);

		const handle = createHook();
		const event = createMockEvent({ path: '/__beacon/' });
		const tracker = createTrackableResolve();

		const response = await handle({ event, resolve: tracker.resolve });

		expect(response.status).toBe(500);
		const text = await response.text();
		expect(text).toContain('Dashboard not found');
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

// -- Auth enforcement --

describe('auth enforcement', () => {
	it('returns 401 for protected routes in deployed mode without session', async () => {
		const handle = createHook({ mode: 'deployed' });
		const event = createBeaconAPIEvent('GET', '/tasks');
		const tracker = createTrackableResolve();

		const response = await handle({ event, resolve: tracker.resolve });

		expect(response.status).toBe(401);
		const body = await response.json();
		expect(body.error).toBe('Unauthorized');
	});

	it('allows protected routes in dev mode without session', async () => {
		const handle = createHook({ mode: 'development' });
		const event = createBeaconAPIEvent('GET', '/tasks');
		const tracker = createTrackableResolve();

		const response = await handle({ event, resolve: tracker.resolve });

		expect(response.status).toBe(200);
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
