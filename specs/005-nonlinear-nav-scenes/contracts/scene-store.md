# Contract: Scene Store

**Feature**: 005-nonlinear-nav-scenes  
**Date**: 2026-02-07  
**Version**: 1.0.0

## Overview

Defines the SceneStore interface for named scene checkpoints — save, restore, and management of IDE state snapshots that persist within a presentation session.

---

## SceneStore Interface

```typescript
interface SceneStore {
  /**
   * Save current IDE state as a named scene.
   * If a runtime scene with the same name exists, it is overwritten.
   * Throws if name matches an authored scene (read-only).
   * Throws if runtime scene limit (20) is reached and name is new.
   */
  save(name: string, snapshot: Snapshot, slideIndex: number): SceneEntry;

  /**
   * Retrieve a scene by name.
   * Returns undefined if scene does not exist.
   */
  get(name: string): SceneEntry | undefined;

  /**
   * Restore a scene. Returns the SceneEntry containing the snapshot.
   * For authored scenes with null snapshot, returns the entry (caller
   * should navigate to the anchored slide and capture on arrival).
   */
  restore(name: string): SceneEntry | undefined;

  /**
   * Delete a runtime scene. Returns true if deleted, false if not found.
   * Throws if attempting to delete an authored scene.
   */
  delete(name: string): boolean;

  /**
   * List all scenes, sorted: authored first (alphabetical), then saved (by timestamp).
   */
  list(): SceneEntry[];

  /**
   * Initialize authored scenes from deck frontmatter definitions.
   * Called once when a presentation is loaded.
   */
  loadAuthored(definitions: SceneDefinition[]): void;

  /**
   * Returns the count of runtime-saved (non-authored) scenes.
   */
  getRuntimeCount(): number;

  /**
   * Clear all scenes. Called when presentation ends.
   */
  clear(): void;
}
```

---

## SceneEntry Type

```typescript
interface SceneEntry {
  name: string;
  origin: 'authored' | 'saved';
  slideIndex: number;
  timestamp: number;
  snapshot: Snapshot | null;
}
```

---

## Scene Restore Flow

```
User presses Ctrl+R
    → VS Code keybinding: executableTalk.restoreScene
        (when: "activeWebviewPanelId == 'executableTalkPresentation'")
    → Command handler sends postMessage { type: 'openScenePicker' } to Webview
    → Webview opens scene picker overlay (reuses slide picker overlay component)
    → User selects "demo-start"
    → Webview sends { type: 'restoreScene', payload: { sceneName: 'demo-start' } }
    → Conductor processes restore:
        1. Capture pre-restore snapshot → push to StateStack (enables undo of restore)
        2. SceneStore.restore('demo-start') → get SceneEntry
        3a. If snapshot exists: SnapshotFactory.restore(snapshot)
            - Close editors not in snapshot
            - Open editors from snapshot (with cursor + scroll restore)
            - Dispose terminals not in snapshot
            - Recreate terminals at saved cwd
        3b. If snapshot is null (authored, not yet visited): navigate to anchored slide
        4. Navigate to scene's slideIndex
        5. Push NavigationHistory entry (method: 'scene-restore')
        6. Send slideChanged + sceneChanged to Webview
```

---

## Scene Save Flow

```
User presses Ctrl+S
    → VS Code keybinding: executableTalk.saveScene
        (when: "activeWebviewPanelId == 'executableTalkPresentation'")
    → Command handler sends postMessage { type: 'openSceneNameInput' } to Webview
    → Webview shows name input overlay (text field + confirm)
    → User types "demo-start" and presses Enter
    → Webview sends { type: 'saveScene', payload: { sceneName: 'demo-start' } }
    → Conductor processes save:
        1. Check if name belongs to an authored scene → error if so
        2. Check runtime count < 20 → prompt if at limit
        3. SnapshotFactory.capture() → get current Snapshot
        4. SceneStore.save('demo-start', snapshot, currentSlideIndex)
        5. Send { type: 'sceneChanged', payload: { scenes: SceneStore.list() } } to Webview
```

---

## New Messages

### Webview → Extension Host

```typescript
interface SaveSceneMessage {
  type: 'saveScene';
  payload: { sceneName: string };
}

interface RestoreSceneMessage {
  type: 'restoreScene';
  payload: { sceneName: string };
}

interface DeleteSceneMessage {
  type: 'deleteScene';
  payload: { sceneName: string };
}
```

### Extension Host → Webview

```typescript
interface SceneChangedMessage {
  type: 'sceneChanged';
  payload: {
    scenes: SceneListItem[];
  };
}

interface SceneListItem {
  name: string;
  origin: 'authored' | 'saved';
  slideIndex: number;
  slideTitle: string;
  timestamp: number;
  hasSnapshot: boolean;
}

interface OpenScenePickerMessage {
  type: 'openScenePicker';
  payload: {};
}

interface OpenSceneNameInputMessage {
  type: 'openSceneNameInput';
  payload: {};
}
```

---

## Partial Restore Behavior (FR-010a)

When restoring a scene, if resources are missing:

```typescript
interface RestoreResult {
  success: boolean;
  restored: {
    editors: number;    // Count of editors successfully restored
    terminals: number;  // Count of terminals successfully restored
  };
  skipped: SkippedResource[];
}

interface SkippedResource {
  type: 'editor' | 'terminal';
  name: string;         // File path or terminal name
  reason: string;       // "File not found", "Terminal creation failed", etc.
}
```

If `skipped.length > 0`, the Conductor sends a non-blocking warning to the Webview:

```typescript
{
  type: 'warning',
  payload: {
    title: 'Scene partially restored',
    message: `${skipped.length} resource(s) could not be restored`,
    details: skipped.map(s => `${s.type}: ${s.name} — ${s.reason}`)
  }
}
```
