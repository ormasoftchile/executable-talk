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
  
  // Replace fragment comments with data attributes on parent element
  // The comment appears after the element content, so we wrap the preceding content
  //
  // IMPORTANT: We must NOT use the `s` (dotall) flag — `.*?` must NOT cross
  // line / tag boundaries, otherwise a fragment comment inside a <p> would be
  // greedily matched against a preceding <h1> (or any earlier open tag).
  let processedHtml = html.replace(
    /(<li[^>]*>)(.*?)(<!--\s*\.fragment(?:\s+([\w-]+))?\s*-->)/g,
    (_match, openTag: string, content: string, _comment: string, animationType: string | undefined) => {
      fragmentIndex++;
      const animation = animationType || 'fade';
      // Add fragment class and data attributes to the li tag
      const newOpenTag = openTag.replace('<li', `<li class="fragment" data-fragment="${fragmentIndex}" data-fragment-animation="${animation}"`);
      return `${newOpenTag}${content}`;
    }
  );
  
  // Also handle other block elements (p, h1-h6, div, blockquote, etc.)
  // Again, NO `s` flag — we only match within a single line / tag.
  processedHtml = processedHtml.replace(
    /(<(?:p|h[1-6]|div|blockquote)[^>]*>)(.*?)(<!--\s*\.fragment(?:\s+([\w-]+))?\s*-->)/g,
    (_match, openTag: string, content: string, _comment: string, animationType: string | undefined) => {
      fragmentIndex++;
      const animation = animationType || 'fade';
      const tagName = openTag.match(/<(\w+)/)?.[1] || 'p';
      const newOpenTag = openTag.replace(`<${tagName}`, `<${tagName} class="fragment" data-fragment="${fragmentIndex}" data-fragment-animation="${animation}"`);
      return `${newOpenTag}${content}`;
    }
  );
  
  return {
    html: processedHtml,
    fragmentCount: fragmentIndex,
  };
}
