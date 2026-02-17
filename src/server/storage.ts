import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import type { ResolvedConfig } from './config.js';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export interface StoredFile {
	filename: string;
	path: string;
	sizeBytes: number;
}

/**
 * Sanitize a filename to alphanumeric, dots, and dashes only.
 */
export function sanitizeFilename(name: string): string {
	return name.replace(/[^a-zA-Z0-9.\-]/g, '_').replace(/_{2,}/g, '_');
}

/**
 * Derive the .beacon directory path from the database URL.
 * e.g. "file:.beacon/beacon.db" → ".beacon"
 */
export function extractDirFromDbUrl(url: string): string {
	const filePath = url.replace(/^file:/, '');
	return dirname(filePath);
}

/**
 * Store a file to disk under .beacon/storage/{taskId}/{filename}.
 * Returns metadata about the stored file.
 * Throws if the file exceeds the 5MB size limit.
 */
export async function storeFile(
	config: ResolvedConfig,
	taskId: string,
	file: { name: string; arrayBuffer(): Promise<ArrayBuffer>; size: number },
): Promise<StoredFile> {
	if (file.size > MAX_FILE_SIZE) {
		throw new Error(`File exceeds maximum size of ${MAX_FILE_SIZE} bytes`);
	}

	const beaconDir = extractDirFromDbUrl(config.database);
	const sanitized = sanitizeFilename(file.name);
	const dir = join(beaconDir, 'storage', taskId);
	const filePath = join(dir, sanitized);

	await mkdir(dir, { recursive: true });

	const buffer = Buffer.from(await file.arrayBuffer());
	await writeFile(filePath, buffer);

	return {
		filename: sanitized,
		path: filePath,
		sizeBytes: buffer.byteLength,
	};
}
