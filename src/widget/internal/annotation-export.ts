/**
 * Flatten screenshot + annotations into a single PNG blob.
 * Uses an offscreen canvas at the original screenshot dimensions.
 */

import type { Annotation } from './annotation-types.js';
import { renderAll } from './annotation-renderer.js';
import { canvasToBlob } from './screenshot.js';

/**
 * Flatten annotations onto a screenshot blob, producing a new PNG blob.
 *
 * 1. Create offscreen canvas at original screenshot dimensions
 * 2. Load screenshot blob as Image via URL.createObjectURL
 * 3. drawImage onto canvas
 * 4. renderAll annotations on top
 * 5. canvasToBlob → return PNG blob
 * 6. Revoke temporary object URL
 */
export async function flattenAnnotations(
	screenshotBlob: Blob,
	annotations: readonly Annotation[],
	width: number,
	height: number,
): Promise<Blob> {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;

	const ctx = canvas.getContext('2d');
	if (!ctx) {
		throw new Error('Failed to get canvas 2d context');
	}

	const objectUrl = URL.createObjectURL(screenshotBlob);

	try {
		const img = await loadImage(objectUrl);
		ctx.drawImage(img, 0, 0, width, height);
		renderAll(ctx, width, height, annotations);
		return await canvasToBlob(canvas);
	} finally {
		URL.revokeObjectURL(objectUrl);
	}
}

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise<HTMLImageElement>((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error('Failed to load screenshot image'));
		img.src = src;
	});
}
