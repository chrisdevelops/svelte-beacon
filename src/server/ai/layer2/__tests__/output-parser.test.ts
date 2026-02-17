import { describe, it, expect } from 'vitest';
import { parseStreamLine, extractBeaconMarker } from '../output-parser.js';

// --- Helpers to build stream-json envelopes ---

function assistantEnvelope(text: string): string {
	return JSON.stringify({
		type: 'assistant',
		message: {
			content: [{ type: 'text', text }],
		},
	});
}

function resultEnvelope(result: string): string {
	return JSON.stringify({
		type: 'result',
		result,
		duration_ms: 1234,
	});
}

// --- parseStreamLine tests ---

describe('parseStreamLine', () => {
	it('parses a PROGRESS marker from an assistant line', () => {
		const line = assistantEnvelope(
			'[BEACON:PROGRESS] {"phase":"analyzing","message":"Reading codebase structure"}',
		);

		const marker = parseStreamLine(line);

		expect(marker).toEqual({
			type: 'progress',
			phase: 'analyzing',
			message: 'Reading codebase structure',
		});
	});

	it('parses a BLOCKED marker from an assistant line', () => {
		const line = assistantEnvelope(
			'[BEACON:BLOCKED] {"question":"Which database table should I modify?"}',
		);

		const marker = parseStreamLine(line);

		expect(marker).toEqual({
			type: 'blocked',
			question: 'Which database table should I modify?',
		});
	});

	it('parses a COMPLETE marker with prUrl', () => {
		const line = assistantEnvelope(
			'[BEACON:COMPLETE] {"branch":"beacon/abc-1-fix-login","prUrl":"https://github.com/org/repo/pull/42","summary":"Fixed the login bug"}',
		);

		const marker = parseStreamLine(line);

		expect(marker).toEqual({
			type: 'complete',
			branch: 'beacon/abc-1-fix-login',
			prUrl: 'https://github.com/org/repo/pull/42',
			summary: 'Fixed the login bug',
		});
	});

	it('parses a COMPLETE marker with null prUrl', () => {
		const line = assistantEnvelope(
			'[BEACON:COMPLETE] {"branch":"beacon/def-2-add-feature","prUrl":null,"summary":"Added the feature"}',
		);

		const marker = parseStreamLine(line);

		expect(marker).toEqual({
			type: 'complete',
			branch: 'beacon/def-2-add-feature',
			prUrl: null,
			summary: 'Added the feature',
		});
	});

	it('parses an ERROR marker', () => {
		const line = assistantEnvelope(
			'[BEACON:ERROR] {"message":"TypeScript compilation failed with 3 errors"}',
		);

		const marker = parseStreamLine(line);

		expect(marker).toEqual({
			type: 'error',
			message: 'TypeScript compilation failed with 3 errors',
		});
	});

	it('parses a marker embedded in a result-type line', () => {
		const line = resultEnvelope(
			'Task completed successfully.\n[BEACON:COMPLETE] {"branch":"beacon/ghi-3-perf","prUrl":null,"summary":"Optimized render loop"}',
		);

		const marker = parseStreamLine(line);

		expect(marker).toEqual({
			type: 'complete',
			branch: 'beacon/ghi-3-perf',
			prUrl: null,
			summary: 'Optimized render loop',
		});
	});

	it('returns null for non-marker assistant text', () => {
		const line = assistantEnvelope('I am now going to analyze the codebase.');

		const marker = parseStreamLine(line);

		expect(marker).toBeNull();
	});

	it('returns null for malformed JSON envelope', () => {
		const marker = parseStreamLine('{this is not valid json}');

		expect(marker).toBeNull();
	});

	it('returns null for empty line', () => {
		expect(parseStreamLine('')).toBeNull();
		expect(parseStreamLine('   ')).toBeNull();
	});

	it('returns null for system/tool_use type envelopes', () => {
		const systemLine = JSON.stringify({
			type: 'system',
			message: 'Initializing...',
		});
		const toolUseLine = JSON.stringify({
			type: 'tool_use',
			name: 'Read',
			input: { file_path: '/foo/bar.ts' },
		});
		const toolResultLine = JSON.stringify({
			type: 'tool_result',
			output: 'file contents here',
		});

		expect(parseStreamLine(systemLine)).toBeNull();
		expect(parseStreamLine(toolUseLine)).toBeNull();
		expect(parseStreamLine(toolResultLine)).toBeNull();
	});
});

// --- extractBeaconMarker tests ---

describe('extractBeaconMarker', () => {
	it('returns null when text has no BEACON prefix', () => {
		expect(extractBeaconMarker('Just some regular text')).toBeNull();
		expect(extractBeaconMarker('Working on the task now...')).toBeNull();
	});

	it('returns null for invalid JSON payload after marker prefix', () => {
		const marker = extractBeaconMarker('[BEACON:PROGRESS] {not valid json}');

		expect(marker).toBeNull();
	});

	it('returns null for unknown BEACON marker type', () => {
		const marker = extractBeaconMarker(
			'[BEACON:UNKNOWN] {"foo":"bar"}',
		);

		expect(marker).toBeNull();
	});

	it('returns null for PROGRESS with invalid phase', () => {
		const marker = extractBeaconMarker(
			'[BEACON:PROGRESS] {"phase":"dancing","message":"Having fun"}',
		);

		expect(marker).toBeNull();
	});

	it('returns null for PROGRESS with missing message', () => {
		const marker = extractBeaconMarker(
			'[BEACON:PROGRESS] {"phase":"analyzing"}',
		);

		expect(marker).toBeNull();
	});

	it('returns null for COMPLETE with missing required fields', () => {
		// Missing summary
		expect(extractBeaconMarker(
			'[BEACON:COMPLETE] {"branch":"beacon/x","prUrl":null}',
		)).toBeNull();

		// Missing branch
		expect(extractBeaconMarker(
			'[BEACON:COMPLETE] {"prUrl":null,"summary":"Done"}',
		)).toBeNull();
	});

	it('extracts a marker when it appears after other text on the same line', () => {
		const marker = extractBeaconMarker(
			'Here is some preamble text [BEACON:PROGRESS] {"phase":"testing","message":"Running test suite"}',
		);

		expect(marker).toEqual({
			type: 'progress',
			phase: 'testing',
			message: 'Running test suite',
		});
	});

	it('accepts all valid phases', () => {
		const phases = ['starting', 'analyzing', 'planning', 'implementing', 'testing', 'verifying', 'committing'];

		for (const phase of phases) {
			const marker = extractBeaconMarker(
				`[BEACON:PROGRESS] {"phase":"${phase}","message":"msg"}`,
			);
			expect(marker).toEqual({ type: 'progress', phase, message: 'msg' });
		}
	});
});
