/**
 * IDiagramRenderer — the plugin contract for diagram renderers in Deckpilot.
 *
 * This interface lives in @deckpilot/core so adapter extensions can import it
 * without pulling in VS Code API dependencies.
 *
 * Adapter extensions (e.g. deckpilot-triton) implement IDiagramRenderer and
 * register an instance via the DeckpilotDiagramAPI exported by the deckpilot
 * extension's activate() function.
 */

export type {
  DiagramFenceInfo,
  DiagramRenderOptions,
  DiagramRenderResult,
  DiagramBlockRef,
} from '../models/diagram';

import type { DiagramFenceInfo, DiagramRenderOptions, DiagramRenderResult } from '../models/diagram';

/**
 * A diagram renderer plugin.
 *
 * Implement this to add a new diagram backend (Triton, Graphviz, D2, PlantUML …).
 * The renderer must never throw — surface errors via DiagramRenderResult.ok=false.
 */
export interface IDiagramRenderer {
  readonly appearanceProtocol?: 1;
  readonly version?: string;
  /** Unique identifier for this renderer, e.g. "triton", "graphviz". */
  readonly id: string;
  /** Fence language tags this renderer handles, e.g. ["mermaid", "poster"]. */
  readonly supportedFenceLanguages: readonly string[];
  /**
   * Renderer selection priority for a matching fence language.
   * Higher values win; omitted values default to 0.
   * The registry uses this to select the highest-priority renderer for each
   * supported fence language.
   */
  readonly priority?: number;
  /**
   * Return true if this renderer can handle the given source/fence pair.
   * If omitted, the registry treats the renderer as eligible for any matching
   * supportedFenceLanguages entry.
   */
  canRender?(source: string, fence: DiagramFenceInfo): boolean;
  /** Render diagram source to SVG. Never throws. */
  render(
    source: string,
    fence: DiagramFenceInfo,
    options?: DiagramRenderOptions,
  ): Promise<DiagramRenderResult>;
}

/**
 * The public diagram API exported by the deckpilot extension's activate().
 *
 * Adapter extensions obtain this via:
 *   const api = await vscode.extensions.getExtension('focus-space.executable-talk').activate();
 *
 * Uses { dispose(): void } instead of vscode.Disposable so this interface
 * remains free of VS Code API imports.
 */
export interface DeckpilotDiagramAPI {
  /** Deckpilot extension version. */
  readonly version: string;
  /**
   * Register a diagram renderer with Deckpilot.
   * Returns a disposable — push it to context.subscriptions.
   */
  registerDiagramRenderer(renderer: IDiagramRenderer): { dispose(): void };
}
