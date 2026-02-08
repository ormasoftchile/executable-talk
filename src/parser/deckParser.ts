/**
 * Deck parser for .deck.md files
 * Uses gray-matter for YAML frontmatter extraction
 */

import matter from 'gray-matter';
import { Deck, DeckMetadata, SceneDefinition, createDeck } from '../models/deck';
import { parseSlides, getLastParseWarnings } from './slideParser';
import { EnvDeclarationParser } from '../env/envDeclarationParser';

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

    // Parse authored scenes from frontmatter (T043)
    const { scenes, errors: sceneErrors } = parseAuthoredScenes(
      metadata.scenes,
      slides.length
    );

    // Update metadata with parsed scenes
    const enrichedMetadata = { ...metadata, scenes } as DeckMetadata;

    // Parse env declarations from frontmatter (T015 [US1])
    let envDeclarations: import('../models/env').EnvDeclaration[] = [];
    const envWarnings: string[] = [];
    try {
      const envParser = new EnvDeclarationParser();
      envDeclarations = envParser.parseEnvDeclarations(metadata);
    } catch (envError) {
      // Non-fatal — deck still loads, warning surfaced
      const msg = envError instanceof Error ? envError.message : 'Unknown env parse error';
      envWarnings.push(`[env] ${msg}`);
    }

    const deck = createDeck(filePath, slides, enrichedMetadata);
    deck.envDeclarations = envDeclarations;

    // Collect action block parse warnings (non-fatal)
    const warnings = getLastParseWarnings();

    // Add scene parse errors as warnings (non-fatal)
    for (const err of sceneErrors) {
      warnings.push(`[scenes] ${err}`);
    }

    // Add env parse warnings
    for (const w of envWarnings) {
      warnings.push(w);
    }

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

/**
 * Parse and validate scenes from frontmatter metadata.
 * Converts 1-based slide numbers to 0-based indices.
 * T043 [US5]
 */
function parseAuthoredScenes(
  rawScenes: unknown,
  totalSlides: number
): { scenes: SceneDefinition[]; errors: string[] } {
  const scenes: SceneDefinition[] = [];
  const errors: string[] = [];

  if (!Array.isArray(rawScenes)) {
    if (rawScenes !== undefined && rawScenes !== null) {
      errors.push('scenes must be an array');
    }
    return { scenes, errors };
  }

  const namesSeen = new Set<string>();

  for (let i = 0; i < rawScenes.length; i++) {
    const entry: unknown = rawScenes[i];

    if (!entry || typeof entry !== 'object') {
      errors.push(`scenes[${i}]: must be an object with name and slide`);
      continue;
    }

    const { name, slide } = entry as { name?: unknown; slide?: unknown };

    // Validate name
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      errors.push(`scenes[${i}]: missing or invalid 'name'`);
      continue;
    }

    const trimmedName = name.trim();

    // Check for duplicate names
    if (namesSeen.has(trimmedName)) {
      errors.push(`scenes[${i}]: duplicate scene name '${trimmedName}'`);
      continue;
    }
    namesSeen.add(trimmedName);

    // Validate slide (1-based in frontmatter, convert to 0-based index)
    if (typeof slide !== 'number' || !Number.isInteger(slide)) {
      errors.push(`scenes[${i}]: 'slide' must be an integer`);
      continue;
    }

    if (slide < 1 || slide > totalSlides) {
      errors.push(`scenes[${i}]: slide ${slide} out of range [1, ${totalSlides}]`);
      continue;
    }

    scenes.push({ name: trimmedName, slide: slide - 1 }); // Convert to 0-based
  }

  return { scenes, errors };
}
