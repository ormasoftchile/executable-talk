import * as vscode from 'vscode';
import { pathToFileURL } from 'node:url';
import { matter } from '@deckpilot/core/parser/frontmatter';
import type {
  IDiagramRenderer,
  DiagramFenceInfo,
  DiagramRenderOptions,
  DiagramRenderResult,
} from '@deckpilot/core/renderer/diagramRenderer';

/**
 * Minimal shape of the Triton module we need.
 * The vendoring step pulls this from the published Triton core package.
 */
type TritonModule = {
  runtimeRevision?: string;
  renderMermaid(
    text: string,
    options?: DiagramRenderOptions & { format?: 'svg' },
  ): { svg?: string; warnings?: string[]; kind?: string; appearance?: DiagramRenderResult['appearance'] };
};

const TRITON_THEME_PRESETS = new Set([
  'default',
  'executive',
  'minimal',
  'consulting',
  'product',
  'release',
  'ai-timeline',
  'bytebytego',
  'gitline',
  'our-timeline',
  'subject-timeline',
  'showcase',
]);

const TRITON_UNSUPPORTED_MERMAID_TYPES = new Set([
  'block-beta',
  'kanban',
  'packet-beta',
  'xychart-beta',
]);

/**
 * Diagram renderer adapter for Triton.
 *
 * Triton is loaded lazily via dynamic import() from dist/vendor/triton/index.js
 * (a vendored ESM island kept outside the CJS extension bundle). The module is
 * cached after the first load so subsequent renders pay no import cost.
 *
 * `npm run build` refreshes the vendor bundle automatically; `npm run
 * vendor-triton` can be used to rebuild it directly.
 */
export class TritonDiagramRenderer implements IDiagramRenderer {
  readonly appearanceProtocol = 1 as const;
  version: string | undefined;
  readonly id = 'triton';
  // Outranks the deckpilot-mermaid engine (priority 10) so `diagram:mermaid`
  // fences render through Triton and share its theme presets. Triton's
  // canRender() still declines the mermaid-native types it can't handle
  // (block-beta, kanban, packet-beta, xychart-beta); those fall back to the
  // deckpilot-mermaid engine (10) or the built-in Mermaid fallback (5).
  readonly priority = 20;
  readonly supportedFenceLanguages = ['mermaid', 'triton'] as const;

  private modulePromise: Promise<TritonModule> | undefined;

  constructor(private readonly extensionUri: vscode.Uri) {}

  canRender(source: string, fence: DiagramFenceInfo): boolean {
    if (!(this.supportedFenceLanguages as readonly string[]).includes(fence.language)) {
      return false;
    }

    if (fence.language === 'triton') {
      return source.trim().length > 0;
    }

    const diagramType = extractDiagramType(source);
    if (!diagramType) {
      return true;
    }

    return !TRITON_UNSUPPORTED_MERMAID_TYPES.has(diagramType);
  }

  async render(
    source: string,
    fence: DiagramFenceInfo,
    options?: DiagramRenderOptions,
  ): Promise<DiagramRenderResult> {
    const fenceTheme = fence.attributes?.theme;
    // Theme resolution precedence: fence attribute (`{theme: minimal}`) >
    // in-fence frontmatter (`---\ntheme: minimal\n---`) > deck theme
    // (`options.theme`). `auto` means "follow the deck", so it defers to the
    // deck theme and ignores any frontmatter theme.
    let explicitTheme: string | undefined;
    if (fenceTheme === 'auto') {
      explicitTheme = undefined;
    } else if (fenceTheme) {
      explicitTheme = fenceTheme;
    } else {
      explicitTheme = extractFrontmatterTheme(source);
    }
    const resolvedTheme = resolveTritonTheme(explicitTheme ?? options?.theme);
    console.log(
      '[tritonAdapter] render called for',
      fence.language,
      'source length:',
      source.length,
      'fence attrs:',
      JSON.stringify(fence.attributes ?? {}),
      'resolved theme:',
      resolvedTheme,
    );
    try {
      const triton = await this.loadTriton();
      this.version = triton.runtimeRevision;
      const bodyMetadata = matter(source).data as Record<string, unknown>;
      const attrs = fence.attributes ?? {};
      const inherited = options?.appearance;
      const requestedStyle = attrs.style ?? (fenceTheme && fenceTheme !== 'auto' ? fenceTheme : undefined)
        ?? (typeof bodyMetadata.style === 'string' ? bodyMetadata.style : undefined)
        ?? (typeof bodyMetadata.theme === 'string' && fenceTheme !== 'auto' ? bodyMetadata.theme : undefined)
        ?? options?.style ?? (options?.theme && options.theme !== 'auto' ? options.theme : undefined);
      const requestedMode = attrs.mode ?? (typeof bodyMetadata.mode === 'string' ? bodyMetadata.mode : undefined) ?? options?.mode;
      const mode = requestedMode === 'light' || requestedMode === 'dark' ? requestedMode : inherited?.mode;
      const surface = attrs.surface ?? options?.surface;
      const result = triton.renderMermaid(source, inherited ? {
        appearance: inherited,
        style: requestedStyle && requestedStyle !== 'inherit' ? requestedStyle : inherited.style,
        mode,
        surface: surface === 'opaque' || surface === 'transparent' ? surface : 'auto',
        fontRevision: options?.fontRevision,
        format: 'svg',
      } : { theme: resolvedTheme, format: 'svg' });

      if (!result.svg) {
        return {
          ok: false,
          format: 'svg',
          errorMessage: `Triton render error: ${result.warnings?.join('; ') || 'Unknown Triton render failure.'}`,
          rendererId: this.id,
        };
      }

      return {
        ok: true,
        format: 'svg',
        // Diagrams are frameless inside a deck: strip the baked theme
        // background so the diagram inherits the slide. Pick a theme whose
        // foreground contrasts with the slide (e.g. a high-contrast/dark theme
        // on a dark deck) for readable frameless text.
        svg: inherited ? result.svg : stripBackgroundRect(result.svg),
        appearance: result.appearance,
        warnings: result.warnings,
        rendererId: this.id,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        format: 'svg',
        errorMessage: `Triton render error: ${message}`,
        rendererId: this.id,
      };
    }
  }

