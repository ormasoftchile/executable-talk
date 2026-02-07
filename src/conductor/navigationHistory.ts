/**
 * Navigation History — FIFO stack tracking non-linear slide navigation.
 * Per data-model.md NavigationHistoryEntry and contracts/navigation-protocol.md.
 */

import { NavigationMethod, NavigationHistoryBreadcrumb } from '../models/deck';

/**
 * Internal entry stored in the history stack.
 */
interface NavigationHistoryEntry {
  slideIndex: number;
  slideTitle?: string;
  method: NavigationMethod;
  timestamp: number;
}

/**
 * Maximum entries before oldest are evicted (FIFO).
 */
const MAX_HISTORY_ENTRIES = 50;

/**
 * Manages a capped FIFO navigation history stack.
 *
 * - `push(entry)` — record a navigation event
 * - `goBack()` — pop the most recent entry and return its slideIndex (or null)
 * - `getRecent(count)` — return the N most-recent breadcrumbs
 * - `canGoBack()` — whether there is at least one entry
 * - `clear()` — reset the history
 */
export class NavigationHistory {
  private entries: NavigationHistoryEntry[] = [];

  /**
   * Record a navigation event.
   * If the stack exceeds MAX_HISTORY_ENTRIES the oldest entry is evicted.
   */
  push(slideIndex: number, method: NavigationMethod, slideTitle?: string): void {
    this.entries.push({
      slideIndex,
      slideTitle,
      method,
      timestamp: Date.now(),
    });

    // FIFO eviction
    if (this.entries.length > MAX_HISTORY_ENTRIES) {
      this.entries.shift();
    }
  }

  /**
   * Pop the most recent entry and return its slide index.
   * Returns `null` if the history is empty.
   */
  goBack(): number | null {
    const entry = this.entries.pop();
    return entry ? entry.slideIndex : null;
  }

  /**
   * Return the N most recent breadcrumbs (newest first).
   */
  getRecent(count: number): NavigationHistoryBreadcrumb[] {
    const start = Math.max(0, this.entries.length - count);
    return this.entries
      .slice(start)
      .reverse()
      .map(e => ({
        slideIndex: e.slideIndex,
        slideTitle: e.slideTitle,
        method: e.method,
      }));
  }

  /**
   * Whether there is at least one entry to go back to.
   */
  canGoBack(): boolean {
    return this.entries.length > 0;
  }

  /**
   * Return current number of entries.
   */
  get length(): number {
    return this.entries.length;
  }

  /**
   * Clear all history.
   */
  clear(): void {
    this.entries = [];
  }
}
