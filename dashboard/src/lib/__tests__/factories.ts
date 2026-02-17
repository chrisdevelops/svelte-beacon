import type { TaskListItem, TaskDetail, Activity, Attachment, AgentState, AILogEntry, AdminNote } from '$lib/types.js';

let counter = 0;

export function createMockTaskListItem(overrides: Partial<TaskListItem> = {}): TaskListItem {
	counter++;
	return {
		id: `task-${counter}`,
		public_id: counter,
		type: 'bug',
		priority: 'medium',
		status: 'new',
		description: `Test task ${counter}`,
		route: '/test',
		origin: 'widget',
		remote_id: null,
		ai_branch: null,
		ai_pr_url: null,
		ai_blocked_reason: null,
		user_email: null,
		created_at: '2025-01-15T10:00:00Z',
		updated_at: '2025-01-15T10:00:00Z',
		attachment_count: 0,
		...overrides,
	};
}

export function createMockActivity(overrides: Partial<Activity> = {}): Activity {
	counter++;
	return {
		id: `activity-${counter}`,
		task_id: 'task-1',
		actor: 'user',
		action: 'status_change',
		old_value: 'new',
		new_value: 'backlog',
		created_at: '2025-01-15T12:00:00Z',
		...overrides,
	};
}

export function createMockAttachment(overrides: Partial<Attachment> = {}): Attachment {
	counter++;
	return {
		id: `attachment-${counter}`,
		task_id: 'task-1',
		type: 'screenshot',
		filename: 'screenshot.png',
		path: '/uploads/screenshot.png',
		mime_type: 'image/png',
		size_bytes: 1024,
		created_at: '2025-01-15T10:00:00Z',
		url: `/__beacon/api/attachments/attachment-${counter}`,
		...overrides,
	};
}

export function createMockTaskDetail(overrides: Partial<TaskDetail> = {}): TaskDetail {
	const listItem = createMockTaskListItem(overrides);
	return {
		...listItem,
		metadata: null,
		element_selector: null,
		attachments: [],
		activity: [],
		admin_notes: [],
		...overrides,
	};
}

export function createMockAgentState(overrides: Partial<AgentState> = {}): AgentState {
	return {
		status: 'idle',
		taskId: null,
		phase: null,
		startedAt: null,
		lastMessage: null,
		blockedQuestion: null,
		...overrides,
	};
}

export function createMockAILogEntry(overrides: Partial<AILogEntry> = {}): AILogEntry {
	counter++;
	return {
		id: `log-${counter}`,
		task_id: 'task-1',
		level: 'info',
		message: `Log message ${counter}`,
		metadata: null,
		created_at: '2025-01-15T10:00:00Z',
		...overrides,
	};
}

export function createMockAdminNote(overrides: Partial<AdminNote> = {}): AdminNote {
	counter++;
	return {
		id: `note-${counter}`,
		task_id: 'task-1',
		content: `Admin note ${counter}`,
		author_email: 'admin@test.com',
		created_at: '2025-01-15T10:00:00Z',
		...overrides,
	};
}
