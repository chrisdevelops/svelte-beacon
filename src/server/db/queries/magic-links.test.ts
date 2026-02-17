import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Client } from '@libsql/client';
import { createTestDB } from '../../../../test/helpers.js';
import { createMagicLink, consumeMagicLink } from './magic-links.js';

describe('magic link queries', () => {
	let db: Client;

	beforeEach(async () => {
		db = await createTestDB();
	});

	afterEach(() => {
		db.close();
	});

	describe('createMagicLink', () => {
		it('creates a magic link with 64-char hex token', async () => {
			const link = await createMagicLink(db, 'user@example.com');

			expect(link.id).toBeDefined();
			expect(link.email).toBe('user@example.com');
			expect(link.token).toMatch(/^[a-f0-9]{64}$/);
			expect(link.used).toBe(false);
			expect(link.expires_at).toBeDefined();
		});

		it('generates unique tokens', async () => {
			const link1 = await createMagicLink(db, 'user@example.com');
			const link2 = await createMagicLink(db, 'user@example.com');

			expect(link1.token).not.toBe(link2.token);
		});

		it('defaults to 15 minute expiry', async () => {
			const link = await createMagicLink(db, 'user@example.com');

			const expiresAt = new Date(link.expires_at.replace(' ', 'T') + 'Z');
			const now = Date.now();
			const diffMinutes = (expiresAt.getTime() - now) / 60000;
			expect(diffMinutes).toBeGreaterThan(14);
			expect(diffMinutes).toBeLessThan(16);
		});

		it('is unused by default', async () => {
			const link = await createMagicLink(db, 'user@example.com');
			expect(link.used).toBe(false);
		});
	});

	describe('consumeMagicLink', () => {
		it('consumes a valid magic link', async () => {
			const link = await createMagicLink(db, 'user@example.com');

			const consumed = await consumeMagicLink(db, link.token);

			expect(consumed).not.toBeNull();
			expect(consumed!.id).toBe(link.id);
			expect(consumed!.email).toBe('user@example.com');
			expect(consumed!.used).toBe(true);
		});

		it('returns null on second consumption attempt', async () => {
			const link = await createMagicLink(db, 'user@example.com');

			await consumeMagicLink(db, link.token);
			const second = await consumeMagicLink(db, link.token);

			expect(second).toBeNull();
		});

		it('returns null for expired magic link', async () => {
			const link = await createMagicLink(db, 'user@example.com');

			// Manually expire the link
			await db.execute({
				sql: "UPDATE magic_links SET expires_at = '2020-01-01 00:00:00' WHERE id = ?",
				args: [link.id],
			});

			const consumed = await consumeMagicLink(db, link.token);
			expect(consumed).toBeNull();
		});

		it('returns null for nonexistent token', async () => {
			const consumed = await consumeMagicLink(db, 'nonexistent-token');
			expect(consumed).toBeNull();
		});
	});
});
