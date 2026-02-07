# Data Model: Non-Linear Navigation, Scenes & Cross-Platform Commands

**Feature**: 005-nonlinear-nav-scenes  
**Date**: 2026-02-07  
**Status**: Draft

## Entity Relationship Diagram

```
┌─────────────┐       1:N       ┌─────────────┐
│    Deck     │────────────────▶│    Slide    │
└─────────────┘                 └─────────────┘
       │                               │
       │ 0:N                           │ 1:N
       ▼                               ▼
┌──────────────────┐            ┌─────────────┐
│ SceneDefinition  │            │   Action    │
│ (authored)       │            └─────────────┘
└──────────────────┘                   │
                                       │ (terminal.run only)
                                       ▼
                                ┌───────────────────┐
                                │ PlatformCommandMap │
                                └───────────────────┘

┌─────────────┐       1:1       ┌─────────────┐
│ SceneStore  │                 │ StateStack  │
│ (named)     │                 │ (linear)    │
└─────────────┘                 └─────────────┘
       │                               │
       │ 0:20                          │ 0:50
       ▼                               ▼
┌──────────────┐                ┌─────────────┐
│ SceneEntry   │                │  Snapshot   │
│              │────────────────│             │
└──────────────┘   extends      └─────────────┘

┌────────────────────┐
│ NavigationHistory  │
└────────────────────┘
       │
       │ 0:50
       ▼
┌────────────────────────┐
│ NavigationHistoryEntry │
└────────────────────────┘
```

---

## New Entities

### SceneDefinition (authored — from deck frontmatter)

Represents a pre-authored scene anchor defined in the deck YAML frontmatter.

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | `string` | ✓ | Human-readable scene name (unique within deck) |
| `slide` | `number` | ✓ | 1-based slide number this scene anchors to |

**Validation Rules**:
- `name` must be non-empty and unique within the `scenes` array
- `slide` must be in range `[1, deck.slides.length]`
- Defined in deck-level frontmatter as `scenes: [{name, slide}]`

**Example in frontmatter**:
```yaml
---
title: My Talk
scenes:
  - name: intro
    slide: 1
  - name: live-demo
    slide: 8
  - name: conclusion
    slide: 18
---
```

---

### SceneEntry (runtime — saved or hydrated)

Represents a fully captured scene checkpoint with IDE state.

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | `string` | ✓ | Scene name (unique across all scenes) |
| `origin` | `'authored' \| 'saved'` | ✓ | Whether this came from frontmatter or was user-saved |
| `slideIndex` | `number` | ✓ | Zero-based slide index when scene was saved |
| `timestamp` | `number` | ✓ | Unix timestamp (ms) of when scene was saved/hydrated |
| `snapshot` | `Snapshot \| null` | | Full IDE state snapshot; `null` for authored scenes not yet visited |

**Validation Rules**:
- `name` must be unique across authored + saved scenes
- `snapshot` is `null` for authored scenes that haven't been visited yet; on first visit or manual save, a full `Snapshot` is captured
- `origin: 'authored'` scenes are read-only (cannot be overwritten by save)
- `origin: 'saved'` scenes can be overwritten by saving with the same name

**State Transitions**:
- Authored scene: `ANCHORED` (null snapshot) → `HYDRATED` (has snapshot, on first visit)
- Saved scene: created directly as `HYDRATED`

---

### SceneStore

Manages the collection of named scene checkpoints.

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `scenes` | `Map<string, SceneEntry>` | ✓ | All scenes keyed by name |
| `maxRuntimeScenes` | `number` | ✓ | Maximum saved (non-authored) scenes; default 20 |

**Operations**:

| Operation | Description |
|-----------|-------------|
| `save(name, snapshot, slideIndex)` | Creates/overwrites a runtime scene |
| `restore(name)` | Returns the `SceneEntry` for the given name |
| `delete(name)` | Removes a runtime scene (authored scenes cannot be deleted) |
| `list()` | Returns all scenes sorted by origin (authored first), then name |
| `loadAuthored(definitions)` | Initializes authored scenes from deck frontmatter |
| `getRuntimeCount()` | Returns count of `origin: 'saved'` scenes |
| `clear()` | Removes all runtime scenes; resets authored scenes to null snapshot |

