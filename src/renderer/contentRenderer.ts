/**
 * Content renderer - resolves render directives to HTML
 */

import { RenderDirective, FileRenderDirective, CommandRenderDirective, DiffRenderDirective } from './renderDirectiveParser';
import { renderFile } from './fileRenderer';
import { renderCommand } from './commandRenderer';
import { renderDiff, parseDiff } from './diffRenderer';

/**
 * Rendered content block ready for display
 */
export interface RenderedBlock {
  id: string;
  type: 'file' | 'command' | 'diff';
  html: string;
  metadata: {
    source: string;
    language?: string;
    lineRange?: { start: number; end: number };
  };
}

/**
 * Resolve a render directive to HTML content
 */
export async function resolveDirective(directive: RenderDirective): Promise<RenderedBlock> {
  switch (directive.type) {
    case 'file':
      return resolveFileDirective(directive);
    case 'command':
      return resolveCommandDirective(directive);
    case 'diff':
      return resolveDiffDirective(directive);
    default: {
      const unknownDirective = directive as RenderDirective;
      return createErrorBlock(unknownDirective.id, 'Unknown directive type');
    }
  }
}

/**
 * Resolve file directive
 */
async function resolveFileDirective(directive: FileRenderDirective): Promise<RenderedBlock> {
  const result = await renderFile(directive.params);
  
  if (!result.success) {
    return createErrorBlock(directive.id, result.error || 'Failed to render file');
  }
  
  const html = formatAsCodeBlock(
    result.content || '',
    result.language || 'plaintext',
    directive.params.path,
    result.lineRange,
    directive.params.format || 'code'
  );
  
  return {
    id: directive.id,
    type: 'file',
    html,
    metadata: {
      source: directive.params.path,
      language: result.language,
      lineRange: result.lineRange,
    },
  };
}

/**
 * Resolve command directive
 */
async function resolveCommandDirective(directive: CommandRenderDirective): Promise<RenderedBlock> {
  const result = await renderCommand(directive.params);
  
  if (!result.success) {
    return createErrorBlock(directive.id, result.error || 'Failed to execute command');
  }
  
  const html = formatAsCommandBlock(
    result.output || '',
    directive.params.cmd,
    result.exitCode ?? 0,
    directive.params.format || 'code'
  );
  
  return {
    id: directive.id,
    type: 'command',
    html,
    metadata: {
      source: directive.params.cmd,
    },
  };
}

/**
 * Resolve diff directive
 */
async function resolveDiffDirective(directive: DiffRenderDirective): Promise<RenderedBlock> {
  const result = await renderDiff(directive.params);
  
  if (!result.success) {
    return createErrorBlock(directive.id, result.error || 'Failed to render diff');
  }
  
  const hunks = parseDiff(result.diff || '');
  
  // Determine source description based on params
  const source = directive.params.path 
    ? directive.params.path 
    : directive.params.left && directive.params.right
      ? `${directive.params.left} ↔ ${directive.params.right}`
      : 'diff';
  
  const html = formatAsDiffBlock(
    hunks,
    directive.params.path,
    directive.params.left,
    directive.params.right,
    directive.params.before,
    directive.params.mode || 'unified'
  );
  
  return {
    id: directive.id,
    type: 'diff',
    html,
    metadata: {
      source,
    },
  };
}

/**
 * Format diff as a styled block
 */
function formatAsDiffBlock(
  hunks: import('./diffRenderer').DiffHunk[],
  path?: string,
  left?: string,
  right?: string,
  before?: string,
  mode: 'unified' | 'split' = 'unified'
): string {
  // Build header description
  let header: string;
  if (left && right) {
    header = `📊 Diff: ${left} ↔ ${right}`;
  } else if (path && before) {
    header = `📊 Diff: ${path} (${before})`;
  } else if (path) {
    header = `📊 Diff: ${path} (working changes)`;
  } else {
    header = `📊 Diff`;
  }
  
  // Build diff content with syntax highlighting
  let diffContent: string;
  
  if (hunks.length === 0) {
    diffContent = '<div class="diff-empty">No changes detected</div>';
  } else if (mode === 'unified') {
    diffContent = renderUnifiedDiff(hunks);
  } else {
    diffContent = renderSplitDiff(hunks);
  }
  
  return `
    <div class="render-block render-block-diff" data-type="diff" data-mode="${mode}">
      <div class="render-block-header">
        <span class="render-block-source">${escapeHtml(header)}</span>
        <div class="render-block-actions">
          <button class="render-action-refresh" title="Refresh">↻</button>
          <button class="render-action-copy" title="Copy raw diff">📋</button>
        </div>
      </div>
      <div class="render-block-content diff-content">
        ${diffContent}
      </div>
    </div>
  `;
}

