export interface AssistResponse {
	improved_description: string;
	suggested_type: string;
	suggested_priority: string;
	reasoning: string;
}

export class AnthropicAPIError extends Error {
	readonly statusCode: number;
	constructor(message: string, statusCode: number) {
		super(message);
		this.name = 'AnthropicAPIError';
		this.statusCode = statusCode;
	}
}

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 1024;
const ANTHROPIC_VERSION = '2023-06-01';

const VALID_TYPES = ['bug', 'feature', 'content', 'accessibility', 'performance', 'other'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'];

export async function callAnthropicAssist(
	apiKey: string,
	system: string,
	userMessage: string,
): Promise<AssistResponse> {
	const res = await fetch(ANTHROPIC_API_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': apiKey,
			'anthropic-version': ANTHROPIC_VERSION,
		},
		body: JSON.stringify({
			model: MODEL,
			max_tokens: MAX_TOKENS,
			system,
			messages: [{ role: 'user', content: userMessage }],
		}),
	});

	if (!res.ok) {
		const body = await res.text();
		throw new AnthropicAPIError(
			`Anthropic API error: ${res.status} ${body}`,
			res.status,
		);
	}

	const data = (await res.json()) as { content: Array<{ type: string; text: string }> };
	const textBlock = data.content.find((b) => b.type === 'text');
	if (!textBlock) {
		throw new AnthropicAPIError('No text content in Anthropic response', 500);
	}

	return parseAssistResponse(textBlock.text);
}

export function parseAssistResponse(text: string): AssistResponse {
	// Strip markdown code fences if present
	let cleaned = text.trim();
	if (cleaned.startsWith('```')) {
		cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
	}

	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(cleaned) as Record<string, unknown>;
	} catch {
		return {
			improved_description: text.trim(),
			suggested_type: 'other',
			suggested_priority: 'medium',
			reasoning: 'Could not parse AI response as JSON.',
		};
	}

	const improved_description = typeof parsed['improved_description'] === 'string'
		? parsed['improved_description']
		: text.trim();

	const suggested_type = typeof parsed['suggested_type'] === 'string' && VALID_TYPES.includes(parsed['suggested_type'])
		? parsed['suggested_type']
		: 'other';

	const suggested_priority = typeof parsed['suggested_priority'] === 'string' && VALID_PRIORITIES.includes(parsed['suggested_priority'])
		? parsed['suggested_priority']
		: 'medium';

	const reasoning = typeof parsed['reasoning'] === 'string'
		? parsed['reasoning']
		: '';

	return { improved_description, suggested_type, suggested_priority, reasoning };
}
