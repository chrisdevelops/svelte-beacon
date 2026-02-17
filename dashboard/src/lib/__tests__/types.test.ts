import { describe, it, expect } from 'vitest';
import {
	TASK_TYPES, PRIORITY_LEVELS, TASK_STATUSES,
	TYPE_LABELS, PRIORITY_LABELS,
} from '$lib/types.js';

describe('types constants', () => {
	it('has all task types', () => {
		expect(TASK_TYPES).toContain('bug');
		expect(TASK_TYPES).toContain('feature');
		expect(TASK_TYPES).toContain('other');
		expect(TASK_TYPES).toHaveLength(6);
	});

	it('has all priority levels', () => {
		expect(PRIORITY_LEVELS).toContain('low');
		expect(PRIORITY_LEVELS).toContain('critical');
		expect(PRIORITY_LEVELS).toHaveLength(4);
	});

	it('has all task statuses', () => {
		expect(TASK_STATUSES).toContain('new');
		expect(TASK_STATUSES).toContain('closed');
		expect(TASK_STATUSES).toHaveLength(7);
	});

	it('has labels for all types', () => {
		for (const t of TASK_TYPES) {
			expect(TYPE_LABELS[t]).toBeDefined();
		}
	});

	it('has labels for all priorities', () => {
		for (const p of PRIORITY_LEVELS) {
			expect(PRIORITY_LABELS[p]).toBeDefined();
		}
	});
});
