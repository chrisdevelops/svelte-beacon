import type { Client } from '@libsql/client';
import type { ResolvedConfig } from './config.js';

/**
 * JSON response helper.
 * Do not use SvelteKit's json() — this runs inside the handle hook, not +server.ts.
 */
export function json(data: unknown, init?: ResponseInit): Response {
	return new Response(JSON.stringify(data), {
		status: 200,
		...init,
		headers: {
			'Content-Type': 'application/json',
			...init?.headers,
		},
	});
}

/**
 * Route definition for the Beacon API.
 */
interface Route {
	method: string;
	pattern: RegExp;
	paramNames: string[];
	handler: (
		event: RequestEvent,
		db: Client,
		config: ResolvedConfig,
		params: Record<string, string>,
	) => Promise<Response>;
}

type RequestEvent = Parameters<import('@sveltejs/kit').Handle>[0]['event'];

const routes: Route[] = [];

/**
 * Register an API route.
 *
 * @example
 * route('GET', '/tasks', handleListTasks);
 * route('GET', '/tasks/:id', handleGetTask);
 * route('POST', '/feedback', handleCreateFeedback);
 */
export function route(
	method: string,
	path: string,
	handler: Route['handler'],
): void {
	const paramNames: string[] = [];
	const patternStr = path.replace(/:(\w+)/g, (_, name: string) => {
		paramNames.push(name);
		return '([^/]+)';
	});

	routes.push({
		method,
		pattern: new RegExp(`^${patternStr}$`),
		paramNames,
		handler,
	});
}

/**
 * Dispatch an API request to the matching route handler.
 */
export async function dispatch(
	event: RequestEvent,
	db: Client,
	config: ResolvedConfig,
): Promise<Response> {
	const apiPath = event.url.pathname.replace('/__beacon/api', '');
	const method = event.request.method;

	let methodMatched = false;

	for (const r of routes) {
		const match = apiPath.match(r.pattern);
		if (match) {
			if (r.method !== method) {
				methodMatched = true;
				continue;
			}

			const params: Record<string, string> = {};
			r.paramNames.forEach((name, i) => {
				const value = match[i + 1];
				if (value) params[name] = value;
			});

			return r.handler(event, db, config, params);
		}
	}

	if (methodMatched) {
		return json({ error: 'Method not allowed' }, { status: 405 });
	}

	return json({ error: 'Not found' }, { status: 404 });
}
