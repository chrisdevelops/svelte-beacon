/**
 * Widget-local type definitions.
 * These are independent copies — the widget cannot import from src/server/.
 */

export type TaskType = 'bug' | 'feature' | 'content' | 'accessibility' | 'performance' | 'other';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type Position = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export const TASK_TYPES: readonly TaskType[] = [
	'bug', 'feature', 'content', 'accessibility', 'performance', 'other',
] as const;

export const PRIORITY_LEVELS: readonly Priority[] = [
	'low', 'medium', 'high', 'critical',
] as const;

export interface WidgetConfig {
	screenshot: boolean;
	elementSelector: boolean;
	aiAssist: boolean;
	requireEmail: boolean;
	position: Position;
}

export interface FeedbackPayload {
	type: TaskType;
	priority: Priority;
	description: string;
	route: string | null;
	element_selector: string | null;
	metadata: string | null;
	email: string | null;
}

export type SubmitResult =
	| { ok: true; data: { id: string; public_id: number } }
	| { ok: false; error: string; fields?: Record<string, string> };

export type ViewState = 'idle' | 'form' | 'success' | 'error';

export const DEFAULT_CONFIG: WidgetConfig = {
	screenshot: false,
	elementSelector: false,
	aiAssist: false,
	requireEmail: false,
	position: 'bottom-right',
};

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

export interface AIAssistResult {
	improved_description: string;
	suggested_type: TaskType;
	suggested_priority: Priority;
	reasoning: string;
}

export type AIAssistState = 'idle' | 'loading' | 'ready' | 'error';
