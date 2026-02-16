// Pure validation utilities for API input.
// No side effects, no database access, no imports beyond types.

type FieldResult<T> = { valid: true; value: T } | { valid: false; error: string };

type CollectInput = Record<string, FieldResult<unknown>>;

type CollectedValues<T extends CollectInput> = {
	[K in keyof T]: T[K] extends FieldResult<infer V> ? V : never;
};

type CollectResult<T extends CollectInput> =
	| { valid: true; values: CollectedValues<T> }
	| { valid: false; errors: Record<string, string> };

export type { FieldResult, CollectInput, CollectedValues, CollectResult };

export function requiredString(
	value: unknown,
	field: string,
	opts?: { maxLength?: number },
): FieldResult<string> {
	if (typeof value !== 'string' || value.trim().length === 0) {
		return { valid: false, error: `${field} is required` };
	}
	const trimmed = value.trim();
	if (opts?.maxLength !== undefined && trimmed.length > opts.maxLength) {
		return { valid: false, error: `${field} must be at most ${opts.maxLength} characters` };
	}
	return { valid: true, value: trimmed };
}

export function optionalString(
	value: unknown,
	field: string,
	opts?: { maxLength?: number },
): FieldResult<string | null> {
	if (value === null || value === undefined) {
		return { valid: true, value: null };
	}
	if (typeof value !== 'string') {
		return { valid: false, error: `${field} must be a string` };
	}
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return { valid: true, value: null };
	}
	if (opts?.maxLength !== undefined && trimmed.length > opts.maxLength) {
		return { valid: false, error: `${field} must be at most ${opts.maxLength} characters` };
	}
	return { valid: true, value: trimmed };
}

export function requiredEnum<T extends string>(
	value: unknown,
	field: string,
	allowed: readonly T[],
): FieldResult<T> {
	if (typeof value !== 'string' || !allowed.includes(value as T)) {
		return { valid: false, error: `${field} must be one of: ${allowed.join(', ')}` };
	}
	return { valid: true, value: value as T };
}

export function optionalEnum<T extends string>(
	value: unknown,
	field: string,
	allowed: readonly T[],
): FieldResult<T | null> {
	if (value === null || value === undefined || value === '') {
		return { valid: true, value: null };
	}
	return requiredEnum(value, field, allowed);
}

export function optionalEmail(
	value: unknown,
	field: string,
): FieldResult<string | null> {
	if (value === null || value === undefined || value === '') {
		return { valid: true, value: null };
	}
	if (typeof value !== 'string') {
		return { valid: false, error: `${field} must be a valid email address` };
	}
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return { valid: true, value: null };
	}
	const atIndex = trimmed.indexOf('@');
	if (atIndex === -1 || trimmed.indexOf('.', atIndex) === -1) {
		return { valid: false, error: `${field} must be a valid email address` };
	}
	return { valid: true, value: trimmed };
}

export function requiredEmail(
	value: unknown,
	field: string,
): FieldResult<string> {
	if (value === null || value === undefined || value === '') {
		return { valid: false, error: `${field} is required` };
	}
	if (typeof value !== 'string') {
		return { valid: false, error: `${field} must be a valid email address` };
	}
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return { valid: false, error: `${field} is required` };
	}
	const atIndex = trimmed.indexOf('@');
	if (atIndex === -1 || trimmed.indexOf('.', atIndex) === -1) {
		return { valid: false, error: `${field} must be a valid email address` };
	}
	return { valid: true, value: trimmed };
}

export function optionalJSON(
	value: unknown,
	field: string,
): FieldResult<string | null> {
	if (value === null || value === undefined) {
		return { valid: true, value: null };
	}
	if (typeof value === 'object') {
		try {
			return { valid: true, value: JSON.stringify(value) };
		} catch {
			return { valid: false, error: `${field} must be valid JSON` };
		}
	}
	if (typeof value === 'string') {
		try {
			JSON.parse(value);
			return { valid: true, value };
		} catch {
			return { valid: false, error: `${field} must be valid JSON` };
		}
	}
	return { valid: false, error: `${field} must be valid JSON` };
}

export function collectErrors<T extends CollectInput>(results: T): CollectResult<T> {
	const errors: Record<string, string> = {};
	const values: Record<string, unknown> = {};

	for (const [key, result] of Object.entries(results)) {
		if (!result.valid) {
			errors[key] = result.error;
		} else {
			values[key] = result.value;
		}
	}

	if (Object.keys(errors).length > 0) {
		return { valid: false, errors };
	}
	return { valid: true, values } as CollectResult<T>;
}
