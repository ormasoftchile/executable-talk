/**
 * Deck types and interfaces for Deckpilot
 * Per data-model.md and contracts/navigation-protocol.md
 */

import { Slide } from './slide';
import { EnvDeclaration } from './env';
import { DeckItem } from './deckItem';
import type { AppearancePreferences } from './appearance';

/**
 * Pre-authored scene anchor defined in deck YAML frontmatter.
 * Per data-model.md.
 */
export interface SceneDefinition {
  /** Human-readable scene name (unique within deck) */
  name: string;
  /** 1-based slide number this scene anchors to */
  slide: number;
}

/**
 * How the presenter arrived at a slide.
 * Per data-model.md.
 */
export type NavigationMethod = 'sequential' | 'jump' | 'scene-restore' | 'history-click' | 'go-back';
export type ListFragmentMode = 'all' | 'each';

/**
 * Lightweight breadcrumb DTO sent to Webview via slideChanged.
 * Per contracts/navigation-protocol.md.
 */
export interface NavigationHistoryBreadcrumb {
  slideIndex: number;
  slideTitle?: string;
  method: NavigationMethod;
}

/**
 * Toolbar button identifiers
 */
export type ToolbarButton = 'sidebar' | 'panel' | 'terminal' | 'activityBar' | 'zenMode';

/**
 * Deck-wide diagram defaults from frontmatter (or sidecar).
 *
 * Applied to every diagram block unless the block's own fence attributes
 * override them. The nested shape leaves room for future per-deck diagram
 * options (e.g. maxWidth, background) without adding more top-level fields.
 */
export interface DiagramDeckOptions {
  style?: string;
  mode?: 'inherit' | 'light' | 'dark';
  surface?: 'auto' | 'opaque' | 'transparent';
  /**
   * Default theme for diagram blocks (e.g. a Triton preset like "executive").
   * A per-fence `{theme: …}` attribute always wins over this default.
   * Renderer-specific; treated as an opaque string by core.
   */
  theme?: string;
}

/**
 * Presentation display options from frontmatter
 */
export interface PresentationOptions {
  /** Show/hide the floating toolbar */
  toolbar?: boolean | ToolbarButton[];
  /** Enable/disable Zen Mode on presentation start */
  zenMode?: boolean;
  /** Show slide numbers in navigation */
  showSlideNumbers?: boolean;
  /** Show progress bar */
  showProgress?: boolean;
  /** Font size: small, medium, large */
  fontSize?: 'small' | 'medium' | 'large';
  /** Theme override */
  theme?: 'dark' | 'light';
  /** Slide transition style */
  transition?: 'slide' | 'fade';
  /** Deck mode: standard presentation or guided onboarding */
  mode?: 'presentation' | 'onboarding';
}

/**
 * Deck-level metadata from frontmatter
 */
