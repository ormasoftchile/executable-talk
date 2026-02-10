/**
 * Markdown-it plugin for layout directives.
 * Transforms :::center, :::columns, :::left, :::right blocks
 * into <div> wrappers with CSS layout classes.
 */

const DIRECTIVE_OPEN = /^:::(center|columns|left|right)\s*$/;
const DIRECTIVE_CLOSE = /^:::\s*$/;

/**
 * Valid layout directive names
 */
type DirectiveName = 'center' | 'columns' | 'left' | 'right';

const CSS_CLASS_MAP: Record<DirectiveName, string> = {
  center: 'layout-center',
  columns: 'layout-columns',
  left: 'layout-left',
  right: 'layout-right',
};

/**
 * Pre-processes slide markdown to transform layout directives into HTML divs
 * before markdown-it rendering. This approach avoids complex block-level plugin
 * machinery while ensuring the directives produce correct HTML structure.
 *
 * @param markdown Raw slide markdown content
 * @returns Transformed markdown with directives replaced by HTML divs
 */
export function transformLayoutDirectives(markdown: string): string {
  const lines = markdown.split('\n');
  const result: string[] = [];
  const stack: DirectiveName[] = [];
  let insideCodeFence = false;

  for (const line of lines) {
    // Track fenced code blocks — skip directive processing inside them
    if (/^(`{3,}|~{3,})/.test(line)) {
      insideCodeFence = !insideCodeFence;
      result.push(line);
      continue;
    }

    if (insideCodeFence) {
      result.push(line);
      continue;
    }

    const openMatch = line.match(DIRECTIVE_OPEN);
    if (openMatch) {
      const name = openMatch[1] as DirectiveName;
      stack.push(name);
      result.push(`<div class="${CSS_CLASS_MAP[name]}">`);
      continue;
    }

    if (DIRECTIVE_CLOSE.test(line) && stack.length > 0) {
      stack.pop();
      result.push('</div>');
      continue;
    }

    result.push(line);
  }

  // Close any unclosed directives (graceful degradation)
  while (stack.length > 0) {
    stack.pop();
    result.push('</div>');
  }

  return result.join('\n');
}
