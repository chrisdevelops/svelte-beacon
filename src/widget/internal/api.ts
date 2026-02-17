import type { WidgetConfig, FeedbackPayload, SubmitResult, AIAssistResult } from './types.js';

const API_BASE = '/__beacon/api';

/**
 * Fetch widget configuration from the server.
 * Throws on failure — caller catches and uses defaults.
 */
export async function fetchConfig(): Promise<WidgetConfig> {
	const res = await fetch(`${API_BASE}/config`);
	if (!res.ok) {
		throw new Error(`Config fetch failed: ${res.status}`);
	}
	const data = (await res.json()) as { widget: WidgetConfig };
	return data.widget;
}

/**
 * Submit feedback to the server as JSON.
 * Returns a discriminated union — never throws.
 */
export async function submitFeedback(payload: FeedbackPayload): Promise<SubmitResult> {
	try {
		const res = await fetch(`${API_BASE}/feedback`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});

		return parseSubmitResponse(res);
	} catch {
		return {
			ok: false,
			error: 'Network error. Please try again.',
		};
	}
}

/**
 * Submit feedback with optional screenshot as multipart FormData.
 * Falls back to JSON when no screenshot is provided.
 */
export async function submitFeedbackWithAttachments(
	payload: FeedbackPayload,
	screenshot: Blob | null,
): Promise<SubmitResult> {
	if (!screenshot) {
		return submitFeedback(payload);
	}

	try {
		const formData = new FormData();

		// Append all payload fields as strings
		formData.append('type', payload.type);
		formData.append('priority', payload.priority);
		formData.append('description', payload.description);
		if (payload.route) formData.append('route', payload.route);
		if (payload.element_selector) formData.append('element_selector', payload.element_selector);
		if (payload.metadata) formData.append('metadata', payload.metadata);
		if (payload.email) formData.append('email', payload.email);

		// Append screenshot file — do NOT set Content-Type (browser adds boundary)
		formData.append('screenshot', screenshot, 'screenshot.png');

		const res = await fetch(`${API_BASE}/feedback`, {
			method: 'POST',
			body: formData,
		});

		return parseSubmitResponse(res);
	} catch {
		return {
			ok: false,
			error: 'Network error. Please try again.',
		};
	}
}

async function parseSubmitResponse(res: Response): Promise<SubmitResult> {
	const body = (await res.json()) as Record<string, unknown>;

	if (res.ok) {
		return {
			ok: true,
			data: body as unknown as { id: string; public_id: number },
		};
	}

	return {
		ok: false,
		error: (body.error as string) ?? 'Submission failed',
		fields: body.fields as Record<string, string> | undefined,
	};
}

export interface AIAssistPayload {
	description: string;
	type: string;
	priority: string;
	route?: string | null;
	element_selector?: string | null;
}

export type AIAssistApiResult =
	| { ok: true; data: AIAssistResult }
	| { ok: false; error: string };

/**
 * Request AI-assisted description improvement.
 * Returns a discriminated union — never throws.
 */
export async function requestAIAssist(payload: AIAssistPayload): Promise<AIAssistApiResult> {
	try {
		const res = await fetch(`${API_BASE}/ai/assist`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});

		const body = (await res.json()) as Record<string, unknown>;

		if (res.ok) {
			return {
				ok: true,
				data: body as unknown as AIAssistResult,
			};
		}

		return {
			ok: false,
			error: (body.error as string) ?? 'AI assist failed',
		};
	} catch {
		return {
			ok: false,
			error: 'Network error. Please try again.',
		};
	}
}
