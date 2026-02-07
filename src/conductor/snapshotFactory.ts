/**
 * Snapshot Factory for creating and restoring IDE state snapshots
 * Per contracts/state-stack.md
 */

import * as vscode from 'vscode';
import {
  Snapshot,
  EditorState,
  TerminalState,
  DecorationState,
  createSnapshot,
} from '../models/snapshot';

/**
 * A resource that could not be restored during partial restore
 */
export interface SkippedResource {
  type: 'editor' | 'terminal' | 'decoration';
  name: string;
  reason: string;
}

/**
 * Result of a partial restore operation
 */
export interface RestoreResult {
  success: boolean;
  skipped: SkippedResource[];
}

/**
 * Tracks which resources were created by the presentation
 */
interface PresentationResources {
  openedEditors: Set<string>; // File paths opened by presentation
  createdTerminals: Set<string>; // Terminal names created by presentation
  decorationTypes: Map<string, vscode.TextEditorDecorationType>; // Active decorations
}

/**
 * Factory for creating and restoring snapshots
 */
export class SnapshotFactory {
  private resources: PresentationResources = {
    openedEditors: new Set(),
    createdTerminals: new Set(),
    decorationTypes: new Map(),
  };

  /**
   * Create snapshot of current presentation state
   * @param slideIndex Current slide index
   * @param label Optional description for debugging
   */
  capture(slideIndex: number, label?: string): Snapshot {
    const snapshot = createSnapshot(slideIndex, label);

    // Capture editor states
    snapshot.openEditors = this.captureEditorStates();

    // Capture active editor info
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      snapshot.activeEditorPath = activeEditor.document.uri.fsPath;
      snapshot.activeLine = activeEditor.selection.active.line + 1;
    }

    // Capture terminal states
    snapshot.terminals = this.captureTerminalStates();

    // Capture decoration states
    snapshot.decorations = this.captureDecorations();

