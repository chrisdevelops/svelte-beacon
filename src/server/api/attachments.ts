import { readFile } from 'fs/promises';
import type { Client } from '@libsql/client';
import type { ResolvedConfig } from '../config.js';
import { route, json } from '../router.js';
import { getAttachment } from '../db/queries/attachments.js';

type RequestEvent = Parameters<import('@sveltejs/kit').Handle>[0]['event'];

export async function handleGetAttachment(
	_event: RequestEvent,
	db: Client,
	_config: ResolvedConfig,
	params: Record<string, string>,
): Promise<Response> {
	const { id } = params;
	if (!id) {
		return json({ error: 'Missing attachment ID' }, { status: 400 });
	}

	const attachment = await getAttachment(db, id);
	if (!attachment) {
		return json({ error: 'Attachment not found' }, { status: 404 });
	}

	let fileBuffer: Buffer;
	try {
		fileBuffer = await readFile(attachment.path);
	} catch {
		return json({ error: 'File not found on disk' }, { status: 404 });
	}

	return new Response(new Uint8Array(fileBuffer), {
		status: 200,
		headers: {
			'Content-Type': attachment.mime_type,
			'Content-Length': String(fileBuffer.byteLength),
			'Content-Disposition': `inline; filename="${attachment.filename}"`,
			'Cache-Control': 'private, max-age=3600',
		},
	});
}

route('GET', '/attachments/:id', handleGetAttachment, { requireAuth: true });
