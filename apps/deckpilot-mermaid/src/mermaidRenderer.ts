import { createRequire } from 'node:module';
import * as vscode from 'vscode';
import type {
  DiagramFenceInfo,
  DiagramRenderOptions,
  DiagramRenderResult,
  IDiagramRenderer,
} from '@deckpilot/core/renderer/diagramRenderer';
import {
  MERMAID_RENDERER_ID,
  MERMAID_RENDERER_PRIORITY,
  MERMAID_SUPPORTED_FENCE_LANGUAGES,
} from './capabilities';
import { resolveMermaidTheme, type MermaidThemeConfig } from './theme';
import { mermaidAppearance } from '@deckpilot/core/renderer/mermaidAppearance';

const runtimeRequire = createRequire(__filename);
const MERMAID_RENDER_TIMEOUT_MS = 2_000;
const DOM_GLOBAL_KEYS = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Element',
  'SVGElement',
  'CSSStyleSheet',
  'Node',
  'Document',
  'DocumentFragment',
  'DOMParser',
  'XMLSerializer',
  'MutationObserver',
  'location',
  'self',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'atob',
  'btoa',
] as const;

type MermaidRenderValue = string | { svg?: string; bindFunctions?: (element: unknown) => void };

type MermaidModule = {
  initialize(config: Record<string, unknown>): void;
  parse(source: string, options?: { suppressErrors?: boolean }): Promise<unknown>;
  render(id: string, source: string): Promise<MermaidRenderValue>;
};

type JSDOMModule = {
  JSDOM: new (html?: string, options?: Record<string, unknown>) => {
    window: Record<string, unknown>;
  };
};

type DomEnvironment = {
  cleanup(): void;
};

type MermaidRendererDependencies = {
  loadMermaid?: () => Promise<MermaidModule>;
  loadJSDOM?: () => Promise<JSDOMModule>;
  timeoutMs?: number;
};

export class MermaidDiagramRenderer implements IDiagramRenderer {
  readonly appearanceProtocol = 1 as const;
  readonly id = MERMAID_RENDERER_ID;
  readonly priority = MERMAID_RENDERER_PRIORITY;
  readonly supportedFenceLanguages = MERMAID_SUPPORTED_FENCE_LANGUAGES;

  private mermaidPromise?: Promise<MermaidModule>;
  private jsdomPromise?: Promise<JSDOMModule>;
  private renderQueue: Promise<void> = Promise.resolve();
  private renderSequence = 0;

  constructor(private readonly dependencies: MermaidRendererDependencies = {}) {}

  canRender(source: string, fence: DiagramFenceInfo): boolean {
    return (
      (this.supportedFenceLanguages as readonly string[]).includes(fence.language) &&
      source.trim().length > 0
    );
  }

  render(
    source: string,
    fence: DiagramFenceInfo,
    options?: DiagramRenderOptions,
  ): Promise<DiagramRenderResult> {
    const theme = resolveRequestedTheme(fence, options);
    const queued = this.renderQueue.then(() => this.beginRender(source, fence, theme));
    this.renderQueue = queued.then(({ settled }) => settled, () => undefined);
    return queued.then(({ result }) => result);
  }

  dispose(): void {
    this.mermaidPromise = undefined;
    this.jsdomPromise = undefined;
  }

  private beginRender(
    source: string,
    fence: DiagramFenceInfo,
    theme: MermaidThemeConfig,
  ): {
    result: Promise<DiagramRenderResult>;
    settled: Promise<void>;
  } {
    const execution = this.renderWithMermaid(source, fence, theme);
    return {
      result: withTimeout(execution, this.dependencies.timeoutMs ?? MERMAID_RENDER_TIMEOUT_MS)
        .catch((error) => this.buildFallbackResult(
          source,
          theme,
          error instanceof Error ? error.message : String(error),
        )),
      settled: execution.then(() => undefined, () => undefined),
    };
  }

  private async renderWithMermaid(
    source: string,
    _fence: DiagramFenceInfo,
    theme: MermaidThemeConfig,
  ): Promise<DiagramRenderResult> {
    const environment = await this.createDomEnvironment();

    try {
      const mermaid = await this.loadMermaid();
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        suppressErrorRendering: true,
        theme: theme.theme,
        darkMode: theme.darkMode,
        themeVariables: theme.themeVariables,
      });

      const syntaxError = await this.validateSource(mermaid, source);
      if (syntaxError) {
        return {
          ok: false,
          format: 'svg',
          errorMessage: syntaxError,
          rendererId: this.id,
        };
      }

      const renderId = `deckpilot-mermaid-${++this.renderSequence}`;
      const rendered = await mermaid.render(renderId, source);
      const svg = typeof rendered === 'string' ? rendered : rendered.svg;

      if (!svg) {
        return this.buildFallbackResult(source, theme, 'Mermaid produced empty SVG output.');
      }