  private loadTriton(): Promise<TritonModule> {
    if (!this.modulePromise) {
      // Triton is vendored as an ESM island — load it with a file:// URL so
      // Node resolves import.meta.url correctly inside the Triton dist files.
      const vendorEntry = vscode.Uri.joinPath(
        this.extensionUri,
        'dist', 'vendor', 'triton', 'index.js',
      );
      const fileUrl = pathToFileURL(vendorEntry.fsPath).href;
      this.modulePromise = import(fileUrl) as Promise<TritonModule>;
    }
    return this.modulePromise;
  }
}

/**
 * Triton bakes its theme background into the SVG as a full-viewport <rect>
 * (see triton's render/svg.ts). Inside a deck slide we want diagrams to inherit
 * the slide background, so strip that leading background rect. It is uniquely
 * identified as the first <rect> whose x/y/width/height match the viewBox.
 */
export function stripBackgroundRect(svg: string): string {
  const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
  if (!viewBoxMatch) {
    return svg;
  }

  const parts = viewBoxMatch[1].trim().split(/\s+/);
  if (parts.length !== 4) {
    return svg;
  }

  const [x, y, width, height] = parts.map(escapeRegExp);
  const bgRectPattern = new RegExp(
    `\\s*<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="[^"]*"\\s*/>`,
  );

  return svg.replace(bgRectPattern, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract a `theme:` value from a diagram source's leading YAML frontmatter,
 * if present. Used so a theme declared in the diagram body is treated as an
 * explicit choice — identical to a fence `{theme: ...}` attribute — for both
 * theme resolution and the keep-background decision.
 */
export function extractFrontmatterTheme(source: string): string | undefined {
  const normalized = source.replace(/^\uFEFF/, '');
  const frontmatter = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!frontmatter) {
    return undefined;
  }

  for (const line of frontmatter[1].split(/\r?\n/)) {
    const match = line.match(/^\s*theme\s*:\s*(.+?)\s*$/);
    if (match) {
      const value = match[1].replace(/^["']|["']$/g, '').trim();
      return value || undefined;
    }
  }

  return undefined;
}

function extractDiagramType(source: string): string | undefined {
  const normalized = source.replace(/^\uFEFF/, '');
  const lines = normalized.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === '---') {
      continue;
    }

    if (trimmed.startsWith('%%')) {
      continue;
    }

    if (/^[A-Za-z0-9_-]+:$/.test(trimmed) || /^[A-Za-z0-9_-]+\s*:/.test(trimmed)) {
      continue;
    }

    return trimmed.split(/[\s{]/, 1)[0];
  }

  return undefined;
}

/**
 * Map Deckpilot theme hints to Triton renderMermaid theme names.
 * Always return a concrete, non-empty value so every render is self-contained
 * and cannot bleed from prior module state.
 */
export function resolveTritonTheme(theme?: string): string {
  if (!theme || theme === 'auto') {
    return 'midnight';
  }

  if (TRITON_THEME_PRESETS.has(theme)) {
    return theme;
  }

  switch (theme) {
    case 'dark': return 'midnight';
    case 'light': return 'default';
    case 'contrast': return 'showcase';
    case 'midnight': return 'midnight';
    case 'blueprint': return 'consulting';
    case 'editorial': return 'minimal';
    case 'default': return 'default';
    default:
      return 'midnight';
  }
}

export function applyTritonTheme(source: string, theme: string): string {
  const normalized = source.replace(/^\uFEFF/, '');
  const frontmatterMatch = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);

  if (!frontmatterMatch) {
    return `---\ntheme: ${theme}\n---\n${normalized}`;
  }

  const [, rawFrontmatter] = frontmatterMatch;
  const afterFrontmatter = normalized.slice(frontmatterMatch[0].length);
  const frontmatterLines = rawFrontmatter.split(/\r?\n/);
  let themeWritten = false;

  const updatedFrontmatter = frontmatterLines.map((line) => {
    if (/^\s*theme\s*:/.test(line)) {
      themeWritten = true;
      return `theme: ${theme}`;
    }
    return line;
  });

  if (!themeWritten) {
    updatedFrontmatter.push(`theme: ${theme}`);
  }

  return `---\n${updatedFrontmatter.join('\n')}\n---\n${afterFrontmatter}`;
}
