// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import TabBar from '$lib/components/TabBar.svelte';

afterEach(cleanup);

describe('TabBar', () => {
	const tabs = [
		{ id: 'overview', label: 'Overview' },
		{ id: 'media', label: 'Media', count: 3 },
		{ id: 'notes', label: 'Notes' },
	];

	it('renders all tab buttons', () => {
		const { container } = render(TabBar, {
			props: { tabs, active: 'overview', onchange: vi.fn() },
		});
		const buttons = container.querySelectorAll('.tab-btn');
		expect(buttons).toHaveLength(3);
		expect(buttons[0].textContent).toContain('Overview');
		expect(buttons[1].textContent).toContain('Media');
		expect(buttons[2].textContent).toContain('Notes');
	});

	it('shows active state on selected tab', () => {
		const { container } = render(TabBar, {
			props: { tabs, active: 'media', onchange: vi.fn() },
		});
		const buttons = container.querySelectorAll('.tab-btn');
		expect(buttons[0].classList.contains('active')).toBe(false);
		expect(buttons[1].classList.contains('active')).toBe(true);
		expect(buttons[2].classList.contains('active')).toBe(false);
	});

	it('calls onchange with correct id on click', () => {
		const onchange = vi.fn();
		const { container } = render(TabBar, {
			props: { tabs, active: 'overview', onchange },
		});
		const buttons = container.querySelectorAll('.tab-btn');
		(buttons[1] as HTMLButtonElement).click();
		expect(onchange).toHaveBeenCalledWith('media');
	});

	it('shows count badge when count is provided', () => {
		const { container } = render(TabBar, {
			props: { tabs, active: 'overview', onchange: vi.fn() },
		});
		const counts = container.querySelectorAll('.tab-count');
		expect(counts).toHaveLength(1);
		expect(counts[0].textContent).toBe('3');
	});

	it('does not show count badge when count is undefined', () => {
		const tabsNoCount = [
			{ id: 'overview', label: 'Overview' },
			{ id: 'notes', label: 'Notes' },
		];
		const { container } = render(TabBar, {
			props: { tabs: tabsNoCount, active: 'overview', onchange: vi.fn() },
		});
		const counts = container.querySelectorAll('.tab-count');
		expect(counts).toHaveLength(0);
	});
});
