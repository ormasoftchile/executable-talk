import { expect } from 'chai';
import { RecordingController } from '../../../packages/extension/src/recording/recordingController';
import { resolveAppearance } from '../../../packages/core/src/models/appearance';

describe('recording appearance snapshot', () => {
  it('retains a concrete independent snapshot through recording and retakes', () => {
    const controller = new RecordingController();
    const appearance = resolveAppearance({}, { kind: 2 });
    controller.startRecording('/demo.deck.md', 'Demo', 0, 'test-session', appearance);
    appearance.palette.background = '#FFFFFF';
    const session = controller.stopRecording(0);
    expect(session?.appearance?.mode).to.equal('dark');
    expect(session?.appearance?.palette.background).to.equal('#171B1D');
    expect(session?.appearance?.manifestHash).to.have.length(64);
  });

  it('leaves old-style sessions without a fabricated appearance', () => {
    const controller = new RecordingController();
    controller.startRecording('/demo.deck.md');
    expect(controller.stopRecording()?.appearance).to.equal(undefined);
  });
});