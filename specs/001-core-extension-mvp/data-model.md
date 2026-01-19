# Data Model: Executable Talk Core Extension MVP

**Feature**: 001-core-extension-mvp  
**Date**: 2026-01-19  
**Status**: Draft

## Entity Relationship Diagram

```
┌─────────────┐       1:N       ┌─────────────┐
│    Deck     │────────────────▶│    Slide    │
└─────────────┘                 └─────────────┘
       │                               │
       │                               │ 1:N
       │                               ▼
       │                        ┌─────────────┐
       │                        │   Action    │
       │                        └─────────────┘
       │
       │ 1:1 (current)
       ▼
┌─────────────┐       1:N       ┌─────────────┐
│ StateStack  │────────────────▶│  Snapshot   │
└─────────────┘                 └─────────────┘
```

---

## Entities

### Deck

Represents a complete `.deck.md` presentation file.

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `filePath` | `string` | ✓ | Absolute path to the `.deck.md` file |
| `title` | `string` | | Presentation title from deck-level frontmatter |
| `author` | `string` | | Author name from deck-level frontmatter |
| `slides` | `Slide[]` | ✓ | Ordered collection of slides |
| `currentSlideIndex` | `number` | ✓ | Zero-based index of active slide |
| `metadata` | `Record<string, unknown>` | | Additional deck-level frontmatter properties |

**Validation Rules**:
- `filePath` must end with `.deck.md`
- `slides` must have at least 1 slide
- `currentSlideIndex` must be in range `[0, slides.length - 1]`

**State Transitions**:
- `IDLE` → `LOADING` (on open command)
- `LOADING` → `ACTIVE` (on successful parse)
- `LOADING` → `ERROR` (on parse failure)
- `ACTIVE` → `CLOSED` (on close/escape)

---

### Slide

Represents a single slide within a deck, delimited by `---` horizontal rules.

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `index` | `number` | ✓ | Zero-based position in deck |
| `content` | `string` | ✓ | Raw Markdown content (without frontmatter) |
| `html` | `string` | ✓ | Rendered HTML content |
| `frontmatter` | `SlideFrontmatter` | | Parsed YAML frontmatter |
| `speakerNotes` | `string` | | Speaker notes from frontmatter |
| `onEnterActions` | `Action[]` | | Actions to execute when slide becomes active |
| `interactiveElements` | `InteractiveElement[]` | | Clickable action links in content |

**SlideFrontmatter Structure**:
```typescript
interface SlideFrontmatter {
  title?: string;
  notes?: string;           // Speaker notes
  onEnter?: ActionDefinition[];
  [key: string]: unknown;   // Extensible
}
```

**InteractiveElement Structure**:
```typescript
interface InteractiveElement {
  id: string;               // Unique within slide
  label: string;            // Display text
  action: Action;           // Parsed action
  position: { line: number; column: number };
}
```

**Validation Rules**:
- `content` may be empty (blank slide)
- `html` is derived from `content` (read-only)
- `onEnterActions` defaults to empty array

---

### Action

Represents an executable instruction that manipulates the IDE.

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | `string` | ✓ | Unique identifier (UUID) |
| `type` | `ActionType` | ✓ | One of the registered action types |
| `params` | `Record<string, unknown>` | ✓ | Type-specific parameters |
| `status` | `ActionStatus` | ✓ | Current execution state |
| `slideIndex` | `number` | ✓ | Owning slide index |
| `error` | `string` | | Error message if failed |
| `startedAt` | `number` | | Timestamp when execution began |
| `completedAt` | `number` | | Timestamp when execution finished |

**ActionType Enum**:
```typescript
type ActionType = 
  | 'file.open'
  | 'editor.highlight'
  | 'terminal.run'
  | 'debug.start'
  | 'sequence';
```

**ActionStatus Enum**:
```typescript
type ActionStatus = 
  | 'pending'      // Not yet executed
  | 'running'      // Currently executing
  | 'success'      // Completed successfully
  | 'failed'       // Completed with error
  | 'timeout';     // Exceeded time limit
```

**Type-Specific Parameters**:

| ActionType | Required Params | Optional Params |
|------------|-----------------|-----------------|
| `file.open` | `path: string` | `range?: string` (e.g., "10-20"), `viewColumn?: number` |
| `editor.highlight` | `lines: string` | `color?: string` (CSS color), `duration?: number` |
| `terminal.run` | `command: string` | `name?: string`, `background?: boolean`, `timeout?: number` |
| `debug.start` | `configName: string` | |
| `sequence` | `steps: ActionDefinition[]` | `delay?: number` (ms between steps) |