/**
 * Render unified diff view
 */
function renderUnifiedDiff(hunks: import('./diffRenderer').DiffHunk[]): string {
  const lines: string[] = [];
  
  for (const hunk of hunks) {
    lines.push(`<div class="diff-hunk-header">${escapeHtml(hunk.header)}</div>`);
    
    for (const line of hunk.lines) {
      // Skip header lines, they're already in hunk.header
      if (line.type === 'header') {
        continue;
      }
      
      const lineClass = getDiffLineClass(line.type);
      const prefix = getDiffLinePrefix(line.type);
      const lineNumOld = line.oldLineNumber !== undefined ? String(line.oldLineNumber) : '';
      const lineNumNew = line.newLineNumber !== undefined ? String(line.newLineNumber) : '';
      
      lines.push(`
        <div class="diff-line ${lineClass}">
          <span class="diff-line-num diff-line-num-old">${lineNumOld}</span>
          <span class="diff-line-num diff-line-num-new">${lineNumNew}</span>
          <span class="diff-line-prefix">${prefix}</span>
          <span class="diff-line-content">${escapeHtml(line.content)}</span>
        </div>
      `);
    }
  }
  
  return `<div class="diff-unified">${lines.join('')}</div>`;
}

/**
 * Render split (side-by-side) diff view
 */
function renderSplitDiff(hunks: import('./diffRenderer').DiffHunk[]): string {
  const rows: string[] = [];
  
  for (const hunk of hunks) {
    rows.push(`
      <tr class="diff-hunk-header-row">
        <td colspan="4">${escapeHtml(hunk.header)}</td>
      </tr>
    `);
    
    // Filter out header lines
    const contentLines = hunk.lines.filter(l => l.type !== 'header');
    
    // For split view, pair deletions with additions
    let i = 0;
    while (i < contentLines.length) {
      const line = contentLines[i];
      
      if (line.type === 'context') {
        rows.push(`
          <tr class="diff-line diff-line-context">
            <td class="diff-line-num">${line.oldLineNumber ?? ''}</td>
            <td class="diff-line-content">${escapeHtml(line.content)}</td>
            <td class="diff-line-num">${line.newLineNumber ?? ''}</td>
            <td class="diff-line-content">${escapeHtml(line.content)}</td>
          </tr>
        `);
        i++;
      } else if (line.type === 'deletion') {
        // Look ahead for matching addition
        const nextLine = contentLines[i + 1];
        if (nextLine && nextLine.type === 'addition') {
          rows.push(`
            <tr class="diff-line diff-line-change">
              <td class="diff-line-num">${line.oldLineNumber ?? ''}</td>
              <td class="diff-line-content diff-line-deletion">${escapeHtml(line.content)}</td>
              <td class="diff-line-num">${nextLine.newLineNumber ?? ''}</td>
              <td class="diff-line-content diff-line-addition">${escapeHtml(nextLine.content)}</td>
            </tr>
          `);
          i += 2;
        } else {
          rows.push(`
            <tr class="diff-line diff-line-deletion">
              <td class="diff-line-num">${line.oldLineNumber ?? ''}</td>
              <td class="diff-line-content diff-line-deletion">${escapeHtml(line.content)}</td>
              <td class="diff-line-num"></td>
              <td class="diff-line-content"></td>
            </tr>
          `);
          i++;
        }
      } else if (line.type === 'addition') {
        rows.push(`
          <tr class="diff-line diff-line-addition">
            <td class="diff-line-num"></td>
            <td class="diff-line-content"></td>
            <td class="diff-line-num">${line.newLineNumber ?? ''}</td>
            <td class="diff-line-content diff-line-addition">${escapeHtml(line.content)}</td>
          </tr>
        `);
        i++;
      } else {
        i++;
      }
    }
  }
  
  return `
    <table class="diff-split">
      <tbody>${rows.join('')}</tbody>
    </table>
  `;
}

