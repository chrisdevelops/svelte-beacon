export interface AssistRequest {
	description: string;
	type: string;
	priority: string;
	route?: string | null;
	element_selector?: string | null;
	screenshot_available?: boolean;
}

export interface AssistPrompt {
	system: string;
	user: string;
}

const VALID_TYPES = ['bug', 'feature', 'content', 'accessibility', 'performance', 'other'] as const;
const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

export function buildAssistPrompt(request: AssistRequest): AssistPrompt {
	const system = `You are a feedback assistant helping users improve their descriptions for a software feedback tool.

Given a user's rough description, their selected type and priority, and optional context about the page/element, return a JSON object with these exact keys:

- "improved_description": A clearer, more actionable version of the user's description. Keep the meaning. Fix grammar, add structure, and make it specific enough for a developer to act on. Do not invent details the user didn't mention.
- "suggested_type": One of: ${VALID_TYPES.join(', ')}
- "suggested_priority": One of: ${VALID_PRIORITIES.join(', ')}
- "reasoning": A brief (1-2 sentence) explanation of what you changed and why.

Return ONLY raw JSON. No markdown fences, no explanation outside the JSON.`;

	const parts: string[] = [
		`Description: ${request.description}`,
		`Current type: ${request.type}`,
		`Current priority: ${request.priority}`,
	];

	if (request.route) {
		parts.push(`Page route: ${request.route}`);
	}
	if (request.element_selector) {
		parts.push(`Selected element: ${request.element_selector}`);
	}
	if (request.screenshot_available) {
		parts.push('A screenshot was also captured (not shown here).');
	}

	return {
		system,
		user: parts.join('\n'),
	};
}
