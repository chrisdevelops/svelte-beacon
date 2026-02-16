import type { TaskType, Priority, TaskStatus } from './constants.js';

export interface Task {
	id: string;
	public_id: number;
	type: TaskType;
	priority: Priority;
	status: TaskStatus;
	description: string;
	route: string | null;
	element_selector: string | null;
	metadata: Record<string, unknown> | null;
	origin: string;
	remote_id: string | null;
	ai_branch: string | null;
	ai_pr_url: string | null;
	ai_blocked_reason: string | null;
	user_email: string | null;
	created_at: string;
	updated_at: string;
}

export interface TaskListItem extends Omit<Task, 'metadata' | 'element_selector'> {
	attachment_count: number;
}

export interface CreateTaskInput {
	type: TaskType;
	priority: Priority;
	description: string;
	route?: string | null;
	element_selector?: string | null;
	metadata?: string | null;
	user_email?: string | null;
	origin?: string;
	remote_id?: string | null;
}

export interface ListTasksParams {
	status?: string | null;
	type?: string | null;
	priority?: string | null;
	search?: string | null;
	sort?: string;
	order?: 'asc' | 'desc';
	page?: number;
	limit?: number;
}

export interface PaginatedTasks {
	items: TaskListItem[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
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
}

export interface CreateAttachmentInput {
	task_id: string;
	type: string;
	filename: string;
	path: string;
	mime_type: string;
	size_bytes: number;
}
