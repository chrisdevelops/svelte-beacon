/**
 * Layer 2: Claude Code Agent types.
 * These types are specific to the agent lifecycle and SSE streaming.
 * They do not import from Layer 1.
 */

export type AgentPhase =
	| 'starting'
	| 'analyzing'
	| 'planning'
	| 'implementing'
	| 'testing'
	| 'verifying'
	| 'committing';

export type AgentStatus = 'idle' | 'running' | 'blocked' | 'stopping' | 'completed' | 'failed';

export interface AgentState {
	status: AgentStatus;
	taskId: string | null;
	phase: AgentPhase | null;
	startedAt: string | null;
	lastMessage: string | null;
	blockedQuestion: string | null;
}

// --- Structured markers parsed from Claude Code output ---

export interface ProgressMarker {
	type: 'progress';
	phase: AgentPhase;
	message: string;
}

export interface BlockedMarker {
	type: 'blocked';
	question: string;
}

export interface CompleteMarker {
	type: 'complete';
	branch: string;
	prUrl: string | null;
	summary: string;
}

export interface ErrorMarker {
	type: 'error';
	message: string;
}

export type AgentMarker = ProgressMarker | BlockedMarker | CompleteMarker | ErrorMarker;

// --- Activity events (ephemeral, real-time only — not persisted to DB) ---

export interface ActivityEvent {
	type: 'activity';
	tool?: string;
	message: string;
}

/** Union of persistent markers and ephemeral activity events. */
export type AgentEvent = AgentMarker | ActivityEvent;

// --- SSE event types ---

export interface SSEProgressEvent {
	event: 'progress';
	data: {
		phase: AgentPhase;
		message: string;
		timestamp: string;
	};
}

export interface SSEBlockedEvent {
	event: 'blocked';
	data: {
		question: string;
		timestamp: string;
	};
}

export interface SSECompleteEvent {
	event: 'complete';
	data: {
		branch: string;
		prUrl: string | null;
		summary: string;
		timestamp: string;
	};
}

export interface SSEErrorEvent {
	event: 'error';
	data: {
		message: string;
		timestamp: string;
	};
}

export interface SSELogEvent {
	event: 'log';
	data: {
		level: string;
		message: string;
		timestamp: string;
	};
}

export interface SSEActivityEvent {
	event: 'activity';
	data: {
		tool?: string;
		message: string;
		timestamp: string;
	};
}

export type SSEEvent =
	| SSEProgressEvent
	| SSEBlockedEvent
	| SSECompleteEvent
	| SSEErrorEvent
	| SSELogEvent
	| SSEActivityEvent;

// --- Initial state constant ---

export const IDLE_STATE: AgentState = {
	status: 'idle',
	taskId: null,
	phase: null,
	startedAt: null,
	lastMessage: null,
	blockedQuestion: null,
};
