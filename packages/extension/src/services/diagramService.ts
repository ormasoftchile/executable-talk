import * as vscode from 'vscode';
import type { DiagramBlockRef, DiagramRenderOptions } from '@deckpilot/core/models/diagram';
import { DiagramRendererRegistry } from '../renderer/diagram/registry';
import { diagramLog } from '../utils/diagramLogger';
import { resolveExportAppearance, type ResolvedAppearance, type AppearancePreferences } from '@deckpilot/core/models/appearance';
import type { DiagramDeckOptions } from '@deckpilot/core/models/deck';

const LOADING_BLOCK_PATTERN = /<figure\b([^>]*\bclass="[^"]*\bdiagram-block--loading\b[^"]*"[^>]*)>([\s\S]*?)<\/figure>/g;

export class DiagramService {
  constructor(private diagramRegistry: DiagramRendererRegistry) {}

  async resolveSlideBlocks(slideHtml: string, appearance?: ResolvedAppearance, defaults?: DiagramDeckOptions, externalFonts = true): Promise<Array<{ blockId: string; html: string }>> {
    const blocks = this.extractBlocks(slideHtml);
    diagramLog(`[diagram-service] resolveSlideBlocks: blocks = ${blocks.length}`);

    return Promise.all(blocks.map(async (block) => ({
      blockId: block.id,
      html: await this.renderBlock(block, appearance, defaults, externalFonts),
    })));
  }

  async resolveExportBlocks(slideHtml: string, options: {
    requested?: AppearancePreferences;
    snapshot?: ResolvedAppearance;
    current?: ResolvedAppearance;
    diagrams?: DiagramDeckOptions;
  } = {}): Promise<{ appearance: ResolvedAppearance; blocks: Array<{ blockId: string; html: string }> }> {
    const appearance = resolveExportAppearance(options.requested, options.snapshot, options.current);
    const blocks = await this.resolveSlideBlocks(slideHtml, appearance, { surface: 'opaque', ...options.diagrams }, false);
    return { appearance, blocks };
  }

  private extractBlocks(slideHtml: string): DiagramBlockRef[] {
    const blocks: DiagramBlockRef[] = [];

    for (const match of slideHtml.matchAll(LOADING_BLOCK_PATTERN)) {
      const attrs = match[1] ?? '';
      const body = match[2] ?? '';
      const id = readAttr(attrs, 'data-render-id');
      const language = decodeMaybe(readAttr(attrs, 'data-diagram-language'));
      const source = decodeHtml(extractCodeSource(body));

      if (!id || !language || !source) {
        continue;
      }

      const caption = decodeMaybe(readAttr(attrs, 'data-diagram-caption'));
      const theme = decodeMaybe(readAttr(attrs, 'data-diagram-theme'));
      const themeDefault = decodeMaybe(readAttr(attrs, 'data-diagram-theme-default'));
      const workspaceRoot = decodeMaybe(readAttr(attrs, 'data-diagram-workspace-root'));
      const style = decodeMaybe(readAttr(attrs, 'data-diagram-style'));
      const mode = decodeMaybe(readAttr(attrs, 'data-diagram-mode'));
      const surface = decodeMaybe(readAttr(attrs, 'data-diagram-surface'));
      blocks.push({
        id,
        slideIndex: 0,
        source,
        fence: {
          language,
          attributes: {
            ...(caption ? { caption } : {}),
            ...(theme ? { theme } : {}),
            ...(themeDefault ? { themeDefault } : {}),
            ...(workspaceRoot ? { workspaceRoot } : {}),
            ...(style ? { style } : {}), ...(mode ? { mode } : {}), ...(surface ? { surface } : {}),
          },
        },
        position: { start: 0, end: source.length },
      });
    }

    return blocks;
  }

