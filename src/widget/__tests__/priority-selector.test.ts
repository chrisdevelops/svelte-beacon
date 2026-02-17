// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import PrioritySelector from '../internal/PrioritySelector.svelte';

afterEach(() => cleanup());

describe('PrioritySelector', () => {
	it('renders all 4 priority options', () => {
		const { container } = render(PrioritySelector, { props: { value: 'medium', onchange: vi.fn() } });
		const radios = container.querySelectorAll('[role="radio"]');
		expect(radios).toHaveLength(4);
	});

	it('renders correct labels', () => {
		const { container } = render(PrioritySelector, { props: { value: 'medium', onchange: vi.fn() } });
		const labels = Array.from(container.querySelectorAll('[role="radio"]')).map((el) => el.textContent?.trim());
		expect(labels).toEqual(['Low', 'Medium', 'High', 'Critical']);
	});

	it('marks selected value as checked', () => {
		const { container } = render(PrioritySelector, { props: { value: 'high', onchange: vi.fn() } });
		const radios = container.querySelectorAll('[role="radio"]');
		const high = Array.from(radios).find((r) => r.textContent?.trim() === 'High');
		expect(high?.getAttribute('aria-checked')).toBe('true');
	});

	it('marks non-selected values as unchecked', () => {
		const { container } = render(PrioritySelector, { props: { value: 'high', onchange: vi.fn() } });
		const radios = container.querySelectorAll('[role="radio"]');
		const low = Array.from(radios).find((r) => r.textContent?.trim() === 'Low');
		expect(low?.getAttribute('aria-checked')).toBe('false');
	});

	it('calls onchange when option is clicked', () => {
		const onchange = vi.fn();
		const { container } = render(PrioritySelector, { props: { value: 'medium', onchange } });
		const radios = container.querySelectorAll('[role="radio"]');
		const critical = Array.from(radios).find((r) => r.textContent?.trim() === 'Critical');
		(critical as HTMLElement).click();
		expect(onchange).toHaveBeenCalledWith('critical');
	});

	it('has a radiogroup role', () => {
		const { container } = render(PrioritySelector, { props: { value: 'medium', onchange: vi.fn() } });
		expect(container.querySelector('[role="radiogroup"]')).toBeTruthy();
	});

	it('renders label "Priority"', () => {
		const { container } = render(PrioritySelector, { props: { value: 'medium', onchange: vi.fn() } });
		expect(container.querySelector('.beacon-label')?.textContent).toBe('Priority');
	});
});
