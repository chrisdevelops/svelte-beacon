import type {
	TaskType,
	Priority,
	Position,
	WidgetConfig,
	SubmitResult,
	ViewState,
	AIAssistResult,
	AIAssistState,
} from './types.js';
import { DEFAULT_CONFIG } from './types.js';

export interface WidgetState {
	// View state
	readonly view: ViewState;
	readonly isOpen: boolean;

	// Config
	readonly config: WidgetConfig;
	readonly position: Position;

	// Form fields
	type: TaskType;
	priority: Priority;
	description: string;
	email: string;

	// Screenshot state
	readonly screenshot: Blob | null;
	readonly screenshotUrl: string | null;

	// Element selector state
	readonly selectedElement: string | null;
	readonly selectingElement: boolean;

	// Submission state
	readonly submitting: boolean;
	readonly lastResult: SubmitResult | null;

	// AI assist state
	readonly aiAssistState: AIAssistState;
	readonly aiSuggestion: AIAssistResult | null;
	readonly aiError: string | null;

	// Actions
	open(): void;
	close(): void;
	reset(): void;
	setSubmitting(value: boolean): void;
	setResult(result: SubmitResult): void;
	setConfig(config: WidgetConfig): void;
	setScreenshot(blob: Blob): void;
	clearScreenshot(): void;
	startElementSelection(): void;
	finishElementSelection(selector: string): void;
	cancelElementSelection(): void;

	// AI assist actions
	setAILoading(): void;
	setAISuggestion(result: AIAssistResult): void;
	setAIError(error: string): void;
	clearAISuggestion(): void;
	acceptAISuggestion(): void;
}

export interface WidgetStateOptions {
	position?: Position;
	screenshot?: boolean;
	elementSelector?: boolean;
	aiAssist?: boolean;
	requireEmail?: boolean;
}

export function createWidgetState(options: WidgetStateOptions = {}): WidgetState {
	let view = $state<ViewState>('idle');
	let config = $state<WidgetConfig>({ ...DEFAULT_CONFIG });
	let type = $state<TaskType>('bug');
	let priority = $state<Priority>('medium');
	let description = $state('');
	let email = $state('');
	let submitting = $state(false);
	let lastResult = $state<SubmitResult | null>(null);
	let screenshot = $state<Blob | null>(null);
	let screenshotUrl = $state<string | null>(null);
	let selectedElement = $state<string | null>(null);
	let selectingElement = $state(false);
	let aiAssistState = $state<AIAssistState>('idle');
	let aiSuggestion = $state<AIAssistResult | null>(null);
	let aiError = $state<string | null>(null);

	const effectiveConfig = $derived<WidgetConfig>({
		screenshot: options.screenshot ?? config.screenshot,
		elementSelector: options.elementSelector ?? config.elementSelector,
		aiAssist: options.aiAssist ?? config.aiAssist,
		requireEmail: options.requireEmail ?? config.requireEmail,
		position: options.position ?? config.position,
	});

	function revokeScreenshotUrl(): void {
		if (screenshotUrl) {
			URL.revokeObjectURL(screenshotUrl);
			screenshotUrl = null;
		}
	}

	function clearScreenshotState(): void {
		revokeScreenshotUrl();
		screenshot = null;
		selectedElement = null;
		selectingElement = false;
	}

	function clearAIState(): void {
		aiAssistState = 'idle';
		aiSuggestion = null;
		aiError = null;
	}

	return {
		get view() { return view; },
		get isOpen() { return view !== 'idle'; },

		get config() { return effectiveConfig; },
		get position() { return effectiveConfig.position; },

		get type() { return type; },
		set type(v: TaskType) { type = v; },

		get priority() { return priority; },
		set priority(v: Priority) { priority = v; },

		get description() { return description; },
		set description(v: string) { description = v; },

		get email() { return email; },
		set email(v: string) { email = v; },

		get screenshot() { return screenshot; },
		get screenshotUrl() { return screenshotUrl; },

		get selectedElement() { return selectedElement; },
		get selectingElement() { return selectingElement; },

		get submitting() { return submitting; },
		get lastResult() { return lastResult; },

		open() {
			if (view === 'idle') {
				view = 'form';
			}
		},

		close() {
			view = 'idle';
			submitting = false;
			lastResult = null;
			clearScreenshotState();
			clearAIState();
		},

		reset() {
			type = 'bug';
			priority = 'medium';
			description = '';
			email = '';
			submitting = false;
			lastResult = null;
			view = 'idle';
			clearScreenshotState();
			clearAIState();
		},

		setSubmitting(value: boolean) {
			submitting = value;
		},

		setResult(result: SubmitResult) {
			submitting = false;
			lastResult = result;
			view = result.ok ? 'success' : 'error';
		},

		setConfig(c: WidgetConfig) {
			config = c;
		},

		setScreenshot(blob: Blob) {
			revokeScreenshotUrl();
			screenshot = blob;
			screenshotUrl = URL.createObjectURL(blob);
		},

		clearScreenshot() {
			revokeScreenshotUrl();
			screenshot = null;
		},

		startElementSelection() {
			selectingElement = true;
		},

		finishElementSelection(selector: string) {
			selectedElement = selector;
			selectingElement = false;
		},

		cancelElementSelection() {
			selectingElement = false;
		},

		get aiAssistState() { return aiAssistState; },
		get aiSuggestion() { return aiSuggestion; },
		get aiError() { return aiError; },

		setAILoading() {
			aiAssistState = 'loading';
			aiSuggestion = null;
			aiError = null;
		},

		setAISuggestion(result: AIAssistResult) {
			aiAssistState = 'ready';
			aiSuggestion = result;
			aiError = null;
		},

		setAIError(error: string) {
			aiAssistState = 'error';
			aiSuggestion = null;
			aiError = error;
		},

		clearAISuggestion() {
			clearAIState();
		},

		acceptAISuggestion() {
			if (aiSuggestion) {
				description = aiSuggestion.improved_description;
				type = aiSuggestion.suggested_type;
				priority = aiSuggestion.suggested_priority;
				clearAIState();
			}
		},
	};
}
