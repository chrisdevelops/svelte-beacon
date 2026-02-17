import type { Client } from '@libsql/client';
import type { ResolvedConfig } from '../config.js';
import { route, json } from '../router.js';
import { createMagicLink, consumeMagicLink } from '../db/queries/magic-links.js';
import { createSession } from '../db/queries/sessions.js';
import { authenticateRequest } from '../auth/middleware.js';
import { requiredEmail, collectErrors } from './validate.js';

type RequestEvent = Parameters<import('@sveltejs/kit').Handle>[0]['event'];

async function handleRequestMagicLink(
	event: RequestEvent,
	db: Client,
	config: ResolvedConfig,
): Promise<Response> {
	let body: Record<string, unknown>;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const validated = collectErrors({
		email: requiredEmail(body.email, 'email'),
	});

	if (!validated.valid) {
		return json({ error: 'Validation failed', details: validated.errors }, { status: 400 });
	}

	const { email } = validated.values;

	const link = await createMagicLink(db, email);
	const verifyUrl = `${event.url.origin}/__beacon/api/auth/verify?token=${link.token}`;

	console.log(`[beacon] Magic link for ${email}: ${verifyUrl}`);

	return json({ success: true });
}

async function handleVerify(
	event: RequestEvent,
	db: Client,
	config: ResolvedConfig,
): Promise<Response> {
	const token = event.url.searchParams.get('token');
	if (!token) {
		return json({ error: 'Missing token parameter' }, { status: 400 });
	}

	const link = await consumeMagicLink(db, token);
	if (!link) {
		return json({ error: 'Invalid or expired token' }, { status: 400 });
	}

	const isAdmin = config.adminEmails.some(
		(e) => e.toLowerCase() === link.email.toLowerCase(),
	);

	const session = await createSession(db, {
		email: link.email,
		isAdmin,
	});

	event.cookies.set('__beacon_session', session.id, {
		path: '/__beacon',
		httpOnly: true,
		sameSite: 'lax',
		secure: event.url.protocol === 'https:',
		maxAge: 7 * 24 * 60 * 60,
	});

	return new Response(null, {
		status: 302,
		headers: { Location: '/__beacon/' },
	});
}

async function handleLogout(
	event: RequestEvent,
): Promise<Response> {
	event.cookies.delete('__beacon_session', { path: '/__beacon' });
	return json({ success: true });
}

async function handleGetSession(
	event: RequestEvent,
	db: Client,
	config: ResolvedConfig,
): Promise<Response> {
	const auth = await authenticateRequest(event, db, config);
	return json(auth);
}

route('POST', '/auth/magic-link', handleRequestMagicLink);
route('GET', '/auth/verify', handleVerify);
route('POST', '/auth/logout', handleLogout);
route('GET', '/auth/session', handleGetSession);
