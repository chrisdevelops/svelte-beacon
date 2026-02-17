import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import BulkActionBar from '$lib/components/BulkActionBar.svelte';

afterEach(cleanup);

describe('BulkActionBar', () => {
	const defaultProps = {
		selectedCount: 3,
		onstatuschange: vi.fn(),
		ondelete: vi.fn(),
		onclear: vi.fn(),
	};

	it('renders selected count', () => {
		const { container } = render(BulkActionBar, { props: defaultProps });
		expect(container.textContent).toContain('3 selected');
	});

	it('renders status dropdown', () => {
		const { container } = render(BulkActionBar, { props: defaultProps });
		const select = container.querySelector('select');
		expect(select).not.toBeNull();
	});

	it('renders delete button', () => {
		const { container } = render(BulkActionBar, { props: defaultProps });
		const deleteBtn = container.querySelector('.delete-btn');
		expect(deleteBtn).not.toBeNull();
		expect(deleteBtn!.textContent).toContain('Delete');
	});

	it('renders clear button', () => {
		const { container } = render(BulkActionBar, { props: defaultProps });
		const clearBtn = container.querySelector('.clear-btn');
		expect(clearBtn).not.toBeNull();
		expect(clearBtn!.textContent).toContain('Clear');
	});

	it('calls ondelete when delete clicked', () => {
		const ondelete = vi.fn();
		const { container } = render(BulkActionBar, {
			props: { ...defaultProps, ondelete },
		});
		const deleteBtn = container.querySelector('.delete-btn') as HTMLButtonElement;
		deleteBtn.click();
		expect(ondelete).toHaveBeenCalled();
	});

	it('calls onclear when clear clicked', () => {
		const onclear = vi.fn();
		const { container } = render(BulkActionBar, {
			props: { ...defaultProps, onclear },
		});
		const clearBtn = container.querySelector('.clear-btn') as HTMLButtonElement;
		clearBtn.click();
		expect(onclear).toHaveBeenCalled();
	});

	it('renders status options', () => {
		const { container } = render(BulkActionBar, { props: defaultProps });
		const options = container.querySelectorAll('select option');
		// 7 statuses + 1 placeholder = 8
		expect(options.length).toBe(8);
	});
});
