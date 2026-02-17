import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Client } from '@libsql/client';
import { createTestDB } from '../../../../test/helpers.js';
import { createTaskData } from '../../../../test/mocks/factories.js';
import { createTask } from './tasks.js';
import { createAILog, getAILogsByTaskId } from './ai-logs.js';

describe('ai-logs queries', () => {
	let db: Client;

	beforeEach(async () => {
		db = await createTestDB();
	});

	afterEach(() => {
		db.close();
	});

	describe('createAILog', () => {
		it('creates AI log with all fields including task_id and metadata', async () => {
			const task = await createTask(db, createTaskData());
			const metadata = { model: 'claude-3', tokens: 1500, duration_ms: 320 };

			const log = await createAILog(db, {
				task_id: task.id,
				level: 'info',
				message: 'AI analysis completed successfully',
				metadata,
			});

			expect(log.id).toBeDefined();
			expect(log.task_id).toBe(task.id);
			expect(log.level).toBe('info');
			expect(log.message).toBe('AI analysis completed successfully');
			expect(log.metadata).toEqual(metadata);
			expect(log.created_at).toBeDefined();
		});

		it('creates AI log with null task_id', async () => {
			const log = await createAILog(db, {
				level: 'info',
				message: 'Layer 1 widget assist before task creation',
			});

			expect(log.id).toBeDefined();
			expect(log.task_id).toBeNull();
			expect(log.level).toBe('info');
			expect(log.message).toBe('Layer 1 widget assist before task creation');
			expect(log.metadata).toBeNull();
		});

		it('creates AI log with null metadata', async () => {
			const task = await createTask(db, createTaskData());

			const log = await createAILog(db, {
				task_id: task.id,
				level: 'warn',
				message: 'AI response was slow',
				metadata: null,
			});

			expect(log.task_id).toBe(task.id);
			expect(log.level).toBe('warn');
			expect(log.metadata).toBeNull();
		});

		it('supports different log levels', async () => {
			const infoLog = await createAILog(db, {
				level: 'info',
				message: 'Info message',
			});

			const warnLog = await createAILog(db, {
				level: 'warn',
				message: 'Warning message',
			});

			const errorLog = await createAILog(db, {
				level: 'error',
				message: 'Error message',
			});

			expect(infoLog.level).toBe('info');
			expect(warnLog.level).toBe('warn');
			expect(errorLog.level).toBe('error');
		});

		it('stores and retrieves metadata as parsed JSON object', async () => {
			const metadata = {
				model: 'claude-3',
				tokens: 2500,
				nested: { key: 'value', arr: [1, 2, 3] },
			};

			const log = await createAILog(db, {
				level: 'info',
				message: 'Complex metadata test',
				metadata,
			});

			expect(log.metadata).toEqual(metadata);
			expect(typeof log.metadata).toBe('object');
			expect(log.metadata).not.toBeNull();
			expect((log.metadata as Record<string, unknown>)['model']).toBe('claude-3');
			expect((log.metadata as Record<string, unknown>)['tokens']).toBe(2500);
			expect((log.metadata as Record<string, unknown>)['nested']).toEqual({
				key: 'value',
				arr: [1, 2, 3],
			});
		});

		it('supports layer 2 log levels', async () => {
			const task = await createTask(db, createTaskData());

			const progressLog = await createAILog(db, {
				task_id: task.id,
				level: 'progress',
				message: 'Implementing feature',
			});
			const blockedLog = await createAILog(db, {
				task_id: task.id,
				level: 'blocked',
				message: 'Need clarification',
			});
			const completeLog = await createAILog(db, {
				task_id: task.id,
				level: 'complete',
				message: 'Task finished',
			});

			expect(progressLog.level).toBe('progress');
			expect(blockedLog.level).toBe('blocked');
			expect(completeLog.level).toBe('complete');
		});
	});

	describe('getAILogsByTaskId', () => {
		it('returns logs for a specific task ordered by created_at ASC', async () => {
			const task = await createTask(db, createTaskData());

			await createAILog(db, { task_id: task.id, level: 'info', message: 'First' });
			await createAILog(db, { task_id: task.id, level: 'progress', message: 'Second' });
			await createAILog(db, { task_id: task.id, level: 'complete', message: 'Third' });

			const logs = await getAILogsByTaskId(db, task.id);

			expect(logs).toHaveLength(3);
			expect(logs[0]!.message).toBe('First');
			expect(logs[1]!.message).toBe('Second');
			expect(logs[2]!.message).toBe('Third');
		});

		it('returns empty array when no logs exist for task', async () => {
			const logs = await getAILogsByTaskId(db, 'nonexistent-task-id');
			expect(logs).toHaveLength(0);
		});

		it('filters logs with since option', async () => {
			const task = await createTask(db, createTaskData());

			await createAILog(db, { task_id: task.id, level: 'info', message: 'Before' });
			// Manually set the first log to the past so the second is strictly after
			await db.execute({
				sql: "UPDATE ai_logs SET created_at = '2020-01-01 00:00:00' WHERE task_id = ? AND message = 'Before'",
				args: [task.id],
			});
			await createAILog(db, { task_id: task.id, level: 'info', message: 'After' });

			const logs = await getAILogsByTaskId(db, task.id, { since: '2020-01-01 00:00:00' });

			expect(logs).toHaveLength(1);
			expect(logs[0]!.message).toBe('After');
		});

		it('limits results with limit option', async () => {
			const task = await createTask(db, createTaskData());

			await createAILog(db, { task_id: task.id, level: 'info', message: 'One' });
			await createAILog(db, { task_id: task.id, level: 'info', message: 'Two' });
			await createAILog(db, { task_id: task.id, level: 'info', message: 'Three' });

			const logs = await getAILogsByTaskId(db, task.id, { limit: 2 });

			expect(logs).toHaveLength(2);
			expect(logs[0]!.message).toBe('One');
			expect(logs[1]!.message).toBe('Two');
		});
	});
});
