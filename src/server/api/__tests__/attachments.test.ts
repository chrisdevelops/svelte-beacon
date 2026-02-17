import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Client } from '@libsql/client';
import { createTestDB } from '../../../../test/helpers.js';
import { createBeaconAPIEvent } from '../../../../test/mocks/request-event.js';
import { defaultConfig, createTaskData } from '../../../../test/mocks/factories.js';
import { handleGetAttachment } from '../attachments.js';
import { createTask } from '../../db/queries/tasks.js';
import { createAttachment } from '../../db/queries/attachments.js';

// Mock fs/promises
vi.mock('fs/promises', async (importOriginal) => ({
	...(await importOriginal<typeof import('fs/promises')>()),
	readFile: vi.fn(),
}));

let db: Client;

beforeEach(async () => {
	db = await createTestDB();
});

afterEach(() => {
	db.close();
	vi.restoreAllMocks();
});

describe('GET /attachments/:id', () => {
	it('returns 404 for non-existent attachment', async () => {
		const event = createBeaconAPIEvent('GET', '/attachments/nonexistent');

		const response = await handleGetAttachment(event, db, defaultConfig, { id: 'nonexistent' });

		expect(response.status).toBe(404);
		const body = await response.json();
		expect(body.error).toBe('Attachment not found');
	});

	it('returns 400 when id is missing', async () => {
		const event = createBeaconAPIEvent('GET', '/attachments/');

		const response = await handleGetAttachment(event, db, defaultConfig, {});

		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toBe('Missing attachment ID');
	});

	it('serves attachment file with correct headers', async () => {
		const { readFile } = await import('fs/promises');
		const mockReadFile = vi.mocked(readFile);
		mockReadFile.mockResolvedValue(Buffer.from('fake-png-data'));

		const task = await createTask(db, createTaskData());
		const attachment = await createAttachment(db, {
			task_id: task.id,
			type: 'screenshot',
			filename: 'capture.png',
			path: '.beacon/storage/test/capture.png',
			mime_type: 'image/png',
			size_bytes: 13,
		});

		const event = createBeaconAPIEvent('GET', `/attachments/${attachment.id}`);

		const response = await handleGetAttachment(event, db, defaultConfig, { id: attachment.id });

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('image/png');
		expect(response.headers.get('Content-Disposition')).toBe('inline; filename="capture.png"');
		expect(response.headers.get('Cache-Control')).toBe('private, max-age=3600');

		const data = await response.arrayBuffer();
		expect(Buffer.from(data).toString()).toBe('fake-png-data');
	});

	it('returns 404 when file is missing from disk', async () => {
		const { readFile } = await import('fs/promises');
		const mockReadFile = vi.mocked(readFile);
		mockReadFile.mockRejectedValue(new Error('ENOENT'));

		const task = await createTask(db, createTaskData());
		const attachment = await createAttachment(db, {
			task_id: task.id,
			type: 'screenshot',
			filename: 'missing.png',
			path: '.beacon/storage/test/missing.png',
			mime_type: 'image/png',
			size_bytes: 100,
		});

		const event = createBeaconAPIEvent('GET', `/attachments/${attachment.id}`);

		const response = await handleGetAttachment(event, db, defaultConfig, { id: attachment.id });

		expect(response.status).toBe(404);
		const body = await response.json();
		expect(body.error).toBe('File not found on disk');
	});
});
