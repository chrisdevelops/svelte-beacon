import type { Client, Row } from '@libsql/client';

/**
 * Execute a query and return all rows.
 */
export async function query(client: Client, sql: string, args: unknown[] = []): Promise<Row[]> {
	const result = await client.execute({ sql, args });
	return result.rows;
}

/**
 * Execute a query and return the first row, or null.
 */
export async function queryOne(client: Client, sql: string, args: unknown[] = []): Promise<Row | null> {
	const result = await client.execute({ sql, args });
	return result.rows[0] ?? null;
}

/**
 * Execute a statement and return the number of affected rows.
 */
export async function execute(client: Client, sql: string, args: unknown[] = []): Promise<{ rowsAffected: number }> {
	const result = await client.execute({ sql, args });
	return { rowsAffected: result.rowsAffected };
}

/**
 * Safely parse a JSON string, returning null on failure.
 */
export function safeParseJSON(value: unknown): unknown {
	if (typeof value !== 'string') return null;
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}
