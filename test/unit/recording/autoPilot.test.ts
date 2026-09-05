import { expect } from 'chai';
import { parseDeck } from '../../../packages/core/src/parser/deckParser';
import {
  buildAutoPilotPlan,
  NarrationTiming,
} from '../../../packages/extension/src/recording/autoPilot';

describe('AutoPilot narration timing', () => {
  it('schedules every cue on static slides before advancing to fragmented slides', async () => {
    const result = await parseDeck('# Static slide\n\nText\n\n# Fragmented slide\n\nText', 'static-cues.deck.md');
    const slides = result.deck!.slides;
    slides[0].fragmentCount = 0;
    slides[0].cues = ['First static cue.', 'Second static cue.', 'Third static cue.'];
    slides[1].cues = ['Next slide cue.'];
    const timings = [
      { cueIndex: 1, text: 'First static cue.', durationMs: 1000 },
      { cueIndex: 2, text: 'Second static cue.', durationMs: 2000 },
      { cueIndex: 3, text: 'Third static cue.', durationMs: 3000 },
      { cueIndex: 4, text: 'Next slide cue.', durationMs: 4000 },
    ];

    const plan = buildAutoPilotPlan(slides, { initialDelayMs: 0, finalDelayMs: 0 }, timings);
    const narrated = plan.filter(step => step.narrationCues?.length);

    expect(narrated.flatMap(step => step.narrationCues!.map(cue => cue.cueIndex)))
      .to.deep.equal([1, 2, 3, 4]);
    expect(narrated.map(step => step.durationMs)).to.deep.equal([1400, 2400, 3400, 4400]);
    const advance = plan.findIndex(step => step.type === 'advance' && step.slideIndex === 1);
    expect(plan.slice(0, advance).flatMap(step => step.narrationCues ?? []).map(cue => cue.cueIndex))
      .to.deep.equal([1, 2, 3]);
  });

  it('reveals all slide content before a single sidecar cue', async () => {
    const result = await parseDeck('## Some Slide\n\nContent', 'single-cue.md');
    result.deck!.slides[0].cues = ['Narrate the complete slide.'];

    const plan = buildAutoPilotPlan(result.deck!.slides, {
      initialDelayMs: 0,
      finalDelayMs: 0,
    }, [
      { cueIndex: 1, text: 'Narrate the complete slide.', durationMs: 1000 },
    ]);
    const cueStepIndex = plan.findIndex(step => step.narrationCues?.[0]?.cueIndex === 1);
    const revealsBeforeCue = plan
      .slice(0, cueStepIndex)
      .filter(step => step.type === 'advance' && step.fragmentIndex !== undefined);

    expect(result.deck!.slides[0].fragmentCount).to.equal(2);
    expect(revealsBeforeCue.map(step => step.fragmentIndex)).to.deep.equal([1, 2]);
  });

  it('reveals one content beat before each of multiple sidecar cues', async () => {
    const result = await parseDeck('## Some Slide\n\nContent', 'multi-cue.md');
    result.deck!.slides[0].cues = ['Heading cue.', 'Content cue.'];

    const plan = buildAutoPilotPlan(result.deck!.slides, {
      initialDelayMs: 0,
      finalDelayMs: 0,
    }, [
      { cueIndex: 1, text: 'Heading cue.', durationMs: 1000 },
      { cueIndex: 2, text: 'Content cue.', durationMs: 1000 },
    ]);
    const ordered = plan.filter(step =>
      (step.type === 'advance' && step.fragmentIndex !== undefined) || step.narrationCues);

    expect(ordered.map(step =>
      step.type === 'advance' ? `reveal-${step.fragmentIndex}` : `cue-${step.narrationCues?.[0]?.cueIndex}`,
    )).to.deep.equal(['reveal-1', 'cue-1', 'reveal-2', 'cue-2']);
  });

  it('uses measured take durations for narrated beats', async () => {
    const result = await parseDeck(`---
slideBreak: marker
---
# Opening

<!-- voice: First narration beat. -->

<!-- voice[1]: Second narration beat. -->

<!-- fragment -->

Fragment content

<!-- slide -->

# Closing without narration
`, 'timed.deck.md');
    expect(result.error).to.be.undefined;

    const timings: NarrationTiming[] = [
      { cueIndex: 1, text: 'First narration beat.', durationMs: 4123 },
      { cueIndex: 2, text: 'Second narration beat.', durationMs: 2789 },
    ];
    const plan = buildAutoPilotPlan(result.deck!.slides, {
      initialDelayMs: 0,
      finalDelayMs: 0,
      minDisplayMs: 900,
    }, timings);
    const openingWait = plan.find(step => step.narrationCues?.[0]?.cueIndex === 1);
    const narratedFragmentWait = plan.find(step =>
      step.label.includes('Second narration beat.'));
    const closingWait = plan.find(step => step.label === 'Slide 2: display');

    expect(openingWait?.durationMs).to.equal(4523);
    expect(narratedFragmentWait?.durationMs).to.equal(3189);
    expect(closingWait?.durationMs).to.equal(900);
  });

  it('assigns the first video an intentional start from pre-roll and narration', async () => {
    const result = await parseDeck(`---
slideBreak: marker
---
<h1 data-no-fragment>Intro</h1>

<!-- voice: Intro narration. -->

<!-- slide -->

:::video
id: clip
src: ./clip.mp4
:::
`, 'planned.deck.md');
    const plan = buildAutoPilotPlan(result.deck!.slides, {
      initialDelayMs: 1500,
      finalDelayMs: 0,
    }, [
      { cueIndex: 1, text: 'Intro narration.', durationMs: 3773 },
    ], new Map([[1, 4000]]));

    const video = plan.find(step => step.type === 'play-video');
    expect(video?.timelineStartMs).to.equal(5673);
    expect(video?.durationMs).to.equal(4000);
  });
});
