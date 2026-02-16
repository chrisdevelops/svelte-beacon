import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Client } from '@libsql/client';
import { createTestDB } from '../../../../test/helpers.js';
import { createTaskData } from '../../../../test/mocks/factories.js';
import { createTask } from './tasks.js';
import { createAttachment, getAttachmentsByTaskId } from './attachments.js';

describe('attachment queries', () => {
	let db: Client;

	beforeEach(async () => {
		db = await createTestDB();
	});

	afterEach(() => {
		db.close();
	});

	describe('createAttachment', () => {
		it('creates record with generated id', async () => {
			const task = await createTask(db, createTaskData());

			const attachment = await createAttachment(db, {
				task_id: task.id,
				type: 'screenshot',
				filename: 'capture.png',
				path: 'screenshots/capture.png',
				mime_type: 'image/png',
				size_bytes: 4096,
			});

			expect(attachment.id).toBeDefined();
			expect(attachment.id.length).toBeGreaterThan(0);
			expect(attachment.task_id).toBe(task.id);
			expect(attachment.type).toBe('screenshot');
			expect(attachment.filename).toBe('capture.png');
			expect(attachment.path).toBe('screenshots/capture.png');
			expect(attachment.mime_type).toBe('image/png');
			expect(attachment.size_bytes).toBe(4096);
			expect(attachment.created_at).toBeDefined();
		});
	});

	describe('getAttachmentsByTaskId', () => {
		it('returns empty array for task with no attachments', async () => {
			const task = await createTask(db, createTaskData());

			const attachments = await getAttachmentsByTaskId(db, task.id);

			expect(attachments).toEqual([]);
		});

		it('returns all attachments for a task', async () => {
			const task = await createTask(db, createTaskData());

			await createAttachment(db, {
				task_id: task.id,
				type: 'screenshot',
				filename: 'first.png',
				path: 'screenshots/first.png',
				mime_type: 'image/png',
				size_bytes: 1024,
			});
			await createAttachment(db, {
				task_id: task.id,
				type: 'file',
				filename: 'log.txt',
				path: 'files/log.txt',
				mime_type: 'text/plain',
				size_bytes: 512,
			});

			const attachments = await getAttachmentsByTaskId(db, task.id);

			expect(attachments).toHaveLength(2);
			expect(attachments[0]!.filename).toBe('first.png');
			expect(attachments[1]!.filename).toBe('log.txt');
		});
	});
});
