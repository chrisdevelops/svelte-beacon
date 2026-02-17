import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Client } from '@libsql/client';
import { createTestDB } from '../../../../test/helpers.js';
import { createSession, getSession, deleteExpiredSessions } from './sessions.js';

describe('session queries', () => {
	let db: Client;

	beforeEach(async () => {
		db = await createTestDB();
	});

	afterEach(() => {
		db.close();
	});

	describe('createSession', () => {
		it('creates a session with default 168h expiry', async () => {
			const session = await createSession(db, {
				email: 'user@example.com',
				isAdmin: false,
			});

			expect(session.id).toBeDefined();
			expect(session.email).toBe('user@example.com');
			expect(session.is_admin).toBe(false);
			expect(session.expires_at).toBeDefined();
			expect(session.created_at).toBeDefined();

			// Default expiry is ~168 hours (7 days) from now
			const expiresAt = new Date(session.expires_at.replace(' ', 'T') + 'Z');
			const now = Date.now();
			const diffHours = (expiresAt.getTime() - now) / 3600000;
			expect(diffHours).toBeGreaterThan(167);
			expect(diffHours).toBeLessThan(169);
		});

		it('stores admin flag correctly', async () => {
			const session = await createSession(db, {
				email: 'admin@example.com',
				isAdmin: true,
			});

			expect(session.is_admin).toBe(true);
		});

		it('accepts custom expiry', async () => {
			const session = await createSession(db, {
				email: 'user@example.com',
				isAdmin: false,
				expiresInHours: 1,
			});

			const expiresAt = new Date(session.expires_at.replace(' ', 'T') + 'Z');
			const now = Date.now();
			const diffMinutes = (expiresAt.getTime() - now) / 60000;
			expect(diffMinutes).toBeGreaterThan(58);
			expect(diffMinutes).toBeLessThan(62);
		});
	});

	describe('getSession', () => {
		it('returns a valid (non-expired) session', async () => {
			const created = await createSession(db, {
				email: 'user@example.com',
				isAdmin: false,
			});

			const fetched = await getSession(db, created.id);

			expect(fetched).not.toBeNull();
			expect(fetched!.id).toBe(created.id);
			expect(fetched!.email).toBe('user@example.com');
		});

		it('returns null for expired session', async () => {
			const created = await createSession(db, {
				email: 'user@example.com',
				isAdmin: false,
			});

			// Manually set expires_at to the past
			await db.execute({
				sql: "UPDATE sessions SET expires_at = '2020-01-01 00:00:00' WHERE id = ?",
				args: [created.id],
			});

			const fetched = await getSession(db, created.id);
			expect(fetched).toBeNull();
		});

		it('returns null for nonexistent session', async () => {
			const fetched = await getSession(db, 'nonexistent-id');
			expect(fetched).toBeNull();
		});
	});

	describe('deleteExpiredSessions', () => {
		it('deletes expired sessions and returns count', async () => {
			const s1 = await createSession(db, { email: 'a@example.com', isAdmin: false });
			await createSession(db, { email: 'b@example.com', isAdmin: false });

			// Expire s1
			await db.execute({
				sql: "UPDATE sessions SET expires_at = '2020-01-01 00:00:00' WHERE id = ?",
				args: [s1.id],
			});

			const { deleted } = await deleteExpiredSessions(db);
			expect(deleted).toBe(1);
		});

		it('returns 0 when no expired sessions', async () => {
			await createSession(db, { email: 'a@example.com', isAdmin: false });

			const { deleted } = await deleteExpiredSessions(db);
			expect(deleted).toBe(0);
		});
	});
});