**Constraints**:
- Maximum 20 runtime scenes per session
- Authored scenes persist for the presentation lifetime
- All scenes cleared when presentation ends

---

### NavigationHistoryEntry

Represents a single entry in the slide visit history trail.

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `slideIndex` | `number` | ✓ | Zero-based index of visited slide |
| `slideTitle` | `string` | | Title of the slide (from frontmatter or first heading) |
| `timestamp` | `number` | ✓ | Unix timestamp (ms) of the visit |
| `method` | `NavigationMethod` | ✓ | How the presenter arrived at this slide |

**NavigationMethod enum**:
```
'sequential' | 'jump' | 'scene-restore' | 'history-click' | 'go-back'
```

---

### NavigationHistory

Manages the breadcrumb trail of visited slides.

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `entries` | `NavigationHistoryEntry[]` | ✓ | Chronologically ordered visit history |
| `maxEntries` | `number` | ✓ | Maximum history entries; default 50 |
| `previousSlideIndex` | `number \| null` | | The slide visited before the current one (for "go back") |

**Operations**:

| Operation | Description |
|-----------|-------------|
| `push(entry)` | Appends entry, updates `previousSlideIndex`, evicts oldest if at cap |
| `goBack()` | Returns `previousSlideIndex` (the logical "go back" target) |
| `getRecent(count)` | Returns the most recent N entries for breadcrumb display |
| `clear()` | Empties all entries |

**Constraints**:
- Maximum 50 entries
- Oldest entries evicted when cap exceeded (FIFO)
- Session-only, cleared when presentation ends

---

### PlatformCommandMap

Represents a cross-platform command definition within a `terminal.run` action.

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `macos` | `string` | | Command to run on macOS |
| `windows` | `string` | | Command to run on Windows |
| `linux` | `string` | | Command to run on Linux |
| `default` | `string` | | Fallback command when no OS-specific entry exists |

**Validation Rules**:
- At least one of `macos`, `windows`, `linux`, or `default` must be present
- Preflight validation warns if the current OS platform key is missing AND no `default` is provided
- Commands may contain path placeholders (`${pathSep}`, `${home}`, `${shell}`, `${pathDelimiter}`)

**Resolution Logic**:
1. Detect current OS via `process.platform` → map to `'macos' | 'windows' | 'linux'`
2. Look up platform-specific command
3. If not found, fall back to `default`
4. If neither found, produce a non-blocking error
5. Expand any `${...}` placeholders before execution

**Example in YAML `onEnter`**:
```yaml
onEnter:
  - type: terminal.run
    params:
      command:
        macos: "open ."
        windows: "explorer ."
        linux: "xdg-open ."
      name: file-browser
```

---

## Extended Entities (modifications to existing models)

### Deck (extended)

New attributes added to the existing `Deck` model:

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `sceneDefinitions` | `SceneDefinition[]` | | Authored scenes from deck frontmatter |

**Changes to `DeckMetadata` interface**:
```typescript
interface DeckMetadata {
  // ... existing fields ...
  scenes?: SceneDefinition[];  // NEW
}
```

---

### Snapshot (extended)

New attributes added to existing `EditorState` within `Snapshot`:

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `cursorPosition` | `{ line: number; character: number }` | | Cursor position in the editor |

**Changes to `EditorState` interface**:
```typescript
interface EditorState {
  path: string;
  viewColumn: number;
  visibleRange?: { start: number; end: number };
  cursorPosition?: { line: number; character: number };  // NEW
  wasOpenedByPresentation: boolean;
}
```

---

### Action `terminal.run` params (extended)

The `command` parameter of `terminal.run` actions now accepts either a plain string (existing behavior) or a `PlatformCommandMap` object:

| `command` type | Behavior |
|----------------|----------|
| `string` | Existing: command executed as-is on all platforms |
| `PlatformCommandMap` | New: OS-specific command selected and executed |

**Backward Compatibility**: If `command` is a string, behavior is identical to today. No breaking changes.
