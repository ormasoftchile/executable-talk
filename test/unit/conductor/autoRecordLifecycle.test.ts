import { expect } from 'chai';
import * as path from 'path';
import { createDeck } from '../../../packages/core/src/models/deck';
import { createSlide } from '../../../packages/core/src/models/slide';
import type { RecordingSession } from '../../../packages/core/src/models/recording';
import { Conductor } from '../../../packages/extension/src/conductor/conductor';
import { resolveVideoBaseDirectory } from '../../../packages/extension/src/recording/videoComposer';

interface AutoRecordHarness {
  deck: ReturnType<typeof createDeck>;
  outputChannel: { appendLine(message: string): void };
  autoPilotRunning: boolean;
  pendingVideoNarrationCues: Map<number, Array<{ cueIndex: number; offsetMs: number }>>;
  narrationTimings: readonly unknown[];
  recordingState: {
    isRecording(): boolean;
    stopRecording(slideIndex?: number): undefined;
  };
  currentSlideIndex: number;
  webviewProvider: { prepareRecordingLayout(): Promise<[]> };
  startRecording(): Promise<void>;
  autoRecord: Conductor['autoRecord'];
  isAutoPilotActive: Conductor['isAutoPilotActive'];
}

interface AdvanceHarness {
  currentSlideIndex: number;
  webviewProvider: { sendAdvancePresentation(): void };
  recordingState: { isRecording(): boolean };
  waitForAdvance(): Promise<boolean>;
  onFragmentRevealed(
    slideIndex: number,
    fragmentIndex: number,
    fragmentCount: number,
    timestamp?: number,
  ): void;
}

interface StopRecordingHarness {
  deck: undefined;
  currentSlideIndex: number;
  recordingState: {
    getSession(): RecordingSession;
    stopRecording(slideIndex?: number): RecordingSession;
  };
  recorderOrchestrator: {
    stop(sessionId: string): Promise<void>;
  };
  stopRecording: Conductor['stopRecording'];
}

describe('Conductor Auto-Record lifecycle', () => {
  it('rejects an over-budget plan before starting the recorder', async () => {
    const conductor = Object.create(Conductor.prototype) as any;
    const slide = createSlide(0, '# Slide', '<h1>Slide</h1>');
    slide.fragmentCount = 0;
    slide.cues = ['The complete explanation.'];
    let starts = 0;
    Object.assign(conductor, {
      deck: createDeck('/deck.md', [slide], { recording: { maxDuration: '2s' } }),
      outputChannel: { appendLine: () => {} },
      autoPilotRunning: false, currentSlideIndex: 0,
      pendingVideoNarrationCues: new Map(), narrationTimings: [],
      recordingState: { isRecording: () => false },
      webviewProvider: { prepareRecordingLayout: async () => [{ fragmentCount: 0, actionFragments: {} }] },
      startRecording: async () => { starts++; },
    });
    let failure: unknown;
    try {
      await conductor.autoRecord([{ cueIndex: 1, text: slide.cues[0], durationMs: 3000 }]);
    } catch (error) {
      failure = error;
    }
    expect(String(failure)).to.include('exceeds');
    expect(starts).to.equal(0);
    expect(conductor.isAutoPilotActive()).to.equal(false);
  });

  it('clears the running flag when recorder startup throws', async () => {
    const harness = Object.create(Conductor.prototype) as AutoRecordHarness;
    harness.deck = createDeck('/deck.md', [createSlide(0, '# Slide', '<h1>Slide</h1>')]);
    harness.outputChannel = { appendLine: () => undefined };
    harness.autoPilotRunning = false;
    harness.pendingVideoNarrationCues = new Map();
    harness.narrationTimings = [];
    harness.recordingState = {
      isRecording: () => false,
      stopRecording: () => undefined,
    };
    harness.currentSlideIndex = 0;
    harness.webviewProvider = { prepareRecordingLayout: async () => [] };
    let startupAttempts = 0;
    harness.startRecording = async () => {
      startupAttempts++;
      throw new Error('recorder startup failed');
    };

    for (let attempt = 0; attempt < 2; attempt++) {
      let error: unknown;
      try {
        await harness.autoRecord([]);
      } catch (caught) {
        error = caught;
      }

      expect(error).to.be.instanceOf(Error);
      expect(harness.isAutoPilotActive()).to.equal(false);
    }

    expect(startupAttempts).to.equal(2);
  });

  it('stops the event clock before awaiting recorder shutdown', async () => {
    const order: string[] = [];
    const session: RecordingSession = {
      sessionId: 'session',
      deckPath: '/deck.md',
      recordingStartTime: 1000,
      events: [],
      segments: [],
      ignoredIntervals: [],
      manualMarkers: [],
      exportMetadata: {
        generatedAt: 0,
        extensionVersion: '',
        platform: 'test',
        exportFormats: [],
      },
    };
    const harness = Object.create(Conductor.prototype) as StopRecordingHarness;
    harness.deck = undefined;
    harness.currentSlideIndex = 0;
    harness.recordingState = {
      getSession: () => session,
      stopRecording: () => {
        order.push('timeline');
        return session;
      },
    };
    harness.recorderOrchestrator = {
      stop: async () => {
        order.push('recorder-start');
        await Promise.resolve();
        order.push('recorder-end');
      },
    };

    await harness.stopRecording();

    expect(order).to.deep.equal(['timeline', 'recorder-start', 'recorder-end']);
  });
});

describe('Conductor Auto-Record video paths', () => {
  const deckPath = path.resolve('examples', 'video-workflow', 'video-workflow.deck.md');

  it('resolves relative video sources from the deck directory by default', () => {
    expect(resolveVideoBaseDirectory(deckPath)).to.equal(path.dirname(deckPath));
  });

  it('resolves an explicit basePath from the deck directory', () => {
    expect(resolveVideoBaseDirectory(deckPath, '..')).to.equal(
      path.resolve(path.dirname(deckPath), '..'),
    );
  });
});

describe('Conductor Auto-Record fragment timing', () => {
  it('resolves an advance from the fragment-rendered callback', async () => {
    const harness = Object.create(Conductor.prototype) as AdvanceHarness;
    harness.currentSlideIndex = 0;
    harness.webviewProvider = { sendAdvancePresentation: () => undefined };
    harness.recordingState = { isRecording: () => false };

    const advanced = harness.waitForAdvance();
    setTimeout(() => harness.onFragmentRevealed(0, 1, 2), 10);
    const result = await Promise.race([
      advanced,
      new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), 200)),
    ]);

    expect(result).to.equal(true);
  });
});
