import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import StatusDropdown from '$lib/components/StatusDropdown.svelte';
import type { TaskStatus } from '$lib/types.js';
import { STATUS_LABELS } from '$lib/status.js';

afterEach(cleanup);

describe('StatusDropdown', () => {
	it('shows current status as selected option', () => {
		const { container } = render(StatusDropdown, {
			props: { current: 'new' as TaskStatus, onchange: vi.fn() },
		});
		const select = container.querySelector('select') as HTMLSelectElement;
		expect(select.value).toBe('new');
	});

	it('shows valid transitions as options', () => {
		const { container } = render(StatusDropdown, {
			props: { current: 'new' as TaskStatus, onchange: vi.fn() },
		});
		const options = container.querySelectorAll('option');
		const values = Array.from(options).map((o) => o.value);
		// 'new' (current) + backlog + closed
		expect(values).toContain('new');
		expect(values).toContain('backlog');
		expect(values).toContain('closed');
		expect(values).not.toContain('done');
	});

	it('shows correct labels for options', () => {
		const { container } = render(StatusDropdown, {
			props: { current: 'needs_review' as TaskStatus, onchange: vi.fn() },
		});
		const options = container.querySelectorAll('option');
		const labels = Array.from(options).map((o) => o.textContent);
		expect(labels).toContain(STATUS_LABELS.needs_review);
		expect(labels).toContain(STATUS_LABELS.done);
	});

	it('fires onchange with new status', () => {
		const onchange = vi.fn();
		const { container } = render(StatusDropdown, {
			props: { current: 'new' as TaskStatus, onchange },
		});
		const select = container.querySelector('select') as HTMLSelectElement;
		select.value = 'backlog';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		expect(onchange).toHaveBeenCalledWith('backlog');
	});

	it('does not fire onchange when selecting current status', () => {
		const onchange = vi.fn();
		const { container } = render(StatusDropdown, {
			props: { current: 'new' as TaskStatus, onchange },
		});
		const select = container.querySelector('select') as HTMLSelectElement;
		select.value = 'new';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		expect(onchange).not.toHaveBeenCalled();
	});

	it('disables select when disabled prop is true', () => {
		const { container } = render(StatusDropdown, {
			props: { current: 'new' as TaskStatus, onchange: vi.fn(), disabled: true },
		});
		const select = container.querySelector('select') as HTMLSelectElement;
		expect(select.disabled).toBe(true);
	});
});
