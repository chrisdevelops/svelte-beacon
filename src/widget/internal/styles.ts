import cssText from './styles.css?raw';

/**
 * Inject widget styles into a shadow root.
 * Prefers `adoptedStyleSheets` (modern browsers), falls back to `<style>`.
 */
export function injectStyles(shadowRoot: ShadowRoot): void {
	try {
		const sheet = new CSSStyleSheet();
		sheet.replaceSync(cssText);
		shadowRoot.adoptedStyleSheets = [sheet];
	} catch {
		const style = document.createElement('style');
		style.textContent = cssText;
		shadowRoot.appendChild(style);
	}
}
