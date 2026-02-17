// Metadata parsing and formatting utilities for dashboard display.
// Transforms the raw JSON metadata (captured by the widget) into
// human-readable strings for the task detail Context section.

export interface FormattedMetadata {
	url: string | null;
	browser: string | null;
	os: string | null;
	viewport: string | null;
	screen: string | null;
	language: string | null;
	darkMode: boolean | null;
	accessibility: string[] | null;
}

export interface ParsedBrowser {
	name: string;
	version: string;
}

export interface ParsedOS {
	name: string;
	version: string;
}

/**
 * Extract browser name and version from a user agent string.
 * Order matters: Edge and Opera include "Chrome" in their UA strings,
 * so they must be checked first.
 */
export function parseBrowser(ua: string): ParsedBrowser {
	const edgeMatch = ua.match(/Edg\/([\d.]+)/);
	if (edgeMatch) return { name: 'Edge', version: edgeMatch[1] };

	const operaMatch = ua.match(/OPR\/([\d.]+)/);
	if (operaMatch) return { name: 'Opera', version: operaMatch[1] };

	const chromeMatch = ua.match(/Chrome\/([\d.]+)/);
	if (chromeMatch) return { name: 'Chrome', version: chromeMatch[1] };

	const firefoxMatch = ua.match(/Firefox\/([\d.]+)/);
	if (firefoxMatch) return { name: 'Firefox', version: firefoxMatch[1] };

	const safariMatch = ua.match(/Version\/([\d.]+).*Safari/);
	if (safariMatch) return { name: 'Safari', version: safariMatch[1] };

	return { name: 'Unknown', version: '' };
}

/**
 * Extract OS name and version from a user agent string.
 * macOS and iOS encode versions with underscores instead of dots.
 */
export function parseOS(ua: string): ParsedOS {
	const macMatch = ua.match(/Mac OS X ([\d_]+)/);
	if (macMatch) return { name: 'macOS', version: macMatch[1].replace(/_/g, '.') };

	const windowsMatch = ua.match(/Windows NT ([\d.]+)/);
	if (windowsMatch) return { name: 'Windows', version: windowsMatch[1] };

	const iosMatch = ua.match(/iPhone OS ([\d_]+)/);
	if (iosMatch) return { name: 'iOS', version: iosMatch[1].replace(/_/g, '.') };

	const androidMatch = ua.match(/Android ([\d.]+)/);
	if (androidMatch) return { name: 'Android', version: androidMatch[1] };

	if (/Linux/.test(ua)) return { name: 'Linux', version: '' };

	return { name: 'Unknown', version: '' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Transform raw metadata JSON into human-readable formatted fields.
 * Returns null for any field that cannot be extracted from the input.
 */
export function formatMetadata(meta: Record<string, unknown>): FormattedMetadata {
	// URL
	const url = typeof meta.url === 'string' ? meta.url : null;

	// Browser & OS from userAgent
	let browser: string | null = null;
	let os: string | null = null;
	if (typeof meta.userAgent === 'string' && meta.userAgent.length > 0) {
		const parsed = parseBrowser(meta.userAgent);
		browser = parsed.name !== 'Unknown'
			? `${parsed.name} ${parsed.version}`.trim()
			: null;

		const parsedOS = parseOS(meta.userAgent);
		os = parsedOS.name !== 'Unknown'
			? `${parsedOS.name} ${parsedOS.version}`.trim()
			: null;
	}

	// Viewport
	let viewport: string | null = null;
	if (isRecord(meta.viewport)) {
		const w = meta.viewport.width;
		const h = meta.viewport.height;
		if (typeof w === 'number' && typeof h === 'number') {
			viewport = `${w}\u00d7${h}`;
		}
	}

	// Screen
	let screen: string | null = null;
	if (isRecord(meta.screen)) {
		const w = meta.screen.width;
		const h = meta.screen.height;
		const dpr = meta.screen.devicePixelRatio;
		if (typeof w === 'number' && typeof h === 'number') {
			screen = `${w}\u00d7${h}`;
			if (typeof dpr === 'number' && dpr > 1) {
				screen += ` @${dpr}x`;
			}
		}
	}

	// Language
	const language = typeof meta.language === 'string' ? meta.language : null;

	// Dark mode
	const darkMode = typeof meta.darkMode === 'boolean' ? meta.darkMode : null;

	// Accessibility
	let accessibility: string[] | null = null;
	if (isRecord(meta.accessibility)) {
		const labels: string[] = [];
		if (meta.accessibility.reducedMotion === true) labels.push('Reduced Motion');
		if (meta.accessibility.highContrast === true) labels.push('High Contrast');
		if (meta.accessibility.forcedColors === true) labels.push('Forced Colors');
		accessibility = labels.length > 0 ? labels : null;
	}

	return { url, browser, os, viewport, screen, language, darkMode, accessibility };
}
