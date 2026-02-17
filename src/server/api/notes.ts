import type { Client } from '@libsql/client';
import type { ResolvedConfig } from '../config.js';
import { route, json } from '../router.js';
import { getTask } from '../db/queries/tasks.js';
import { createAdminNote } from '../db/queries/admin-notes.js';
import { requiredString, collectErrors } from './validate.js';

type RequestEvent = Parameters<import('@sveltejs/kit').Handle>[0]['event'];

export async function handleCreateNote(
	event: RequestEvent,
	db: Client,
	_config: ResolvedConfig,
	params: Record<string, string>,
): Promise<Response> {
	const { id } = params;
	if (!id) {
		return json({ error: 'Task ID is required' }, { status: 400 });
	}

	let body: Record<string, unknown>;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const validated = collectErrors({
		content: requiredString(body.content, 'content', { maxLength: 10000 }),
	});

	if (!validated.valid) {
		return json({ error: 'Validation failed', details: validated.errors }, { status: 400 });
	}

	const { content } = validated.values;

	try {
		const task = await getTask(db, id);
		if (!task) {
			return json({ error: 'Task not found' }, { status: 404 });
		}

		const auth = (event.locals as Record<string, unknown>).auth as
			| { email: string }
			| undefined;
		const author_email = auth?.email ?? null;

		const note = await createAdminNote(db, {
			task_id: id,
			content,
			author_email,
		});

		return json(note, { status: 201 });
	} catch (err) {
		console.error('[beacon] Failed to create note:', err);
		return json({ error: 'Failed to create note' }, { status: 500 });
	}
}

route('POST', '/tasks/:id/notes', handleCreateNote, { requireAuth: true });
