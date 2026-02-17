import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Client } from '@libsql/client';
import { createTestDB } from '../../../../test/helpers.js';
import { defaultConfig } from '../../../../test/mocks/factories.js';
import { createMockEvent } from '../../../../test/mocks/request-event.js';
import { authenticateRequest } from '../middleware.js';
import { createSession } from '../../db/queries/sessions.js';
import type { ResolvedConfig } from '../../config.js';

describe('authenticateRequest', () => {
	let db: Client;

	beforeEach(async () => {
		db = await createTestDB();
	});

	afterEach(() => {
		db.close();
	});

	const deployedConfig: ResolvedConfig = {
		...defaultConfig,
		mode: 'deployed',
		requireAuth: true,
	};

	it('returns authenticated in dev mode without cookie', async () => {
		const event = createMockEvent({ path: '/__beacon/api/tasks' });

		const auth = await authenticateRequest(event, db, defaultConfig);

		expect(auth.authenticated).toBe(true);
		expect(auth.email).toBe('dev@localhost');
		expect(auth.isAdmin).toBe(true);
	});

	it('returns unauthenticated in deployed mode without cookie', async () => {
		const event = createMockEvent({ path: '/__beacon/api/tasks' });

		const auth = await authenticateRequest(event, db, deployedConfig);

		expect(auth.authenticated).toBe(false);
		expect(auth.email).toBeUndefined();
	});

	it('returns unauthenticated with invalid session id', async () => {
		const event = createMockEvent({
			path: '/__beacon/api/tasks',
			cookies: { __beacon_session: 'invalid-session-id' },
		});

		const auth = await authenticateRequest(event, db, deployedConfig);

		expect(auth.authenticated).toBe(false);
	});

	it('returns unauthenticated with expired session', async () => {
		const session = await createSession(db, {
			email: 'user@example.com',
			isAdmin: false,
		});

		// Expire the session
		await db.execute({
			sql: "UPDATE sessions SET expires_at = '2020-01-01 00:00:00' WHERE id = ?",
			args: [session.id],
		});

		const event = createMockEvent({
			path: '/__beacon/api/tasks',
			cookies: { __beacon_session: session.id },
		});

		const auth = await authenticateRequest(event, db, deployedConfig);

		expect(auth.authenticated).toBe(false);
	});

	it('returns authenticated with valid session', async () => {
		const session = await createSession(db, {
			email: 'user@example.com',
			isAdmin: false,
		});

		const event = createMockEvent({
			path: '/__beacon/api/tasks',
			cookies: { __beacon_session: session.id },
		});

		const auth = await authenticateRequest(event, db, deployedConfig);

		expect(auth.authenticated).toBe(true);
		expect(auth.email).toBe('user@example.com');
		expect(auth.isAdmin).toBe(false);
	});

	it('detects admin sessions', async () => {
		const session = await createSession(db, {
			email: 'admin@example.com',
			isAdmin: true,
		});

		const event = createMockEvent({
			path: '/__beacon/api/tasks',
			cookies: { __beacon_session: session.id },
		});

		const auth = await authenticateRequest(event, db, deployedConfig);

		expect(auth.authenticated).toBe(true);
		expect(auth.isAdmin).toBe(true);
	});

	it('authenticates via Bearer token when session exists', async () => {
		const session = await createSession(db, {
			email: 'cli@example.com',
			isAdmin: false,
		});

		const event = createMockEvent({
			path: '/__beacon/api/tasks',
			headers: { Authorization: `Bearer ${session.id}` },
		});

		const auth = await authenticateRequest(event, db, deployedConfig);

		expect(auth.authenticated).toBe(true);
		expect(auth.email).toBe('cli@example.com');
		expect(auth.isAdmin).toBe(false);
	});

	it('rejects Bearer token when session does not exist', async () => {
		const event = createMockEvent({
			path: '/__beacon/api/tasks',
			headers: { Authorization: 'Bearer invalid-token' },
		});

		const auth = await authenticateRequest(event, db, deployedConfig);

		expect(auth.authenticated).toBe(false);
	});

	it('cookie takes precedence over Bearer token', async () => {
		const cookieSession = await createSession(db, {
			email: 'cookie-user@example.com',
			isAdmin: true,
		});
		const bearerSession = await createSession(db, {
			email: 'bearer-user@example.com',
			isAdmin: false,
		});

		const event = createMockEvent({
			path: '/__beacon/api/tasks',
			cookies: { __beacon_session: cookieSession.id },
			headers: { Authorization: `Bearer ${bearerSession.id}` },
		});

		const auth = await authenticateRequest(event, db, deployedConfig);

		expect(auth.authenticated).toBe(true);
		expect(auth.email).toBe('cookie-user@example.com');
		expect(auth.isAdmin).toBe(true);
	});
});
