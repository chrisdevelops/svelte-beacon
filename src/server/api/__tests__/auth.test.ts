import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Client } from '@libsql/client';
import { createTestDB } from '../../../../test/helpers.js';
import { defaultConfig } from '../../../../test/mocks/factories.js';
import { createBeaconAPIEvent, createMockEvent } from '../../../../test/mocks/request-event.js';
import { dispatch } from '../../router.js';
import { createMagicLink } from '../../db/queries/magic-links.js';
import { createSession } from '../../db/queries/sessions.js';
import type { ResolvedConfig } from '../../config.js';

// Ensure routes are registered
import '../../api/index.js';

describe('auth API handlers', () => {
	let db: Client;

	beforeEach(async () => {
		db = await createTestDB();
	});

	afterEach(() => {
		db.close();
	});

	describe('POST /auth/magic-link', () => {
		it('returns 400 for invalid JSON', async () => {
			const event = createMockEvent({
				method: 'POST',
				path: '/__beacon/api/auth/magic-link',
				headers: { 'content-type': 'text/plain' },
			});
			// Override request to have non-JSON body
			Object.defineProperty(event, 'request', {
				value: new Request('http://localhost/__beacon/api/auth/magic-link', {
					method: 'POST',
					body: 'not json',
					headers: { 'content-type': 'text/plain' },
				}),
			});

			const response = await dispatch(event, db, defaultConfig);
			expect(response.status).toBe(400);

			const body = await response.json();
			expect(body.error).toBe('Invalid JSON body');
		});

		it('returns 400 for missing email', async () => {
			const event = createBeaconAPIEvent('POST', '/auth/magic-link', {
				body: {},
			});

			const response = await dispatch(event, db, defaultConfig);
			expect(response.status).toBe(400);

			const body = await response.json();
			expect(body.error).toBe('Validation failed');
			expect(body.details.email).toBeDefined();
		});

		it('returns 400 for invalid email', async () => {
			const event = createBeaconAPIEvent('POST', '/auth/magic-link', {
				body: { email: 'not-an-email' },
			});

			const response = await dispatch(event, db, defaultConfig);
			expect(response.status).toBe(400);

			const body = await response.json();
			expect(body.error).toBe('Validation failed');
		});

		it('creates magic link and logs to console on success', async () => {
			const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			const event = createBeaconAPIEvent('POST', '/auth/magic-link', {
				body: { email: 'user@example.com' },
			});

			const response = await dispatch(event, db, defaultConfig);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.success).toBe(true);

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('[beacon] Magic link for user@example.com:'),
			);
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('/auth/verify?token='),
			);

			consoleSpy.mockRestore();
		});
	});

	describe('GET /auth/verify', () => {
		it('returns 400 for missing token', async () => {
			const event = createBeaconAPIEvent('GET', '/auth/verify');

			const response = await dispatch(event, db, defaultConfig);
			expect(response.status).toBe(400);

			const body = await response.json();
			expect(body.error).toBe('Missing token parameter');
		});

		it('returns 400 for invalid token', async () => {
			const event = createBeaconAPIEvent('GET', '/auth/verify', {
				query: { token: 'invalid-token' },
			});

			const response = await dispatch(event, db, defaultConfig);
			expect(response.status).toBe(400);

			const body = await response.json();
			expect(body.error).toBe('Invalid or expired token');
		});

		it('creates session, sets cookie, and redirects on valid token', async () => {
			const link = await createMagicLink(db, 'user@example.com');

			const event = createBeaconAPIEvent('GET', '/auth/verify', {
				query: { token: link.token },
			});

			const response = await dispatch(event, db, defaultConfig);

			expect(response.status).toBe(302);
			expect(response.headers.get('Location')).toBe('/__beacon/');

			// Session cookie was set
			const sessionId = event.cookies.get('__beacon_session');
			expect(sessionId).toBeDefined();
			expect(sessionId).not.toBeNull();
		});

		it('detects admin from adminEmails config', async () => {
			const config: ResolvedConfig = {
				...defaultConfig,
				adminEmails: ['admin@test.com'],
			};

			const link = await createMagicLink(db, 'admin@test.com');

			const event = createBeaconAPIEvent('GET', '/auth/verify', {
				query: { token: link.token },
			});

			await dispatch(event, db, config);

			// Verify admin was stored by checking the session
			const sessionId = event.cookies.get('__beacon_session');
			expect(sessionId).toBeDefined();

			// Fetch the session from DB to verify admin flag
			const { getSession } = await import('../../db/queries/sessions.js');
			const session = await getSession(db, sessionId!);
			expect(session).not.toBeNull();
			expect(session!.is_admin).toBe(true);
		});

		it('returns 400 for already-used token', async () => {
			const link = await createMagicLink(db, 'user@example.com');

			// Consume first
			const event1 = createBeaconAPIEvent('GET', '/auth/verify', {
				query: { token: link.token },
			});
			await dispatch(event1, db, defaultConfig);

			// Try again
			const event2 = createBeaconAPIEvent('GET', '/auth/verify', {
				query: { token: link.token },
			});
			const response = await dispatch(event2, db, defaultConfig);

			expect(response.status).toBe(400);
			const body = await response.json();
			expect(body.error).toBe('Invalid or expired token');
		});
	});

	describe('POST /auth/logout', () => {
		it('clears session cookie', async () => {
			const event = createBeaconAPIEvent('POST', '/auth/logout', {
				cookies: { __beacon_session: 'some-session-id' },
			});

			const response = await dispatch(event, db, defaultConfig);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.success).toBe(true);

			// Cookie should be deleted
			expect(event.cookies.get('__beacon_session')).toBeNull();
		});
	});

	describe('GET /auth/session', () => {
		it('returns auth context in dev mode', async () => {
			const event = createBeaconAPIEvent('GET', '/auth/session');

			const response = await dispatch(event, db, defaultConfig);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.authenticated).toBe(true);
			expect(body.email).toBe('dev@localhost');
			expect(body.isAdmin).toBe(true);
		});

		it('returns unauthenticated in deployed mode without session', async () => {
			const deployedConfig: ResolvedConfig = {
				...defaultConfig,
				mode: 'deployed',
				requireAuth: true,
			};

			const event = createBeaconAPIEvent('GET', '/auth/session');

			const response = await dispatch(event, db, deployedConfig);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.authenticated).toBe(false);
		});
	});
});
