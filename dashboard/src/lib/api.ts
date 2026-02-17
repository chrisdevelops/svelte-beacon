import type { TaskDetail, TaskListResponse, TaskUpdateInput, AgentState, AdminNote, BulkUpdateResponse, BulkDeleteResponse } from './types.js';

const BASE = '/__beacon/api';

class APIError extends Error {
	status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = 'APIError';
		this.status = status;
	}
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
	const res = await fetch(`${BASE}${path}`, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			...options.headers,
		},
		credentials: 'same-origin',
	});

	if (res.status === 401) {
		window.location.href = '/__beacon/login';
		throw new APIError(401, 'Unauthorized');
	}

	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new APIError(res.status, (body as { error?: string }).error ?? 'Request failed');
	}

	return res.json() as T;
}

function toQuery(params?: Record<string, string | number | undefined>): string {
	if (!params) return '';
	const entries = Object.entries(params).filter(([, v]) => v !== undefined);
	return new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

export const api = {
	// Tasks
	getTasks: (params?: Record<string, string | number | undefined>): Promise<TaskListResponse> =>
		request<TaskListResponse>(`/tasks?${toQuery(params)}`),
	getTask: (id: string): Promise<TaskDetail> =>
		request<TaskDetail>(`/tasks/${id}`),
	updateTask: (id: string, data: TaskUpdateInput): Promise<TaskDetail> =>
		request<TaskDetail>(`/tasks/${id}`, {
			method: 'PATCH',
			body: JSON.stringify(data),
		}),
	deleteTask: (id: string): Promise<void> =>
		request<void>(`/tasks/${id}`, { method: 'DELETE' }),

	// Config
	getConfig: () => request<unknown>('/config'),

	// AI
	startAI: (taskId: string): Promise<AgentState> =>
		request<AgentState>(`/ai/start/${taskId}`, { method: 'POST' }),
	stopAI: (taskId: string): Promise<AgentState> =>
		request<AgentState>(`/ai/stop/${taskId}`, { method: 'POST' }),
	unblockAI: (taskId: string, answer: string): Promise<AgentState> =>
		request<AgentState>(`/ai/unblock/${taskId}`, {
			method: 'POST',
			body: JSON.stringify({ answer }),
		}),

	// Notes
	addNote: (taskId: string, content: string): Promise<AdminNote> =>
		request<AdminNote>(`/tasks/${taskId}/notes`, {
			method: 'POST',
			body: JSON.stringify({ content }),
		}),

	// Bulk actions
	bulkUpdateStatus: (ids: string[], status: string): Promise<BulkUpdateResponse> =>
		request<BulkUpdateResponse>('/tasks/bulk-update', {
			method: 'POST',
			body: JSON.stringify({ ids, status }),
		}),
	bulkDeleteTasks: (ids: string[]): Promise<BulkDeleteResponse> =>
		request<BulkDeleteResponse>('/tasks/bulk-delete', {
			method: 'POST',
			body: JSON.stringify({ ids }),
		}),

	// Auth
	requestMagicLink: (email: string): Promise<void> =>
		request<void>('/auth/magic-link', {
			method: 'POST',
			body: JSON.stringify({ email }),
		}),
	getSession: (): Promise<{ authenticated: boolean; email?: string; isAdmin?: boolean }> =>
		request<{ authenticated: boolean; email?: string; isAdmin?: boolean }>('/auth/session'),
	logout: (): Promise<void> =>
		request<void>('/auth/logout', { method: 'POST' }),
};

export { APIError };
