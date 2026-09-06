/**
 * Deck parser for .deck.md files
 * Uses the in-tree YAML frontmatter parser (replaces gray-matter)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { matter } from './frontmatter';
import { Deck, DeckMetadata, SceneDefinition, createDeck, type ListFragmentMode } from '../models/deck';
import { parseSlides, getLastParseWarnings } from './slideParser';
import { resolveSlideBreakConfig } from './slideBreakResolver';
import { EnvDeclarationParser } from '../env/envDeclarationParser';
import { loadSidecar } from './sidecarLoader';
import { mergeSidecarIntoSlides, mergeSidecarDeckMetadata } from './mergeEngine';
import { resolveEnvironment } from '../env/envMerger';
import type { SidecarFile } from '../models/sidecar';

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
 * Options for parsing a deck.
 */
export interface ParseDeckOptions {
  /**
   * Resolve the text of a `content:`-imported markdown file. Given the absolute
   * path, returns live text (e.g. an unsaved editor buffer) or undefined to fall
   * back to reading from disk. Lets the live preview reflect keystroke edits in
   * the external content file.
   */
  readImport?: (absolutePath: string) => string | undefined;
}

/**
 * Parse a deck file into a Deck structure. Dispatches by file type:
 *  - `.deck.yaml` (with no sibling `.deck.md`) → YAML-primary deck (references
 *    external markdown via `content:` and carries all overlays inline).
 *  - everything else → `.deck.md` markdown deck (optionally + `.deck.yaml` sidecar).
 * @param content Raw file content
 * @param filePath Absolute path to the file
 * @param options Optional parse hooks (e.g. live content resolution)
 */
export async function parseDeck(
  content: string,
  filePath: string,
  options?: ParseDeckOptions,
): Promise<ParseResult> {
  if (filePath.endsWith('.deck.yaml')) {
    return parseYamlDeck(content, filePath, options);
  }
  return parseMarkdownDeck(content, filePath, options);
}

/**
 * Parse a `.deck.md` markdown deck (original behavior).
 * @param content Raw file content
 * @param filePath Absolute path to the file
 */
