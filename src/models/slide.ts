/**
 * Slide types and interfaces for Executable Talk
 * Per data-model.md
 */

import { Action, ActionDefinition } from './action';

/**
 * YAML frontmatter structure for a slide
 */
export interface SlideFrontmatter {
  /** Slide title */
  title?: string;
  /** Speaker notes */
  notes?: string;
  /** Actions to execute when slide becomes active */
  onEnter?: ActionDefinition[];
  /** Checkpoint identifier for onboarding mode */
  checkpoint?: string;
  /** Extensible properties */
  [key: string]: unknown;
}

/**
 * Position within slide content
 */
export interface ContentPosition {
  line: number;
  column: number;
}

/**
 * Interactive element (clickable action link) in slide content
 */
export interface InteractiveElement {
  /** Unique identifier within slide */
  id: string;
  /** Display text */
  label: string;
  /** Parsed action */
  action: Action;
  /** Position in content */
  position: ContentPosition;
  /** Original markdown link text */
  rawLink: string;
  /** Whether this element came from an inline link or a fenced block.
   *  Defaults to 'inline' for backward compatibility. */
  source?: 'inline' | 'block';
  /** Fragment animation for this element.
   *  - `true` or `'fade'` = default fade animation
   *  - A string like `'slide-up'` = specific animation type
   *  - `undefined` / `false` = no fragment, immediately visible */
  fragment?: boolean | string;
}

/**
 * Represents a single slide within a deck
 */
export interface Slide {
  /** Zero-based position in deck */
  index: number;
  /** Raw Markdown content (without frontmatter) */
  content: string;
  /** Rendered HTML content */
  html: string;
  /** Parsed YAML frontmatter */
  frontmatter?: SlideFrontmatter;
  /** Speaker notes from frontmatter */
  speakerNotes?: string;
  /** Actions to execute when slide becomes active */
  onEnterActions: Action[];
  /** Clickable action links in content */
  interactiveElements: InteractiveElement[];
  /** Render directives for dynamic content */
  renderDirectives: RenderDirectiveRef[];
  /** Number of animated fragments in this slide */
  fragmentCount: number;
  /** Checkpoint identifier for onboarding mode */
  checkpoint?: string;
}

/**
 * Reference to a render directive (stores parsed info, resolved at display time)
 */
export interface RenderDirectiveRef {
  id: string;
  type: 'file' | 'command' | 'diff';
  rawDirective: string;
  position: { start: number; end: number };
}

/**
 * Create a new slide with defaults
 */
export function createSlide(
  index: number,
  content: string,
  html: string,
  frontmatter?: SlideFrontmatter,
  checkpoint?: string
): Slide {
  return {
    index,
    content,
    html,
    frontmatter,
    speakerNotes: frontmatter?.notes,
    onEnterActions: [],
    interactiveElements: [],
    renderDirectives: [],
    fragmentCount: 0,
    checkpoint: checkpoint ?? (frontmatter?.checkpoint as string | undefined),
  };
}