    return snapshot;
  }

  /**
   * Restore presentation to a snapshot state
   * @param snapshot State to restore
   */
  async restore(snapshot: Snapshot): Promise<void> {
    // Restore editor states
    await this.restoreEditorStates(snapshot.openEditors);

    // Restore decorations
    this.restoreDecorations(snapshot.decorations);

    // Note: Terminal state restoration is limited
    // We can close terminals but not restore their output
    this.restoreTerminalStates(snapshot.terminals);
  }

  /**
   * Restore a snapshot partially, collecting skipped resources instead of failing.
   * Used by scene restore where best-effort is acceptable.
   * Per contracts/scene-store.md.
   * @param snapshot State to restore
   */
  async restorePartial(snapshot: Snapshot): Promise<RestoreResult> {
    const skipped: SkippedResource[] = [];

    // Restore editor states (best-effort)
    for (const editorState of snapshot.openEditors) {
      try {
        const editor = vscode.window.visibleTextEditors.find(e =>
          vscode.workspace.asRelativePath(e.document.uri) === editorState.path
        );
        if (editor) {
          if (editorState.visibleRange) {
            const range = new vscode.Range(
              new vscode.Position(editorState.visibleRange.start - 1, 0),
              new vscode.Position(editorState.visibleRange.end - 1, 0)
            );
            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
          }
          if (editorState.cursorPosition) {
            const pos = new vscode.Position(
              editorState.cursorPosition.line,
              editorState.cursorPosition.character
            );
            editor.selection = new vscode.Selection(pos, pos);
          }
        } else {
          // Try to open the file
          const workspaceFolders = vscode.workspace.workspaceFolders;
          if (workspaceFolders) {
            const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, editorState.path);
            try {
              await vscode.window.showTextDocument(fileUri, {
                viewColumn: editorState.viewColumn,
                preserveFocus: true,
              });
            } catch {
              skipped.push({
                type: 'editor',
                name: editorState.path,
                reason: 'File not found or could not be opened',
              });
            }
          }
        }
      } catch {
        skipped.push({
          type: 'editor',
          name: editorState.path,
          reason: 'Failed to restore editor state',
        });
      }
    }

    // Restore decorations (best-effort)
    try {
      this.restoreDecorations(snapshot.decorations);
    } catch {
      skipped.push({
        type: 'decoration',
        name: 'all',
        reason: 'Failed to restore decorations',
      });
    }

    // Restore terminals (best-effort)
    try {
      this.restoreTerminalStates(snapshot.terminals);
    } catch {
      skipped.push({
        type: 'terminal',
        name: 'all',
        reason: 'Failed to restore terminal states',
      });
    }

    return {
      success: skipped.length === 0,
      skipped,
    };
  }

  /**
   * Track a file opened by the presentation
   */
  trackOpenedEditor(filePath: string): void {
    this.resources.openedEditors.add(filePath);
  }

  /**
   * Track a terminal created by the presentation
   */
  trackCreatedTerminal(name: string): void {
    this.resources.createdTerminals.add(name);
  }

  /**
   * Track a decoration type
   */
  trackDecoration(id: string, decorationType: vscode.TextEditorDecorationType): void {
    this.resources.decorationTypes.set(id, decorationType);
  }

  /**
   * Clear all tracked resources
   */
  clearTracking(): void {
    this.resources = {
      openedEditors: new Set(),
      createdTerminals: new Set(),
      decorationTypes: new Map(),
    };
  }

  /**
   * Dispose all decoration types
   */
  disposeDecorations(): void {
    for (const decorationType of this.resources.decorationTypes.values()) {
      decorationType.dispose();
    }
    this.resources.decorationTypes.clear();
  }

  // ============================================================================
  // Private capture methods
  // ============================================================================

  private captureEditorStates(): EditorState[] {
    const states: EditorState[] = [];

    for (const tabGroup of vscode.window.tabGroups.all) {
      for (const tab of tabGroup.tabs) {
        if (tab.input instanceof vscode.TabInputText) {
          const uri = tab.input.uri;
          
          // Get visible range and cursor position if editor is open
          let visibleRange: { start: number; end: number } | undefined;
          let cursorPosition: { line: number; character: number } | undefined;
          const editor = vscode.window.visibleTextEditors.find(
            e => e.document.uri.toString() === uri.toString()
          );
          if (editor) {
            if (editor.visibleRanges.length > 0) {
              visibleRange = {
                start: editor.visibleRanges[0].start.line + 1,
                end: editor.visibleRanges[0].end.line + 1,
              };
            }
            cursorPosition = {
              line: editor.selection.active.line,
              character: editor.selection.active.character,
            };
          }

          states.push({
            path: vscode.workspace.asRelativePath(uri),
            viewColumn: tabGroup.viewColumn,
            wasOpenedByPresentation: this.resources.openedEditors.has(uri.fsPath),
            visibleRange,
            cursorPosition,
          });
        }
      }
    }

    return states;
  }

  private captureTerminalStates(): TerminalState[] {
    return vscode.window.terminals.map((terminal) => ({
      name: terminal.name,
      wasCreatedByPresentation: this.resources.createdTerminals.has(terminal.name),
    }));
  }

  private captureDecorations(): DecorationState[] {
    const states: DecorationState[] = [];
    
    for (const [id, _decorationType] of this.resources.decorationTypes) {
      // We can't get the current ranges from a decorationType
      // So we store the id and will clear it on restore
      states.push({
        editorPath: '', // Will be extracted from id if needed
        decorationType: id,
        ranges: [], // Ranges cannot be retrieved from decorationType
      });
    }
    
    return states;
  }

  private async restoreEditorStates(editors: EditorState[]): Promise<void> {
    // Close editors that were opened by the presentation
    const currentTabs = vscode.window.tabGroups.all.flatMap(g => g.tabs);
    
    for (const tab of currentTabs) {
      if (tab.input instanceof vscode.TabInputText) {
        const relativePath = vscode.workspace.asRelativePath(tab.input.uri);
        const savedEditor = editors.find(e => e.path === relativePath);
        
        // If this editor wasn't in the snapshot and was opened by presentation, close it
        if (!savedEditor && this.resources.openedEditors.has(tab.input.uri.fsPath)) {
          try {
            await vscode.window.tabGroups.close(tab);
          } catch {
            // Ignore errors closing tabs
          }
        }
      }
    }
    
    // Restore visible ranges and cursor positions for editors that were in the snapshot
    for (const editorState of editors) {
      const editor = vscode.window.visibleTextEditors.find(e => 
        vscode.workspace.asRelativePath(e.document.uri) === editorState.path
      );
      if (editor) {
        if (editorState.visibleRange) {
          const range = new vscode.Range(
            new vscode.Position(editorState.visibleRange.start - 1, 0),
            new vscode.Position(editorState.visibleRange.end - 1, 0)
          );
          editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        }
        if (editorState.cursorPosition) {
          const pos = new vscode.Position(
            editorState.cursorPosition.line,
            editorState.cursorPosition.character
          );
          editor.selection = new vscode.Selection(pos, pos);
        }
      }
    }
  }

  private restoreTerminalStates(terminals: TerminalState[]): void {
    // Close terminals that were created by the presentation and aren't in snapshot
    const currentTerminals = vscode.window.terminals;
    
    for (const terminal of currentTerminals) {
      const savedTerminal = terminals.find(t => t.name === terminal.name);
      
      // If this terminal wasn't in the snapshot and was created by presentation, dispose it
      if (!savedTerminal && this.resources.createdTerminals.has(terminal.name)) {
        terminal.dispose();
      }
    }
  }

  private restoreDecorations(decorations: DecorationState[]): void {
    // Clear all current decorations that aren't in the snapshot
    const snapshotDecorationIds = new Set(decorations.map(d => d.decorationType));
    
    for (const [id, decorationType] of this.resources.decorationTypes) {
      if (!snapshotDecorationIds.has(id)) {
        decorationType.dispose();
        this.resources.decorationTypes.delete(id);
      }
    }
  }
}
