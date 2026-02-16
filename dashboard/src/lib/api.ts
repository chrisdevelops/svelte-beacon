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
	getTasks: (params?: Record<string, string | number | undefined>) =>
		request<unknown>(`/tasks?${toQuery(params)}`),
	getTask: (id: string) => request<unknown>(`/tasks/${id}`),
	updateTask: (id: string, data: Record<string, unknown>) =>
		request<unknown>(`/tasks/${id}`, {
			method: 'PATCH',
			body: JSON.stringify(data),
		}),
	deleteTask: (id: string) =>
		request<void>(`/tasks/${id}`, { method: 'DELETE' }),

	// Config
	getConfig: () => request<unknown>('/config'),

	// AI
	startAI: (taskId: string) =>
		request<void>(`/ai/start/${taskId}`, { method: 'POST' }),
	stopAI: (taskId: string) =>
		request<void>(`/ai/stop/${taskId}`, { method: 'POST' }),
	unblockAI: (taskId: string, answer: string) =>
		request<void>(`/ai/unblock/${taskId}`, {
			method: 'POST',
			body: JSON.stringify({ answer }),
		}),

	// Notes
	addNote: (taskId: string, content: string) =>
		request<unknown>(`/tasks/${taskId}/notes`, {
			method: 'POST',
			body: JSON.stringify({ content }),
		}),

	// Auth
	requestMagicLink: (email: string) =>
		request<void>('/auth/magic-link', {
			method: 'POST',
			body: JSON.stringify({ email }),
		}),
};
