import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import TaskOverview from '$lib/components/TaskOverview.svelte';
import { createMockTaskDetail } from './factories.js';

afterEach(cleanup);

describe('TaskOverview', () => {
	it('renders status dropdown', () => {
		const task = createMockTaskDetail({ status: 'new' });
		const { container } = render(TaskOverview, {
			props: { task, onstatuschange: vi.fn() },
		});
		expect(container.querySelector('select')).not.toBeNull();
	});

	it('renders description', () => {
		const task = createMockTaskDetail({ description: 'Test description here' });
		const { container } = render(TaskOverview, {
			props: { task, onstatuschange: vi.fn() },
		});
		expect(container.textContent).toContain('Test description here');
	});

	it('renders type and priority in metadata', () => {
		const task = createMockTaskDetail({ type: 'feature', priority: 'critical' });
		const { container } = render(TaskOverview, {
			props: { task, onstatuschange: vi.fn() },
		});
		expect(container.textContent).toContain('Feature');
		expect(container.textContent).toContain('Critical');
	});

	it('shows route when present', () => {
		const task = createMockTaskDetail({ route: '/dashboard/settings' });
		const { container } = render(TaskOverview, {
			props: { task, onstatuschange: vi.fn() },
		});
		expect(container.textContent).toContain('/dashboard/settings');
	});

	it('hides route when null', () => {
		const task = createMockTaskDetail({ route: null });
		const { container } = render(TaskOverview, {
			props: { task, onstatuschange: vi.fn() },
		});
		expect(container.textContent).not.toContain('Route');
	});

	it('shows email when present', () => {
		const task = createMockTaskDetail({ user_email: 'hello@test.com' });
		const { container } = render(TaskOverview, {
			props: { task, onstatuschange: vi.fn() },
		});
		expect(container.textContent).toContain('hello@test.com');
	});

	it('disables dropdown when updating', () => {
		const task = createMockTaskDetail();
		const { container } = render(TaskOverview, {
			props: { task, updating: true, onstatuschange: vi.fn() },
		});
		const select = container.querySelector('select') as HTMLSelectElement;
		expect(select.disabled).toBe(true);
	});

	it('renders Context section when task has metadata', () => {
		const task = createMockTaskDetail({
			metadata: {
				url: 'https://example.com/page',
				userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.130 Safari/537.36',
				viewport: { width: 1920, height: 1080 },
				screen: { width: 2560, height: 1440, devicePixelRatio: 2 },
				language: 'en-US',
				darkMode: true,
				accessibility: { reducedMotion: false, highContrast: false, forcedColors: false },
			},
		});
		const { container } = render(TaskOverview, {
			props: { task, onstatuschange: vi.fn() },
		});
		expect(container.textContent).toContain('Context');
		expect(container.textContent).toContain('https://example.com/page');
		expect(container.textContent).toContain('en-US');
		expect(container.textContent).toContain('Yes');
	});

	it('does not render Context section when metadata is null', () => {
		const task = createMockTaskDetail({ metadata: null });
		const { container } = render(TaskOverview, {
			props: { task, onstatuschange: vi.fn() },
		});
		expect(container.textContent).not.toContain('Context');
	});

	it('shows browser and OS info from user agent', () => {
		const task = createMockTaskDetail({
			metadata: {
				userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.130 Safari/537.36',
			},
		});
		const { container } = render(TaskOverview, {
			props: { task, onstatuschange: vi.fn() },
		});
		expect(container.textContent).toContain('Chrome 120.0.6099.130');
		expect(container.textContent).toContain('Windows 10.0');
	});
});
