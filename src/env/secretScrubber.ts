/**
 * SecretScrubber — replaces secret values in strings with a mask.
 * Per env-resolver contract SecretScrubber interface (T030).
 *
 * Values are replaced longest-first to avoid partial replacement artifacts.
 * Empty secret values are skipped. Matching is case-sensitive.
 */

import { ResolvedEnv } from '../models/env';

/** Default mask string for scrubbed secrets */
const DEFAULT_MASK = '•••••';

/**
 * Scrubs secret values from text that may be displayed in the webview.
 */
export class SecretScrubber {
  /**
   * Replace all occurrences of secret values in text with a mask.
   * Values are replaced longest-first (using pre-sorted secretValues).
   * Empty values are skipped.
   *
   * @param text - Text that may contain secret values
   * @param resolvedEnv - Current resolved environment with secretValues
   * @param mask - Replacement string (default: '•••••')
   * @returns Scrubbed text
   */
  scrub(text: string, resolvedEnv: ResolvedEnv, mask?: string): string {
    if (!text || resolvedEnv.secretValues.length === 0) {
      return text;
    }

    const replacement = mask ?? DEFAULT_MASK;
    let result = text;

    // secretValues is already sorted longest-first by EnvResolver
    for (const secretValue of resolvedEnv.secretValues) {
      if (!secretValue) {
        continue; // Skip empty secret values
      }
      // Use split+join for case-sensitive global replacement without regex escaping
      result = result.split(secretValue).join(replacement);
    }

    return result;
  }
}
