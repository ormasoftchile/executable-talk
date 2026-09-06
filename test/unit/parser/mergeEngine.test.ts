/**
 * Unit tests for mergeEngine — DA-05: sidecar merge engine.
 *
 * Covers:
 * - mergeSidecarIntoSlides: no-op paths, field precedence, partial matches, id-less slides
 * - mergeSidecarDeckMetadata: no-op paths, field precedence, title + theme merging
 */

import { expect } from 'chai';
import { mergeSidecarIntoSlides, mergeSidecarDeckMetadata } from '../../../packages/core/src/parser/mergeEngine';
import type { Slide } from '../../../packages/core/src/models/slide';
import type { DeckMetadata } from '../../../packages/core/src/models/deck';
import type { SidecarFile } from '../../../packages/core/src/models/sidecar';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSlide(overrides: Partial<Slide> & { index: number }): Slide {
  return {
    content: '',
    html: '',
    onEnterActions: [],
    interactiveElements: [],
    renderDirectives: [],
    fragmentCount: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// mergeSidecarIntoSlides
// ---------------------------------------------------------------------------

describe('mergeSidecarIntoSlides', () => {
  describe('no-op paths', () => {
    it('returns the same array when sidecar has no slides array', () => {
      const slides = [makeSlide({ index: 0, id: 'intro' })];
      const sidecar: SidecarFile = {};
      const result = mergeSidecarIntoSlides(slides, sidecar);
      expect(result).to.equal(slides);
    });

    it('returns the same array when sidecar slides is empty', () => {
      const slides = [makeSlide({ index: 0, id: 'intro' })];
      const sidecar: SidecarFile = { slides: [] };
      const result = mergeSidecarIntoSlides(slides, sidecar);
      expect(result).to.equal(slides);
    });

    it('passes through a slide with no id unchanged', () => {
      const slide = makeSlide({ index: 0 }); // no id
      const sidecar: SidecarFile = {
        slides: [{ id: 'intro', cues: ['hello'] }],
      };
      const result = mergeSidecarIntoSlides([slide], sidecar);
      expect(result[0]).to.equal(slide);
    });

    it('passes through a slide whose id has no matching sidecar entry', () => {
      const slide = makeSlide({ index: 0, id: 'other' });
      const sidecar: SidecarFile = {
        slides: [{ id: 'intro', cues: ['hello'] }],
      };
      const result = mergeSidecarIntoSlides([slide], sidecar);
      expect(result[0]).to.equal(slide);
    });

    it('silently skips sidecar entries with no matching slide', () => {
      const slides = [makeSlide({ index: 0, id: 'slide-0' })];
      const sidecar: SidecarFile = {
        slides: [
          { id: 'slide-0', cues: ['cue'] },
          { id: 'ghost', cues: ['ignored'] },
        ],
      };
      const result = mergeSidecarIntoSlides(slides, sidecar);
      expect(result).to.have.lengthOf(1);
      expect(result[0].id).to.equal('slide-0');
    });
  });

  describe('cues merging', () => {
    it('applies sidecar cues when slide has none', () => {
      const slide = makeSlide({ index: 0, id: 'intro' });
      const sidecar: SidecarFile = {
        slides: [{ id: 'intro', cues: ['Welcome', 'Today we cover…'] }],
      };
      const result = mergeSidecarIntoSlides([slide], sidecar);
      expect(result[0].cues).to.deep.equal(['Welcome', 'Today we cover…']);
    });

    it('does not overwrite existing slide cues with sidecar cues', () => {
      const slide = makeSlide({ index: 0, id: 'intro', cues: ['inline cue'] });
      const sidecar: SidecarFile = {
        slides: [{ id: 'intro', cues: ['sidecar cue'] }],
      };
      const result = mergeSidecarIntoSlides([slide], sidecar);
      expect(result[0].cues).to.deep.equal(['inline cue']);
    });

    it('leaves cues undefined when sidecar entry has no cues', () => {
      const slide = makeSlide({ index: 0, id: 'intro' });
      const sidecar: SidecarFile = { slides: [{ id: 'intro' }] };
      const result = mergeSidecarIntoSlides([slide], sidecar);
      expect(result[0].cues).to.be.undefined;
    });
  });

  describe('duration merging', () => {
    it('applies sidecar duration when slide has none', () => {
      const slide = makeSlide({ index: 0, id: 'intro' });
      const sidecar: SidecarFile = {
        slides: [{ id: 'intro', duration: '2m30s' }],
      };
      const result = mergeSidecarIntoSlides([slide], sidecar);
      expect(result[0].duration).to.equal('2m30s');
    });

    it('does not overwrite existing slide duration', () => {
      const slide = makeSlide({ index: 0, id: 'intro', duration: '1m' });
      const sidecar: SidecarFile = {
        slides: [{ id: 'intro', duration: '5m' }],
      };
      const result = mergeSidecarIntoSlides([slide], sidecar);
      expect(result[0].duration).to.equal('1m');
    });
  });

  describe('checkpoint merging', () => {
    it('applies sidecar checkpoint when slide has none', () => {
      const slide = makeSlide({ index: 0, id: 'step-1' });
      const sidecar: SidecarFile = {
        slides: [{ id: 'step-1', checkpoint: 'install-complete' }],
      };
      const result = mergeSidecarIntoSlides([slide], sidecar);
      expect(result[0].checkpoint).to.equal('install-complete');
    });

    it('does not overwrite existing inline checkpoint', () => {
      const slide = makeSlide({ index: 0, id: 'step-1', checkpoint: 'inline-cp' });
      const sidecar: SidecarFile = {
        slides: [{ id: 'step-1', checkpoint: 'sidecar-cp' }],
      };
      const result = mergeSidecarIntoSlides([slide], sidecar);
      expect(result[0].checkpoint).to.equal('inline-cp');
    });
  });

  describe('sidecarActions merging', () => {
    it('stores sidecar actions on slide', () => {
      const slide = makeSlide({ index: 0, id: 'demo' });
      const sidecar: SidecarFile = {
        slides: [
          {
            id: 'demo',
            actions: [
              { type: 'terminal.run', cmd: 'npm test' },
              { type: 'file.open', file: 'src/index.ts' },
            ],
          },
        ],
      };
      const result = mergeSidecarIntoSlides([slide], sidecar);
      expect(result[0].sidecarActions).to.deep.equal([
        { type: 'terminal.run', cmd: 'npm test' },
        { type: 'file.open', file: 'src/index.ts' },
      ]);
    });

    it('leaves sidecarActions undefined when sidecar entry has no actions', () => {
      const slide = makeSlide({ index: 0, id: 'demo' });
      const sidecar: SidecarFile = { slides: [{ id: 'demo' }] };
      const result = mergeSidecarIntoSlides([slide], sidecar);
      expect(result[0].sidecarActions).to.be.undefined;
    });

    it('populates interactiveElements from sidecar actions (DA-07)', () => {
      const slide = makeSlide({ index: 2, id: 'demo' });
      const sidecar: SidecarFile = {
        slides: [
          {
            id: 'demo',
            actions: [
              { type: 'terminal.run', cmd: 'npm install' },
              { type: 'file.open', file: 'src/app.ts' },
            ],
          },
        ],
      };
      const result = mergeSidecarIntoSlides([slide], sidecar);
      const elements = result[0].interactiveElements;
      expect(elements).to.have.lengthOf(2);
      expect(elements[0].action.type).to.equal('terminal.run');
      expect(elements[0].action.params).to.have.property('command', 'npm install');
      expect(elements[0].source).to.equal('sidecar');
      expect(elements[1].action.type).to.equal('file.open');
      expect(elements[1].action.params).to.have.property('path', 'src/app.ts');
    });

    it('appends sidecar actions to existing interactiveElements', () => {
      const existingAction = {
        id: 'existing',
        type: 'file.open' as const,
        params: { path: 'inline.ts' },
        status: 'pending' as const,
        slideIndex: 0,
      };
      const existingElement = {
        id: 'el-1',
        label: 'Open inline.ts',
        action: existingAction,
        position: { line: 1, column: 0 },
        rawLink: '[Open inline.ts](action:file.open?path=inline.ts)',
        source: 'inline' as const,
      };
      const slide = makeSlide({ index: 0, id: 'demo', interactiveElements: [existingElement] });
      const sidecar: SidecarFile = {
        slides: [{ id: 'demo', actions: [{ type: 'terminal.run', cmd: 'npm test' }] }],
      };
      const result = mergeSidecarIntoSlides([slide], sidecar);
      expect(result[0].interactiveElements).to.have.lengthOf(2);
      expect(result[0].interactiveElements[0].id).to.equal('el-1');
      expect(result[0].interactiveElements[1].source).to.equal('sidecar');
    });

    it('assigns the correct slideIndex to sidecar interactive elements', () => {
      const slide = makeSlide({ index: 7, id: 'slide-7' });
      const sidecar: SidecarFile = {
        slides: [{ id: 'slide-7', actions: [{ type: 'terminal.run', cmd: 'ls' }] }],
      };
      const result = mergeSidecarIntoSlides([slide], sidecar);
      expect(result[0].interactiveElements[0].action.slideIndex).to.equal(7);
    });

    it('leaves interactiveElements unchanged when sidecar entry has no actions', () => {
      const slide = makeSlide({ index: 0, id: 'demo' });
      const sidecar: SidecarFile = { slides: [{ id: 'demo' }] };
      const result = mergeSidecarIntoSlides([slide], sidecar);
      expect(result[0].interactiveElements).to.deep.equal([]);
    });
  });

  describe('immutability', () => {
    it('does not mutate the original slide object', () => {
      const slide = makeSlide({ index: 0, id: 'intro' });
      const originalCheckpoint = slide.checkpoint;
      const sidecar: SidecarFile = {
        slides: [{ id: 'intro', checkpoint: 'cp', cues: ['x'], duration: '1m' }],
      };
      mergeSidecarIntoSlides([slide], sidecar);
      expect(slide.checkpoint).to.equal(originalCheckpoint);
      expect(slide.cues).to.be.undefined;
      expect(slide.duration).to.be.undefined;
    });

    it('returns a new array (not the same reference)', () => {
      const slides = [makeSlide({ index: 0, id: 'intro' })];
      const sidecar: SidecarFile = {
        slides: [{ id: 'intro', cues: ['cue'] }],
      };
      const result = mergeSidecarIntoSlides(slides, sidecar);
      expect(result).to.not.equal(slides);
    });
  });

  describe('multi-slide deck', () => {
    it('merges only matching slides, passes others through', () => {
      const slides = [
        makeSlide({ index: 0, id: 'intro' }),
        makeSlide({ index: 1, id: 'demo' }),
        makeSlide({ index: 2, id: 'outro' }),
      ];
      const sidecar: SidecarFile = {
        slides: [
          { id: 'demo', cues: ['run it'], duration: '3m' },
        ],
      };
      const result = mergeSidecarIntoSlides(slides, sidecar);
      expect(result).to.have.lengthOf(3);
      expect(result[0]).to.equal(slides[0]); // pass-through (no match)
      expect(result[1].cues).to.deep.equal(['run it']);
      expect(result[1].duration).to.equal('3m');
      expect(result[2]).to.equal(slides[2]); // pass-through (no match)
    });

    it('each of multiple sidecar entries matches its own slide independently', () => {
      const slides = [
        makeSlide({ index: 0, id: 'slide-1' }),
        makeSlide({ index: 1, id: 'slide-2' }),
        makeSlide({ index: 2, id: 'slide-3' }),
      ];
      const sidecar: SidecarFile = {
        slides: [
          { id: 'slide-1', cues: ['cue-a'], duration: '1m' },
          { id: 'slide-2', checkpoint: 'mid' },
          { id: 'slide-3', cues: ['cue-z'], duration: '5m', checkpoint: 'end' },
        ],
      };
      const result = mergeSidecarIntoSlides(slides, sidecar);
      expect(result).to.have.lengthOf(3);

      expect(result[0].cues).to.deep.equal(['cue-a']);
      expect(result[0].duration).to.equal('1m');
      expect(result[0].checkpoint).to.be.undefined;

      expect(result[1].cues).to.be.undefined;
      expect(result[1].checkpoint).to.equal('mid');

      expect(result[2].cues).to.deep.equal(['cue-z']);
      expect(result[2].duration).to.equal('5m');
      expect(result[2].checkpoint).to.equal('end');
    });

    it('sidecar entry matching only slide-2 leaves slide-1 and slide-3 untouched', () => {
      const slides = [
        makeSlide({ index: 0, id: 'slide-1', cues: ['original'], duration: '10m', checkpoint: 'cp1' }),
        makeSlide({ index: 1, id: 'slide-2' }),
        makeSlide({ index: 2, id: 'slide-3', cues: ['z'], duration: '2m', checkpoint: 'cp3' }),
      ];
      const sidecar: SidecarFile = {
        slides: [{ id: 'slide-2', cues: ['injected'], duration: '3m', checkpoint: 'mid' }],
      };
      const result = mergeSidecarIntoSlides(slides, sidecar);

      // slide-1 and slide-3 are identical references (untouched)
      expect(result[0]).to.equal(slides[0]);
      expect(result[2]).to.equal(slides[2]);

      // only slide-2 was merged
      expect(result[1].cues).to.deep.equal(['injected']);
      expect(result[1].duration).to.equal('3m');
      expect(result[1].checkpoint).to.equal('mid');
    });
  });
});

// ---------------------------------------------------------------------------
// mergeSidecarDeckMetadata
// ---------------------------------------------------------------------------

describe('mergeSidecarDeckMetadata', () => {
  describe('no-op paths', () => {
    it('returns the same metadata object when sidecar has no deck section', () => {
      const metadata: DeckMetadata = { title: 'My Deck' };
      const sidecar: SidecarFile = {};
      const result = mergeSidecarDeckMetadata(metadata, sidecar);
      expect(result).to.equal(metadata);
    });

    it('returns the same metadata object when sidecar.deck is undefined', () => {
      const metadata: DeckMetadata = {};
      const sidecar: SidecarFile = { slides: [] };
      const result = mergeSidecarDeckMetadata(metadata, sidecar);
      expect(result).to.equal(metadata);
    });
  });

  describe('title merging', () => {
    it('applies sidecar title when metadata has none', () => {
      const metadata: DeckMetadata = {};
      const sidecar: SidecarFile = { deck: { title: 'Sidecar Title' } };
      const result = mergeSidecarDeckMetadata(metadata, sidecar);
      expect(result.title).to.equal('Sidecar Title');
    });

    it('does not overwrite existing inline title', () => {
      const metadata: DeckMetadata = { title: 'Inline Title' };
      const sidecar: SidecarFile = { deck: { title: 'Sidecar Title' } };
      const result = mergeSidecarDeckMetadata(metadata, sidecar);
      expect(result.title).to.equal('Inline Title');
    });
  });

  describe('basePath merging', () => {
    it('applies a deck-relative base path from the sidecar', () => {
      const metadata: DeckMetadata = {};
      const sidecar: SidecarFile = { deck: { basePath: '.' } };
      const result = mergeSidecarDeckMetadata(metadata, sidecar);
      expect(result.basePath).to.equal('.');
      expect(metadata.basePath).to.equal(undefined);
    });

    it('preserves an inline base path over the sidecar value', () => {
      const metadata: DeckMetadata = { basePath: '../examples' };
      const sidecar: SidecarFile = { deck: { basePath: '.' } };
      const result = mergeSidecarDeckMetadata(metadata, sidecar);
      expect(result.basePath).to.equal('../examples');
    });
  });

  describe('theme merging', () => {
    it('applies sidecar theme when metadata has none', () => {
      const metadata: DeckMetadata = {};
      const sidecar: SidecarFile = { deck: { theme: 'dark' } };
      const result = mergeSidecarDeckMetadata(metadata, sidecar);
      expect(result.theme).to.equal('dark');
    });

    it('does not overwrite existing inline theme', () => {
      const metadata: DeckMetadata = { theme: 'light' };
      const sidecar: SidecarFile = { deck: { theme: 'dark' } };
      const result = mergeSidecarDeckMetadata(metadata, sidecar);
      expect(result.theme).to.equal('light');
    });

    it('handles arbitrary theme strings from sidecar', () => {
      const metadata: DeckMetadata = {};
      const sidecar: SidecarFile = { deck: { theme: 'corporate-blue' } };
      const result = mergeSidecarDeckMetadata(metadata, sidecar);
      expect(result.theme).to.equal('corporate-blue');
    });
  });

  describe('diagrams theme merging', () => {
    it('applies sidecar diagrams theme when metadata has none', () => {
      const metadata: DeckMetadata = {};
      const sidecar: SidecarFile = { deck: { diagrams: { theme: 'executive' } } };
      const result = mergeSidecarDeckMetadata(metadata, sidecar);
      expect(result.diagrams?.theme).to.equal('executive');
    });

    it('lets inline diagrams theme win over sidecar', () => {
      const metadata: DeckMetadata = { diagrams: { theme: 'consulting' } };
      const sidecar: SidecarFile = { deck: { diagrams: { theme: 'executive' } } };
      const result = mergeSidecarDeckMetadata(metadata, sidecar);
      expect(result.diagrams?.theme).to.equal('consulting');
    });
  });

  describe('combined merging', () => {
    it('applies both title and theme from sidecar when neither is set inline', () => {
      const metadata: DeckMetadata = {};
      const sidecar: SidecarFile = { deck: { title: 'My Talk', theme: 'dark' } };
      const result = mergeSidecarDeckMetadata(metadata, sidecar);
      expect(result.title).to.equal('My Talk');
      expect(result.theme).to.equal('dark');
    });

    it('applies sidecar listFragmentMode when metadata has none', () => {
      const metadata: DeckMetadata = {};
      const sidecar: SidecarFile = { deck: { listFragmentMode: 'each' } };
      const result = mergeSidecarDeckMetadata(metadata, sidecar);
      expect(result.listFragmentMode).to.equal('each');
    });

    it('preserves other metadata fields unchanged', () => {
      const metadata: DeckMetadata = { author: 'Alice', basePath: '/talks' };
      const sidecar: SidecarFile = { deck: { title: 'New Title', theme: 'light' } };
      const result = mergeSidecarDeckMetadata(metadata, sidecar);
      expect(result.author).to.equal('Alice');
      expect(result.basePath).to.equal('/talks');
    });
  });

  describe('recording merging', () => {
    it('applies full sidecar recording when metadata has none', () => {
      const metadata: DeckMetadata = {};
      const sidecar: SidecarFile = {
        recording: { autoStart: true, outputDir: './out', format: 'mp4', codec: 'h264', framerate: 30, windowScope: 'focused' },
      };
      const result = mergeSidecarDeckMetadata(metadata, sidecar);
      expect(result.recording).to.deep.equal({ autoStart: true, outputDir: './out', format: 'mp4', codec: 'h264', framerate: 30, windowScope: 'focused' });
    });

    it('does not apply sidecar recording when sidecar has no recording section', () => {
      const metadata: DeckMetadata = {};
      const sidecar: SidecarFile = { deck: { title: 'T' } };
      const result = mergeSidecarDeckMetadata(metadata, sidecar);
      expect(result.recording).to.be.undefined;
    });

    it('inline recording wins over sidecar recording for each field', () => {
      const metadata: DeckMetadata = { recording: { outputDir: './inline', framerate: 60 } };
      const sidecar: SidecarFile = {
        recording: { autoStart: true, outputDir: './sidecar', format: 'webm', framerate: 30 },
      };
      const result = mergeSidecarDeckMetadata(metadata, sidecar);
      expect(result.recording!.outputDir).to.equal('./inline');
      expect(result.recording!.framerate).to.equal(60);
      // sidecar-only fields survive
      expect(result.recording!.autoStart).to.equal(true);
      expect(result.recording!.format).to.equal('webm');
    });

    it('sidecar recording field fills in when inline recording omits it', () => {
      const metadata: DeckMetadata = { recording: { outputDir: './out' } };
      const sidecar: SidecarFile = {
        recording: { autoStart: false, outputDir: './sidecar', windowScope: 'screen' },
      };
      const result = mergeSidecarDeckMetadata(metadata, sidecar);
      expect(result.recording!.outputDir).to.equal('./out');
      expect(result.recording!.autoStart).to.equal(false);
      expect(result.recording!.windowScope).to.equal('screen');
    });

    it('does not mutate the original recording object', () => {
      const originalRec = { outputDir: './orig' };
      const metadata: DeckMetadata = { recording: originalRec };
      const sidecar: SidecarFile = { recording: { autoStart: true, outputDir: './sidecar' } };
      mergeSidecarDeckMetadata(metadata, sidecar);
      expect(originalRec.outputDir).to.equal('./orig');
      expect((originalRec as DeckMetadata['recording'])!.autoStart).to.be.undefined;
    });
  });

  describe('export merging', () => {
    it('applies full sidecar export when metadata has none', () => {
      const metadata: DeckMetadata = {};
      const sidecar: SidecarFile = {
        export: { subtitles: true, video: true, outputDir: './exports', srtFormat: 'vtt', voiceScript: true },
      };
      const result = mergeSidecarDeckMetadata(metadata, sidecar);
      expect(result.export).to.deep.equal({ subtitles: true, video: true, outputDir: './exports', srtFormat: 'vtt', voiceScript: true });
    });

    it('does not apply sidecar export when sidecar has no export section', () => {
      const metadata: DeckMetadata = {};
      const sidecar: SidecarFile = { recording: { autoStart: true } };
      const result = mergeSidecarDeckMetadata(metadata, sidecar);
      expect(result.export).to.be.undefined;
    });

    it('inline export wins over sidecar export for each field', () => {
      const metadata: DeckMetadata = { export: { outputDir: './inline-exports', srtFormat: 'srt' } };
      const sidecar: SidecarFile = {
        export: { subtitles: false, video: true, outputDir: './sidecar-exports', srtFormat: 'vtt' },
      };
      const result = mergeSidecarDeckMetadata(metadata, sidecar);
      expect(result.export!.outputDir).to.equal('./inline-exports');
      expect(result.export!.srtFormat).to.equal('srt');
      // sidecar-only fields survive
      expect(result.export!.subtitles).to.equal(false);
      expect(result.export!.video).to.equal(true);
    });

    it('sidecar export field fills in when inline export omits it', () => {
      const metadata: DeckMetadata = { export: { subtitles: true } };
      const sidecar: SidecarFile = {
        export: { subtitles: false, voiceScript: true, outputDir: './out' },
      };
      const result = mergeSidecarDeckMetadata(metadata, sidecar);
      expect(result.export!.subtitles).to.equal(true);
      expect(result.export!.voiceScript).to.equal(true);
      expect(result.export!.outputDir).to.equal('./out');
    });

    it('does not mutate the original export object', () => {
      const originalExp = { subtitles: true };
      const metadata: DeckMetadata = { export: originalExp };
      const sidecar: SidecarFile = { export: { video: true, subtitles: false } };
      mergeSidecarDeckMetadata(metadata, sidecar);
      expect(originalExp.subtitles).to.equal(true);
      expect((originalExp as DeckMetadata['export'])!.video).to.be.undefined;
    });
  });

  describe('combined recording + export + deck merging', () => {
    it('merges all three sections from sidecar in one pass', () => {
      const metadata: DeckMetadata = {};
      const sidecar: SidecarFile = {
        deck: { title: 'Full Deck' },
        recording: { autoStart: true, format: 'mp4' },
        export: { subtitles: true, srtFormat: 'vtt' },
      };
      const result = mergeSidecarDeckMetadata(metadata, sidecar);
      expect(result.title).to.equal('Full Deck');
      expect(result.recording!.autoStart).to.equal(true);
      expect(result.export!.subtitles).to.equal(true);
    });

    it('applies recording and export from sidecar when no deck section is present', () => {
      const metadata: DeckMetadata = {};
      const sidecar: SidecarFile = {
        recording: { format: 'webm', framerate: 24 },
        export: { video: true },
      };
      const result = mergeSidecarDeckMetadata(metadata, sidecar);
      expect(result.title).to.be.undefined;
      expect(result.theme).to.be.undefined;
      expect(result.recording!.format).to.equal('webm');
      expect(result.export!.video).to.equal(true);
    });

    it('returns same metadata reference when sidecar has only environment (no deck/recording/export)', () => {
      const metadata: DeckMetadata = { title: 'Existing' };
      const sidecar: SidecarFile = {
        environment: { common: { FOO: 'bar' } },
      };
      const result = mergeSidecarDeckMetadata(metadata, sidecar);
      expect(result).to.equal(metadata);
    });
  });

  describe('immutability', () => {
    it('does not mutate the original metadata object', () => {
      const metadata: DeckMetadata = {};
      const sidecar: SidecarFile = { deck: { title: 'New', theme: 'dark' } };
      mergeSidecarDeckMetadata(metadata, sidecar);
      expect(metadata.title).to.be.undefined;
      expect(metadata.theme).to.be.undefined;
    });

    it('returns a new object (not the same reference)', () => {
      const metadata: DeckMetadata = {};
      const sidecar: SidecarFile = { deck: { title: 'New' } };
      const result = mergeSidecarDeckMetadata(metadata, sidecar);
      expect(result).to.not.equal(metadata);
    });
  });

  describe('recording edge cases', () => {
    it('preserves framerate: 0 from sidecar (falsy number is a valid value)', () => {
      const metadata: DeckMetadata = {};
      const sidecar: SidecarFile = { recording: { framerate: 0 } };
      const result = mergeSidecarDeckMetadata(metadata, sidecar);
      expect(result.recording!.framerate).to.equal(0);
    });

    it('inline recording with all fields wins completely over sidecar recording', () => {
      const metadata: DeckMetadata = {
        recording: {
          autoStart: false,
          outputDir: './inline',
          format: 'avi',
          codec: 'vp9',
          framerate: 15,
          windowScope: 'screen',
        },
      };
      const sidecar: SidecarFile = {
        recording: {
          autoStart: true,
          outputDir: './sidecar',
          format: 'mp4',
          codec: 'h264',
          framerate: 60,
          windowScope: 'focused',
        },
      };
      const result = mergeSidecarDeckMetadata(metadata, sidecar);
      expect(result.recording!.autoStart).to.equal(false);
      expect(result.recording!.outputDir).to.equal('./inline');
      expect(result.recording!.format).to.equal('avi');
      expect(result.recording!.codec).to.equal('vp9');
      expect(result.recording!.framerate).to.equal(15);
      expect(result.recording!.windowScope).to.equal('screen');
    });

    it('inline export with all fields wins completely over sidecar export', () => {
      const metadata: DeckMetadata = {
        export: {
          subtitles: false,
          video: false,
          outputDir: './inline-out',
          srtFormat: 'srt',
          voiceScript: false,
        },
      };
      const sidecar: SidecarFile = {
        export: {
          subtitles: true,
          video: true,
          outputDir: './sidecar-out',
          srtFormat: 'vtt',
          voiceScript: true,
        },
      };
      const result = mergeSidecarDeckMetadata(metadata, sidecar);
      expect(result.export!.subtitles).to.equal(false);
      expect(result.export!.video).to.equal(false);
      expect(result.export!.outputDir).to.equal('./inline-out');
      expect(result.export!.srtFormat).to.equal('srt');
      expect(result.export!.voiceScript).to.equal(false);
    });
  });

  describe('autoFragment: false suppression', () => {
    it('strips all fragment attributes from HTML when autoFragment: false', () => {
      const slide = makeSlide({
        index: 0,
        id: 'no-fragments',
        html: '<h1>Title</h1>\n<p class="fragment" data-fragment="1" data-fragment-animation="fade">First point</p>\n<p class="fragment" data-fragment="2" data-fragment-animation="fade">Second point</p>',
        fragmentCount: 2,
      });
      const sidecar: SidecarFile = {
        slides: [{ id: 'no-fragments', autoFragment: false }],
      };
      const result = mergeSidecarIntoSlides([slide], sidecar);
      expect(result[0].fragmentCount).to.equal(0);
      expect(result[0].html).to.not.contain('class="fragment"');
      expect(result[0].html).to.not.contain('data-fragment');
      expect(result[0].html).to.not.contain('data-fragment-animation');
      // Content should still be present
      expect(result[0].html).to.contain('First point');
      expect(result[0].html).to.contain('Second point');
    });

    it('preserves fragment attributes when autoFragment: true (explicit)', () => {
      const slide = makeSlide({
        index: 0,
        id: 'with-fragments',
        html: '<p class="fragment" data-fragment="1" data-fragment-animation="fade">Point 1</p>\n<p class="fragment" data-fragment="2" data-fragment-animation="fade">Point 2</p>',
        fragmentCount: 2,
      });
      const sidecar: SidecarFile = {
        slides: [{ id: 'with-fragments', autoFragment: true }],
      };
      const result = mergeSidecarIntoSlides([slide], sidecar);
      expect(result[0].fragmentCount).to.equal(2);
      expect(result[0].html).to.contain('class="fragment"');
      expect(result[0].html).to.contain('data-fragment="1"');
      expect(result[0].html).to.contain('data-fragment="2"');
      expect(result[0].html).to.contain('data-fragment-animation="fade"');
    });

    it('preserves fragment attributes when autoFragment is absent (default behavior)', () => {
      const slide = makeSlide({
        index: 0,
        id: 'default',
        html: '<p class="fragment" data-fragment="1" data-fragment-animation="fade">Point 1</p>',
        fragmentCount: 1,
      });
      const sidecar: SidecarFile = {
        slides: [{ id: 'default', cues: ['Some cue'] }],
      };
      const result = mergeSidecarIntoSlides([slide], sidecar);
      expect(result[0].fragmentCount).to.equal(1);
      expect(result[0].html).to.contain('class="fragment"');
      expect(result[0].html).to.contain('data-fragment="1"');
    });

    it('only strips fragments from the targeted slide in a multi-slide deck', () => {
      const slides = [
        makeSlide({
          index: 0,
          id: 'slide-a',
          html: '<p class="fragment" data-fragment="1">Slide A fragment</p>',
          fragmentCount: 1,
        }),
        makeSlide({
          index: 1,
          id: 'slide-b',
          html: '<p class="fragment" data-fragment="1">Slide B fragment</p>',
          fragmentCount: 1,
        }),
      ];
      const sidecar: SidecarFile = {
        slides: [
          { id: 'slide-a', autoFragment: false },
        ],
      };
      const result = mergeSidecarIntoSlides(slides, sidecar);

      // slide-a: fragments stripped
      expect(result[0].fragmentCount).to.equal(0);
      expect(result[0].html).to.not.contain('class="fragment"');
      expect(result[0].html).to.not.contain('data-fragment');
      expect(result[0].html).to.contain('Slide A fragment');

      // slide-b: fragments preserved
      expect(result[1].fragmentCount).to.equal(1);
      expect(result[1].html).to.contain('class="fragment"');
      expect(result[1].html).to.contain('data-fragment="1"');
      expect(result[1].html).to.contain('Slide B fragment');
    });

    it('handles mixed class attributes correctly — preserves non-fragment classes', () => {
      const slide = makeSlide({
        index: 0,
        id: 'mixed',
        html: '<p class="highlight fragment" data-fragment="1" data-fragment-animation="fade">First</p>\n<p class="fragment highlight" data-fragment="2">Second</p>\n<p class="fragment" data-fragment="3">Third</p>',
        fragmentCount: 3,
      });
      const sidecar: SidecarFile = {
        slides: [{ id: 'mixed', autoFragment: false }],
      };
      const result = mergeSidecarIntoSlides([slide], sidecar);
      expect(result[0].fragmentCount).to.equal(0);
      expect(result[0].html).to.not.contain('fragment');
      expect(result[0].html).to.not.contain('data-fragment');
      // Non-fragment classes should be preserved
      expect(result[0].html).to.contain('class="highlight"');
    });

    it('strips fragments from slide-group elements', () => {
      const slide = makeSlide({
        index: 0,
        id: 'group',
        html: '<div class="slide-group fragment" data-fragment="1" data-fragment-animation="fade"><ul><li>Item A</li><li>Item B</li></ul></div>',
        fragmentCount: 1,
      });
      const sidecar: SidecarFile = {
        slides: [{ id: 'group', autoFragment: false }],
      };
      const result = mergeSidecarIntoSlides([slide], sidecar);
      expect(result[0].fragmentCount).to.equal(0);
      expect(result[0].html).to.not.contain('fragment');
      expect(result[0].html).to.not.contain('data-fragment');
      // Preserve slide-group class
      expect(result[0].html).to.contain('class="slide-group"');
      expect(result[0].html).to.contain('Item A');
    });

    it('handles empty class attribute cleanup — no empty class="" left behind', () => {
      const slide = makeSlide({
        index: 0,
        id: 'empty-class',
        html: '<p class="fragment" data-fragment="1">Only fragment class</p>',
        fragmentCount: 1,
      });
      const sidecar: SidecarFile = {
        slides: [{ id: 'empty-class', autoFragment: false }],
      };
      const result = mergeSidecarIntoSlides([slide], sidecar);
      expect(result[0].fragmentCount).to.equal(0);
      expect(result[0].html).to.not.contain('class="fragment"');
      expect(result[0].html).to.not.contain('data-fragment');
      // Should not have empty class="" or dangling class attribute
      expect(result[0].html).to.not.match(/class="\s*"/);
      expect(result[0].html).to.contain('Only fragment class');
    });

    it('strips fragments from various element types (li, h2-h6, pre, blockquote, details)', () => {
      const slide = makeSlide({
        index: 0,
        id: 'various',
        html: [
          '<h2 class="fragment" data-fragment="1">Section</h2>',
          '<ul><li class="fragment" data-fragment="2">Item</li></ul>',
          '<pre class="fragment" data-fragment="3"><code>code</code></pre>',
          '<blockquote class="fragment" data-fragment="4"><p>Quote</p></blockquote>',
          '<details class="disclosure-advanced fragment" data-fragment="5"><summary>Details</summary><p>Content</p></details>',
        ].join('\n'),
        fragmentCount: 5,
      });
      const sidecar: SidecarFile = {
        slides: [{ id: 'various', autoFragment: false }],
      };
      const result = mergeSidecarIntoSlides([slide], sidecar);
      expect(result[0].fragmentCount).to.equal(0);
      expect(result[0].html).to.not.contain('fragment');
      expect(result[0].html).to.not.contain('data-fragment');
      // Preserve other classes
      expect(result[0].html).to.contain('class="disclosure-advanced"');
      // Content intact
      expect(result[0].html).to.contain('Section');
      expect(result[0].html).to.contain('Item');
      expect(result[0].html).to.contain('code');
      expect(result[0].html).to.contain('Quote');
      expect(result[0].html).to.contain('Details');
    });
  });
});
