/**
 * Collects page metadata at submission time.
 */

export interface PageMetadata {
	url: string;
	viewport: { width: number; height: number };
	userAgent: string;
	darkMode: boolean;
	timestamp: string;
}

export function collectMetadata(): PageMetadata {
	return {
		url: window.location.href,
		viewport: {
			width: window.innerWidth,
			height: window.innerHeight,
		},
		userAgent: navigator.userAgent,
		darkMode: window.matchMedia('(prefers-color-scheme: dark)').matches,
		timestamp: new Date().toISOString(),
	};
}
