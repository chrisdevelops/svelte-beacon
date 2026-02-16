export const TASK_TYPES = [
	'bug', 'feature', 'content', 'accessibility', 'performance', 'other',
] as const;

export const PRIORITY_LEVELS = [
	'low', 'medium', 'high', 'critical',
] as const;

export const TASK_STATUSES = [
	'new', 'backlog', 'ai_working', 'blocked', 'needs_review', 'done', 'closed',
] as const;

export type TaskType = typeof TASK_TYPES[number];
export type Priority = typeof PRIORITY_LEVELS[number];
export type TaskStatus = typeof TASK_STATUSES[number];

export const VALID_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
	new: ['backlog', 'closed'],
	backlog: ['ai_working', 'closed'],
	ai_working: ['blocked', 'needs_review', 'backlog'],
	blocked: ['ai_working', 'backlog'],
	needs_review: ['done', 'backlog', 'ai_working'],
	done: ['closed', 'backlog'],
	closed: ['backlog'],
};
