import { randomBytes } from 'node:crypto';
import type { Client, Row } from '@libsql/client';
import { queryOne, execute } from '../helpers.js';
import type { MagicLink } from '../../types.js';

function mapMagicLink(row: Row): MagicLink {
	return {
		id: row['id'] as string,
		email: row['email'] as string,
		token: row['token'] as string,
		used: row['used'] === 1,
		expires_at: row['expires_at'] as string,
		created_at: row['created_at'] as string,
	};
}

function computeExpiry(minutes: number): string {
	return new Date(Date.now() + minutes * 60000)
		.toISOString().replace('T', ' ').slice(0, 19);
}

export async function createMagicLink(
	client: Client,
	email: string,
	expiresInMinutes?: number,
): Promise<MagicLink> {
	const id = crypto.randomUUID();
	const token = randomBytes(32).toString('hex');
	const expiresAt = computeExpiry(expiresInMinutes ?? 15);

	await execute(
		client,
		`INSERT INTO magic_links (id, email, token, expires_at) VALUES (?, ?, ?, ?)`,
		[id, email, token, expiresAt],
	);

	const row = await queryOne(client, 'SELECT * FROM magic_links WHERE id = ?', [id]);
	if (!row) {
		throw new Error('Magic link creation failed: could not re-fetch created magic link');
	}
	return mapMagicLink(row);
}

export async function consumeMagicLink(
	client: Client,
	token: string,
): Promise<MagicLink | null> {
	const row = await queryOne(
		client,
		`SELECT * FROM magic_links WHERE token = ? AND used = 0 AND datetime(expires_at) > datetime('now')`,
		[token],
	);

	if (!row) {
		return null;
	}

	await execute(
		client,
		`UPDATE magic_links SET used = 1 WHERE id = ?`,
		[row['id'] as string],
	);

	return mapMagicLink({ ...row, used: 1 });
}
