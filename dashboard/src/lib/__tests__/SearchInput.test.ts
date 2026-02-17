import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import SearchInput from '$lib/components/SearchInput.svelte';

afterEach(cleanup);

describe('SearchInput', () => {
	it('renders search input', () => {
		const { container } = render(SearchInput, {
			props: { onchange: vi.fn() },
		});
		const input = container.querySelector('input[type="search"]');
		expect(input).not.toBeNull();
	});

	it('has correct aria label', () => {
		const { container } = render(SearchInput, {
			props: { onchange: vi.fn() },
		});
		expect(container.querySelector('[aria-label="Search tasks"]')).not.toBeNull();
	});

	it('shows placeholder text', () => {
		const { container } = render(SearchInput, {
			props: { onchange: vi.fn() },
		});
		const input = container.querySelector('input') as HTMLInputElement;
		expect(input.placeholder).toBe('Search tasks...');
	});

	it('calls onchange after debounce', async () => {
		vi.useFakeTimers();
		const onchange = vi.fn();
		const { container } = render(SearchInput, {
			props: { onchange },
		});
		const input = container.querySelector('input') as HTMLInputElement;

		// Set value natively and dispatch bubbling input event
		const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype, 'value'
		)!.set!;
		nativeInputValueSetter.call(input, 'test query');
		input.dispatchEvent(new Event('input', { bubbles: true }));

		// Not called yet (debounced)
		expect(onchange).not.toHaveBeenCalled();

		// Advance past debounce
		vi.advanceTimersByTime(300);
		expect(onchange).toHaveBeenCalledWith('test query');

		vi.useRealTimers();
	});
});
