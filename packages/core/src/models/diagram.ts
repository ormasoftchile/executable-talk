/**
 * Diagram block types for Deckpilot.
 *
 * A diagram block is a fenced code block whose info string starts with
 * "diagram:" (e.g. ```diagram:mermaid). Core parses these into
 * DiagramBlockRef entries; the extension layer resolves them to SVG via
 * the IDiagramRenderer plugin system.
 */

/** Parsed info from a diagram fence info string and optional attribute block. */
export interface DiagramFenceInfo {
  /** Diagram language/type — e.g. "mermaid", "poster". */
  language: string;
  /** Inline attributes from the fence info string, e.g. {theme:"dark", caption:"My diagram"}. */
  attributes?: Record<string, string>;
}

/** A parsed diagram block reference stored on a Slide. */
export interface DiagramBlockRef {
  /** Stable unique ID within the deck, e.g. "diagram-0-2". */
  id: string;
  /** Zero-based index of the owning slide. */
  slideIndex: number;
  /** Raw fence body (the diagram source text). */
  source: string;
  /** Parsed fence info. */
  fence: DiagramFenceInfo;
  /** Source position in the original slide content (character offsets). */
  position: { start: number; end: number };
}

/** Options passed to a diagram renderer at render time. */
export interface DiagramRenderOptions {
  appearance?: import('./appearance').ResolvedAppearance;
  style?: string;
  mode?: 'inherit' | 'light' | 'dark';
  surface?: 'auto' | 'opaque' | 'transparent';
  fontRevision?: string;
  /** Resolved theme hint or renderer-specific explicit theme name. */
  theme?: string;
  /** Absolute path to the workspace root, if available. */
  workspaceRoot?: string;
}

/** Result returned by a diagram renderer. Never throws — errors are returned as ok:false. */
export interface DiagramRenderResult {
  appearance?: {
    style: string;
    mode: 'light' | 'dark';
    contrast: 'normal' | 'high';
    canvas: string;
    backgroundPainted: boolean;
    hash: string;
  };
  /** Whether rendering succeeded. */
  ok: boolean;
  /** Output format — always 'svg' in v1. */
  format: 'svg';
  /** SVG string (present when ok is true). */
  svg?: string;
  /** Non-fatal warnings from the renderer. */
  warnings?: string[];
  /** Human-readable error message (present when ok is false). */
  errorMessage?: string;
  /** ID of the renderer that produced this result. */
  rendererId: string;
}
