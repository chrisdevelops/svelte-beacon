import { describe, it, expect } from 'vitest';
import {
	requiredString,
	optionalString,
	requiredEnum,
	optionalEnum,
	optionalEmail,
	requiredEmail,
	optionalJSON,
	collectErrors,
} from '../validate.js';

// -- requiredString --

describe('requiredString', () => {
	it('returns error for null', () => {
		const result = requiredString(null, 'name');
		expect(result).toEqual({ valid: false, error: 'name is required' });
	});

	it('returns error for undefined', () => {
		const result = requiredString(undefined, 'name');
		expect(result).toEqual({ valid: false, error: 'name is required' });
	});

	it('returns error for empty string', () => {
		const result = requiredString('', 'name');
		expect(result).toEqual({ valid: false, error: 'name is required' });
	});

	it('returns error for whitespace-only string', () => {
		const result = requiredString('   ', 'name');
		expect(result).toEqual({ valid: false, error: 'name is required' });
	});

	it('trims and returns valid string', () => {
		const result = requiredString('  hello  ', 'name');
		expect(result).toEqual({ valid: true, value: 'hello' });
	});

	it('enforces maxLength', () => {
		const result = requiredString('abcdef', 'name', { maxLength: 3 });
		expect(result).toEqual({ valid: false, error: 'name must be at most 3 characters' });
	});

	it('passes when under maxLength', () => {
		const result = requiredString('abc', 'name', { maxLength: 5 });
		expect(result).toEqual({ valid: true, value: 'abc' });
	});
});

// -- optionalString --

describe('optionalString', () => {
	it('returns null for null', () => {
		const result = optionalString(null, 'note');
		expect(result).toEqual({ valid: true, value: null });
	});

	it('returns null for undefined', () => {
		const result = optionalString(undefined, 'note');
		expect(result).toEqual({ valid: true, value: null });
	});

	it('returns null for empty string', () => {
		const result = optionalString('', 'note');
		expect(result).toEqual({ valid: true, value: null });
	});

	it('trims and returns non-empty string', () => {
		const result = optionalString('  hello  ', 'note');
		expect(result).toEqual({ valid: true, value: 'hello' });
	});

	it('enforces maxLength on non-empty', () => {
		const result = optionalString('abcdef', 'note', { maxLength: 3 });
		expect(result).toEqual({ valid: false, error: 'note must be at most 3 characters' });
	});
});

// -- requiredEnum --

describe('requiredEnum', () => {
	const allowed = ['low', 'medium', 'high'] as const;

	it('returns error for value not in list', () => {
		const result = requiredEnum('critical', 'priority', allowed);
		expect(result).toEqual({
			valid: false,
			error: 'priority must be one of: low, medium, high',
		});
	});

	it('returns error for null', () => {
		const result = requiredEnum(null, 'priority', allowed);
		expect(result).toEqual({
			valid: false,
			error: 'priority must be one of: low, medium, high',
		});
	});

	it('accepts valid value', () => {
		const result = requiredEnum('medium', 'priority', allowed);
		expect(result).toEqual({ valid: true, value: 'medium' });
	});

	it('returns the value typed correctly', () => {
		const result = requiredEnum('high', 'priority', allowed);
		expect(result.valid).toBe(true);
		if (result.valid) {
			// TypeScript should narrow this to 'low' | 'medium' | 'high'
			const val: 'low' | 'medium' | 'high' = result.value;
			expect(val).toBe('high');
		}
	});
});

// -- optionalEnum --

describe('optionalEnum', () => {
	const allowed = ['bug', 'feature', 'other'] as const;

	it('returns null for null', () => {
		const result = optionalEnum(null, 'type', allowed);
		expect(result).toEqual({ valid: true, value: null });
	});

	it('returns null for undefined', () => {
		const result = optionalEnum(undefined, 'type', allowed);
		expect(result).toEqual({ valid: true, value: null });
	});

	it('returns null for empty string', () => {
		const result = optionalEnum('', 'type', allowed);
		expect(result).toEqual({ valid: true, value: null });
	});

	it('validates non-empty against list', () => {
		const result = optionalEnum('invalid', 'type', allowed);
		expect(result).toEqual({
			valid: false,
			error: 'type must be one of: bug, feature, other',
		});
	});

	it('accepts valid value', () => {
		const result = optionalEnum('bug', 'type', allowed);
		expect(result).toEqual({ valid: true, value: 'bug' });
	});
});

