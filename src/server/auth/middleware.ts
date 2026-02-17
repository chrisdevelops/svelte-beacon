import type { Client } from '@libsql/client';
import type { ResolvedConfig } from '../config.js';
import { getSession } from '../db/queries/sessions.js';

export interface AuthContext {
	authenticated: boolean;
	email?: string;
	isAdmin?: boolean;
}

type RequestEvent = Parameters<import('@sveltejs/kit').Handle>[0]['event'];

export async function authenticateRequest(
	event: RequestEvent,
	db: Client,
	config: ResolvedConfig,
): Promise<AuthContext> {
	if (!config.requireAuth) {
		return { authenticated: true, email: 'dev@localhost', isAdmin: true };
	}

	// Try cookie first
	const cookieSessionId = event.cookies.get('__beacon_session');
	if (cookieSessionId) {
		const session = await getSession(db, cookieSessionId);
		if (session) {
			return {
				authenticated: true,
				email: session.email,
				isAdmin: session.is_admin,
			};
		}
	}

	// Fall back to Bearer token (used by CLI pull)
	const authHeader = event.request.headers.get('authorization');
	if (authHeader?.startsWith('Bearer ')) {
		const tokenSessionId = authHeader.slice(7);
		const session = await getSession(db, tokenSessionId);
		if (session) {
			return {
				authenticated: true,
				email: session.email,
				isAdmin: session.is_admin,
			};
		}
	}

	return { authenticated: false };
}
