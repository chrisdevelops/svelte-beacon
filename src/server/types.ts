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

export interface UpdateTaskInput {
	status?: TaskStatus;
	type?: TaskType;
	priority?: Priority;
	description?: string;
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

export interface CreateActivityInput {
	task_id: string;
	actor: string;
	action: string;
	old_value?: string | null;
	new_value?: string | null;
}

export interface Session {
	id: string;
	email: string;
	is_admin: boolean;
	expires_at: string;
	created_at: string;
}

export interface CreateSessionInput {
	email: string;
	isAdmin: boolean;
	expiresInHours?: number;
}

export interface MagicLink {
	id: string;
	email: string;
	token: string;
	used: boolean;
	expires_at: string;
	created_at: string;
}

export interface AILog {
	id: string;
	task_id: string | null;
	level: string;
	message: string;
	metadata: Record<string, unknown> | null;
	created_at: string;
}

export interface CreateAILogInput {
	task_id?: string | null;
	level: 'info' | 'warn' | 'error' | 'progress' | 'blocked' | 'complete' | 'activity';
	message: string;
	metadata?: Record<string, unknown> | null;
}

export interface UpdateTaskAIInput {
	ai_branch?: string | null;
	ai_pr_url?: string | null;
	ai_blocked_reason?: string | null;
}

export interface AdminNote {
	id: string;
	task_id: string;
	content: string;
	author_email: string | null;
	created_at: string;
}

export interface CreateAdminNoteInput {
	task_id: string;
	content: string;
	author_email?: string | null;
}

export interface ExportedAdminNote {
	content: string;
	author_email: string | null;
}

export interface ExportedAttachment {
	filename: string;
	type: string;
	mime_type: string;
	data: string;
}

export interface ExportedTask {
	public_id: number;
	type: string;
	priority: string;
	status: string;
	description: string;
	route: string | null;
	element_selector: string | null;
	metadata: Record<string, unknown> | null;
	user_email: string | null;
	created_at: string;
	updated_at: string;
	admin_notes: ExportedAdminNote[];
	attachments: ExportedAttachment[];
}

export interface ExportEnvelope {
	version: 1;
	exported_at: string;
	source: string;
	tasks: ExportedTask[];
}

export interface ExportTasksParams {
	status?: string;
	since?: string;
	public_id?: number;
}

export interface ImportTaskInput {
	origin: string;
	remote_id: string;
	type: string;
	priority: string;
	status: string;
	description: string;
	route?: string | null;
	element_selector?: string | null;
	metadata?: string | null;
	user_email?: string | null;
}
