/**
 * TypeScript types for .deck.yaml sidecar files.
 *
 * DA-04: Canonical model for sidecar YAML structure.
 */

export interface SidecarAction {
  type: string;
  cmd?: string;
  file?: string;
  label?: string;
  [key: string]: unknown;
}

export interface SidecarSlide {
  id: string;
  /** Ordered narration beats: slide entry first, then fragment/action events. */
  cues?: SidecarCue[];
  duration?: string;
  actions?: SidecarAction[];
  checkpoint?: string;
  /** Speaker notes — merged into Slide.notes; sidecar value used when slide has no inline notes */
  notes?: string;
  /** Slide-level layout: 'center' | 'columns' | 'left' | 'right' | 'group'. Applied by wrapping slide HTML. */
  layout?: string;
  /**
   * When false, auto-fragmentation is suppressed for this slide.
   * All elements render visible immediately — no progressive reveal.
   * Useful for title slides, recap slides, and reference tables.
   * Default: true (auto-fragment is on for all slides unless overridden).
   */
  autoFragment?: boolean;
}

export interface SidecarTimedCue {
  at: string | number;
  text: string;
}

export type SidecarCue = string | SidecarTimedCue;

export type SidecarItem = SidecarSlide;

export interface SidecarDeck {
  appearance?: import('./appearance').AppearancePreferences;
  title?: string;
  theme?: string;
  /** Base path for resolving relative file references in the deck (mirrors DeckMetadata.basePath) */
  basePath?: string;
  /** Default list fragmentation mode for presentation rendering */
  listFragmentMode?: 'all' | 'each';
  /** Slide break mode: 'blank', 'marker', 'heading', 'h1', 'h2', etc. */
  slideBreak?: string;
  /** Deck-wide diagram defaults (mirrors DeckMetadata.diagrams). */
  diagrams?: SidecarDiagrams;
}

/** Deck-wide diagram defaults in a sidecar (mirrors DiagramDeckOptions). */
export interface SidecarDiagrams {
  style?: string;
  mode?: 'inherit' | 'light' | 'dark';
  surface?: 'auto' | 'opaque' | 'transparent';
  /** Default theme for diagram blocks; a per-fence `{theme: …}` wins over it. */
  theme?: string;
}

/**
 * A named checkpoint that targets a derived/explicit slide ID or 1-based number.
 * The parser resolves the target to a zero-based slide index after parsing slides.
 */
export interface SidecarScene {
  /** Human-readable scene name (unique within deck) */
  name: string;
  /** Title-derived or explicit slide ID, or a one-based slide number. */
  slide: string | number;
}

export interface SidecarRecording {
  maxDuration?: string | number;
  autoStart?: boolean;
  outputDir?: string;
  format?: string;
  codec?: string;
  framerate?: number;
  windowScope?: 'focused' | 'screen';
}

export interface SidecarExport {
  subtitles?: boolean;
  video?: boolean;
  outputDir?: string;
  srtFormat?: 'srt' | 'vtt';
  voiceScript?: boolean;
}

export interface SidecarEnvironment {
  common?: Record<string, string>;
  platform?: {
    darwin?: Record<string, string>;
    linux?: Record<string, string>;
    win32?: Record<string, string>;
  };
}

export interface SidecarFile {
  deck?: SidecarDeck;
  scenes?: SidecarScene[];
  slides?: SidecarSlide[];
  /** Canonical metadata for ordered slide and video items. */
  items?: SidecarItem[];
  recording?: SidecarRecording;
  export?: SidecarExport;
  environment?: SidecarEnvironment;
}
