/**
 * Renders block-sourced interactive elements as clickable action link HTML.
 *
 * Inline action links (`[label](action:...)`) are already present in `slide.html`
 * because markdown-it renders them as `<a>` tags. Block elements (from ` ```action `
 * fenced code blocks) are stripped during parsing and need to be injected as HTML
 * wherever slide content is sent to the webview.
 */

import { Slide, InteractiveElement } from '../models/slide';

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
 * 
 * @deprecated Use {@link injectBlockElements} instead which places buttons
 * at the correct position using placeholders.
 */
export function renderBlockElements(slide: Slide): string {
  const blockElements = slide.interactiveElements.filter(el => el.source === 'block');
  if (blockElements.length === 0) {
    return '';
  }

  const links = blockElements.map(el => {
    const type = el.action.type;
    const params = el.action.params ?? {};
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

/**
 * Replace `<!--ACTION:id-->` placeholders in slide HTML with rendered
 * action-button links, so buttons appear at their original position in
 * the slide content rather than being appended at the end.
 *
 * If a placeholder has no matching element (e.g. parse error), it is
 * removed from the HTML silently.
 */
export function injectBlockElements(html: string, slide: Slide): string {
  const blockElements = slide.interactiveElements.filter(el => el.source === 'block');
  // Build a map from element ID → button HTML
  const buttonMap = new Map<string, string>();
  for (const el of blockElements) {
    const type = el.action.type;
    const params = el.action.params ?? {};
    const simpleParams = Object.entries(params)
      .filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    const href = simpleParams ? `action:${type}?${simpleParams}` : `action:${type}`;
    const escapedLabel = escapeHtml(el.label);
    // If element has fragment animation, append a fragment comment so
    // processFragments will pick it up during the single-pass sweep.
    const fragmentComment = el.fragment
      ? ` <!-- .fragment${typeof el.fragment === 'string' ? ` ${el.fragment}` : ''} -->`
      : '';
    buttonMap.set(el.id, `<p><a href="${href}" data-action-id="${el.action.id}">${escapedLabel}</a>${fragmentComment}</p>`);
  }

  // Replace each placeholder; remove unmatched ones (from errored blocks)
  return html.replace(
    /<!--ACTION:(block-\d+-\d+)-->/g,
    (_match, id: string) => buttonMap.get(id) ?? '',
  );
}

/**
 * Lightweight variant of {@link injectBlockElements} that accepts an array
 * of parsed elements directly, so the slide parser can call it before
 * fragment processing (no Slide object needed yet).
 */
export function injectBlockElementsFromParsed(html: string, elements: InteractiveElement[]): string {
  const blockElements = elements.filter(el => el.source === 'block');
  if (blockElements.length === 0) {
    return html;
  }
  const buttonMap = new Map<string, string>();
  for (const el of blockElements) {
    const type = el.action.type;
    const params = el.action.params ?? {};
    const simpleParams = Object.entries(params)
      .filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    const href = simpleParams ? `action:${type}?${simpleParams}` : `action:${type}`;
    const escapedLabel = escapeHtml(el.label);
    const fragmentComment = el.fragment
      ? ` <!-- .fragment${typeof el.fragment === 'string' ? ` ${el.fragment}` : ''} -->`
      : '';
    buttonMap.set(el.id, `<p><a href="${href}" data-action-id="${el.action.id}">${escapedLabel}</a>${fragmentComment}</p>`);
  }
  return html.replace(
    /<!--ACTION:(block-\d+-\d+)-->/g,
    (_match, id: string) => buttonMap.get(id) ?? '',
  );
}