async function parseMarkdownDeck(
  content: string,
  filePath: string,
  options?: ParseDeckOptions,
): Promise<ParseResult> {
  try {
    // Extract deck-level frontmatter (before first slide delimiter)
    const { data: metadata, content: bodyContent, lineOffset: frontmatterOffset } = extractDeckFrontmatter(content);

    // If frontmatter declares `content: <path>`, load that file's body instead.
    // Imported file's frontmatter (if any) is discarded — wrapper is source of truth.
    let effectiveBody = bodyContent;
    let effectiveOffset = frontmatterOffset;
    const importWarnings: string[] = [];
    const importPath = typeof metadata.content === 'string' ? metadata.content.trim() : '';
    if (importPath) {
      try {
        const resolved = path.isAbsolute(importPath)
          ? importPath
          : path.resolve(path.dirname(filePath), importPath);
        const live = options?.readImport?.(resolved);
        const imported = live !== undefined ? live : await fs.promises.readFile(resolved, 'utf-8');
        const { content: importedBody, lineOffset: importedOffset } = extractDeckFrontmatter(imported);
        effectiveBody = importedBody;
        effectiveOffset = importedOffset;
      } catch (importError) {
        const msg = importError instanceof Error ? importError.message : 'Unknown import error';
        importWarnings.push(`[content] could not import '${importPath}': ${msg}`);
      }
    }

    let mergedMetadata = metadata as DeckMetadata;
    let loadedSidecar: import('../models/sidecar').SidecarFile | null = null;
    const sidecarWarnings: string[] = [];
    try {
      const sidecar = await loadSidecar(filePath);
      loadedSidecar = sidecar;
      if (sidecar) {
        mergedMetadata = mergeSidecarDeckMetadata(mergedMetadata, sidecar);
      }
    } catch (sidecarError) {
      // Non-fatal: sidecar load/merge errors surface as warnings, deck still loads
      const msg = sidecarError instanceof Error ? sidecarError.message : 'Unknown sidecar error';
      sidecarWarnings.push(`[sidecar] ${msg}`);
    }

    // Parse slides from body content. The slide-break mode comes from the
    // wrapper deck's frontmatter (source of truth, even for imported content).
    // Default is 'heading' (h1-h2); `slideBreak` (or `split` alias) can override.
    const breakCfg = resolveSlideBreakConfig(mergedMetadata.slideBreak ?? mergedMetadata.split);
    let slides = parseSlides(effectiveBody, {
      slideBreak: breakCfg.mode,
      headingLevels: breakCfg.headingLevels,
      listFragmentMode: resolveListFragmentMode(mergedMetadata.listFragmentMode),
      lineOffset: effectiveOffset,
    });

    if (slides.length === 0) {
      return {
        error: 'Deck must contain at least one slide',
      };
    }

    // Load and merge sidecar (.deck.yaml) if present — zero behavior change when absent
    if (loadedSidecar) {
      slides = mergeSidecarIntoSlides(slides, loadedSidecar);
    }

    const { scenes, errors: sceneErrors } = mergedMetadata.scenes !== undefined
      ? parseAuthoredScenes(mergedMetadata.scenes, slides.length)
      : resolveManifestScenes(loadedSidecar?.scenes, slides);

    // Update metadata with parsed scenes
    const enrichedMetadata = { ...mergedMetadata, scenes } as DeckMetadata;

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

    // Resolve merged execution environment (DA-22): process.env ← sidecar.common ← sidecar.platform ← .deck.env
    try {
      deck.resolvedEnvironment = await resolveEnvironment(filePath, loadedSidecar);
    } catch {
      // Non-fatal — deck still loads without resolved environment
    }

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

    // Add sidecar warnings
    for (const w of sidecarWarnings) {
      warnings.push(w);
    }

    // Add content-import warnings
    for (const w of importWarnings) {
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
function extractDeckFrontmatter(content: string): { data: Record<string, unknown>; content: string; lineOffset: number } {
  try {
    const parsed = matter(content);
    return {
      data: parsed.data,
      content: parsed.content,
      lineOffset: parsed.lineOffset,
    };
  } catch (error) {
    // If frontmatter parsing fails, return content as-is
    return {
      data: {},
      content,
      lineOffset: 0,
    };
  }
}

/**
 * A YAML-primary deck: the parsed `.deck.yaml` object plus the fields unique to
 * a standalone deck manifest (`content` pointer and `slideBreak`/`split` mode).
 * Reuses the SidecarFile shape so the existing merge engine applies overlays.
 */
type YamlDeckManifest = SidecarFile & {
  content?: string;
  slideBreak?: unknown;
  split?: unknown;
};

/**
 * Parse a standalone `.deck.yaml` deck manifest. It references untouched
 * external markdown via `content:` and carries all overlays (deck metadata,
 * per-slide notes/cues/actions, scenes, recording, export, environment) inline
 * — collapsing the former `.deck.md` + `.deck.yaml` pair into a single file.
 *
 * @param yamlContent Raw YAML file content
 * @param filePath Absolute path to the `.deck.yaml` file
 */
async function parseYamlDeck(
  yamlContent: string,
  filePath: string,
  options?: ParseDeckOptions,
): Promise<ParseResult> {
  let manifest: YamlDeckManifest;
  try {
    const parsed = yaml.load(yamlContent);
    if (parsed === null || parsed === undefined) {
      return { error: 'Deck manifest is empty' };
    }
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: 'Deck manifest must be a YAML mapping' };
    }
    manifest = parsed as YamlDeckManifest;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid YAML';
    return { error: `Failed to parse deck manifest: ${message}` };
  }

  // A YAML-primary deck must reference external markdown content.
  const importPath =
    typeof manifest.content === 'string' ? manifest.content.trim() : '';
  if (!importPath) {
    return {
      error:
        'Deck manifest must declare `content: <path>` pointing to a markdown file',
    };
  }

  // Load the external (untouched) markdown body.
  let body: string;
  let bodyOffset = 0;
  try {
    const resolved = path.isAbsolute(importPath)
      ? importPath
      : path.resolve(path.dirname(filePath), importPath);
    const live = options?.readImport?.(resolved);
    const imported = live !== undefined ? live : await fs.promises.readFile(resolved, 'utf-8');
    // Strip any frontmatter the content file may carry — manifest is source of truth.
    const extracted = extractDeckFrontmatter(imported);
    body = extracted.content;
    bodyOffset = extracted.lineOffset;
  } catch (importError) {
    const msg = importError instanceof Error ? importError.message : 'Unknown import error';
    return { error: `[content] could not import '${importPath}': ${msg}` };
  }

  // Parse slides using the manifest's slide-break mode (default 'heading' h1-h2).
  const breakCfg = resolveSlideBreakConfig(manifest.slideBreak ?? manifest.split);
  let slides = parseSlides(body, {
    slideBreak: breakCfg.mode,
    headingLevels: breakCfg.headingLevels,
    listFragmentMode: resolveListFragmentMode(manifest.deck?.listFragmentMode),
    lineOffset: bodyOffset,
  });

  if (slides.length === 0) {
    return { error: 'Deck must contain at least one slide' };
  }

  // Build base deck metadata from the manifest's `deck:` block.
  // Record the content import so watchers (live preview) track the source file.
  let metadata: DeckMetadata = { content: importPath };
  if (manifest.deck) {
    if (manifest.deck.title !== undefined) {
      metadata.title = manifest.deck.title;
    }
    if (manifest.deck.theme !== undefined) {
      metadata.theme = manifest.deck.theme;
    }
    if (manifest.deck.basePath !== undefined) {
      metadata.basePath = manifest.deck.basePath;
    }
    if (manifest.deck.listFragmentMode !== undefined) {
      metadata.listFragmentMode = resolveListFragmentMode(manifest.deck.listFragmentMode);
    }
  }

  // Apply per-slide and deck-level overlays via the existing merge engine
  // (the manifest is sidecar-shaped, so this Just Works).
  slides = mergeSidecarIntoSlides(slides, manifest);
  metadata = mergeSidecarDeckMetadata(metadata, manifest);

  // Resolve scenes (id-based like a sidecar, or 1-based numeric like frontmatter).
  const { scenes, errors: sceneErrors } = resolveManifestScenes(manifest.scenes, slides);
  const enrichedMetadata: DeckMetadata = { ...metadata, scenes };

  const deck = createDeck(filePath, slides, enrichedMetadata);

  // Resolve merged execution environment from the manifest's `environment:` block.
  try {
    deck.resolvedEnvironment = await resolveEnvironment(filePath, manifest);
  } catch {
    // Non-fatal — deck still loads without resolved environment.
  }

  const warnings = getLastParseWarnings();
  for (const err of sceneErrors) {
    warnings.push(`[scenes] ${err}`);
  }

  return { deck, warnings: warnings.length > 0 ? warnings : undefined };
}

/**
 * Resolve manifest scenes into 0-based SceneDefinition[]. A scene's `slide`
 * may be a slide ID string (matched against parsed slide IDs) or a 1-based
 * slide number.
 */
function resolveManifestScenes(
  rawScenes: unknown,
  slides: Deck['slides'],
): { scenes: SceneDefinition[]; errors: string[] } {
  const scenes: SceneDefinition[] = [];
  const errors: string[] = [];
  if (rawScenes === undefined || rawScenes === null) {
    return { scenes, errors };
  }
  if (!Array.isArray(rawScenes)) {
    errors.push('scenes must be an array');
    return { scenes, errors };
  }

  const idToIndex = new Map<string, number>();
  slides.forEach((s, i) => {
    if (s.id) {
      idToIndex.set(s.id, i);
    }
  });
  const namesSeen = new Set<string>();

  for (let i = 0; i < rawScenes.length; i++) {
    const entry = rawScenes[i] as { name?: unknown; slide?: unknown };
    if (!entry || typeof entry !== 'object') {
      errors.push(`scenes[${i}]: must be an object with name and slide`);
      continue;
    }
    const { name, slide } = entry;
    if (typeof name !== 'string' || name.trim().length === 0) {
      errors.push(`scenes[${i}]: missing or invalid 'name'`);
      continue;
    }
    const trimmedName = name.trim();
    if (namesSeen.has(trimmedName)) {
      errors.push(`scenes[${i}]: duplicate scene name '${trimmedName}'`);
      continue;
    }

    let index: number | undefined;
    if (typeof slide === 'string') {
      index = idToIndex.get(slide.trim());
      if (index === undefined) {
        errors.push(`scenes[${i}]: no slide with id '${slide}'`);
        continue;
      }
    } else if (typeof slide === 'number' && Number.isInteger(slide)) {
      if (slide < 1 || slide > slides.length) {
        errors.push(`scenes[${i}]: slide ${slide} out of range [1, ${slides.length}]`);
        continue;
      }
      index = slide - 1;
    } else {
      errors.push(`scenes[${i}]: 'slide' must be a slide id (string) or 1-based number`);
      continue;
    }

    namesSeen.add(trimmedName);
    scenes.push({ name: trimmedName, slide: index });
  }

  return { scenes, errors };
}

/**
 * Validate that a file path is a valid deck file
 */
export function isValidDeckFile(filePath: string): boolean {
  return filePath.endsWith('.deck.md');
}

/**
 * Read the `content:` import path declared by a deck file, if any.
 * Works for both `.deck.md` (YAML frontmatter) and `.deck.yaml` (top-level
 * YAML key). Returns the raw (unresolved) path string, or undefined.
 * Used by the extension to discover which deck imports a given content file
 * and to recognize a standalone `.deck.yaml` deck manifest.
 */
export function readDeckContentImport(rawContent: string, filePath: string): string | undefined {
  try {
    if (filePath.endsWith('.deck.yaml')) {
      const data = yaml.load(rawContent);
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const c = (data as Record<string, unknown>).content;
        return typeof c === 'string' && c.trim().length > 0 ? c.trim() : undefined;
      }
      return undefined;
    }
    const parsed = matter(rawContent);
    const c = parsed.data.content;
    return typeof c === 'string' && c.trim().length > 0 ? c.trim() : undefined;
  } catch {
    return undefined;
  }
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

function resolveListFragmentMode(value: unknown): ListFragmentMode | undefined {
  return value === 'all' || value === 'each' ? value : undefined;
}