  private async renderBlock(block: DiagramBlockRef, appearance?: ResolvedAppearance, defaults?: DiagramDeckOptions, externalFonts = true): Promise<string> {
    diagramLog(`[diagram-service] rendering block ${block.id} ${block.fence.language}`);

    const attrs = block.fence.attributes;
    const fenceTheme = attrs?.theme;
    const deckDefaultTheme = attrs?.themeDefault;
    // Precedence: per-fence {theme:X} > deck-wide diagrams.theme default > VS Code color-theme fallback.
    const theme: DiagramRenderOptions['theme'] =
      fenceTheme && fenceTheme !== 'auto' ? fenceTheme
        : deckDefaultTheme && deckDefaultTheme !== 'auto' ? deckDefaultTheme
          : appearance ? undefined : resolveTheme();
    const workspaceRoot = attrs?.workspaceRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    try {
      const result = await this.diagramRegistry.renderBlock(block, { theme, workspaceRoot, appearance,
        style: defaults?.style, mode: defaults?.mode, surface: defaults?.surface,
        fontRevision: externalFonts ? appearance?.font.revision : undefined,
      });
      if (result.ok && result.svg) {
        const caption = attrs?.caption ?? '';
        const captionHtml = caption
          ? `<figcaption class="diagram-block__caption">${escapeHtml(caption)}</figcaption>`
          : '';
        const warning = result.warnings?.length ? ` title="${escapeAttr(result.warnings.join(' '))}"` : '';
        return `<figure class="${buildDiagramClasses(block.fence.language)}" data-render-id="${block.id}" data-diagram-renderer="${result.rendererId}" data-diagram-language="${block.fence.language}"${warning}>\
<div class="diagram-block__viewport">${result.svg}</div>${captionHtml}</figure>`;
      }

      return buildErrorHtml(
        block,
        result.errorMessage ?? 'Diagram render failed.',
        '⚠ Diagram failed to render',
        true,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return buildErrorHtml(block, message, '⚠ Diagram render error', false);
    }
  }
}

export function annotateDiagramPlaceholders(
  slideHtml: string,
  workspaceRoot?: string,
  diagramThemeDefault?: string,
): string {
  if (!workspaceRoot && !diagramThemeDefault) {
    return slideHtml;
  }

  return slideHtml.replace(LOADING_BLOCK_PATTERN, (_match, attrs: string, body: string) => {
    let annotatedAttrs = attrs;
    if (workspaceRoot && !/data-diagram-workspace-root=/.test(annotatedAttrs)) {
      annotatedAttrs += ` data-diagram-workspace-root="${escapeAttr(workspaceRoot)}"`;
    }
    // Only apply the deck default where the fence itself did not set a theme —
    // a per-fence {theme:…} must always win.
    if (
      diagramThemeDefault &&
      !/data-diagram-theme=/.test(annotatedAttrs) &&
      !/data-diagram-theme-default=/.test(annotatedAttrs)
    ) {
      annotatedAttrs += ` data-diagram-theme-default="${escapeAttr(diagramThemeDefault)}"`;
    }
    return `<figure${annotatedAttrs}>${body}</figure>`;
  });
}

function buildErrorHtml(
  block: DiagramBlockRef,
  message: string,
  title: string,
  showSource: boolean,
): string {
  const sourceHtml = showSource
    ? `<details class="diagram-block__source"><summary>Show source</summary>\
<pre><code class="language-${block.fence.language}">${escapeHtml(block.source)}</code></pre></details>`
    : '';

  return `<figure class="diagram-block diagram-block--error" data-render-id="${block.id}">\
<div class="diagram-block__error-header">${title}</div>\
<pre class="diagram-block__error-message">${escapeHtml(message)}</pre>${sourceHtml}</figure>`;
}

function extractCodeSource(body: string): string {
  const match = body.match(/<code\b[^>]*>([\s\S]*?)<\/code>/);
  return match?.[1] ?? '';
}

function readAttr(attrs: string, name: string): string | undefined {
  const match = attrs.match(new RegExp(`${name}="([^"]*)"`, 'i'));
  return match?.[1];
}

function resolveTheme(): DiagramRenderOptions['theme'] {
  const vsTheme = vscode.window.activeColorTheme?.kind;
  return vsTheme === vscode.ColorThemeKind.Light ? 'light'
    : vsTheme === vscode.ColorThemeKind.HighContrast || vsTheme === vscode.ColorThemeKind.HighContrastLight ? 'contrast'
    : 'dark';
}

function decodeHtml(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, '\'')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function decodeMaybe(text?: string): string | undefined {
  return text ? decodeHtml(text) : undefined;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildDiagramClasses(language: string): string {
  const suffix = language.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  return suffix ? `diagram-block diagram-block--${suffix}` : 'diagram-block';
}
