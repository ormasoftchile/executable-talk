/**
 * Snapshot types and interfaces for Executable Talk
 * Per data-model.md and contracts/state-stack.md
 */

/**
 * Captured state of an editor for restoration
 */
export interface EditorState {
  /** Relative file path */
  path: string;
  /** View column position */
  viewColumn: number;
  /** Visible line range */
  visibleRange?: {
    start: number;
    end: number;
  };
  /** Whether file was opened by presentation */
  wasOpenedByPresentation: boolean;
}

/**
 * Captured state of a terminal for restoration
 */
export interface TerminalState {
  /** Terminal name */
  name: string;
  /** Whether terminal was created by presentation */
  wasCreatedByPresentation: boolean;
}

/**
 * Captured decoration state for restoration
 */
export interface DecorationState {
  /** Path of file with decoration */
  editorPath: string;
  /** Reference to decoration type ID */
  decorationType: string;
  /** Line ranges with decorations */
  ranges: Array<{
    startLine: number;
    endLine: number;
  }>;
}

/**
 * Immutable snapshot of presentation state at a point in time
 */
export interface Snapshot {
  /** Unique identifier */
  id: string;
  /** Slide index when snapshot was taken (0-based) */
  slideIndex: number;
  /** Timestamp when snapshot was taken */
  timestamp: number;
  /** Optional description for debugging */
  label?: string;
  /** State of all open editors */
  openEditors: EditorState[];
  /** Path of the focused editor */
  activeEditorPath?: string;
  /** Cursor line in active editor */
  activeLine?: number;
  /** State of presentation-opened terminals */
  terminals: TerminalState[];
  /** Active editor decorations */
  decorations: DecorationState[];
  /** Whether Zen Mode was active before snapshot */
  zenModeWasActive: boolean;
  /** IDs of actions executed on this slide */
  executedActionIds: string[];
}

/**
 * Create a new snapshot with defaults
 */
export function createSnapshot(
  slideIndex: number,
  label?: string
): Snapshot {
  return {
    id: generateSnapshotId(),
    slideIndex,
    timestamp: Date.now(),
    label,
    openEditors: [],
    terminals: [],
    decorations: [],
    zenModeWasActive: false,
    executedActionIds: [],
  };
}

/**
 * Generate a unique snapshot ID
 */
function generateSnapshotId(): string {
  return `snapshot-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
