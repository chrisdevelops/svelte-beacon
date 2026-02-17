/**
 * Normalize a SQLite datetime string to a proper ISO 8601 string.
 * SQLite's `datetime('now')` returns `YYYY-MM-DD HH:MM:SS` (UTC, no timezone
 * indicator). Passing that to `new Date()` causes most JS engines to parse it
 * as local time, which produces incorrect relative-time calculations.
 *
 * This function replaces the space separator with `T` and appends `Z` to mark
 * the timestamp as UTC. Strings that already contain `T` (i.e. proper ISO
 * strings) are returned unchanged.
 */
export function parseSQLiteDateTime(raw: string): string {
	if (raw.includes('T')) return raw;
	return raw.replace(' ', 'T') + 'Z';
}

export function formatDate(raw: string): string {
	const date = new Date(parseSQLiteDateTime(raw));
	return date.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	});
}

export function formatRelativeTime(raw: string): string {
	const iso = parseSQLiteDateTime(raw);
	const now = Date.now();
	const then = new Date(iso).getTime();
	const seconds = Math.floor((now - then) / 1000);

	if (seconds < 60) return 'just now';

	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;

	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;

	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;

	return formatDate(iso);
}

export function truncate(text: string, max: number): string {
	if (text.length <= max) return text;
	return text.slice(0, max - 1) + '\u2026';
}