// -- optionalEmail --

describe('optionalEmail', () => {
	it('returns null for null', () => {
		const result = optionalEmail(null, 'email');
		expect(result).toEqual({ valid: true, value: null });
	});

	it('returns null for undefined', () => {
		const result = optionalEmail(undefined, 'email');
		expect(result).toEqual({ valid: true, value: null });
	});

	it('returns null for empty string', () => {
		const result = optionalEmail('', 'email');
		expect(result).toEqual({ valid: true, value: null });
	});

	it('returns error for string without @', () => {
		const result = optionalEmail('notanemail.com', 'email');
		expect(result).toEqual({ valid: false, error: 'email must be a valid email address' });
	});

	it('returns error for string without . after @', () => {
		const result = optionalEmail('user@localhost', 'email');
		expect(result).toEqual({ valid: false, error: 'email must be a valid email address' });
	});

	it('accepts valid email', () => {
		const result = optionalEmail('user@example.com', 'email');
		expect(result).toEqual({ valid: true, value: 'user@example.com' });
	});

	it('trims email', () => {
		const result = optionalEmail('  user@example.com  ', 'email');
		expect(result).toEqual({ valid: true, value: 'user@example.com' });
	});
});

// -- requiredEmail --

describe('requiredEmail', () => {
	it('returns error for null', () => {
		const result = requiredEmail(null, 'email');
		expect(result).toEqual({ valid: false, error: 'email is required' });
	});

	it('returns error for undefined', () => {
		const result = requiredEmail(undefined, 'email');
		expect(result).toEqual({ valid: false, error: 'email is required' });
	});

	it('returns error for empty string', () => {
		const result = requiredEmail('', 'email');
		expect(result).toEqual({ valid: false, error: 'email is required' });
	});

	it('returns error for invalid format', () => {
		const result = requiredEmail('notanemail', 'email');
		expect(result).toEqual({ valid: false, error: 'email must be a valid email address' });
	});

	it('accepts valid email', () => {
		const result = requiredEmail('admin@example.com', 'email');
		expect(result).toEqual({ valid: true, value: 'admin@example.com' });
	});
});

// -- optionalJSON --

describe('optionalJSON', () => {
	it('returns null for null', () => {
		const result = optionalJSON(null, 'metadata');
		expect(result).toEqual({ valid: true, value: null });
	});

	it('returns null for undefined', () => {
		const result = optionalJSON(undefined, 'metadata');
		expect(result).toEqual({ valid: true, value: null });
	});

	it('serializes object to string', () => {
		const result = optionalJSON({ key: 'value' }, 'metadata');
		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.value).toBe('{"key":"value"}');
		}
	});

	it('validates and passes through valid JSON string', () => {
		const jsonStr = '{"key":"value"}';
		const result = optionalJSON(jsonStr, 'metadata');
		expect(result).toEqual({ valid: true, value: jsonStr });
	});

	it('returns error for invalid JSON string', () => {
		const result = optionalJSON('{not valid json}', 'metadata');
		expect(result).toEqual({ valid: false, error: 'metadata must be valid JSON' });
	});
});

// -- collectErrors --

describe('collectErrors', () => {
	it('returns errors when any field fails', () => {
		const result = collectErrors({
			name: requiredString('', 'name'),
			email: requiredEmail('bad', 'email'),
		});

		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(result.errors).toEqual({
				name: 'name is required',
				email: 'email must be a valid email address',
			});
		}
	});

	it('returns all values when all pass', () => {
		const result = collectErrors({
			name: requiredString('Alice', 'name'),
			email: requiredEmail('alice@example.com', 'email'),
			note: optionalString(null, 'note'),
		});

		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.values).toEqual({
				name: 'Alice',
				email: 'alice@example.com',
				note: null,
			});
		}
	});

	it('collects multiple errors from multiple fields', () => {
		const result = collectErrors({
			description: requiredString(null, 'description'),
			type: requiredEnum('invalid', 'type', ['bug', 'feature'] as const),
			priority: requiredEnum(42, 'priority', ['low', 'high'] as const),
		});

		expect(result.valid).toBe(false);
		if (!result.valid) {
			expect(Object.keys(result.errors)).toHaveLength(3);
			expect(result.errors['description']).toBe('description is required');
			expect(result.errors['type']).toBe('type must be one of: bug, feature');
			expect(result.errors['priority']).toBe('priority must be one of: low, high');
		}
	});
});
