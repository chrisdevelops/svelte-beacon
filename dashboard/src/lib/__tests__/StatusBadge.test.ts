import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import StatusBadge from '$lib/components/StatusBadge.svelte';
import { TASK_STATUSES } from '$lib/types.js';
import { STATUS_LABELS, STATUS_COLORS } from '$lib/status.js';
import type { TaskStatus } from '$lib/types.js';

afterEach(cleanup);

describe('StatusBadge', () => {
	it.each(TASK_STATUSES)('renders label for status "%s"', (status) => {
		const { container } = render(StatusBadge, { props: { status } });
		const badge = container.querySelector('.badge');
		expect(badge).not.toBeNull();
		expect(badge!.textContent).toBe(STATUS_LABELS[status as TaskStatus]);
	});

	it('applies correct color via CSS variable', () => {
		const { container } = render(StatusBadge, { props: { status: 'new' as const } });
		const badge = container.querySelector('.badge') as HTMLElement;
		expect(badge.style.getPropertyValue('--badge-color')).toBe(STATUS_COLORS.new);
	});
});
