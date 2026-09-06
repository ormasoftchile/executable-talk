import { expect } from 'chai';
import * as vscode from 'vscode';
import { Conductor } from '../../../packages/extension/src/conductor/conductor';

describe('Auto-Record editor demo cleanup', () => {
  const api = vscode as any;
  let originalTabs: any;
  let originalCommands: any;
  let tabs: any[];
  let closed: any[];
  let commands: string[];
  let conductor: any;

  beforeEach(() => {
    originalTabs = api.window.tabGroups;
    originalCommands = api.commands.executeCommand;
    tabs = [{ label: 'Deckpilot' }, { label: 'Existing source' }];
    closed = [];
    commands = [];
    api.window.tabGroups = {
      get all() { return [{ tabs }]; },
      close: async (targets: any[]) => {
        closed.push(...targets);
        tabs = tabs.filter(tab => !targets.includes(tab));
        return true;
      },
    };
    api.commands.executeCommand = async (id: string) => {
      commands.push(id);
      if (id === 'vscode.getEditorLayout') return { orientation: 0, groups: [{}] };
      return undefined;
    };
    conductor = Object.create(Conductor.prototype);
    Object.assign(conductor, {
      webviewProvider: { reveal: () => commands.push('reveal-deck') },
      outputChannel: { appendLine: () => {} },
      recordingState: { getElapsedMs: () => 0, isRecording: () => false },
      pendingVideoNarrationCues: new Map(),
      delay: async () => {},
      autoPilotConfig: { postActionMs: 0 },
    });
  });

  afterEach(() => {
    api.window.tabGroups = originalTabs;
    api.commands.executeCommand = originalCommands;
  });

  it('closes only demo-created tabs and restores layout and presentation focus', async () => {
    await conductor.beginEditorDemo();
    const demo = { label: 'Preview' };
    tabs.push(demo);
    conductor.captureEditorDemoTabs();
    await conductor.restoreEditorDemo();
    expect(closed).to.deep.equal([demo]);
    expect(tabs.map(tab => tab.label)).to.deep.equal(['Deckpilot', 'Existing source']);
    expect(commands).to.deep.equal(['vscode.getEditorLayout', 'vscode.setEditorLayout', 'reveal-deck']);
    await conductor.restoreEditorDemo();
    expect(closed).to.have.length(1);
  });

  it('preserves dirty demo tabs and unrelated tabs opened during the hold', async () => {
    await conductor.beginEditorDemo();
    const dirty = { label: 'Edited source', isDirty: true };
    const preview = { label: 'Preview' };
    tabs.push(dirty, preview);
    conductor.captureEditorDemoTabs();
    const unrelated = { label: 'User opened later' };
    tabs.push(unrelated);
    await conductor.restoreEditorDemo();
    expect(closed).to.deep.equal([preview]);
    expect(tabs).to.include(dirty).and.include(unrelated);
    expect(commands).not.to.include('vscode.setEditorLayout');
    expect(commands.at(-1)).to.equal('reveal-deck');
  });

  it('captures an opted-in action and waits before returning', async () => {
    conductor.handleExecuteAction = async () => { tabs.push({ label: 'Preview' }); };
    await conductor.executeAutoPilotStep({ type: 'trigger-action', actionId: 'preview', restoreEditors: true, durationMs: 0, slideIndex: 0 });
    expect(conductor.editorDemo).not.to.equal(undefined);
    const durations: number[] = [];
    conductor.delay = async (duration: number) => { durations.push(duration); };
    await conductor.executeAutoPilotStep({ type: 'restore-editors', durationMs: 8000, slideIndex: 0 });
    expect(durations).to.deep.equal([8000]);
    expect(closed.map(tab => tab.label)).to.deep.equal(['Preview']);
  });

  it('restores the demo during cancellation cleanup', async () => {
    await conductor.beginEditorDemo();
    tabs.push({ label: 'Preview' });
    conductor.captureEditorDemoTabs();
    await conductor.cleanupAutoPilotRun();
    expect(closed.map(tab => tab.label)).to.deep.equal(['Preview']);
    expect(conductor.editorDemo).to.equal(undefined);
  });
});