import { expect } from 'chai';
import * as vscode from 'vscode';
import { Conductor } from '../../../packages/extension/src/conductor/conductor';
import { createDeck } from '../../../packages/core/src/models/deck';
import { resolveAppearance } from '../../../packages/core/src/models/appearance';

function harness() {
  const sent: any[] = [];
  const conductor = Object.create(Conductor.prototype) as any;
  const slides = [0, 1].map(index => ({
    index, id: `slide-${index}`, content: '', html: `<h1>Slide ${index}</h1>`,
    interactiveElements: [], renderDirectives: [], onEnterActions: [],
    fragmentCount: 0, diagramBlocks: [{ id: `diagram-${index}-0` }],
  }));
  Object.assign(conductor, {
    deck: createDeck('/workspace/demo.deck.md', slides as any),
    currentSlideIndex: 0,
    slideRenderVersion: 0,
    snapshotFactory: { capture: () => ({}) },
    stateStack: { push: () => {}, canUndo: () => false, canRedo: () => false },
    recordingState: { isRecording: () => false },
    appearanceService: { get: () => ({ ...resolveAppearance(), revision: 1 }) },
    navigationHistory: { getRecent: () => [], canGoBack: () => false, length: 0 },
    webviewProvider: { sendSlideChanged: (payload: unknown) => sent.push(payload) },
    presenterViewProvider: { updateSlide: () => {} },
    resolveSlideRenderDirectives: (slide: { html: string }) => slide.html,
    resolvedBasePath: () => '/workspace',
    isOnboardingMode: () => false,
  });
  return { conductor, sent };
}

describe('atomic slide presentation', () => {
  it('waits for read-only content but starts command output only after publication', async () => {
    const { conductor, sent } = harness();
    const originalFs = vscode.workspace.fs;
    let finish!: (data: Uint8Array) => void;
    (vscode.workspace as any).fs = { readFile: () => new Promise(resolve => { finish = resolve; }) };
    try {
      const slide = conductor.deck.slides[0];
      slide.diagramBlocks = [];
      slide.content = '[](render:file?path=sample.ts)\n\n[](render:command?cmd=node)';
      slide.renderDirectives = [{ type: 'file' }, { type: 'command' }];
      const commands: unknown[] = [];
      conductor.resolveDirectivesAsync = (directives: unknown[]) => {
        expect(sent).to.have.length(1);
        commands.push(...directives);
      };
      const navigation = conductor.goToSlide(0);
      expect(sent).to.have.length(0);
      finish(Buffer.from('const ready = true;'));
      await navigation;
      expect(sent[0].diagramBlocks).to.have.length(1);
      expect(sent[0].diagramBlocks[0].html).to.include('const ready = true;');
      expect(commands).to.have.length(1);
      expect((commands[0] as any).type).to.equal('command');
    } finally {
      (vscode.workspace as any).fs = originalFs;
    }
  });

  it('sends the slide and resolved diagrams together, never a placeholder paint', async () => {
    const { conductor, sent } = harness();
    let finish!: (value: unknown) => void;
    const blocks = [{ blockId: 'diagram-0-0', html: '<figure><svg /></figure>' }];
    conductor.diagramService = { resolveSlideBlocks: () => new Promise(resolve => { finish = resolve; }) };
    const navigation = conductor.goToSlide(0);
    await Promise.resolve();
    expect(sent).to.have.length(0);
    finish(blocks);
    await navigation;
    expect(sent).to.have.length(1);
    expect(sent[0].diagramBlocks).to.deep.equal(blocks);
    expect(sent[0].appearance.mode).to.equal('light');
  });

  it('does not publish a slow slide after a newer navigation completes', async () => {
    const { conductor, sent } = harness();
    let finish!: (value: unknown) => void;
    let calls = 0;
    conductor.diagramService = { resolveSlideBlocks: () => ++calls === 1
      ? new Promise(resolve => { finish = resolve; }) : Promise.resolve([]) };
    const first = conductor.goToSlide(0);
    await Promise.resolve();
    await conductor.goToSlide(1);
    finish([]);
    await first;
    expect(sent.map(payload => payload.slideIndex)).to.deep.equal([1]);
  });

  it('does not publish or start slide actions after the presentation closes', async () => {
    const { conductor, sent } = harness();
    let finish!: (value: unknown) => void;
    conductor.diagramService = { resolveSlideBlocks: () => new Promise(resolve => { finish = resolve; }) };
    conductor.deck.slides[0].onEnterActions = [{}];
    conductor.waitForSlideRender = () => { throw new Error('Closed slide must not execute actions'); };
    const navigation = conductor.goToSlide(0);
    await Promise.resolve();
    conductor.deck.state = 'closed';
    finish([]);
    await navigation;
    expect(sent).to.have.length(0);
  });
});