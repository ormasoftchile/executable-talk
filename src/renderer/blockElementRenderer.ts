/**
 * Renders block-sourced interactive elements as clickable action link HTML.
 *
 * Inline action links (`[label](action:...)`) are already present in `slide.html`
 * because markdown-it renders them as `<a>` tags. Block elements (from ` ```action `
 * fenced code blocks) are stripped during parsing and need to be injected as HTML
 * wherever slide content is sent to the webview.
 */

import { Slide } from '../models/slide';

/**
 * Escape HTML special characters in content strings.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generate HTML for block-sourced interactive elements on a slide.
 * Returns an empty string if the slide has no block elements.
 */
export function renderBlockElements(slide: Slide): string {
  const blockElements = slide.interactiveElements.filter(el => el.source === 'block');
  if (blockElements.length === 0) {
    return '';
  }

  const links = blockElements.map(el => {
    const type = el.action.type;
    const params = el.action.params ?? {};
    // Build a simple action: href for CSS styling (a[href^="action:"])
    // Complex params like steps can't be fully URL-encoded, but the click
    // handler will use data-action-id to look up the real action by ID.
    const simpleParams = Object.entries(params)
      .filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    const href = simpleParams ? `action:${type}?${simpleParams}` : `action:${type}`;
    const escapedLabel = escapeHtml(el.label);
    return `<p><a href="${href}" data-action-id="${el.action.id}">${escapedLabel}</a></p>`;
  });

  return '\n' + links.join('\n');
}
