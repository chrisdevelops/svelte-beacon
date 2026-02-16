import type { Client } from '@libsql/client';
import type { ResolvedConfig } from '../config.js';
import { route, json } from '../router.js';
import { TASK_TYPES, PRIORITY_LEVELS } from '../constants.js';
import { createTask } from '../db/queries/tasks.js';
import {
	requiredString,
	optionalString,
	requiredEnum,
	optionalEmail,
	requiredEmail,
	optionalJSON,
	collectErrors,
} from './validate.js';

type RequestEvent = Parameters<import('@sveltejs/kit').Handle>[0]['event'];

export async function handleCreateFeedback(
	event: RequestEvent,
	db: Client,
	config: ResolvedConfig,
): Promise<Response> {
	let body: Record<string, unknown>;
	try {
		body = (await event.request.json()) as Record<string, unknown>;
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const emailValidator = config.widget.requireEmail ? requiredEmail : optionalEmail;

	const validation = collectErrors({
		description: requiredString(body.description, 'description', { maxLength: 10000 }),
		type: requiredEnum(body.type, 'type', TASK_TYPES),
		priority: requiredEnum(body.priority, 'priority', PRIORITY_LEVELS),
		email: emailValidator(body.email, 'email'),
		route: optionalString(body.route, 'route', { maxLength: 2000 }),
		element_selector: optionalString(body.element_selector, 'element_selector', { maxLength: 1000 }),
		metadata: optionalJSON(body.metadata, 'metadata'),
	});

	if (!validation.valid) {
		return json({ error: 'Validation failed', fields: validation.errors }, { status: 400 });
	}

	const { values } = validation;

	try {
		const task = await createTask(db, {
			type: values.type as string as typeof TASK_TYPES[number],
			priority: values.priority as string as typeof PRIORITY_LEVELS[number],
			description: values.description as string,
			route: values.route as string | null,
			element_selector: values.element_selector as string | null,
			metadata: values.metadata as string | null,
			user_email: values.email as string | null,
		});
		return json({ id: task.id, public_id: task.public_id }, { status: 201 });
	} catch (err) {
		console.error('[beacon] Failed to create task:', err);
		return json({ error: 'Failed to create feedback' }, { status: 500 });
	}
}

route('POST', '/feedback', handleCreateFeedback);
