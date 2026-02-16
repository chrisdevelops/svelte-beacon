import type { ResolvedConfig } from '../../src/server/config.js';
import type { CreateTaskInput } from '../../src/server/types.js';

let idCounter = 0;

export function createTaskData(overrides: Partial<CreateTaskInput> = {}): CreateTaskInput {
	idCounter++;
	return {
		type: 'bug',
		priority: 'medium',
		description: `Test task ${idCounter}`,
		route: '/test-page',
		...overrides,
	};
}

export function createSessionData(overrides: Record<string, unknown> = {}) {
	return {
		email: 'test@example.com',
		isAdmin: false,
		expiresInHours: 24,
		...overrides,
	};
}

export const defaultConfig: ResolvedConfig = {
	enabled: true,
	mode: 'development',
	database: 'file::memory:',
	requireAuth: false,
	adminEmails: ['admin@test.com'],
	widget: {
		screenshot: true,
		elementSelector: true,
		aiAssist: true,
		requireEmail: false,
		position: 'bottom-right',
	},
	ai: {
		maxDurationMinutes: 30,
		requireTestsForBugs: true,
		createPR: false,
	},
};
