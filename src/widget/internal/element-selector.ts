/**
 * Element selector utility for the feedback widget.
 *
 * Creates a light-DOM overlay that lets users hover over and click
 * elements in the host page. The overlay uses all inline styles
 * (no classes) because it lives outside the shadow DOM.
 */

/**
 * Escape a string for use in a CSS selector.
 * Uses the native CSS.escape when available, otherwise a simple fallback
 * that handles the most common cases (alphanumeric, hyphens, underscores).
 */
function cssEscape(value: string): string {
	if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
		return CSS.escape(value);
	}
	// Fallback: escape characters that are not valid in CSS identifiers
	return value.replace(/([^\w-])/g, '\\$1');
}

export interface SelectionOptions {
	/** The widget host element to ignore during selection. */
	ignoreElement?: HTMLElement | null;
	/** Called when the user clicks an element. */
	onSelect: (selector: string, label: string) => void;
	/** Called when the user presses Escape. */
	onCancel: () => void;
}

/**
 * Generate a CSS selector that uniquely identifies the given element.
 *
 * Strategy (in order of preference):
 * 1. `#id` if the element has an id and it's unique
 * 2. `[data-testid="value"]` if the element has a data-testid attribute
 * 3. nth-child path from element up to body, max 5 segments
 */
export function generateCssSelector(element: Element): string {
	// Strategy 1: ID selector
	if (element.id) {
		const idSelector = `#${cssEscape(element.id)}`;
		try {
			const matches = document.querySelectorAll(idSelector);
			if (matches.length === 1) {
				return idSelector;
			}
		} catch {
			// Invalid selector, fall through
		}
	}

	// Strategy 2: data-testid attribute
	const testId = element.getAttribute('data-testid');
	if (testId) {
		const testIdSelector = `[data-testid="${cssEscape(testId)}"]`;
		try {
			const matches = document.querySelectorAll(testIdSelector);
			if (matches.length === 1) {
				return testIdSelector;
			}
		} catch {
			// Invalid selector, fall through
		}
	}

	// Strategy 3: nth-child path
	const segments: string[] = [];
	let current: Element | null = element;
	const maxSegments = 5;

	while (current && current !== document.body && segments.length < maxSegments) {
		const parent = current.parentElement;
		if (!parent) break;

		const tag = current.tagName.toLowerCase();
		const children = Array.from(parent.children);
		const index = children.indexOf(current) + 1; // nth-child is 1-based
		segments.unshift(`${tag}:nth-child(${index})`);
		current = parent;
	}

	if (segments.length === 0) {
		return element.tagName.toLowerCase();
	}

	const nthChildSelector = `body > ${segments.join(' > ')}`;

	// Validate uniqueness
	try {
		const matches = document.querySelectorAll(nthChildSelector);
		if (matches.length === 1) {
			return nthChildSelector;
		}
	} catch {
		// Invalid selector, return as-is
	}

	return nthChildSelector;
}

/**
 * Generate a human-readable label for an element.
 *
 * Format: `<tagName>` + `#id` if present + `.className` for the first class.
 * Examples: `button.primary`, `div#main`, `section`
 */
export function getElementLabel(element: Element): string {
	const tag = element.tagName.toLowerCase();
	let label = tag;

	if (element.id) {
		label += `#${element.id}`;
	} else if (element.classList.length > 0) {
		label += `.${element.classList[0]}`;
	}

	return label;
}

/**
 * Start element selection mode.
 *
 * Attaches event listeners to the document and creates a highlight
 * overlay in the light DOM (document.body). The overlay uses all
 * inline styles because it lives outside the shadow root.
 *
 * @returns A cleanup function that removes event listeners and the overlay.
 */
export function startSelection(options: SelectionOptions): () => void {
	const { ignoreElement, onSelect, onCancel } = options;

	// Create the highlight overlay in the light DOM
	const overlay = document.createElement('div');
	overlay.setAttribute('data-beacon-selector-overlay', '');
	Object.assign(overlay.style, {
		position: 'fixed',
		top: '0',
		left: '0',
		width: '0',
		height: '0',
		border: '2px solid rgba(99, 102, 241, 0.8)',
		background: 'rgba(99, 102, 241, 0.1)',
		pointerEvents: 'none',
		zIndex: '2147483646',
		borderRadius: '2px',
		transition: 'top 50ms ease, left 50ms ease, width 50ms ease, height 50ms ease',
		display: 'none',
	});
	document.body.appendChild(overlay);

	let currentTarget: Element | null = null;

	function isInsideIgnored(el: Element | null): boolean {
		if (!ignoreElement || !el) return false;
		return ignoreElement.contains(el) || el === ignoreElement;
	}

	function handleMouseMove(e: MouseEvent): void {
		const target = document.elementFromPoint(e.clientX, e.clientY);

		if (!target || isInsideIgnored(target) || target === overlay) {
			overlay.style.display = 'none';
			currentTarget = null;
			return;
		}

		currentTarget = target;
		const rect = target.getBoundingClientRect();
		overlay.style.display = 'block';
		overlay.style.top = `${rect.top}px`;
		overlay.style.left = `${rect.left}px`;
		overlay.style.width = `${rect.width}px`;
		overlay.style.height = `${rect.height}px`;
	}

	function handleClick(e: MouseEvent): void {
		e.preventDefault();
		e.stopPropagation();

		if (!currentTarget || isInsideIgnored(currentTarget)) {
			return;
		}

		const selector = generateCssSelector(currentTarget);
		const label = getElementLabel(currentTarget);
		cleanupAll();
		onSelect(selector, label);
	}

	function handleKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			cleanupAll();
			onCancel();
		}
	}

	function cleanupAll(): void {
		document.removeEventListener('mousemove', handleMouseMove, true);
		document.removeEventListener('click', handleClick, true);
		document.removeEventListener('keydown', handleKeydown, true);
		if (overlay.parentNode) {
			overlay.parentNode.removeChild(overlay);
		}
	}

	// Attach listeners using capture phase to intercept before host handlers
	document.addEventListener('mousemove', handleMouseMove, true);
	document.addEventListener('click', handleClick, true);
	document.addEventListener('keydown', handleKeydown, true);

	return cleanupAll;
}