**Validation Rules**:
- `type` must be a registered ActionType
- `params` must satisfy type-specific schema
- `file.open.path` must be relative to workspace root
- `terminal.run.timeout` defaults to 30000 (30 seconds)

---

### Snapshot

Captures the IDE state at a point in time for undo/redo.

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | `string` | ✓ | Unique identifier (UUID) |
| `slideIndex` | `number` | ✓ | Slide index when snapshot was taken |
| `timestamp` | `number` | ✓ | Unix timestamp (ms) |
| `openEditors` | `EditorState[]` | ✓ | State of all open editors |
| `activeEditorPath` | `string` | | Path of the focused editor |
| `activeLine` | `number` | | Cursor line in active editor |
| `terminals` | `TerminalState[]` | ✓ | State of presentation-opened terminals |
| `decorations` | `DecorationState[]` | ✓ | Active editor decorations |
| `zenModeWasActive` | `boolean` | ✓ | Whether Zen Mode was on before snapshot |

**EditorState Structure**:
```typescript
interface EditorState {
  path: string;
  viewColumn: number;
  visibleRange?: { start: number; end: number };
  wasOpenedByPresentation: boolean;
}
```

**TerminalState Structure**:
```typescript
interface TerminalState {
  name: string;
  wasCreatedByPresentation: boolean;
}
```

**DecorationState Structure**:
```typescript
interface DecorationState {
  editorPath: string;
  decorationType: string;  // Reference to decoration type ID
  ranges: Array<{ startLine: number; endLine: number }>;
}
```

---

### StateStack

Manages the collection of snapshots for undo/redo operations.

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `snapshots` | `Snapshot[]` | ✓ | Ordered snapshot history |
| `currentIndex` | `number` | ✓ | Current position in stack (-1 if empty) |
| `maxDepth` | `number` | ✓ | Maximum snapshots to retain (default: 50) |

**Operations**:
```typescript
interface StateStack {
  push(snapshot: Snapshot): void;   // Add new snapshot, drop oldest if at limit
  undo(): Snapshot | undefined;      // Move back, return target state
  redo(): Snapshot | undefined;      // Move forward, return target state
  clear(): void;                     // Reset stack
  canUndo(): boolean;
  canRedo(): boolean;
}
```

**Invariants**:
- `currentIndex` is always in range `[-1, snapshots.length - 1]`
- When `push()` is called after undo, snapshots after `currentIndex` are discarded
- When `maxDepth` exceeded, oldest snapshot is removed (FIFO)

---

## Relationships

| Parent | Child | Cardinality | Description |
|--------|-------|-------------|-------------|
| Deck | Slide | 1:N | A deck contains one or more slides |
| Slide | Action | 1:N | A slide has zero or more onEnter actions |
| Slide | InteractiveElement | 1:N | A slide has zero or more clickable elements |
| Deck | StateStack | 1:1 | Each active deck has one state stack |
| StateStack | Snapshot | 1:N | Stack contains zero or more snapshots |

---

## State Machines

### Presentation Lifecycle

```
       ┌─────────────────────────────────────────┐
       │                                         │
       ▼                                         │
    ┌──────┐    open    ┌─────────┐   success   ┌────────┐
    │ IDLE │───────────▶│ LOADING │────────────▶│ ACTIVE │
    └──────┘            └─────────┘             └────────┘
       ▲                     │                      │
       │                     │ error                │ close/escape
       │                     ▼                      │
       │               ┌─────────┐                  │
       └───────────────│  ERROR  │◀─────────────────┘
                       └─────────┘
```

### Action Execution

```
    ┌─────────┐   execute   ┌─────────┐   complete   ┌─────────┐
    │ PENDING │────────────▶│ RUNNING │─────────────▶│ SUCCESS │
    └─────────┘             └─────────┘              └─────────┘
                                 │
                                 │ error/timeout
                                 ▼
                            ┌─────────┐
                            │ FAILED  │
                            └─────────┘
```

---

## Persistence

**Session Storage** (via VS Code Webview `getState`/`setState`):
- Current slide index
- Presentation metadata cache

**No Persistent Storage**:
- StateStack (session-only, cleared on presentation close)
- Action execution history
- Decoration state

---

## Indexing / Query Patterns

| Query | Data Structure | Access Pattern |
|-------|----------------|----------------|
| Get slide by index | `Deck.slides[index]` | O(1) array access |
| Find action by ID | `Map<string, Action>` in Conductor | O(1) lookup |
| Current snapshot | `StateStack.snapshots[currentIndex]` | O(1) |
| Terminals by presentation | Filter `TerminalState.wasCreatedByPresentation` | O(n) scan |
