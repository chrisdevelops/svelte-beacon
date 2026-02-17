import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import TypeBadge from '$lib/components/TypeBadge.svelte';
import { TASK_TYPES, TYPE_LABELS } from '$lib/types.js';
import type { TaskType } from '$lib/types.js';

afterEach(cleanup);

describe('TypeBadge', () => {
	it.each(TASK_TYPES)('renders label for type "%s"', (type) => {
		const { container } = render(TypeBadge, { props: { type } });
		const badge = container.querySelector('.badge');
		expect(badge).not.toBeNull();
		expect(badge!.textContent).toBe(TYPE_LABELS[type as TaskType]);
	});
});
