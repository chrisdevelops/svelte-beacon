import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import Pagination from '$lib/components/Pagination.svelte';

afterEach(cleanup);

describe('Pagination', () => {
	it('does not render when totalPages is 1', () => {
		const { container } = render(Pagination, {
			props: {
				pagination: { page: 1, limit: 20, total: 5, totalPages: 1 },
				onchange: vi.fn(),
			},
		});
		expect(container.querySelector('nav')).toBeNull();
	});

	it('renders navigation when totalPages > 1', () => {
		const { container } = render(Pagination, {
			props: {
				pagination: { page: 1, limit: 20, total: 50, totalPages: 3 },
				onchange: vi.fn(),
			},
		});
		expect(container.querySelector('nav')).not.toBeNull();
	});

	it('disables prev button on first page', () => {
		const { container } = render(Pagination, {
			props: {
				pagination: { page: 1, limit: 20, total: 50, totalPages: 3 },
				onchange: vi.fn(),
			},
		});
		const prevBtn = container.querySelector('[aria-label="Previous page"]') as HTMLButtonElement;
		expect(prevBtn.disabled).toBe(true);
	});

	it('disables next button on last page', () => {
		const { container } = render(Pagination, {
			props: {
				pagination: { page: 3, limit: 20, total: 50, totalPages: 3 },
				onchange: vi.fn(),
			},
		});
		const nextBtn = container.querySelector('[aria-label="Next page"]') as HTMLButtonElement;
		expect(nextBtn.disabled).toBe(true);
	});

	it('marks current page with aria-current', () => {
		const { container } = render(Pagination, {
			props: {
				pagination: { page: 2, limit: 20, total: 50, totalPages: 3 },
				onchange: vi.fn(),
			},
		});
		const currentBtn = container.querySelector('[aria-current="page"]');
		expect(currentBtn).not.toBeNull();
		expect(currentBtn!.textContent).toBe('2');
	});

	it('calls onchange with page number when clicking page', () => {
		const onchange = vi.fn();
		const { container } = render(Pagination, {
			props: {
				pagination: { page: 1, limit: 20, total: 50, totalPages: 3 },
				onchange,
			},
		});
		const page2 = container.querySelector('[aria-label="Page 2"]') as HTMLButtonElement;
		page2.click();
		expect(onchange).toHaveBeenCalledWith(2);
	});

	it('calls onchange with next page when clicking next', () => {
		const onchange = vi.fn();
		const { container } = render(Pagination, {
			props: {
				pagination: { page: 1, limit: 20, total: 50, totalPages: 3 },
				onchange,
			},
		});
		const nextBtn = container.querySelector('[aria-label="Next page"]') as HTMLButtonElement;
		nextBtn.click();
		expect(onchange).toHaveBeenCalledWith(2);
	});
});
