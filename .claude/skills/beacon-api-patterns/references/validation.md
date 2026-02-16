# Input Validation

## Table of Contents

- Validation approach
- The validate utility
- Field types and rules
- Validation by endpoint
- Handling validation errors
- Sanitization

---

## Validation Approach

Beacon uses a simple, explicit validation layer — no schema library, no
decorators. Each handler validates its own input using small utility functions.
The reason: Beacon is a single-developer tool with a known client (the widget
and dashboard). The input surface is small and stable. A lightweight approach
keeps dependencies low and makes the validation logic easy to read and modify.

If the project grows to need more complex validation (nested objects, unions,
conditional fields), consider adopting Zod or Valibot at that point. For now,
the utility functions below are sufficient and have zero dependencies.

---

## The Validate Utility

A small set of functions that parse and validate individual fields, returning
either the validated value or a descriptive error:

```typescript
// src/server/api/validate.ts

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function ok<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

function fail<T>(error: string): ValidationResult<T> {
  return { ok: false, error };
}

// --- String fields ---

export function requiredString(
  value: unknown,
  field: string,
  opts?: { minLength?: number; maxLength?: number }
): ValidationResult<string> {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fail(`${field} is required`);
  }
  const trimmed = value.trim();
  if (opts?.minLength && trimmed.length < opts.minLength) {
    return fail(`${field} must be at least ${opts.minLength} characters`);
  }
  if (opts?.maxLength && trimmed.length > opts.maxLength) {
    return fail(`${field} must be at most ${opts.maxLength} characters`);
  }
  return ok(trimmed);
}

export function optionalString(
  value: unknown,
  field: string,
  opts?: { maxLength?: number }
): ValidationResult<string | null> {
  if (value === null || value === undefined || value === '') {
    return ok(null);
  }
  if (typeof value !== 'string') {
    return fail(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (opts?.maxLength && trimmed.length > opts.maxLength) {
    return fail(`${field} must be at most ${opts.maxLength} characters`);
  }
  return ok(trimmed || null);
}

// --- Enum fields ---

export function requiredEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[]
): ValidationResult<T> {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    return fail(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return ok(value as T);
}

export function optionalEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[]
): ValidationResult<T | null> {
  if (value === null || value === undefined || value === '') {
    return ok(null);
  }
  return requiredEnum(value, field, allowed);
}

// --- Email ---

export function optionalEmail(
  value: unknown,
  field: string
): ValidationResult<string | null> {
  if (value === null || value === undefined || value === '') {
    return ok(null);
  }
  if (typeof value !== 'string') {
    return fail(`${field} must be a string`);
  }
  const trimmed = value.trim().toLowerCase();
  // Intentionally simple — not trying to be RFC 5322 compliant.
  // Catches obvious non-emails without rejecting valid unusual addresses.
  if (!trimmed.includes('@') || !trimmed.includes('.')) {
    return fail(`${field} must be a valid email address`);
  }
  return ok(trimmed);
}

export function requiredEmail(
  value: unknown,
  field: string
): ValidationResult<string> {
  const result = optionalEmail(value, field);
  if (!result.ok) return result;
  if (result.value === null) return fail(`${field} is required`);
  return ok(result.value);
}

// --- JSON (for metadata blobs) ---

export function optionalJSON(
  value: unknown,
  field: string
): ValidationResult<string | null> {
  if (value === null || value === undefined || value === '') {
    return ok(null);
  }
  if (typeof value === 'object') {
    // Already parsed — stringify for storage
    try {
      return ok(JSON.stringify(value));
    } catch {
      return fail(`${field} must be valid JSON`);
    }
  }
  if (typeof value === 'string') {
    try {
      JSON.parse(value);
      return ok(value);
    } catch {
      return fail(`${field} must be valid JSON`);
    }
  }
  return fail(`${field} must be valid JSON`);
}
```

### Collecting Validation Errors

Handlers validate all fields and collect errors before returning, rather
than failing on the first invalid field. This gives the client a complete
picture of what needs fixing:

```typescript
export function collectErrors(
  results: Record<string, ValidationResult<unknown>>
): { valid: false; errors: Record<string, string> } | { valid: true; values: Record<string, unknown> } {
  const errors: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  for (const [key, result] of Object.entries(results)) {
    if (!result.ok) {
      errors[key] = result.error;
    } else {
      values[key] = result.value;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }
  return { valid: true, values };
}
```

Usage in a handler:

