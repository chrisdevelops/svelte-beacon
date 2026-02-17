export function formatDate(iso: string): string {
	const date = new Date(iso);
	return date.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	});
}

export function formatRelativeTime(iso: string): string {
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
