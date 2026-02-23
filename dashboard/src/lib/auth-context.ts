import { setContext, getContext } from 'svelte';

export interface AuthContext {
	readonly isAdmin: boolean;
}

const AUTH_KEY = 'beacon:auth';

export function setAuthContext(ctx: AuthContext): void {
	setContext(AUTH_KEY, ctx);
}

export function getAuthContext(): AuthContext {
	return getContext<AuthContext>(AUTH_KEY);
}