```typescript
route('POST', '/feedback', async (event, db, config, params) => {
  const formData = await parseFormData(event);
  if (!formData) return errorResponse(400, 'Invalid form data');

  const validation = collectErrors({
    description: requiredString(formData.get('description'), 'description', { maxLength: 10000 }),
    type: requiredEnum(formData.get('type'), 'type', TASK_TYPES),
    priority: requiredEnum(formData.get('priority'), 'priority', PRIORITY_LEVELS),
    email: optionalEmail(formData.get('email'), 'email'),
    route: optionalString(formData.get('route'), 'route', { maxLength: 2000 }),
    metadata: optionalJSON(formData.get('metadata'), 'metadata'),
  });

  if (!validation.valid) {
    return jsonResponse({ error: 'Validation failed', fields: validation.errors }, 400);
  }

  const { description, type, priority, email, route, metadata } = validation.values;
  // ... proceed with validated data
});
```

---

## Allowed Values

These constants define the valid values for enum fields. They're used by
both validation and the database schema:

```typescript
// src/server/constants.ts

export const TASK_TYPES = [
  'bug',
  'feature',
  'content',
  'accessibility',
  'performance',
  'other',
] as const;

export const PRIORITY_LEVELS = [
  'low',
  'medium',
  'high',
  'critical',
] as const;

export const TASK_STATUSES = [
  'new',
  'backlog',
  'ai_working',
  'blocked',
  'needs_review',
  'done',
  'closed',
] as const;

export type TaskType = typeof TASK_TYPES[number];
export type Priority = typeof PRIORITY_LEVELS[number];
export type TaskStatus = typeof TASK_STATUSES[number];
```

---

## Validation by Endpoint

### POST /feedback (widget submission)

| Field | Source | Rule |
|-------|--------|------|
| `description` | formData | Required string, max 10000 chars |
| `type` | formData | Required, one of TASK_TYPES |
| `priority` | formData | Required, one of PRIORITY_LEVELS |
| `email` | formData | Optional email (required if config.widget.requireEmail) |
| `route` | formData | Optional string, max 2000 chars |
| `element_selector` | formData | Optional string, max 1000 chars |
| `metadata` | formData | Optional JSON string |
| `screenshot` | formData | Optional File, see file-handling.md |
| `attachments` | formData | Optional File[], see file-handling.md |

Note: `requireEmail` is a config-level toggle. The handler should check
`config.widget.requireEmail` and use `requiredEmail` or `optionalEmail`
accordingly.

### PATCH /tasks/:id (update task)

| Field | Source | Rule |
|-------|--------|------|
| `status` | JSON body | Optional, one of TASK_STATUSES |
| `type` | JSON body | Optional, one of TASK_TYPES |
| `priority` | JSON body | Optional, one of PRIORITY_LEVELS |
| `description` | JSON body | Optional string, max 10000 chars |

At least one field must be present. All fields are optional individually,
but an empty update is a 400.

### POST /tasks/:id/notes (add grooming note)

| Field | Source | Rule |
|-------|--------|------|
| `content` | JSON body | Required string, max 50000 chars |

### POST /ai/unblock/:id (answer agent question)

| Field | Source | Rule |
|-------|--------|------|
| `answer` | JSON body | Required string, max 10000 chars |

### POST /ai/assist (widget AI description)

| Field | Source | Rule |
|-------|--------|------|
| `description` | JSON body | Required string, max 10000 chars |
| `screenshot` | JSON body | Optional base64 string |
| `metadata` | JSON body | Optional JSON object |

### POST /auth/magic-link

| Field | Source | Rule |
|-------|--------|------|
| `email` | JSON body | Required email |

### GET /tasks (list)

| Field | Source | Rule |
|-------|--------|------|
| `status` | query param | Optional, one of TASK_STATUSES |
| `type` | query param | Optional, one of TASK_TYPES |
| `priority` | query param | Optional, one of PRIORITY_LEVELS |
| `sort` | query param | Optional, one of: created_at, updated_at, priority, public_id |
| `order` | query param | Optional, "asc" or "desc" (default: desc) |
| `page` | query param | Optional integer >= 1 (default: 1) |
| `limit` | query param | Optional integer 1-100 (default: 50) |
| `search` | query param | Optional string, searches description text |

### GET /tasks/export (bulk export)

| Field | Source | Rule |
|-------|--------|------|
| `status` | query param | Optional, one of TASK_STATUSES |
| `since` | query param | Optional ISO datetime string |

---

## Handling Validation Errors

Validation errors return 400 with a structured body:

```json
{
  "error": "Validation failed",
  "fields": {
    "description": "description is required",
    "type": "type must be one of: bug, feature, content, accessibility, performance, other"
  }
}
```

The `fields` object maps field names to human-readable error messages. The
dashboard and widget use this to display field-level error indicators.

For single-field errors (like a bad path parameter), use a simple error:

```json
{ "error": "Invalid task ID" }
```

---

## Sanitization

Input is trimmed but not HTML-escaped on the server. The dashboard and widget
are responsible for safe rendering (Svelte auto-escapes by default). The
database stores the raw trimmed input.

The one exception: if description text is used in a Claude Code prompt, it
should be treated as untrusted input. The prompt construction layer (in the
AI bridge, not in the API handler) is responsible for any necessary escaping
or sandboxing.
