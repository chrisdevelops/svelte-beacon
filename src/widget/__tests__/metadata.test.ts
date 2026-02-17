// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { collectMetadata, mediaMatches } from '../internal/metadata.js';

function stubMatchMedia(darkMode: boolean): void {
	vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
		matches: query === '(prefers-color-scheme: dark)' ? darkMode : false,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
	})));
}

beforeEach(() => {
	Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
	Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
	Object.defineProperty(window, 'location', {
		value: { href: 'http://localhost:5173/test-page' },
		writable: true,
		configurable: true,
	});
	Object.defineProperty(navigator, 'userAgent', {
		value: 'TestAgent/1.0',
		writable: true,
		configurable: true,
	});
	Object.defineProperty(navigator, 'language', {
		value: 'en-US',
		writable: true,
		configurable: true,
	});
	Object.defineProperty(window, 'devicePixelRatio', { value: 2, writable: true, configurable: true });
	Object.defineProperty(window, 'screen', {
		value: { width: 1920, height: 1080 },
		writable: true,
		configurable: true,
	});
	stubMatchMedia(false);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('collectMetadata', () => {
	it('returns all expected fields', () => {
		const meta = collectMetadata();
		expect(meta).toHaveProperty('url');
		expect(meta).toHaveProperty('viewport');
		expect(meta).toHaveProperty('userAgent');
		expect(meta).toHaveProperty('darkMode');
		expect(meta).toHaveProperty('timestamp');
		expect(meta).toHaveProperty('screen');
		expect(meta).toHaveProperty('accessibility');
		expect(meta).toHaveProperty('language');
	});

	it('captures current URL', () => {
		const meta = collectMetadata();
		expect(meta.url).toBe('http://localhost:5173/test-page');
	});

	it('captures viewport dimensions', () => {
		const meta = collectMetadata();
		expect(meta.viewport).toEqual({ width: 1024, height: 768 });
	});

	it('captures user agent', () => {
		const meta = collectMetadata();
		expect(meta.userAgent).toBe('TestAgent/1.0');
	});

	it('detects light mode', () => {
		const meta = collectMetadata();
		expect(meta.darkMode).toBe(false);
	});

	it('detects dark mode', () => {
		stubMatchMedia(true);
		const meta = collectMetadata();
		expect(meta.darkMode).toBe(true);
	});

	it('returns ISO timestamp', () => {
		const meta = collectMetadata();
		expect(() => new Date(meta.timestamp)).not.toThrow();
		expect(meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it('includes screen dimensions from window.screen', () => {
		const meta = collectMetadata();
		expect(meta.screen.width).toBe(1920);
		expect(meta.screen.height).toBe(1080);
	});

	it('includes devicePixelRatio', () => {
		const meta = collectMetadata();
		expect(meta.screen.devicePixelRatio).toBe(2);
	});

	it('includes navigator.language', () => {
		const meta = collectMetadata();
		expect(meta.language).toBe('en-US');
	});

	it('includes accessibility preferences when reduced motion is active', () => {
		vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
			matches: query === '(prefers-reduced-motion: reduce)',
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		})));

		const meta = collectMetadata();
		expect(meta.accessibility.reducedMotion).toBe(true);
		expect(meta.accessibility.highContrast).toBe(false);
		expect(meta.accessibility.forcedColors).toBe(false);
	});

	it('returns false accessibility defaults when matchMedia is unavailable', () => {
		vi.stubGlobal('matchMedia', undefined);

		const meta = collectMetadata();
		expect(meta.accessibility.reducedMotion).toBe(false);
		expect(meta.accessibility.highContrast).toBe(false);
		expect(meta.accessibility.forcedColors).toBe(false);
		expect(meta.darkMode).toBe(false);
	});
});

describe('mediaMatches', () => {
	it('returns true when query matches', () => {
		vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
			matches: true,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		}));

		expect(mediaMatches('(prefers-color-scheme: dark)')).toBe(true);
	});

	it('returns false when query does not match', () => {
		vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
			matches: false,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		}));

		expect(mediaMatches('(prefers-color-scheme: dark)')).toBe(false);
	});

	it('returns false when matchMedia is unavailable', () => {
		vi.stubGlobal('matchMedia', undefined);
		expect(mediaMatches('(prefers-color-scheme: dark)')).toBe(false);
	});
});
