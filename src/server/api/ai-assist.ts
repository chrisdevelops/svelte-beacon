import type { Client } from '@libsql/client';
import type { ResolvedConfig } from '../config.js';
import { route, json } from '../router.js';
import { TASK_TYPES, PRIORITY_LEVELS } from '../constants.js';
import {
	requiredString,
	requiredEnum,
	optionalString,
	collectErrors,
} from './validate.js';
import { buildAssistPrompt } from '../ai/layer1/prompt.js';
import { callAnthropicAssist, AnthropicAPIError } from '../ai/layer1/client.js';
import { createAILog } from '../db/queries/ai-logs.js';

type RequestEvent = Parameters<import('@sveltejs/kit').Handle>[0]['event'];

export async function handleAssist(
	event: RequestEvent,
	db: Client,
	config: ResolvedConfig,
): Promise<Response> {
	// Check if API key is configured
	if (!config.ai.anthropicApiKey) {
		return json({ error: 'AI assist is not configured' }, { status: 503 });
	}

	// Parse JSON body
	let body: Record<string, unknown>;
	try {
		body = (await event.request.json()) as Record<string, unknown>;
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	// Validate
	const validation = collectErrors({
		description: requiredString(body.description, 'description', { maxLength: 10000 }),
		type: requiredEnum(body.type, 'type', TASK_TYPES),
		priority: requiredEnum(body.priority, 'priority', PRIORITY_LEVELS),
		route: optionalString(body.route, 'route', { maxLength: 2000 }),
		element_selector: optionalString(body.element_selector, 'element_selector', { maxLength: 1000 }),
	});

	if (!validation.valid) {
		return json({ error: 'Validation failed', fields: validation.errors }, { status: 400 });
	}

	const { values } = validation;

	try {
		const prompt = buildAssistPrompt({
			description: values.description as string,
			type: values.type as string,
			priority: values.priority as string,
			route: values.route as string | null,
			element_selector: values.element_selector as string | null,
		});

		const result = await callAnthropicAssist(
			config.ai.anthropicApiKey,
			prompt.system,
			prompt.user,
		);

		// Fire-and-forget logging — never fails the response
		createAILog(db, {
			level: 'info',
			message: 'AI assist completed',
			metadata: {
				original_description: values.description,
				improved_description: result.improved_description,
				suggested_type: result.suggested_type,
				suggested_priority: result.suggested_priority,
			},
		}).catch(() => {});

		return json(result);
	} catch (err) {
		// Fire-and-forget error logging
		createAILog(db, {
			level: 'error',
			message: err instanceof Error ? err.message : 'AI assist failed',
			metadata: { description: values.description },
		}).catch(() => {});

		if (err instanceof AnthropicAPIError) {
			if (err.statusCode === 429) {
				return json({ error: 'Rate limited. Please try again shortly.' }, { status: 429 });
			}
			return json({ error: 'AI service unavailable' }, { status: 502 });
		}

		return json({ error: 'AI assist failed' }, { status: 500 });
	}
}

route('POST', '/ai/assist', handleAssist);
