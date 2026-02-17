export interface CaptureOptions {
	hideElement?: HTMLElement | null;
}

export interface CaptureResult {
	blob: Blob;
	width: number;
	height: number;
}

/**
 * Capture a screenshot of the current viewport using html2canvas.
 *
 * The `hideElement` option temporarily hides the widget host element
 * during capture so it does not appear in the screenshot. The element
 * is always restored in a `finally` block.
 */
export async function captureScreenshot(options: CaptureOptions = {}): Promise<CaptureResult> {
	const { default: html2canvas } = await import('html2canvas');

	const el = options.hideElement;
	const previousDisplay = el ? el.style.display : '';

	if (el) {
		el.style.display = 'none';
	}

	try {
		const canvas = await html2canvas(document.body, {
			windowWidth: document.documentElement.clientWidth,
			windowHeight: document.documentElement.clientHeight,
			width: document.documentElement.clientWidth,
			height: document.documentElement.clientHeight,
			scrollX: window.scrollX,
			scrollY: window.scrollY,
			x: window.scrollX,
			y: window.scrollY,
			scale: window.devicePixelRatio || 1,
			useCORS: true,
			allowTaint: false,
			logging: false,
		});

		const blob = await canvasToBlob(canvas);

		return {
			blob,
			width: canvas.width,
			height: canvas.height,
		};
	} finally {
		if (el) {
			el.style.display = previousDisplay;
		}
	}
}

/**
 * Check whether the html2canvas library is available.
 * Returns `false` if the dynamic import fails (e.g., peer dep not installed).
 */
export async function isScreenshotAvailable(): Promise<boolean> {
	try {
		await import('html2canvas');
		return true;
	} catch {
		return false;
	}
}

/**
 * Convert an HTMLCanvasElement to a PNG Blob.
 */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
	return new Promise<Blob>((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (blob) {
					resolve(blob);
				} else {
					reject(new Error('Canvas toBlob returned null'));
				}
			},
			'image/png',
		);
	});
}
