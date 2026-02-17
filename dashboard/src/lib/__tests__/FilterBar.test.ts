import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import FilterBar from '$lib/components/FilterBar.svelte';

afterEach(cleanup);

describe('FilterBar', () => {
	it('renders three select dropdowns', () => {
		const { container } = render(FilterBar, {
			props: { onchange: vi.fn() },
		});
		const selects = container.querySelectorAll('select');
		expect(selects).toHaveLength(3);
	});

	it('has correct aria labels', () => {
		const { container } = render(FilterBar, {
			props: { onchange: vi.fn() },
		});
		expect(container.querySelector('[aria-label="Filter by status"]')).not.toBeNull();
		expect(container.querySelector('[aria-label="Filter by type"]')).not.toBeNull();
		expect(container.querySelector('[aria-label="Filter by priority"]')).not.toBeNull();
	});

	it('fires onchange with filter shape when status changes', () => {
		const onchange = vi.fn();
		const { container } = render(FilterBar, {
			props: { onchange },
		});
		const statusSelect = container.querySelector('[aria-label="Filter by status"]') as HTMLSelectElement;
		statusSelect.value = 'new';
		statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
		expect(onchange).toHaveBeenCalledWith({ status: 'new', type: '', priority: '' });
	});

	it('fires onchange with filter shape when type changes', () => {
		const onchange = vi.fn();
		const { container } = render(FilterBar, {
			props: { status: 'new', onchange },
		});
		const typeSelect = container.querySelector('[aria-label="Filter by type"]') as HTMLSelectElement;
		typeSelect.value = 'bug';
		typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
		expect(onchange).toHaveBeenCalledWith({ status: 'new', type: 'bug', priority: '' });
	});

	it('defaults to empty string values', () => {
		const { container } = render(FilterBar, {
			props: { onchange: vi.fn() },
		});
		const selects = container.querySelectorAll('select');
		for (const select of selects) {
			expect(select.value).toBe('');
		}
	});
});
