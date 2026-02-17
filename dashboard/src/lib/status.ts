import type { TaskStatus } from './types.js';

export const STATUS_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
	new: ['backlog', 'closed'],
	backlog: ['ai_working', 'closed'],
	ai_working: ['blocked', 'needs_review', 'backlog'],
	blocked: ['ai_working', 'backlog'],
	needs_review: ['done', 'backlog', 'ai_working'],
	done: ['closed', 'backlog'],
	closed: ['backlog'],
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
	new: 'New',
	backlog: 'Backlog',
	ai_working: 'AI Working',
	blocked: 'Blocked',
	needs_review: 'Needs Review',
	done: 'Done',
	closed: 'Closed',
};

export const STATUS_COLORS: Record<TaskStatus, string> = {
	new: '#6366f1',
	backlog: '#8b5cf6',
	ai_working: '#f59e0b',
	blocked: '#ef4444',
	needs_review: '#3b82f6',
	done: '#22c55e',
	closed: '#6b7280',
};

export const PRIORITY_COLORS: Record<string, string> = {
	critical: '#dc2626',
	high: '#f97316',
	medium: '#eab308',
	low: '#6b7280',
};

export function getValidTransitions(currentStatus: TaskStatus): readonly TaskStatus[] {
	return STATUS_TRANSITIONS[currentStatus] ?? [];
}
