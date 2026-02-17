// Dashboard-local types — cannot import from src/server/
// These mirror the server types for use in the client-only SPA

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

export const TYPE_LABELS: Record<TaskType, string> = {
	bug: 'Bug',
	feature: 'Feature',
	content: 'Content',
	accessibility: 'Accessibility',
	performance: 'Performance',
	other: 'Other',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
	low: 'Low',
	medium: 'Medium',
	high: 'High',
	critical: 'Critical',
};

export interface TaskListItem {
	id: string;
	public_id: number;
	type: TaskType;
	priority: Priority;
	status: TaskStatus;
	description: string;
	route: string | null;
	origin: string;
	remote_id: string | null;
	ai_branch: string | null;
	ai_pr_url: string | null;
	ai_blocked_reason: string | null;
	user_email: string | null;
	created_at: string;
	updated_at: string;
	attachment_count: number;
}

export interface Attachment {
	id: string;
	task_id: string;
	type: string;
	filename: string;
	path: string;
	mime_type: string;
	size_bytes: number;
	created_at: string;
	url: string;
}

export interface Activity {
	id: string;
	task_id: string;
	actor: string;
	action: string;
	old_value: string | null;
	new_value: string | null;
	created_at: string;
}

export interface AdminNote {
	id: string;
	task_id: string;
	content: string;
	author_email: string | null;
	created_at: string;
}

export interface TaskDetail extends TaskListItem {
	metadata: Record<string, unknown> | null;
	element_selector: string | null;
	attachments: Attachment[];
	activity: Activity[];
	admin_notes: AdminNote[];
}

export interface Pagination {
	page: number;
	limit: number;
	total: number;
	totalPages: number;
}

export interface TaskListResponse {
	items: TaskListItem[];
	pagination: Pagination;
}

export interface TaskUpdateInput {
	status?: TaskStatus;
	type?: TaskType;
	priority?: Priority;
	description?: string;
}

export interface ListTasksParams {
	status?: string;
	type?: string;
	priority?: string;
	search?: string;
	sort?: string;
	order?: 'asc' | 'desc';
	page?: number;
	limit?: number;
}

export type AgentPhase = 'starting' | 'analyzing' | 'planning' | 'implementing' | 'testing' | 'verifying' | 'committing';
export type AgentStatus = 'idle' | 'running' | 'blocked' | 'stopping' | 'completed' | 'failed';

export interface AgentState {
	status: AgentStatus;
	taskId: string | null;
	phase: AgentPhase | null;
	startedAt: string | null;
	lastMessage: string | null;
	blockedQuestion: string | null;
}

export interface AILogEntry {
	id: string;
	task_id: string;
	level: string;
	message: string;
	metadata: Record<string, unknown> | null;
	created_at: string;
}

export interface BulkUpdateResponse {
	updated: number;
	skipped: number;
}

export interface BulkDeleteResponse {
	deleted: number;
}