/**
 * Get CSS class for diff line type
 */
function getDiffLineClass(type: 'addition' | 'deletion' | 'context'): string {
  switch (type) {
    case 'addition': return 'diff-line-addition';
    case 'deletion': return 'diff-line-deletion';
    case 'context': return 'diff-line-context';
  }
}

/**
 * Get prefix character for diff line type
 */
function getDiffLinePrefix(type: 'addition' | 'deletion' | 'context'): string {
  switch (type) {
    case 'addition': return '+';
    case 'deletion': return '-';
    case 'context': return ' ';
  }
}

/**
 * Format content as a code block or blockquote
 */
function formatAsCodeBlock(
  content: string,
  language: string,
  filePath: string,
  lineRange?: { start: number; end: number },
  format: 'code' | 'quote' | 'raw' = 'code'
): string {
  const escapedContent = escapeHtml(content);
  const lineRangeStr = lineRange ? `:${lineRange.start}-${lineRange.end}` : '';
  const header = `📄 ${filePath}${lineRangeStr}`;
  
  if (format === 'quote') {
    return `
      <div class="render-block render-block-quote" data-type="file">
        <div class="render-block-header">
          <span class="render-block-source">${escapeHtml(header)}</span>
          <div class="render-block-actions">
            <button class="render-action-refresh" title="Refresh">↻</button>
            <button class="render-action-copy" title="Copy">📋</button>
          </div>
        </div>
        <blockquote class="render-block-content">${escapedContent}</blockquote>
      </div>
    `;
  }
  
  if (format === 'raw') {
    return `<div class="render-block-raw">${escapedContent}</div>`;
  }
  
  // Default: code block
  return `
    <div class="render-block render-block-code" data-type="file" data-language="${language}">
      <div class="render-block-header">
        <span class="render-block-source">${escapeHtml(header)}</span>
        <div class="render-block-actions">
          <button class="render-action-refresh" title="Refresh">↻</button>
          <button class="render-action-copy" title="Copy">📋</button>
        </div>
      </div>
      <pre class="render-block-content"><code class="language-${language}">${escapedContent}</code></pre>
    </div>
  `;
}

/**
 * Format command output as a block
 */
function formatAsCommandBlock(
  output: string,
  command: string,
  exitCode: number,
  format: 'code' | 'json' | 'raw' = 'code'
): string {
  const escapedOutput = escapeHtml(output);
  const statusIcon = exitCode === 0 ? '✓' : '✗';
  const statusClass = exitCode === 0 ? 'success' : 'error';
  const header = `⚡ ${command}`;
  
  if (format === 'raw') {
    return `<div class="render-block-raw">${escapedOutput}</div>`;
  }
  
  const language = format === 'json' ? 'json' : 'plaintext';
  
  return `
    <div class="render-block render-block-command render-block-${statusClass}" data-type="command" data-exit-code="${exitCode}">
      <div class="render-block-header">
        <span class="render-block-source">${escapeHtml(header)}</span>
        <span class="render-block-status">${statusIcon}</span>
        <div class="render-block-actions">
          <button class="render-action-refresh" title="Re-run">↻</button>
          <button class="render-action-copy" title="Copy">📋</button>
        </div>
      </div>
      <pre class="render-block-content"><code class="language-${language}">${escapedOutput}</code></pre>
    </div>
  `;
}

/**
 * Create error block HTML
 */
function createErrorBlock(id: string, error: string): RenderedBlock {
  const html = `
    <div class="render-block render-block-error" data-type="error">
      <div class="render-block-header">
        <span class="render-block-source">⚠️ Render Error</span>
      </div>
      <div class="render-block-content render-error-message">${escapeHtml(error)}</div>
    </div>
  `;
  
  return {
    id,
    type: 'file',
    html,
    metadata: {
      source: 'error',
    },
  };
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
