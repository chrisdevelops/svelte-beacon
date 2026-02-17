import type { Client, Row } from '@libsql/client';
import { queryOne, execute } from '../helpers.js';
import type { Session, CreateSessionInput } from '../../types.js';

function mapSession(row: Row): Session {
	return {
		id: row['id'] as string,
		email: row['email'] as string,
		is_admin: row['is_admin'] === 1,
		expires_at: row['expires_at'] as string,
		created_at: row['created_at'] as string,
	};
}

function computeExpiry(hours: number): string {
	return new Date(Date.now() + hours * 3600000)
		.toISOString().replace('T', ' ').slice(0, 19);
}

export async function createSession(
	client: Client,
	data: CreateSessionInput,
): Promise<Session> {
	const id = crypto.randomUUID();
	const expiresAt = computeExpiry(data.expiresInHours ?? 168);

	await execute(
		client,
		`INSERT INTO sessions (id, email, is_admin, expires_at) VALUES (?, ?, ?, ?)`,
		[id, data.email, data.isAdmin ? 1 : 0, expiresAt],
	);

	const row = await queryOne(client, 'SELECT * FROM sessions WHERE id = ?', [id]);
	if (!row) {
		throw new Error('Session creation failed: could not re-fetch created session');
	}
	return mapSession(row);
}

export async function getSession(
	client: Client,
	id: string,
): Promise<Session | null> {
	const row = await queryOne(
		client,
		`SELECT * FROM sessions WHERE id = ? AND datetime(expires_at) > datetime('now')`,
		[id],
	);
	return row ? mapSession(row) : null;
}

export async function deleteExpiredSessions(
	client: Client,
): Promise<{ deleted: number }> {
	const { rowsAffected } = await execute(
		client,
		`DELETE FROM sessions WHERE datetime(expires_at) <= datetime('now')`,
	);
	return { deleted: rowsAffected };
}
