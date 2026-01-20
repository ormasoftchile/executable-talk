/**
 * Deck types and interfaces for Executable Talk
 * Per data-model.md
 */

import { Slide } from './slide';

/**
 * Toolbar button identifiers
 */
export type ToolbarButton = 'sidebar' | 'panel' | 'terminal' | 'activityBar' | 'zenMode';

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
}

/**
 * Deck-level metadata from frontmatter
 */
export interface DeckMetadata {
  /** Presentation title */
  title?: string;
  /** Author name */
  author?: string;
  /** Presentation display options */
  options?: PresentationOptions;
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
  /** Zero-based index of active slide */
  currentSlideIndex: number;
  /** Additional deck-level frontmatter properties */
  metadata: DeckMetadata;
  /** Current deck state */
  state: DeckState;
  /** Error message if state is 'error' */
  error?: string;
}

/**
 * Create a new deck with defaults
 */
export function createDeck(
  filePath: string,
  slides: Slide[],
  metadata: DeckMetadata = {}
): Deck {
  return {
    filePath,
    title: metadata.title,
    author: metadata.author,
    slides,
    currentSlideIndex: 0,
    metadata,
    state: 'active',
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
