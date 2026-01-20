# State Stack Operations Contract

**Feature**: 001-core-extension-mvp  
**Date**: 2026-01-19  
**Version**: 1.0.0

## Overview

This document defines the contract for the State Stack, which manages undo/redo operations during a presentation session. The stack is session-only (not persisted) with a maximum capacity of 50 snapshots.

---

## Core Interfaces

### Snapshot

```typescript
/**
 * Immutable snapshot of presentation state at a point in time
 */
interface Snapshot {
  /** Unique identifier for this snapshot */
  readonly id: string;
  
  /** Slide index at time of snapshot (0-based) */
  readonly slideIndex: number;
  
  /** IDs of actions executed on this slide */
  readonly executedActionIds: readonly string[];
  
  /** Timestamp when snapshot was taken */
  readonly timestamp: number;
  
  /** Optional description for debugging */
  readonly label?: string;
  
  /** Editor states to restore */
  readonly editorStates: readonly EditorState[];
  
  /** Terminal states to restore */
  readonly terminalStates: readonly TerminalState[];
}

/**
 * Captured state of an editor for restoration
 */
interface EditorState {
  /** Relative file path */
  readonly filePath: string;
  
  /** Whether file was open */
  readonly wasOpen: boolean;
  
  /** Visible ranges in editor */
  readonly visibleRanges?: readonly Range[];
  
  /** Active decorations to restore */
  readonly decorations?: readonly DecorationState[];
}

/**
 * Captured state of a terminal for restoration
 */
interface TerminalState {
  /** Terminal name */
  readonly name: string;
  
  /** Whether terminal existed */
  readonly existed: boolean;
  
  /** Output content before action (limited buffer) */
  readonly outputSnapshot?: string;
}
```

---

### State Stack

```typescript
/**
 * Manages undo/redo stack for presentation session
 * 
 * Invariants:
 * - Maximum 50 snapshots in undo stack
 * - Redo stack clears on new snapshot
 * - Session-only, not persisted
 */
interface StateStack {
  /** Maximum snapshots before eviction */
  readonly MAX_CAPACITY: 50;
  
  /**
   * Push a new snapshot onto the undo stack
   * - Clears redo stack
   * - Evicts oldest if at capacity
   */
  push(snapshot: Snapshot): void;
  
  /**
   * Pop and return the most recent snapshot
   * - Moves current state to redo stack
   * @returns Snapshot to restore, or undefined if empty
   */
  undo(): Snapshot | undefined;
  
  /**
   * Redo a previously undone operation
   * @returns Snapshot to apply, or undefined if empty
   */
  redo(): Snapshot | undefined;
  
  /**
   * Check if undo is available
   */
  canUndo(): boolean;
  
  /**
   * Check if redo is available
   */
  canRedo(): boolean;
  
  /**
   * Get current undo stack depth
   */
  undoDepth(): number;
  
  /**
   * Get current redo stack depth
   */
  redoDepth(): number;
  
  /**
   * Clear all snapshots (e.g., when loading new deck)
   */
  clear(): void;
  
  /**
   * Get the most recent snapshot without removing it
   */
  peek(): Snapshot | undefined;
}
```

---

## State Transitions

```
                                    ┌─────────────┐
                                    │   EMPTY     │
                                    │ undo: []    │
                                    │ redo: []    │
                                    └─────┬───────┘
                                          │ push(s1)
                                          ▼
                                    ┌─────────────┐
                      ┌────────────▶│  HAS_UNDO   │◀────────────┐
                      │             │ undo: [s1]  │             │
                      │             │ redo: []    │             │
                      │ redo()      └──────┬──────┘  push(s2)   │
                      │                    │                    │
                      │                    │ undo()             │
                      │                    ▼                    │
                ┌─────┴───────┐     ┌─────────────┐             │
                │  HAS_REDO   │     │ HAS_BOTH    │─────────────┘
                │ undo: []    │◀────│ undo: [s1]  │
                │ redo: [s1]  │     │ redo: [s2]  │
                └─────────────┘     └─────────────┘
```

---

## Eviction Policy

When stack reaches `MAX_CAPACITY` (50) and a new snapshot is pushed:

1. **FIFO Eviction**: Oldest snapshot is removed from bottom of undo stack
2. **No Warning**: Eviction is silent (no user notification)
3. **Memory Cleanup**: Evicted snapshot resources released

```typescript
// Pseudocode for push with eviction
function push(snapshot: Snapshot): void {
  // Clear redo stack on new action
  this.redoStack = [];
  
  // Evict oldest if at capacity
  if (this.undoStack.length >= this.MAX_CAPACITY) {
    this.undoStack.shift();  // Remove oldest (index 0)
  }
  
  this.undoStack.push(snapshot);
}
```

---

## Snapshot Factory Contract

```typescript
/**
 * Factory for creating snapshots with current state
 */
interface SnapshotFactory {
  /**
   * Create snapshot of current presentation state
   * @param label Optional description for debugging
   */
  capture(label?: string): Promise<Snapshot>;
  
  /**
   * Restore presentation to a snapshot state
   * @param snapshot State to restore
   */
  restore(snapshot: Snapshot): Promise<void>;
}
```

### Capture Logic

```typescript
// What gets captured:
async function capture(label?: string): Promise<Snapshot> {
  return {
    id: generateUUID(),
    slideIndex: this.conductor.currentSlideIndex,
    executedActionIds: this.conductor.getExecutedActionIds(),
    timestamp: Date.now(),
    label,
    editorStates: await this.captureEditorStates(),
    terminalStates: await this.captureTerminalStates(),
  };
}
```

### Restore Logic

```typescript
// What gets restored:
async function restore(snapshot: Snapshot): Promise<void> {
  // 1. Navigate to snapshot slide
  await this.conductor.goToSlide(snapshot.slideIndex);
  
  // 2. Restore editor states
  for (const editorState of snapshot.editorStates) {
    await this.restoreEditor(editorState);
  }
  
  // 3. Restore decorations (highlights)
  await this.restoreDecorations(snapshot.editorStates);
  
  // 4. Mark actions as executed (for UI indicators)
  this.conductor.setExecutedActionIds(snapshot.executedActionIds);
  
  // Note: Terminal output is NOT restored (security/complexity)
}
```

---

## Integration Points

### Conductor → StateStack

```typescript
// Before navigating slides
class Conductor {
  async goToSlide(index: number): Promise<void> {
    // Capture before navigation
    const snapshot = await this.snapshotFactory.capture('Before slide change');
    this.stateStack.push(snapshot);
    
    // Navigate
    await this.navigateToSlide(index);
  }
  
  async undo(): Promise<boolean> {
    if (!this.stateStack.canUndo()) {
      return false;
    }
    
    const snapshot = this.stateStack.undo();
    if (snapshot) {
      await this.snapshotFactory.restore(snapshot);
      this.notifyWebview();
    }
    return true;
  }
}
```

### Webview → StateStack (via messages)

```typescript
// In message handler
case 'undo':
  const success = await this.conductor.undo();
  this.postMessage({
    type: 'slideChanged',
    payload: {
      ...this.getCurrentSlideData(),
      canUndo: this.stateStack.canUndo(),
      canRedo: this.stateStack.canRedo(),
    }
  });
  break;
```

---

## Limitations & Non-Goals

| Aspect | Behavior |
|--------|----------|
| Terminal Output | NOT restored (security/complexity) |
| External State | NOT tracked (external tools, file changes) |
| Debug Sessions | Stopped but not restored |
| Persistence | Session-only, lost on window close |
| Large Files | May impact memory, no special handling in MVP |
