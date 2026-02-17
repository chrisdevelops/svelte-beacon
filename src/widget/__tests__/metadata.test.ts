// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { collectMetadata } from '../internal/metadata.js';

function stubMatchMedia(darkMode: boolean): void {
	vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
		matches: darkMode,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
	}));
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
});
