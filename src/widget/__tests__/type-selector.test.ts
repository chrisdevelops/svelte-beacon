// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import TypeSelector from '../internal/TypeSelector.svelte';

afterEach(() => cleanup());

describe('TypeSelector', () => {
	it('renders all 6 type options', () => {
		const { container } = render(TypeSelector, { props: { value: 'bug', onchange: vi.fn() } });
		const radios = container.querySelectorAll('[role="radio"]');
		expect(radios).toHaveLength(6);
	});

	it('renders correct labels', () => {
		const { container } = render(TypeSelector, { props: { value: 'bug', onchange: vi.fn() } });
		const labels = Array.from(container.querySelectorAll('[role="radio"]')).map((el) => el.textContent?.trim());
		expect(labels).toEqual(['Bug', 'Feature', 'Content', 'Accessibility', 'Performance', 'Other']);
	});

	it('marks selected value as checked', () => {
		const { container } = render(TypeSelector, { props: { value: 'feature', onchange: vi.fn() } });
		const radios = container.querySelectorAll('[role="radio"]');
		const feature = Array.from(radios).find((r) => r.textContent?.trim() === 'Feature');
		expect(feature?.getAttribute('aria-checked')).toBe('true');
	});

	it('marks non-selected values as unchecked', () => {
		const { container } = render(TypeSelector, { props: { value: 'bug', onchange: vi.fn() } });
		const radios = container.querySelectorAll('[role="radio"]');
		const feature = Array.from(radios).find((r) => r.textContent?.trim() === 'Feature');
		expect(feature?.getAttribute('aria-checked')).toBe('false');
	});

	it('calls onchange when option is clicked', () => {
		const onchange = vi.fn();
		const { container } = render(TypeSelector, { props: { value: 'bug', onchange } });
		const radios = container.querySelectorAll('[role="radio"]');
		const feature = Array.from(radios).find((r) => r.textContent?.trim() === 'Feature');
		(feature as HTMLElement).click();
		expect(onchange).toHaveBeenCalledWith('feature');
	});

	it('has a radiogroup role', () => {
		const { container } = render(TypeSelector, { props: { value: 'bug', onchange: vi.fn() } });
		expect(container.querySelector('[role="radiogroup"]')).toBeTruthy();
	});

	it('renders label "Type"', () => {
		const { container } = render(TypeSelector, { props: { value: 'bug', onchange: vi.fn() } });
		expect(container.querySelector('.beacon-label')?.textContent).toBe('Type');
	});
});
