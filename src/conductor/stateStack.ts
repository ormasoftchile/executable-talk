/**
 * State Stack for undo/redo operations
 * Per contracts/state-stack.md
 */

import { Snapshot } from '../models/snapshot';

/**
 * Maximum snapshots before eviction
 */
const MAX_CAPACITY = 50;

/**
 * Manages undo/redo stack for presentation session
 *
 * Invariants:
 * - Maximum 50 snapshots in undo stack
 * - Redo stack clears on new snapshot
 * - Session-only, not persisted
 */
export class StateStack {
  readonly MAX_CAPACITY = MAX_CAPACITY;

  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];

  /**
   * Push a new snapshot onto the undo stack
   * - Clears redo stack
   * - Evicts oldest if at capacity
   */
  push(snapshot: Snapshot): void {
    // Clear redo stack on new action
    this.redoStack = [];

    // Evict oldest if at capacity
    if (this.undoStack.length >= this.MAX_CAPACITY) {
      this.undoStack.shift(); // Remove oldest (index 0)
    }

    this.undoStack.push(snapshot);
  }

  /**
   * Pop and return the most recent snapshot
   * - Moves current state to redo stack
   * @returns Snapshot to restore, or undefined if empty
   */
  undo(): Snapshot | undefined {
    const snapshot = this.undoStack.pop();
    if (snapshot) {
      this.redoStack.push(snapshot);
    }
    return snapshot;
  }

  /**
   * Redo a previously undone operation
   * @returns Snapshot to apply, or undefined if empty
   */
  redo(): Snapshot | undefined {
    const snapshot = this.redoStack.pop();
    if (snapshot) {
      this.undoStack.push(snapshot);
    }
    return snapshot;
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Get current undo stack depth
   */
  undoDepth(): number {
    return this.undoStack.length;
  }

  /**
   * Get current redo stack depth
   */
  redoDepth(): number {
    return this.redoStack.length;
  }

  /**
   * Clear all snapshots (e.g., when loading new deck)
   */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Get the most recent snapshot without removing it
   */
  peek(): Snapshot | undefined {
    return this.undoStack[this.undoStack.length - 1];
  }

  /**
   * Get all snapshots in undo stack (for debugging)
   */
  getUndoStack(): readonly Snapshot[] {
    return this.undoStack;
  }

  /**
   * Get all snapshots in redo stack (for debugging)
   */
  getRedoStack(): readonly Snapshot[] {
    return this.redoStack;
  }
}
