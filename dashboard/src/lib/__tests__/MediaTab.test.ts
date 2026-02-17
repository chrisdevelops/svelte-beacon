// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import MediaTab from '$lib/components/MediaTab.svelte';
import { createMockTaskDetail, createMockAttachment } from './factories.js';

afterEach(cleanup);

describe('MediaTab', () => {
	it('shows screenshots when attachments exist', () => {
		const task = createMockTaskDetail({
			attachments: [
				createMockAttachment({ type: 'screenshot', filename: 'page.png', url: '/__beacon/api/attachments/1' }),
				createMockAttachment({ type: 'screenshot', filename: 'error.png', url: '/__beacon/api/attachments/2' }),
			],
		});
		const { container } = render(MediaTab, { props: { task } });
		const images = container.querySelectorAll('.screenshot-img');
		expect(images).toHaveLength(2);
		expect((images[0] as HTMLImageElement).alt).toBe('page.png');
		expect((images[1] as HTMLImageElement).alt).toBe('error.png');
	});

	it('shows element selector code block when element_selector is set', () => {
		const task = createMockTaskDetail({
			element_selector: 'button.submit-btn',
		});
		const { container } = render(MediaTab, { props: { task } });
		const code = container.querySelector('.element-code');
		expect(code).not.toBeNull();
		expect(code!.textContent).toBe('button.submit-btn');
	});

	it('shows empty state when no attachments and no element selector', () => {
		const task = createMockTaskDetail({
			attachments: [],
			element_selector: null,
		});
		const { container } = render(MediaTab, { props: { task } });
		expect(container.textContent).toContain('No media attachments');
		expect(container.querySelector('.screenshot-img')).toBeNull();
		expect(container.querySelector('.element-code')).toBeNull();
	});

	it('does not show screenshot section when no screenshot attachments', () => {
		const task = createMockTaskDetail({
			attachments: [
				createMockAttachment({ type: 'log', filename: 'console.txt' }),
			],
			element_selector: 'div#main',
		});
		const { container } = render(MediaTab, { props: { task } });
		expect(container.querySelector('.screenshot-img')).toBeNull();
		// Element selector should still show
		const code = container.querySelector('.element-code');
		expect(code).not.toBeNull();
		expect(code!.textContent).toBe('div#main');
	});
});
