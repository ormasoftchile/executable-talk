/**
 * Markdown-it plugin for layout directives.
 * Transforms :::center, :::columns, :::left, :::right blocks
 * into <div> wrappers with CSS layout classes.
 * Also handles :::advanced (collapsible details) and :::optional (badge-marked) sections.
 */

const DIRECTIVE_OPEN = /^:::(center|columns|left|right|advanced|optional)\s*$/;
const DIRECTIVE_CLOSE = /^:::\s*$/;

/**
 * Valid layout directive names
 */
type DirectiveName = 'center' | 'columns' | 'left' | 'right' | 'advanced' | 'optional';

const CSS_CLASS_MAP: Record<string, string> = {
  center: 'layout-center',
  columns: 'layout-columns',
  left: 'layout-left',
  right: 'layout-right',
};

function getOpenTag(name: DirectiveName): string {
  switch (name) {
    case 'advanced':
      return '<details class="disclosure-advanced"><summary>Advanced</summary>';
    case 'optional':
      return '<div class="step-optional"><span class="optional-badge">Optional</span>';
    default:
      return `<div class="${CSS_CLASS_MAP[name]}">`;
  }
}

function getCloseTag(name: DirectiveName): string {
  return name === 'advanced' ? '</details>' : '</div>';
}

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
      result.push(getOpenTag(name));
      // Add blank line after opening tag so markdown-it parses inner content as markdown
      result.push('');
      continue;
    }

    if (DIRECTIVE_CLOSE.test(line) && stack.length > 0) {
      const top = stack[stack.length - 1];
      stack.pop();
      // Add blank line before closing tag so markdown-it ends the markdown context cleanly
      result.push('');
      result.push(getCloseTag(top));
      continue;
    }

    result.push(line);
  }

  // Close any unclosed directives (graceful degradation)
  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    stack.pop();
    result.push(getCloseTag(top));
  }

  return result.join('\n');
}
