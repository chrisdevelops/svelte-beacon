import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Client } from '@libsql/client';
import { createTestDB, createTempDir, removeTempDir } from '../../test/helpers.js';
import { runPull } from '../pull.js';
import { query } from '../../src/server/db/helpers.js';

/**
 * Build a mock fetch that returns the given envelope as JSON.
 */
function createMockFetch(envelope: unknown) {
	return vi.fn().mockResolvedValue(
		new Response(JSON.stringify(envelope), {
			status: 200,
			headers: { 'content-type': 'application/json' },
		}),
	);
}

/**
 * Build a mock fetch that returns an error status.
 */
function createErrorFetch(status: number, statusText: string) {
	return vi.fn().mockResolvedValue(
		new Response(null, { status, statusText }),
	);
}

/**
 * Create an ExportEnvelope with the given tasks.
 */
function createEnvelope(tasks: unknown[] = []) {
	return {
		version: 1,
		exported_at: new Date().toISOString(),
		source: 'https://staging.example.com',
		tasks,
	};
}

/**
 * Create an exported task with sensible defaults.
 */
function createExportedTask(overrides: Record<string, unknown> = {}) {
	return {
		public_id: 1,
		type: 'bug',
		priority: 'medium',
		status: 'new',
		description: 'Test task from remote',
		route: '/test',
		element_selector: null,
		metadata: null,
		user_email: 'user@remote.com',
		created_at: '2024-01-01 00:00:00',
		updated_at: '2024-01-01 00:00:00',
		admin_notes: [],
		attachments: [],
		...overrides,
	};
}

