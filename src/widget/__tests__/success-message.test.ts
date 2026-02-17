// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import SuccessMessage from '../internal/SuccessMessage.svelte';

afterEach(() => cleanup());

describe('SuccessMessage', () => {
	it('renders thank you title', () => {
		const { container } = render(SuccessMessage, { props: { publicId: 42, onclose: vi.fn() } });
		expect(container.querySelector('.beacon-message-title')?.textContent).toBe('Thank you!');
	});

	it('renders public ID', () => {
		const { container } = render(SuccessMessage, { props: { publicId: 42, onclose: vi.fn() } });
		expect(container.querySelector('.beacon-message-text')?.textContent).toBe('Feedback submitted as #42');
	});

	it('renders Done button', () => {
		const { container } = render(SuccessMessage, { props: { publicId: 1, onclose: vi.fn() } });
		const btn = container.querySelector('.beacon-btn-primary');
		expect(btn?.textContent).toBe('Done');
	});

	it('calls onclose when Done is clicked', () => {
		const onclose = vi.fn();
		const { container } = render(SuccessMessage, { props: { publicId: 1, onclose } });
		const btn = container.querySelector('.beacon-btn-primary') as HTMLElement;
		btn.click();
		expect(onclose).toHaveBeenCalledOnce();
	});
});
