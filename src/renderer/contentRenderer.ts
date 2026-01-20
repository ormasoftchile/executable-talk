/**
 * Content renderer - resolves render directives to HTML
 */

import { RenderDirective, FileRenderDirective } from './renderDirectiveParser';
import { renderFile } from './fileRenderer';

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
      return resolveCommandDirective(directive.id);
    case 'diff':
      return resolveDiffDirective(directive.id);
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
 * Resolve command directive (placeholder for M2)
 */
async function resolveCommandDirective(id: string): Promise<RenderedBlock> {
  return createErrorBlock(id, 'render:command not yet implemented');
}

/**
 * Resolve diff directive (placeholder for M3)
 */
async function resolveDiffDirective(id: string): Promise<RenderedBlock> {
  return createErrorBlock(id, 'render:diff not yet implemented');
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
