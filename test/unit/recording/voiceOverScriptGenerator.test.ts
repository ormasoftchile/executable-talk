/**
 * Unit tests for VoiceOverScriptGenerator
 * Covers: Markdown generation, JSON generation, timestamp formatting,
 * slide headers, cue text, event summaries, edge cases.
 */

import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { RecordingSession } from '../../../packages/core/src/models/recording';
import { VoiceOverScriptGenerator } from '../../../packages/extension/src/recording/voiceOverScriptGenerator';
import { CaptionsScaffoldGenerator } from '../../../packages/extension/src/recording/captionsScaffoldGenerator';
import { createMockSession, createMockSegment, createMockEvent } from './helpers';

describe('VoiceOverScriptGenerator', () => {
  let generator: VoiceOverScriptGenerator;

  beforeEach(() => {
    generator = new VoiceOverScriptGenerator();
  });

  describe('exportNarrationScripts()', () => {
    let outputDirectory: string;

    beforeEach(async () => {
      outputDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'deckpilot-measured-script-'));
    });

    afterEach(async () => {
      await fs.promises.rm(outputDirectory, { recursive: true, force: true });
    });

    it('exports measured cues once in Markdown and JSON without mutating the session', async () => {
      const session = createMockSession({
        events: [
          createMockEvent({ type: 'fragment.revealed', relativeTimeMs: 999, slideIndex: 1, fragmentIndex: 1 }),
          createMockEvent({ type: 'narration.cue.started', relativeTimeMs: 1000, slideIndex: 1, metadata: { cueIndex: 1 } }),
          createMockEvent({ type: 'narration.cue.started', relativeTimeMs: 3400, slideIndex: 1, metadata: { cueIndex: 2 } }),
        ],
        segments: [
          createMockSegment({ slideIndex: 1, slideTitle: 'Demo', fragmentIndex: 1,
            cueText: 'Wrong inferred fragment.', draftNarration: 'Wrong inferred fragment.' }),
          createMockSegment({ slideIndex: 1, cueText: 'First recorded cue.', draftNarration: 'First recorded cue.' }),
          createMockSegment({ slideIndex: 1, fragmentIndex: 2, cueText: 'Second recorded cue.', draftNarration: 'Second recorded cue.' }),
        ],
      });
      const timings = [
        { cueIndex: 1, text: 'First recorded cue.', durationMs: 2000 },
        { cueIndex: 2, text: 'Second recorded cue.', durationMs: 3000 },
      ];
      const original = JSON.stringify(session);
      const captions = new CaptionsScaffoldGenerator();

      const files = await generator.exportNarrationScripts(session, outputDirectory, timings);
      const markdown = await fs.promises.readFile(files[0], 'utf8');
      const script = JSON.parse(await fs.promises.readFile(files[1], 'utf8')) as RecordingSession;

      expect(markdown.match(/^### Cue /gm)).to.have.length(2);
      expect(markdown.match(/^\*\*Cue:\*\*/gm)).to.have.length(2);
      expect(markdown).to.include('Slide 2: Demo');
      expect(markdown).to.include('00:01.000').and.include('00:03.000');
      expect(markdown).to.include('00:03.400').and.include('00:06.400');
      expect(markdown).not.to.include('### Fragment').and.not.to.include('Wrong inferred fragment');
      expect(script.segments.map(segment =>
        [segment.startTimeMs, segment.endTimeMs, segment.durationMs, segment.cueText]))
        .to.deep.equal([[1000, 3000, 2000, timings[0].text], [3400, 6400, 3000, timings[1].text]]);
      expect(new Set(script.segments.map((segment: { segmentId: string }) => segment.segmentId)).size).to.equal(2);
      expect(captions.generateSrt(script)).to.equal(captions.generateNarrationSrt(session, timings));
      expect(script.events).to.deep.equal(session.events);
      expect(JSON.stringify(session)).to.equal(original);
    });

    it('keeps distinct cue starts even when their narration text is identical', async () => {
      const session = createMockSession({
        events: [
          createMockEvent({ type: 'narration.cue.started', relativeTimeMs: 0, metadata: { cueIndex: 1 } }),
          createMockEvent({ type: 'narration.cue.started', relativeTimeMs: 2000, metadata: { cueIndex: 2 } }),
        ],
      });
      const files = await generator.exportNarrationScripts(session, outputDirectory, [
        { cueIndex: 1, text: 'Repeated words.', durationMs: 1000 },
        { cueIndex: 2, text: 'Repeated words.', durationMs: 1000 },
      ]);
      const script = JSON.parse(await fs.promises.readFile(files[1], 'utf8')) as RecordingSession;
      expect(script.segments).to.have.length(2);
    });

    it('rejects an unscheduled cue before writing scripts', async () => {
      let error: unknown;
      try {
        await generator.exportNarrationScripts(createMockSession(), outputDirectory, [
          { cueIndex: 1, text: 'Missing cue.', durationMs: 1000 },
        ]);
      } catch (caught) {
        error = caught;
      }
      expect(error).to.be.instanceOf(Error);
      expect((error as Error).message).to.include('cue 1');
      expect(await fs.promises.readdir(outputDirectory)).to.deep.equal([]);
    });
  });

  describe('generateMarkdown()', () => {
    it('should generate markdown with deck title', () => {
      const session = createMockSession({
        deckTitle: 'My Awesome Talk',
        segments: [createMockSegment({ slideIndex: 0, slideTitle: 'Intro' })],
      });

      const md = generator.generateMarkdown(session);
      expect(md).to.include('My Awesome Talk');
    });

    it('should include slide headers with timestamps', () => {
      const session = createMockSession({
        segments: [
          createMockSegment({
            slideIndex: 0,
            slideTitle: 'Intro',
            startTimeMs: 0,
            endTimeMs: 5000,
            durationMs: 5000,
          }),
          createMockSegment({
            segmentId: 'seg-2',
            slideIndex: 1,
            slideTitle: 'Demo',
            startTimeMs: 5000,
            endTimeMs: 15000,
            durationMs: 10000,
          }),
        ],
      });

      const md = generator.generateMarkdown(session);
      expect(md).to.include('Intro');
      expect(md).to.include('Demo');
      // Should contain some timestamp format
      expect(md).to.match(/\d+:\d+/);
    });

    it('should include cue text in markdown', () => {
      const session = createMockSession({
        segments: [
          createMockSegment({
            slideIndex: 0,
            cueText: 'Welcome everyone to this presentation',
          }),
        ],
      });

      const md = generator.generateMarkdown(session);
      expect(md).to.include('Welcome everyone to this presentation');
    });

    it('should include event summaries', () => {
      const session = createMockSession({
        segments: [
          createMockSegment({
            slideIndex: 0,
            eventSummary: 'Opened file src/index.ts, highlighted lines 10-20',
          }),
        ],
      });

      const md = generator.generateMarkdown(session);
      expect(md).to.include('Opened file src/index.ts');
    });

    it('should handle session with no segments gracefully', () => {
      const session = createMockSession({ segments: [] });

      const md = generator.generateMarkdown(session);
      expect(md).to.be.a('string');
      // Should still include the title or at least not throw
      if (session.deckTitle) {
        expect(md).to.include(session.deckTitle);
      }
    });

    it('should format timestamps as mm:ss.mmm', () => {
      const session = createMockSession({
        segments: [
          createMockSegment({
            slideIndex: 0,
            startTimeMs: 65500, // 1:05.500
            endTimeMs: 125750,
            durationMs: 60250,
          }),
        ],
      });

      const md = generator.generateMarkdown(session);
      expect(md).to.include('01:05.500');
      expect(md).to.include('02:05.750');
    });

    it('should omit empty setup segments and distinguish cues from fragments', () => {
      const session = createMockSession({
        segments: [
          createMockSegment({
            segmentId: 'cue-1',
            slideIndex: 1,
            startTimeMs: 5,
            endTimeMs: 3264,
            durationMs: 3259,
            cueText: 'Opening cue',
            draftNarration: 'Opening cue',
            eventSummary: '',
          }),
          createMockSegment({
            segmentId: 'setup',
            slideIndex: 1,
            startTimeMs: 3280,
            endTimeMs: 3326,
            durationMs: 46,
            cueText: undefined,
            draftNarration: '',
            eventSummary: '',
          }),
          createMockSegment({
            segmentId: 'cue-2',
            slideIndex: 1,
            startTimeMs: 3326,
            endTimeMs: 4181,
            durationMs: 855,
            cueText: 'Video cue',
            draftNarration: 'Video cue',
            eventSummary: '',
          }),
        ],
      });

      const md = generator.generateMarkdown(session);

      expect(md).to.include('00:00.005');
      expect(md).to.include('00:03.264');
      expect(md).to.include('00:03.326');
      expect(md).to.not.include('00:03.280');
      expect(md).to.include('### Cue 1');
      expect(md).to.include('### Cue 2');
      expect(md).to.not.include('### Fragment');
    });
  });

  describe('generateJson()', () => {
    it('should generate valid JSON', () => {
      const session = createMockSession({
        segments: [createMockSegment()],
      });

      const json = generator.generateJson(session);
      expect(() => JSON.parse(json)).to.not.throw();
    });

    it('should contain segments in JSON output', () => {
      const session = createMockSession({
        segments: [
          createMockSegment({ slideIndex: 0, cueText: 'First cue' }),
          createMockSegment({
            segmentId: 'seg-2',
            slideIndex: 1,
            cueText: 'Second cue',
          }),
        ],
      });

      const json = generator.generateJson(session);
      const parsed = JSON.parse(json);

      // JSON should contain segment data
      const jsonStr = JSON.stringify(parsed);
      expect(jsonStr).to.include('First cue');
      expect(jsonStr).to.include('Second cue');
    });

    it('should handle session with no segments in JSON', () => {
      const session = createMockSession({ segments: [] });
      const json = generator.generateJson(session);

      expect(() => JSON.parse(json)).to.not.throw();
    });

    it('should include deck metadata in JSON', () => {
      const session = createMockSession({
        deckTitle: 'JSON Talk',
        deckPath: '/talk.deck.md',
        durationMs: 30000,
      });

      const json = generator.generateJson(session);
      const parsed = JSON.parse(json);
      const jsonStr = JSON.stringify(parsed);

      expect(jsonStr).to.include('JSON Talk');
      expect(jsonStr).to.include('/talk.deck.md');
    });
  });
});
