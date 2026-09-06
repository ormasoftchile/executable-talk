import { expect } from 'chai';
import * as vscode from 'vscode';
import { AppearanceService } from '../../../packages/extension/src/services/appearanceService';
import { createDeck } from '../../../packages/core/src/models/deck';

describe('AppearanceService', () => {
  let oldConfiguration: typeof vscode.workspace.getConfiguration;
  let oldTheme: typeof vscode.window.activeColorTheme;
  beforeEach(() => {
    oldConfiguration = vscode.workspace.getConfiguration;
    oldTheme = vscode.window.activeColorTheme;
    (vscode.workspace as any).getConfiguration = () => ({ get: () => undefined });
    (vscode.window as any).activeColorTheme = { kind: 2 };
  });
  afterEach(() => {
    (vscode.workspace as any).getConfiguration = oldConfiguration;
    (vscode.window as any).activeColorTheme = oldTheme;
  });

  it('shares deck session choices and freezes recording appearance', () => {
    const service = new AppearanceService();
    const deck = createDeck('/workspace/demo.deck.md', [], { appearance: { mode: 'auto' } });
    const changes: string[] = [];
    service.onDidChange((_path, appearance) => changes.push(appearance.mode));
    expect(service.get(deck).mode).to.equal('dark');
    service.select(deck, { mode: 'light' });
    expect(service.get({ ...deck }).mode).to.equal('light');
    service.select(deck, { mode: 'auto' });
    const snapshot = service.freeze(deck);
    (vscode.window as any).activeColorTheme = { kind: 1 };
    service.select(deck, { mode: 'light' });
    expect(service.get(deck)).to.deep.equal(snapshot);
    expect(snapshot.mode).to.equal('dark');
    service.release(deck);
    expect(service.get(deck).mode).to.equal('light');
    expect(changes).to.deep.equal(['light', 'dark', 'light']);
    service.dispose();
  });

  it('does not overwrite newer preview metadata when presentation reads an older deck', () => {
    const service = new AppearanceService();
    const original = createDeck('/workspace/demo.deck.md', [], { appearance: { mode: 'auto' } });
    service.configure(original);
    const edited = createDeck(original.filePath, [], { appearance: { mode: 'light' } });
    service.configure(edited);
    expect(service.get(original).mode).to.equal('light');
    expect(service.get(edited).revision).to.equal(service.get(original).revision);
    service.dispose();
  });
});