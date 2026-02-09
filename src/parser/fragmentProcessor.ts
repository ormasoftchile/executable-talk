/**
 * Fragment processor - handles slide fragment animations
 * Pure functions with no VS Code dependencies for testability
 */

/**
 * Process fragment markers in HTML
 * Transforms <!-- .fragment --> comments into fragment class attributes
 * 
 * @param html - The HTML content to process
 * @returns Object with processed HTML and fragment count
 */
export function processFragments(html: string): { html: string; fragmentCount: number } {
  let fragmentIndex = 0;
  
  // Single-pass regex that matches ALL fragment-bearing elements (li, p,
  // h1-h6, div, blockquote) in one sweep so that fragment indices follow
  // document order.
  //
  // The content group uses a negative lookahead for block-level closing
  // tags — `(?!<\/(?:li|p|h[1-6]|div|blockquote)\b)` — to prevent a
  // match that starts at one element (e.g. <h1>) from extending through
  // its closing tag into a sibling element's content.  This is more
  // reliable than the previous approach of omitting the `s` (dotall) flag,
  // which broke when two elements happened to sit on the same line.
  const processedHtml = html.replace(
    /(<(li|p|h[1-6]|div|blockquote)\b[^>]*>)((?:(?!<\/(?:li|p|h[1-6]|div|blockquote)\b)[\s\S])*?)(<!--\s*\.fragment(?:\s+([\w-]+))?\s*-->)/g,
    (_match, openTag: string, tagName: string, content: string, _comment: string, animationType: string | undefined) => {
      fragmentIndex++;
      const animation = animationType || 'fade';
      const newOpenTag = openTag.replace(
        `<${tagName}`,
        `<${tagName} class="fragment" data-fragment="${fragmentIndex}" data-fragment-animation="${animation}"`,
      );
      return `${newOpenTag}${content}`;
    }
  );
  
  return {
    html: processedHtml,
    fragmentCount: fragmentIndex,
  };
}