export interface DeckMetadata {
  appearance?: AppearancePreferences;
  /** Presentation title */
  title?: string;
  /** Author name */
  author?: string;
  /** Base path for resolving relative paths in actions and render directives.
   *  Resolved relative to the deck file's directory. */
  basePath?: string;
  /** Optional path/URL of an external markdown file whose body provides the
   *  slide content. Resolved relative to the deck file. The imported file's
   *  own frontmatter (if any) is ignored. */
  content?: string;
  /** Presentation display options */
  options?: PresentationOptions;
  /** Authored scenes from deck frontmatter */
  scenes?: SceneDefinition[];
  /**
   * How the deck body is split into slides.
   *  - 'blank' (default): break on runs of 2+ consecutive blank lines
   *    (fence- and indented-code-aware). Also honors `<!-- slide -->` markers
   *    and, for backward compatibility, bare `---` rules (deprecated).
   *  - 'marker': disable blank-line splitting; break only on `<!-- slide -->`
   *    markers and bare `---` rules.
   *  - 'heading' | 'h2' | 'h1-h3': break before ATX headings. `heading` uses
   *    levels 1–2; `hN` splits at exactly level N; `hN-hM` splits at a range.
   *    Ideal for untouched external content (e.g. a README).
   */
  slideBreak?: string;
  /** Theme override from sidecar (DA-05) */
  theme?: string;
  /** Deck-wide defaults applied to diagram blocks (e.g. Triton diagrams). */
  diagrams?: DiagramDeckOptions;
  /** Recording configuration from sidecar (DA-20) */
  recording?: {
    autoStart?: boolean;
    outputDir?: string;
    format?: string;
    codec?: string;
    framerate?: number;
    windowScope?: 'focused' | 'screen';
  };
  /** Export configuration from sidecar (DA-20) */
  export?: {
    subtitles?: boolean;
    video?: boolean;
    outputDir?: string;
    srtFormat?: 'srt' | 'vtt';
    voiceScript?: boolean;
  };
  /** Per-deck auto-record pacing overrides. Any omitted field falls back to DEFAULT_CONFIG. */
  autoRecord?: {
    wordsPerMinute?: number;
    minDisplayMs?: number;
    actionDelayMs?: number;
    narrationGapMs?: number;
    fileViewMs?: number;
    initialDelayMs?: number;
    finalDelayMs?: number;
    postActionMs?: number;
  };
  /** Default list fragmentation mode for presentation rendering */
  listFragmentMode?: ListFragmentMode;
  /** Additional properties */
  [key: string]: unknown;
}

/**
 * Deck state during lifecycle
 */
export type DeckState = 'idle' | 'loading' | 'active' | 'error' | 'closed';

/**
 * Represents a complete .deck.md presentation file
 */
export interface Deck {
  /** Absolute path to the .deck.md file */
  filePath: string;
  /** Presentation title from deck-level frontmatter */
  title?: string;
  /** Author name from deck-level frontmatter */
  author?: string;
  /** Ordered collection of slides */
  slides: Slide[];
  /** Ordered presentation items. Video items retain backing slides for protocol compatibility. */
  items?: DeckItem[];
  /** Default list fragmentation mode for presentation rendering */
  listFragmentMode?: ListFragmentMode;
  /** Zero-based index of active slide */
  currentSlideIndex: number;
  /** Additional deck-level frontmatter properties */
  metadata: DeckMetadata;
  /** Current deck state */
  state: DeckState;
  /** Error message if state is 'error' */
  error?: string;
  /** Environment variable declarations from frontmatter (Feature 006) */
  envDeclarations: EnvDeclaration[];
  /** Merged execution environment: process.env ← sidecar.common ← sidecar.platform ← .deck.env (DA-22) */
  resolvedEnvironment?: Record<string, string>;
}

/**
 * Create a new deck with defaults
 */
export function createDeck(
  filePath: string,
  slides: Slide[],
  metadata: DeckMetadata = {}
): Deck {
  const items: DeckItem[] = slides.map((slide, index) => slide.video
    ? { kind: 'video', index, slide, ...slide.video }
    : { kind: 'slide', id: slide.id ?? `slide-${index + 1}`, index, slide });
  return {
    filePath,
    title: metadata.title,
    author: metadata.author,
    slides,
    items,
    listFragmentMode: metadata.listFragmentMode,
    currentSlideIndex: 0,
    metadata,
    state: 'active',
    envDeclarations: [],
  };
}

/**
 * Validate deck file path
 */
export function isValidDeckPath(filePath: string): boolean {
  return filePath.endsWith('.deck.md');
}

/**
 * Get current slide from deck
 */
export function getCurrentSlide(deck: Deck): Slide | undefined {
  return deck.slides[deck.currentSlideIndex];
}

/**
 * Check if deck has next slide
 */
export function hasNextSlide(deck: Deck): boolean {
  return deck.currentSlideIndex < deck.slides.length - 1;
}

/**
 * Check if deck has previous slide
 */
export function hasPreviousSlide(deck: Deck): boolean {
  return deck.currentSlideIndex > 0;
}
