// AI integration entry point
// Layer 1 (Anthropic API proxy) and Layer 2 (Claude Code agent) are
// completely independent. They share no code.

// Layer 1 exports:
export { buildAssistPrompt } from './layer1/prompt.js';
export type { AssistRequest, AssistPrompt } from './layer1/prompt.js';
export { callAnthropicAssist, parseAssistResponse, AnthropicAPIError } from './layer1/client.js';
export type { AssistResponse } from './layer1/client.js';

// Layer 2 exports:
export { parseStreamLine, extractBeaconMarker } from './layer2/output-parser.js';
export type {
	AgentPhase,
	AgentStatus,
	AgentState,
	AgentMarker,
	ProgressMarker,
	BlockedMarker,
	CompleteMarker,
	ErrorMarker,
} from './layer2/types.js';
export {
	generateBranchName,
	createBranch,
	commitChanges,
	pushBranch,
	createPR,
	performGitOperations,
} from './layer2/git.js';
export { runVerification } from './layer2/verification.js';
export type { VerificationResult } from './layer2/verification.js';
export { generateProjectContext } from './layer2/context-generator.js';
export type { ProjectContext } from './layer2/context-generator.js';
export { buildAgentPrompt, generateBranchSlug } from './layer2/prompt-builder.js';
export type { PromptInput } from './layer2/prompt-builder.js';
export { startAgent, stopAgent, getActiveAgent, unblockAgent, isClaudeAvailable } from './layer2/agent.js';
export { handleSSEConnection, broadcastToSSEClients, createSSEStream, removeSSEConnection } from './layer2/sse.js';