      return {
        ok: true,
        format: 'svg',
        svg: `<div class="diagram-block__mermaid">${svg}</div>`,
        rendererId: this.id,
      };
    } catch (error) {
      return this.buildFallbackResult(source, theme, error instanceof Error ? error.message : String(error));
    } finally {
      environment.cleanup();
    }
  }

  private async validateSource(mermaid: MermaidModule, source: string): Promise<string | undefined> {
    try {
      const parsed = await mermaid.parse(source, { suppressErrors: false });
      if (parsed === false) {
        return 'Mermaid syntax error: Invalid Mermaid diagram.';
      }
      return undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Mermaid syntax error: ${message}`;
    }
  }

  private async loadMermaid(): Promise<MermaidModule> {
    if (!this.mermaidPromise) {
      this.mermaidPromise = (this.dependencies.loadMermaid
        ? this.dependencies.loadMermaid()
        : import(runtimeRequire.resolve('mermaid')).then((module: Record<string, unknown>) => normalizeMermaidModule(module)));
    }

    return this.mermaidPromise;
  }

  private async createDomEnvironment(): Promise<DomEnvironment> {
    const { JSDOM } = await this.loadJSDOM();
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      pretendToBeVisual: true,
      url: 'https://deckpilot.local/diagram',
    });
    const window = dom.window as Record<string, unknown> & {
      close(): void;
      requestAnimationFrame?: (callback: (timestamp: number) => void) => number;
      cancelAnimationFrame?: (handle: number) => void;
      matchMedia?: (query: string) => {
        matches: boolean;
        media: string;
        onchange: unknown;
        addListener: () => void;
        removeListener: () => void;
        addEventListener: () => void;
        removeEventListener: () => void;
        dispatchEvent: () => boolean;
      };
      setTimeout(callback: (...args: unknown[]) => void, delay?: number): number;
      clearTimeout(handle: number): void;
    };
    const restore = new Map<string, PropertyDescriptor | undefined>();

    if (typeof window.requestAnimationFrame !== 'function') {
      window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(Date.now()), 0);
    }

    if (typeof window.cancelAnimationFrame !== 'function') {
      window.cancelAnimationFrame = (handle) => window.clearTimeout(handle);
    }

    if (typeof window.matchMedia !== 'function') {
      window.matchMedia = (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      });
    }

    window.atob = (value: string) => Buffer.from(value, 'base64').toString('utf8');
    window.btoa = (value: string) => Buffer.from(value, 'utf8').toString('base64');

    const svgElement = window.SVGElement as { prototype?: Record<string, unknown> } | undefined;
    if (svgElement?.prototype) {
      if (typeof svgElement.prototype.getBBox !== 'function') {
        svgElement.prototype.getBBox = function getBBox(this: { textContent?: string; tagName?: string }) {
          const width = estimateTextWidth(this.textContent, this.tagName);
          return { x: 0, y: 0, width, height: width > 0 ? 16 : 0 };
        };
      }

      if (typeof svgElement.prototype.getComputedTextLength !== 'function') {
        svgElement.prototype.getComputedTextLength = function getComputedTextLength(this: { textContent?: string; tagName?: string }) {
          return estimateTextWidth(this.textContent, this.tagName);
        };
      }

      if (typeof svgElement.prototype.getScreenCTM !== 'function') {
        svgElement.prototype.getScreenCTM = () => ({
          a: 1,
          b: 0,
          c: 0,
          d: 1,
          e: 0,
          f: 0,
          inverse() {
            return this;
          },
        });
      }
    }

    for (const key of DOM_GLOBAL_KEYS) {
      const value = (window as unknown as Record<string, unknown>)[key];
      if (typeof value === 'undefined') {
        continue;
      }

      restore.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, {
        configurable: true,
        writable: true,
        value,
      });
    }

    return {
      cleanup: () => {
        for (const [key, descriptor] of restore) {
          if (descriptor) {
            Object.defineProperty(globalThis, key, descriptor);
          } else {
            delete (globalThis as Record<string, unknown>)[key];
          }
        }

        window.close();
      },
    };
  }

  private async loadJSDOM(): Promise<JSDOMModule> {
    if (!this.jsdomPromise) {
      this.jsdomPromise = this.dependencies.loadJSDOM
        ? this.dependencies.loadJSDOM()
        : Promise.resolve(runtimeRequire('jsdom') as JSDOMModule);
    }

    return this.jsdomPromise;
  }

  private buildFallbackResult(
    source: string,
    theme: MermaidThemeConfig,
    reason: string,
  ): DiagramRenderResult {
    return {
      ok: true,
      format: 'svg',
      svg: `<div class="diagram-block__mermaid-fallback" data-mermaid-source="${escapeAttr(Buffer.from(source, 'utf8').toString('base64'))}" data-mermaid-theme="${escapeAttr(theme.theme)}" data-mermaid-config="${escapeAttr(JSON.stringify(theme))}"><p>Mermaid diagram (will render in webview if offline rendering failed)</p></div>`,
      warnings: [reason],
      rendererId: this.id,
    };
  }
}

function resolveRequestedTheme(
  fence: DiagramFenceInfo,
  options?: DiagramRenderOptions,
): MermaidThemeConfig {
  if (options?.appearance) return mermaidAppearance(options.appearance);
  // Mirror the core/Triton precedence: an explicit per-fence theme wins;
  // otherwise use options.theme, which core already resolved from the
  // deck-wide diagrams.theme default and the editor fallback. The actual
  // editor color kind drives `auto`/dark-mode decisions.
  const fenceTheme = fence.attributes?.theme;
  const requestedTheme = fenceTheme && fenceTheme !== 'auto' ? fenceTheme : options?.theme;
  return resolveMermaidTheme(requestedTheme, vscode.window.activeColorTheme?.kind);
}

function normalizeMermaidModule(module: Record<string, unknown>): MermaidModule {
  const candidate = ('default' in module ? module.default : module) as MermaidModule;
  return candidate;
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function estimateTextWidth(text?: string, tagName?: string): number {
  if (!text) {
    return 0;
  }

  const estimated = Math.max(16, text.trim().length * 8);
  if (tagName && !['text', 'tspan'].includes(tagName.toLowerCase())) {
    return Math.min(estimated, 240);
  }

  return estimated;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Mermaid native render timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
