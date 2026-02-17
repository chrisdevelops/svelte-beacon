/**
 * Collects page metadata at submission time.
 */

export interface PageMetadata {
	url: string;
	viewport: { width: number; height: number };
	userAgent: string;
	darkMode: boolean;
	timestamp: string;
	screen: { width: number; height: number; devicePixelRatio: number };
	accessibility: { reducedMotion: boolean; highContrast: boolean; forcedColors: boolean };
	language: string;
}

/**
 * SSR-safe wrapper around window.matchMedia.
 * Returns false if matchMedia is unavailable.
 */
export function mediaMatches(query: string): boolean {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
		return false;
	}
	return window.matchMedia(query).matches;
}

export function collectMetadata(): PageMetadata {
	return {
		url: window.location.href,
		viewport: {
			width: window.innerWidth,
			height: window.innerHeight,
		},
		userAgent: navigator.userAgent,
		darkMode: mediaMatches('(prefers-color-scheme: dark)'),
		timestamp: new Date().toISOString(),
		screen: {
			width: window.screen?.width ?? 0,
			height: window.screen?.height ?? 0,
			devicePixelRatio: window.devicePixelRatio ?? 1,
		},
		accessibility: {
			reducedMotion: mediaMatches('(prefers-reduced-motion: reduce)'),
			highContrast: mediaMatches('(prefers-contrast: more)'),
			forcedColors: mediaMatches('(forced-colors: active)'),
		},
		language: navigator.language ?? 'en',
	};
}
