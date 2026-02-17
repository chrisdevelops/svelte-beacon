import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import PriorityBadge from '$lib/components/PriorityBadge.svelte';
import { PRIORITY_LEVELS, PRIORITY_LABELS } from '$lib/types.js';
import { PRIORITY_COLORS } from '$lib/status.js';
import type { Priority } from '$lib/types.js';

afterEach(cleanup);

describe('PriorityBadge', () => {
	it.each(PRIORITY_LEVELS)('renders label for priority "%s"', (priority) => {
		const { container } = render(PriorityBadge, { props: { priority } });
		const badge = container.querySelector('.badge');
		expect(badge).not.toBeNull();
		expect(badge!.textContent).toBe(PRIORITY_LABELS[priority as Priority]);
	});

	it('applies correct color via CSS variable', () => {
		const { container } = render(PriorityBadge, { props: { priority: 'critical' as const } });
		const badge = container.querySelector('.badge') as HTMLElement;
		expect(badge.style.getPropertyValue('--badge-color')).toBe(PRIORITY_COLORS.critical);
	});
});
