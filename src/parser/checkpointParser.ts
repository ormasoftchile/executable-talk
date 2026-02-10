/**
 * Checkpoint extraction from slide content.
 * Parses <!-- checkpoint: name --> HTML comments.
 */

/**
 * Pattern for checkpoint HTML comments: <!-- checkpoint: name -->
 */
const CHECKPOINT_PATTERN = /<!--\s*checkpoint:\s*([a-zA-Z0-9_-]+)\s*-->/;

/**
 * Extract checkpoint ID from slide content and return cleaned content.
 * Only the first checkpoint comment per slide is extracted.
 */
export function extractCheckpoint(content: string): { checkpoint?: string; cleanedContent: string } {
  const match = content.match(CHECKPOINT_PATTERN);
  if (match) {
    return {
      checkpoint: match[1],
      cleanedContent: content.replace(CHECKPOINT_PATTERN, '').trim(),
    };
  }
  return { cleanedContent: content };
}
