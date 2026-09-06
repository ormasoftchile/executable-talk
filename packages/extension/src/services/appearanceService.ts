import * as vscode from 'vscode';
import type { Deck } from '@deckpilot/core/models/deck';
import { resolveAppearance, type AppearancePreferences, type ResolvedAppearance } from '@deckpilot/core/models/appearance';

interface Entry {
  deck: Deck;
  session: AppearancePreferences;
  resolved: ResolvedAppearance;
  frozen?: ResolvedAppearance;
}

export class AppearanceService implements vscode.Disposable {
  private entries = new Map<string, Entry>();
  private listeners = new Set<(path: string, appearance: ResolvedAppearance) => void>();
  private subscriptions: vscode.Disposable[] = [];
  private revision = 0;

  constructor() {
    if (typeof vscode.window.onDidChangeActiveColorTheme === 'function') {
      this.subscriptions.push(vscode.window.onDidChangeActiveColorTheme(() => {
        for (const entry of this.entries.values()) {
          if (entry.frozen) {
            void vscode.window.showWarningMessage('The editor theme changed during recording. Deck colors remain frozen, but captured editor and terminal colors may differ.');
          } else this.update(entry);
        }
      }));
    }
    if (typeof vscode.workspace.onDidChangeConfiguration === 'function') {
      this.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('deckPilot.appearance')) {
          for (const entry of this.entries.values()) if (!entry.frozen) this.update(entry);
        }
      }));
    }
  }

  private key(path: string): string {
    return vscode.Uri.file(path).toString();
  }

  get(deck: Deck): ResolvedAppearance {
    const key = this.key(deck.filePath);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { deck, session: {}, resolved: resolveAppearance() };
      this.entries.set(key, entry);
      this.update(entry, false);
    }
    return entry.frozen ?? entry.resolved;
  }

  configure(deck: Deck): ResolvedAppearance {
    this.get(deck);
    const entry = this.entries.get(this.key(deck.filePath))!;
    entry.deck = deck;
    if (!entry.frozen) this.update(entry);
    return entry.frozen ?? entry.resolved;
  }

  onDidChange(listener: (path: string, appearance: ResolvedAppearance) => void): vscode.Disposable {
    this.listeners.add(listener);
    return { dispose: () => { this.listeners.delete(listener); } };
  }

  select(deck: Deck, preferences: AppearancePreferences): void {
    this.get(deck);
    const entry = this.entries.get(this.key(deck.filePath))!;
    if (entry.frozen) return;
    entry.session = { ...entry.session, ...preferences };
    this.update(entry);
  }

  async showMenu(filePath?: string): Promise<void> {
    const entry = filePath ? this.entries.get(this.key(filePath)) : [...this.entries.values()].at(-1);
    if (!entry) return;
    if (entry.frozen) {
      void vscode.window.showInformationMessage('Appearance is frozen for this recording.');
      return;
    }
    const choices: Array<vscode.QuickPickItem & { preference: AppearancePreferences }> = [
      { label: `Auto (${entry.resolved.mode})`, description: 'Follow this window', preference: { mode: 'auto' } },
      { label: 'Light', preference: { mode: 'light' } },
      { label: 'Dark', preference: { mode: 'dark' } },
      { label: 'System contrast', preference: { contrast: 'auto' } },
      { label: 'Normal contrast', preference: { contrast: 'normal' } },
      { label: 'High contrast', preference: { contrast: 'high' } },
      { label: 'Default style', description: 'Source Sans 3, teal and coral', preference: { style: 'default' } },
    ];
    const selected = await vscode.window.showQuickPick(choices, { title: 'Deckpilot Appearance', placeHolder: 'Applies to this deck session; does not edit the deck' });
    if (selected) this.select(entry.deck, selected.preference);
  }

  freeze(deck: Deck, snapshot?: ResolvedAppearance): ResolvedAppearance {
    const current = this.get(deck);
    const entry = this.entries.get(this.key(deck.filePath))!;
    entry.frozen = JSON.parse(JSON.stringify(snapshot ?? current)) as ResolvedAppearance;
    return entry.frozen;
  }

  release(deck: Deck): void {
    const entry = this.entries.get(this.key(deck.filePath));
    if (!entry) return;
    delete entry.frozen;
    this.update(entry);
  }

  private update(entry: Entry, emit = true): void {
    const config = vscode.workspace.getConfiguration('deckPilot.appearance', vscode.Uri.file(entry.deck.filePath));
    const workspace: AppearancePreferences = {};
    for (const key of ['style', 'mode', 'contrast'] as const) {
      const value = config.get<string>(key);
      if (typeof value === 'string') Object.assign(workspace, { [key]: value });
    }
    const next = resolveAppearance(entry.deck.metadata, { kind: vscode.window.activeColorTheme?.kind ?? 1 }, workspace, entry.session);
    if (next.hash === entry.resolved.hash && entry.resolved.revision !== undefined) {
      entry.resolved = { ...next, revision: entry.resolved.revision };
      return;
    }
    entry.resolved = { ...next, revision: ++this.revision };
    if (emit) for (const listener of this.listeners) listener(entry.deck.filePath, entry.resolved);
  }

  dispose(): void {
    this.subscriptions.forEach(subscription => subscription.dispose());
    this.entries.clear();
    this.listeners.clear();
  }
}