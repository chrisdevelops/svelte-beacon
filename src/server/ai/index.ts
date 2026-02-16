// AI integration entry point
// Layer 1 (Anthropic API proxy) and Layer 2 (Claude Code agent) are
// completely independent. They share no code.

// Layer 1 exports:
// export { handleAssist } from './layer1/assist.js';

// Layer 2 exports:
// export { startAgent, stopAgent, getActiveAgent } from './layer2/agent.js';
// export { handleSSEConnection } from './layer2/sse.js';
