import { expect } from 'chai';
import { parseDeck } from '../../../packages/core/src/parser/deckParser';
import { mergeSidecarDeckMetadata } from '../../../packages/core/src/parser/mergeEngine';
import { buildTimingSummary, parseMaxDuration, requirePlanWithinBudget, validateMediaDuration } from '../../../packages/extension/src/recording/durationBudget';

describe('duration budget', () => {
  it('merges the single sidecar setting without overriding an inline limit', () => {
    expect(mergeSidecarDeckMetadata({}, { recording: { maxDuration: '120s' } }).recording?.maxDuration).to.equal('120s');
    expect(mergeSidecarDeckMetadata({ recording: { maxDuration: '90s' } }, { recording: { maxDuration: '120s' } }).recording?.maxDuration).to.equal('90s');
  });

  it('accepts a single positive duration setting and rejects invalid limits', () => {
    expect(parseMaxDuration(undefined)).to.equal(undefined);
    expect(parseMaxDuration('120s')).to.equal(120000);
    expect(parseMaxDuration('2m')).to.equal(120000);
    for (const value of [0, -1, '0s', 'two minutes', Infinity, true]) {
      expect(() => parseMaxDuration(value)).to.throw('maxDuration');
    }
  });

  it('combines measured and estimated takes without labelling overhead measured', async () => {
    const { deck } = await parseDeck('# Intro\n\nText\n\n# Demo\n\nText', 'budget.deck.md');
    deck!.slides.forEach(slide => { slide.fragmentCount = 0; });
    deck!.slides[0].cues = ['First recorded explanation.'];
    deck!.slides[1].cues = ['Another explanation to record.'];
    const summary = buildTimingSummary(deck!.slides, {}, [{ cueIndex: 1, text: 'First recorded explanation.', durationMs: 4000 }], 120000);
    expect(summary.measuredCues).to.equal(1);
    expect(summary.estimatedCues).to.equal(1);
    expect(summary.measuredNarrationMs).to.equal(4000);
    expect(summary.estimatedNarrationMs).to.be.greaterThan(0);
    expect(summary.plannedMs).to.be.greaterThan(summary.measuredNarrationMs + summary.estimatedNarrationMs);
    expect(summary.finalVerified).to.equal(false);
    const changed = buildTimingSummary(deck!.slides, {}, [{ cueIndex: 1, text: 'Old text.', durationMs: 4000 }]);
    expect(changed.measuredCues).to.equal(0);
  });

  it('reports how much a plan exceeds the limit', async () => {
    const { deck } = await parseDeck('# Intro', 'budget.deck.md');
    deck!.slides[0].fragmentCount = 0;
    deck!.slides[0].cues = ['Long take.'];
    const summary = buildTimingSummary(deck!.slides, {}, [{ cueIndex: 1, text: 'Long take.', durationMs: 121000 }], 120000);
    expect(summary.overByMs).to.equal(summary.plannedMs - 120000);
    expect(summary.overByMs).to.be.greaterThan(1000);
    expect(() => requirePlanWithinBudget(summary)).to.throw('Shorten at least');
  });

  const media = (video: string, audio = video) => ({
    format: { duration: video },
    streams: [{ codec_type: 'video', duration: video }, { codec_type: 'audio', duration: audio }],
  });

  it('checks unrounded final video, audio, and container duration', () => {
    expect(validateMediaDuration(media('120.000000'), 120000).withinLimit).to.equal(true);
    expect(validateMediaDuration(media('120.000001'), 120000).withinLimit).to.equal(false);
    expect(validateMediaDuration(media('119', '120.01'), 120000).withinLimit).to.equal(false);
    const delayed = media('119');
    Object.assign(delayed.streams[1], { start_time: '2' });
    expect(validateMediaDuration(delayed, 120000).withinLimit).to.equal(false);
  });

  it('fails closed for unreadable duration or missing video', () => {
    for (const value of [{}, { format: { duration: 'N/A' }, streams: [] },
      { format: { duration: '119' }, streams: [{ codec_type: 'video' }] },
      { format: { duration: '119' }, streams: [{ codec_type: 'audio', duration: '119' }] }]) {
      expect(() => validateMediaDuration(value, 120000)).to.throw('duration');
    }
  });
});