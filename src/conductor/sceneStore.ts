/**
 * SceneStore — Named scene checkpoint storage.
 * Per contracts/scene-store.md.
 *
 * Manages both runtime-saved and authored (frontmatter-defined) scenes.
 * Runtime scenes are limited to 20; authored scenes are read-only.
 */

import { Snapshot } from '../models/snapshot';
import { SceneDefinition } from '../models/deck';

/**
 * A stored scene entry.
 */
export interface SceneEntry {
  name: string;
  origin: 'authored' | 'saved';
  slideIndex: number;
  timestamp: number;
  /** Snapshot is null for authored scenes that have never been visited. */
  snapshot: Snapshot | null;
}

/**
 * Maximum number of runtime-saved (non-authored) scenes.
 */
const MAX_RUNTIME_SCENES = 20;

/**
 * Manages named scene checkpoints within a presentation session.
 */
export class SceneStore {
  private scenes: Map<string, SceneEntry> = new Map();

  /**
   * Save current IDE state as a named scene.
   * Overwrites if a runtime scene with the same name exists.
   * @throws If name matches an authored scene (read-only).
   * @throws If runtime limit (20) is reached and name is new.
   */
  save(name: string, snapshot: Snapshot, slideIndex: number): SceneEntry {
    const existing = this.scenes.get(name);

    // Cannot overwrite an authored scene
    if (existing && existing.origin === 'authored') {
      throw new Error(`Cannot save over authored scene "${name}". Authored scenes are read-only.`);
    }

    // Check runtime cap for new scenes
    if (!existing && this.getRuntimeCount() >= MAX_RUNTIME_SCENES) {
      throw new Error(
        `Scene limit reached (${MAX_RUNTIME_SCENES}). Delete an existing scene to save a new one.`
      );
    }

    const entry: SceneEntry = {
      name,
      origin: 'saved',
      slideIndex,
      timestamp: Date.now(),
      snapshot,
    };

    this.scenes.set(name, entry);
    return entry;
  }

  /**
   * Retrieve a scene by name.
   */
  get(name: string): SceneEntry | undefined {
    return this.scenes.get(name);
  }

  /**
   * Restore a scene — returns the entry containing the snapshot.
   * For authored scenes with null snapshot, caller should navigate to the anchored slide.
   */
  restore(name: string): SceneEntry | undefined {
    return this.scenes.get(name);
  }

  /**
   * Delete a runtime scene.
   * @throws If attempting to delete an authored scene.
   */
  delete(name: string): boolean {
    const entry = this.scenes.get(name);
    if (!entry) {
      return false;
    }
    if (entry.origin === 'authored') {
      throw new Error(`Cannot delete authored scene "${name}". Authored scenes are read-only.`);
    }
    this.scenes.delete(name);
    return true;
  }

  /**
   * List all scenes, sorted: authored first (alphabetical), then saved (by timestamp).
   */
  list(): SceneEntry[] {
    const authored: SceneEntry[] = [];
    const saved: SceneEntry[] = [];

    for (const entry of this.scenes.values()) {
      if (entry.origin === 'authored') {
        authored.push(entry);
      } else {
        saved.push(entry);
      }
    }

    authored.sort((a, b) => a.name.localeCompare(b.name));
    saved.sort((a, b) => a.timestamp - b.timestamp);

    return [...authored, ...saved];
  }

  /**
   * Initialize authored scenes from deck frontmatter definitions.
   * Replaces any previous authored scenes.
   */
  loadAuthored(definitions: SceneDefinition[]): void {
    // Remove existing authored scenes
    for (const [name, entry] of this.scenes) {
      if (entry.origin === 'authored') {
        this.scenes.delete(name);
      }
    }

    // Add new authored scenes
    for (const def of definitions) {
      this.scenes.set(def.name, {
        name: def.name,
        origin: 'authored',
        slideIndex: def.slide,
        timestamp: 0,
        snapshot: null,
      });
    }
  }

  /**
   * Returns the count of runtime-saved (non-authored) scenes.
   */
  getRuntimeCount(): number {
    let count = 0;
    for (const entry of this.scenes.values()) {
      if (entry.origin === 'saved') {
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all scenes.
   */
  clear(): void {
    this.scenes.clear();
  }
}
