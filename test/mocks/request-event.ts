import type { RequestEvent } from '@sveltejs/kit';

interface MockEventOptions {
	method?: string;
	path?: string;
	body?: unknown;
	headers?: Record<string, string>;
	cookies?: Record<string, string>;
	locals?: Record<string, unknown>;
	query?: Record<string, string>;
}

export function createMockEvent(options: MockEventOptions = {}): RequestEvent {
	const {
		method = 'GET',
		path = '/',
		body = null,
		headers = {},
		cookies = {},
		locals = {},
		query = {},
	} = options;

	const url = new URL(`http://localhost${path}`);
	for (const [key, value] of Object.entries(query)) {
		url.searchParams.set(key, value);
	}

	const requestHeaders = new Headers(headers);
	if (body && !requestHeaders.has('content-type')) {
		requestHeaders.set('content-type', 'application/json');
	}

	const request = new Request(url, {
		method,
		headers: requestHeaders,
		body: body ? JSON.stringify(body) : null,
	});

	const cookieJar = new Map(Object.entries(cookies));

	return {
		url,
		request,
		params: {},
		route: { id: null },
		locals: { ...locals },
		platform: undefined,
		isDataRequest: false,
		isSubRequest: false,

		cookies: {
			get: (name: string) => cookieJar.get(name) ?? null,
			getAll: () => [...cookieJar.entries()].map(([name, value]) => ({ name, value })),
			set: (name: string, value: string) => {
				cookieJar.set(name, value);
			},
			delete: (name: string) => {
				cookieJar.delete(name);
			},
			serialize: (name: string, value: string) => `${name}=${value}`,
		},

		getClientAddress: () => '127.0.0.1',
		setHeaders: () => {},
		fetch: globalThis.fetch,
	} as unknown as RequestEvent;
}

/**
 * Create a mock event targeting a Beacon API endpoint.
 */
export function createBeaconAPIEvent(
	method: string,
	apiPath: string,
	options: Omit<MockEventOptions, 'method' | 'path'> = {},
): RequestEvent {
	return createMockEvent({
		...options,
		method,
		path: `/__beacon/api${apiPath}`,
	});
}

/**
 * Create a trackable resolve function for testing passthrough behavior.
 */
export function createTrackableResolve() {
	let called = false;
	let calledWith: RequestEvent | null = null;

	const resolve = async (event: RequestEvent) => {
		called = true;
		calledWith = event;
		return new Response('OK', { status: 200 });
	};

	return {
		resolve,
		get called() {
			return called;
		},
		get calledWith() {
			return calledWith;
		},
	};
}
