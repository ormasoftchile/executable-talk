/**
 * Deck parser for .deck.md files
 * Uses gray-matter for YAML frontmatter extraction
 */

import matter from 'gray-matter';
import { Deck, DeckMetadata, createDeck } from '../models/deck';
import { parseSlides, getLastParseWarnings } from './slideParser';

/**
 * Parse result with potential errors
 */
export interface ParseResult {
  deck?: Deck;
  error?: string;
  errorLine?: number;
  /** Non-fatal warnings (e.g., action block parse errors) — deck still loads */
  warnings?: string[];
}

/**
 * Parse a .deck.md file content into a Deck structure
 * @param content Raw file content
 * @param filePath Absolute path to the file
 */
export function parseDeck(content: string, filePath: string): ParseResult {
  try {
    // Extract deck-level frontmatter (before first slide delimiter)
    const { data: metadata, content: bodyContent } = extractDeckFrontmatter(content);

    // Parse slides from body content
    const slides = parseSlides(bodyContent);

    if (slides.length === 0) {
      return {
        error: 'Deck must contain at least one slide',
      };
    }

    const deck = createDeck(filePath, slides, metadata as DeckMetadata);

    // Collect action block parse warnings (non-fatal)
    const warnings = getLastParseWarnings();

    return { deck, warnings: warnings.length > 0 ? warnings : undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parse error';
    return {
      error: message,
    };
  }
}

/**
 * Extract deck-level frontmatter from content
 * Handles the case where frontmatter is at the very beginning
 */
function extractDeckFrontmatter(content: string): { data: Record<string, unknown>; content: string } {
  try {
    const parsed = matter(content);
    return {
      data: parsed.data as Record<string, unknown>,
      content: parsed.content,
    };
  } catch (error) {
    // If frontmatter parsing fails, return content as-is
    return {
      data: {},
      content,
    };
  }
}

/**
 * Validate that a file path is a valid deck file
 */
export function isValidDeckFile(filePath: string): boolean {
  return filePath.endsWith('.deck.md');
}
