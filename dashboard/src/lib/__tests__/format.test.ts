import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatDate, formatRelativeTime, truncate, parseSQLiteDateTime } from '$lib/format.js';

describe('formatDate', () => {
	it('formats ISO date as readable string', () => {
		const result = formatDate('2025-01-15T10:00:00Z');
		expect(result).toContain('Jan');
		expect(result).toContain('15');
		expect(result).toContain('2025');
	});
});

describe('formatRelativeTime', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns "just now" for recent times', () => {
		expect(formatRelativeTime('2025-01-15T11:59:30Z')).toBe('just now');
	});

	it('returns minutes ago', () => {
		expect(formatRelativeTime('2025-01-15T11:55:00Z')).toBe('5m ago');
	});

	it('returns hours ago', () => {
		expect(formatRelativeTime('2025-01-15T09:00:00Z')).toBe('3h ago');
	});

	it('returns days ago', () => {
		expect(formatRelativeTime('2025-01-13T12:00:00Z')).toBe('2d ago');
	});

	it('returns formatted date for old times', () => {
		const result = formatRelativeTime('2024-06-15T10:00:00Z');
		expect(result).toContain('Jun');
		expect(result).toContain('15');
	});
});

describe('parseSQLiteDateTime', () => {
	it('converts space-separated SQLite datetime to ISO 8601 with Z suffix', () => {
		expect(parseSQLiteDateTime('2026-02-17 14:30:00')).toBe('2026-02-17T14:30:00Z');
	});

	it('passes through ISO strings unchanged', () => {
		expect(parseSQLiteDateTime('2026-02-17T14:30:00Z')).toBe('2026-02-17T14:30:00Z');
	});

	it('passes through ISO strings with offset unchanged', () => {
		expect(parseSQLiteDateTime('2026-02-17T14:30:00+05:00')).toBe('2026-02-17T14:30:00+05:00');
	});
});

describe('formatRelativeTime with SQLite datetime', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-02-17T15:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('correctly computes "5m ago" for SQLite format', () => {
		expect(formatRelativeTime('2026-02-17 14:55:00')).toBe('5m ago');
	});

	it('correctly computes "2h ago" for SQLite format', () => {
		expect(formatRelativeTime('2026-02-17 13:00:00')).toBe('2h ago');
	});
});

describe('formatDate with SQLite datetime', () => {
	it('correctly formats a SQLite datetime string', () => {
		const result = formatDate('2026-02-17 14:30:00');
		expect(result).toContain('Feb');
		expect(result).toContain('17');
		expect(result).toContain('2026');
	});
});

describe('truncate', () => {
	it('returns text unchanged when under limit', () => {
		expect(truncate('hello', 10)).toBe('hello');
	});

	it('returns text unchanged at exact limit', () => {
		expect(truncate('hello', 5)).toBe('hello');
	});

	it('truncates with ellipsis when over limit', () => {
		expect(truncate('hello world', 8)).toBe('hello w\u2026');
	});
});
