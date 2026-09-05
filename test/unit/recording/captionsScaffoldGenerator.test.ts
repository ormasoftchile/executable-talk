/**
 * Unit tests for CaptionsScaffoldGenerator
 * Covers: SRT generation, timestamp formatting, text wrapping, edge cases.
 */

import { expect } from 'chai';
import { CaptionsScaffoldGenerator } from '../../../packages/extension/src/recording/captionsScaffoldGenerator';
import { createMockSession, createMockSegment, createMockEvent } from './helpers';

describe('CaptionsScaffoldGenerator', () => {
  let generator: CaptionsScaffoldGenerator;

  beforeEach(() => {
    generator = new CaptionsScaffoldGenerator();
  });

  describe('generateNarrationSrt()', () => {
    const timings = [
      { cueIndex: 1, text: 'First recorded cue.', durationMs: 2000 },
      { cueIndex: 2, text: 'Second recorded cue.', durationMs: 3000 },
    ];

    it('uses one caption per explicit cue start, not duplicated inferred segments', () => {
      const session = createMockSession({
        events: [
          createMockEvent({ type: 'narration.cue.started', relativeTimeMs: 1000, metadata: { cueIndex: 1 } }),
          createMockEvent({ type: 'fragment.revealed', relativeTimeMs: 3100 }),
          createMockEvent({ type: 'narration.cue.started', relativeTimeMs: 3500, metadata: { cueIndex: 2 } }),
        ],
        segments: [createMockSegment({ draftNarration: 'Duplicate inferred caption.' })],
      });

      const srt = generator.generateNarrationSrt(session, timings);

      expect(srt).to.equal([
        '1', '00:00:01,000 --> 00:00:03,000', 'First recorded cue.', '',
        '2', '00:00:03,500 --> 00:00:06,500', 'Second recorded cue.', '',
      ].join('\n'));
    });

    it('reports a missing scheduled cue before handing off to assembly', () => {
      const session = createMockSession({
        events: [createMockEvent({ type: 'narration.cue.started', metadata: { cueIndex: 1 } })],
      });

      expect(() => generator.generateNarrationSrt(session, timings)).to.throw('cue 2');
    });

    it('rejects duplicate cue starts instead of assigning the same take twice', () => {
      const session = createMockSession({
        events: [
          createMockEvent({ type: 'narration.cue.started', metadata: { cueIndex: 1 } }),
          createMockEvent({ type: 'narration.cue.started', metadata: { cueIndex: 1 } }),
        ],
      });

      expect(() => generator.generateNarrationSrt(session, timings)).to.throw('cue 1');
    });
  });

  describe('generateSrt()', () => {
    it('should generate valid SRT with numbered entries', () => {
      const session = createMockSession({
        segments: [
          createMockSegment({
            startTimeMs: 0,
            endTimeMs: 3000,
            draftNarration: 'Welcome to the demo.',
          }),
          createMockSegment({
            startTimeMs: 3000,
            endTimeMs: 7000,
            draftNarration: 'Here is the first step.',
          }),
        ],
      });

      const srt = generator.generateSrt(session);
      expect(srt).to.include('1\n');
      expect(srt).to.include('2\n');
      expect(srt).to.include('Welcome to the demo.');
      expect(srt).to.include('Here is the first step.');
    });

    it('should format timestamps as HH:MM:SS,mmm', () => {
      const session = createMockSession({
        segments: [
          createMockSegment({
            startTimeMs: 65000,
            endTimeMs: 68000,
            draftNarration: 'A caption.',
          }),
        ],
      });

      const srt = generator.generateSrt(session);
      expect(srt).to.include('00:01:05,000'); // start — exercises the HH:MM:SS,mmm format
      expect(srt).to.include('00:01:08,000');
    });

    it('should use segment boundaries so adjacent captions cannot overlap', () => {
      const session = createMockSession({
        segments: [
          createMockSegment({
            startTimeMs: 0,
            endTimeMs: 2000,
            draftNarration: 'This narration has enough words that its estimated reading time exceeds two seconds.',
          }),
          createMockSegment({
            startTimeMs: 2000,
            endTimeMs: 5000,
            draftNarration: 'The next narration beat.',
          }),
        ],
      });

      const srt = generator.generateSrt(session);
      expect(srt).to.include('00:00:00,000 --> 00:00:02,000');
      expect(srt).to.include('00:00:02,000 --> 00:00:05,000');
    });

    it('should skip segments with empty narration', () => {
      const session = createMockSession({
        segments: [
          createMockSegment({
            startTimeMs: 0,
            endTimeMs: 3000,
            draftNarration: '',
            cueText: undefined,
            eventSummary: '',
          }),
          createMockSegment({
            startTimeMs: 3000,
            endTimeMs: 6000,
            draftNarration: 'This one has text.',
          }),
        ],
      });

      const srt = generator.generateSrt(session);
      expect(srt).to.not.include('1\n00:00:00,000');
      expect(srt).to.include('This one has text.');
    });

    it('should handle empty segments array', () => {
      const session = createMockSession({ segments: [] });
      const srt = generator.generateSrt(session);
      expect(srt).to.equal('');
    });

    it('should wrap long narration text', () => {
      const longText = 'This is a very long narration text that should be wrapped across multiple lines for caption readability in the SRT output.';
      const session = createMockSession({
        segments: [
          createMockSegment({
            startTimeMs: 0,
            endTimeMs: 10000,
            draftNarration: longText,
          }),
        ],
      });

      const srt = generator.generateSrt(session);
      const lines = srt.split('\n');
      // The text should be broken into multiple lines (not one giant line)
      const textLines = lines.filter(l => l.length > 0 && !l.match(/^\d+$/) && !l.includes('-->'));
      expect(textLines.length).to.be.greaterThan(1);
    });

    it('should use cueText as fallback when draftNarration is empty', () => {
      const session = createMockSession({
        segments: [
          createMockSegment({
            startTimeMs: 0,
            endTimeMs: 3000,
            draftNarration: '',
            cueText: 'Cue text fallback',
          }),
        ],
      });

      const srt = generator.generateSrt(session);
      expect(srt).to.include('Cue text fallback');
    });
  });
});
