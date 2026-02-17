import { describe, it, expect } from 'vitest';
import { parseBrowser, parseOS, formatMetadata } from '$lib/metadata.js';

describe('parseBrowser', () => {
	it('detects Chrome with version', () => {
		const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.130 Safari/537.36';
		const result = parseBrowser(ua);
		expect(result).toEqual({ name: 'Chrome', version: '120.0.6099.130' });
	});

	it('detects Firefox with version', () => {
		const ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0';
		const result = parseBrowser(ua);
		expect(result).toEqual({ name: 'Firefox', version: '121.0' });
	});

	it('detects Safari with version', () => {
		const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15';
		const result = parseBrowser(ua);
		expect(result).toEqual({ name: 'Safari', version: '17.2' });
	});

	it('detects Edge and not Chrome', () => {
		const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91';
		const result = parseBrowser(ua);
		expect(result).toEqual({ name: 'Edge', version: '120.0.2210.91' });
	});

	it('detects Opera and not Chrome', () => {
		const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0';
		const result = parseBrowser(ua);
		expect(result).toEqual({ name: 'Opera', version: '106.0.0.0' });
	});

	it('returns Unknown for empty or unrecognized UA strings', () => {
		expect(parseBrowser('')).toEqual({ name: 'Unknown', version: '' });
		expect(parseBrowser('SomeWeirdBot/1.0')).toEqual({ name: 'Unknown', version: '' });
	});
});

describe('parseOS', () => {
	it('detects macOS with version converting underscores to dots', () => {
		const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/537.36';
		const result = parseOS(ua);
		expect(result).toEqual({ name: 'macOS', version: '14.2.1' });
	});

	it('detects Windows NT version', () => {
		const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
		const result = parseOS(ua);
		expect(result).toEqual({ name: 'Windows', version: '10.0' });
	});

	it('detects iOS with version converting underscores to dots', () => {
		const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2_1 like Mac OS X) AppleWebKit/605.1.15';
		const result = parseOS(ua);
		expect(result).toEqual({ name: 'iOS', version: '17.2.1' });
	});

	it('detects Android with version', () => {
		const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36';
		const result = parseOS(ua);
		expect(result).toEqual({ name: 'Android', version: '14' });
	});

	it('detects Linux without version', () => {
		const ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0';
		const result = parseOS(ua);
		expect(result).toEqual({ name: 'Linux', version: '' });
	});

	it('returns Unknown for unrecognized OS', () => {
		expect(parseOS('')).toEqual({ name: 'Unknown', version: '' });
		expect(parseOS('SomeWeirdBot/1.0')).toEqual({ name: 'Unknown', version: '' });
	});
});

describe('formatMetadata', () => {
	it('formats a complete metadata object correctly', () => {
		const meta = {
			url: 'https://example.com/page',
			userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.130 Safari/537.36',
			viewport: { width: 1920, height: 1080 },
			screen: { width: 2560, height: 1440, devicePixelRatio: 2 },
			language: 'en-US',
			darkMode: true,
			accessibility: { reducedMotion: true, highContrast: false, forcedColors: false },
			timestamp: '2025-01-15T10:00:00Z',
		};

		const result = formatMetadata(meta);

		expect(result.url).toBe('https://example.com/page');
		expect(result.browser).toBe('Chrome 120.0.6099.130');
		expect(result.os).toBe('macOS 14.2.1');
		expect(result.viewport).toBe('1920\u00d71080');
		expect(result.screen).toBe('2560\u00d71440 @2x');
		expect(result.language).toBe('en-US');
		expect(result.darkMode).toBe(true);
		expect(result.accessibility).toEqual(['Reduced Motion']);
	});

	it('handles missing or partial metadata gracefully', () => {
		const result = formatMetadata({});

		expect(result.url).toBeNull();
		expect(result.browser).toBeNull();
		expect(result.os).toBeNull();
		expect(result.viewport).toBeNull();
		expect(result.screen).toBeNull();
		expect(result.language).toBeNull();
		expect(result.darkMode).toBeNull();
		expect(result.accessibility).toBeNull();
	});

	it('returns null for browser when UA is Unknown', () => {
		const result = formatMetadata({ userAgent: 'SomeWeirdBot/1.0' });
		expect(result.browser).toBeNull();
		expect(result.os).toBeNull();
	});

	it('omits @Nx suffix when devicePixelRatio is 1', () => {
		const result = formatMetadata({
			screen: { width: 1920, height: 1080, devicePixelRatio: 1 },
		});
		expect(result.screen).toBe('1920\u00d71080');
	});

	it('returns null accessibility when no flags are true', () => {
		const result = formatMetadata({
			accessibility: { reducedMotion: false, highContrast: false, forcedColors: false },
		});
		expect(result.accessibility).toBeNull();
	});

	it('collects multiple accessibility labels', () => {
		const result = formatMetadata({
			accessibility: { reducedMotion: true, highContrast: true, forcedColors: true },
		});
		expect(result.accessibility).toEqual(['Reduced Motion', 'High Contrast', 'Forced Colors']);
	});
});