describe('CLI pull', () => {
	let cwd: string;
	let db: Client;
	const con = { log: vi.fn(), error: vi.fn() };
	let mockExit: ReturnType<typeof vi.spyOn>;

	beforeEach(async () => {
		cwd = await createTempDir();
		db = await createTestDB();
		mkdirSync(join(cwd, '.beacon'), { recursive: true });
		con.log.mockClear();
		con.error.mockClear();
		mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
			throw new Error('process.exit');
		});
	});

	afterEach(async () => {
		mockExit.mockRestore();
		db.close();
		await removeTempDir(cwd);
	});

	it('constructs the correct export URL', async () => {
		const envelope = createEnvelope([]);
		const mockFetch = createMockFetch(envelope);

		await runPull({
			cwd,
			from: 'https://staging.example.com',
			db,
			fetch: mockFetch,
			console: con,
		});

		expect(mockFetch).toHaveBeenCalledOnce();
		const calledUrl = mockFetch.mock.calls[0]![0] as string;
		expect(calledUrl).toBe('https://staging.example.com/__beacon/api/tasks/export');
	});

	it('appends query params for --task and --since', async () => {
		const envelope = createEnvelope([]);
		const mockFetch = createMockFetch(envelope);

		await runPull({
			cwd,
			from: 'https://staging.example.com',
			task: '42',
			since: '2024-06-01T00:00:00Z',
			db,
			fetch: mockFetch,
			console: con,
		});

		const calledUrl = mockFetch.mock.calls[0]![0] as string;
		const url = new URL(calledUrl);
		expect(url.searchParams.get('public_id')).toBe('42');
		expect(url.searchParams.get('since')).toBe('2024-06-01T00:00:00Z');
	});

	it('sends Bearer auth header when token provided', async () => {
		const envelope = createEnvelope([]);
		const mockFetch = createMockFetch(envelope);

		await runPull({
			cwd,
			from: 'https://staging.example.com',
			token: 'my-secret-token',
			db,
			fetch: mockFetch,
			console: con,
		});

		expect(mockFetch).toHaveBeenCalledOnce();
		const calledOptions = mockFetch.mock.calls[0]![1] as RequestInit;
		const headers = calledOptions.headers as Record<string, string>;
		expect(headers['Authorization']).toBe('Bearer my-secret-token');
	});

	it('imports tasks into the local database', async () => {
		const envelope = createEnvelope([
			createExportedTask({ public_id: 10, description: 'First remote task' }),
			createExportedTask({ public_id: 20, description: 'Second remote task' }),
		]);
		const mockFetch = createMockFetch(envelope);

		await runPull({
			cwd,
			from: 'https://staging.example.com',
			db,
			fetch: mockFetch,
			console: con,
		});

		const rows = await query(db, 'SELECT * FROM tasks ORDER BY remote_id ASC');
		expect(rows).toHaveLength(2);
		expect(rows[0]!['description']).toBe('First remote task');
		expect(rows[0]!['origin']).toBe('https://staging.example.com');
		expect(rows[0]!['remote_id']).toBe('10');
		expect(rows[1]!['description']).toBe('Second remote task');
		expect(rows[1]!['remote_id']).toBe('20');
	});

	it('writes attachments to disk as decoded files', async () => {
		const envelope = createEnvelope([
			createExportedTask({
				public_id: 5,
				attachments: [
					{
						filename: 'screenshot.png',
						type: 'screenshot',
						mime_type: 'image/png',
						data: 'aGVsbG8=', // base64 for "hello"
					},
				],
			}),
		]);
		const mockFetch = createMockFetch(envelope);

		await runPull({
			cwd,
			from: 'https://staging.example.com',
			db,
			fetch: mockFetch,
			console: con,
		});

		// Find the task to get its id for the storage path
		const rows = await query(db, 'SELECT id FROM tasks LIMIT 1');
		expect(rows).toHaveLength(1);
		const taskId = rows[0]!['id'] as string;

		const filePath = join(cwd, '.beacon', 'storage', taskId, 'screenshot.png');
		expect(existsSync(filePath)).toBe(true);
		expect(readFileSync(filePath, 'utf-8')).toBe('hello');

		// Verify attachment record in DB
		const attachments = await query(db, 'SELECT * FROM attachments WHERE task_id = ?', [taskId]);
		expect(attachments).toHaveLength(1);
		expect(attachments[0]!['filename']).toBe('screenshot.png');
		expect(attachments[0]!['mime_type']).toBe('image/png');
		expect(Number(attachments[0]!['size_bytes'])).toBe(5);
	});

	it('imports admin notes for tasks', async () => {
		const envelope = createEnvelope([
			createExportedTask({
				public_id: 7,
				admin_notes: [
					{ content: 'Confirmed on staging', author_email: 'admin@example.com' },
					{ content: 'Needs priority fix', author_email: null },
				],
			}),
		]);
		const mockFetch = createMockFetch(envelope);

		await runPull({
			cwd,
			from: 'https://staging.example.com',
			db,
			fetch: mockFetch,
			console: con,
		});

		const tasks = await query(db, 'SELECT id FROM tasks LIMIT 1');
		const taskId = tasks[0]!['id'] as string;

		const notes = await query(
			db,
			'SELECT * FROM admin_notes WHERE task_id = ? ORDER BY created_at ASC',
			[taskId],
		);
		expect(notes).toHaveLength(2);
		expect(notes[0]!['content']).toBe('Confirmed on staging');
		expect(notes[0]!['author_email']).toBe('admin@example.com');
		expect(notes[1]!['content']).toBe('Needs priority fix');
	});

	it('updates lastSyncAt in config.json after pull', async () => {
		const envelope = createEnvelope([createExportedTask()]);
		const mockFetch = createMockFetch(envelope);

		const before = new Date().toISOString();

		await runPull({
			cwd,
			from: 'https://staging.example.com',
			db,
			fetch: mockFetch,
			console: con,
		});

		const after = new Date().toISOString();

		const configPath = join(cwd, '.beacon', 'config.json');
		expect(existsSync(configPath)).toBe(true);

		const config = JSON.parse(readFileSync(configPath, 'utf-8'));
		expect(config.lastSyncAt).toBeDefined();
		// lastSyncAt should be between before and after
		expect(config.lastSyncAt >= before).toBe(true);
		expect(config.lastSyncAt <= after).toBe(true);
	});

	it('resolves --since last using stored lastSyncAt from config', async () => {
		// Write a config with an existing lastSyncAt
		const configPath = join(cwd, '.beacon', 'config.json');
		const storedTimestamp = '2024-06-15T12:00:00.000Z';
		writeFileSync(configPath, JSON.stringify({ lastSyncAt: storedTimestamp }));

		const envelope = createEnvelope([]);
		const mockFetch = createMockFetch(envelope);

		await runPull({
			cwd,
			from: 'https://staging.example.com',
			since: 'last',
			db,
			fetch: mockFetch,
			console: con,
		});

		const calledUrl = mockFetch.mock.calls[0]![0] as string;
		const url = new URL(calledUrl);
		expect(url.searchParams.get('since')).toBe(storedTimestamp);
	});

	it('exits with error on 401 response', async () => {
		const mockFetch = createErrorFetch(401, 'Unauthorized');

		await expect(
			runPull({
				cwd,
				from: 'https://staging.example.com',
				db,
				fetch: mockFetch,
				console: con,
			}),
		).rejects.toThrow('process.exit');

		expect(mockExit).toHaveBeenCalledWith(1);
		const errors = con.error.mock.calls.map((c) => c[0]).join('\n');
		expect(errors).toContain('Authentication failed');
	});

	it('exits with error on 500 response', async () => {
		const mockFetch = createErrorFetch(500, 'Internal Server Error');

		await expect(
			runPull({
				cwd,
				from: 'https://staging.example.com',
				db,
				fetch: mockFetch,
				console: con,
			}),
		).rejects.toThrow('process.exit');

		expect(mockExit).toHaveBeenCalledWith(1);
		const errors = con.error.mock.calls.map((c) => c[0]).join('\n');
		expect(errors).toContain('500');
	});

	it('handles empty export gracefully', async () => {
		const envelope = createEnvelope([]);
		const mockFetch = createMockFetch(envelope);

		await runPull({
			cwd,
			from: 'https://staging.example.com',
			db,
			fetch: mockFetch,
			console: con,
		});

		const output = con.log.mock.calls.map((c) => c[0]).join('\n');
		expect(output).toContain('No tasks to import.');

		// No tasks should exist in the database
		const rows = await query(db, 'SELECT * FROM tasks');
		expect(rows).toHaveLength(0);
	});
});
