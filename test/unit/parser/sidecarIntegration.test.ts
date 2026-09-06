/**
 * Integration tests for the full .deck.md + .deck.yaml round-trip — DA-18.
 *
 * Exercises the complete pipeline:
 *   real files on disk → parseDeck() → fully merged Deck model
 *
 * Pipeline components exercised end-to-end:
 *   DeckParser (parseDeck) → SidecarLoader (loadSidecar) →
 *   MergeEngine (mergeSidecarIntoSlides + mergeSidecarDeckMetadata) →
 *   DeckValidator (validateSidecarSlideIds + validateSidecarSchema)
 */

import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseDeck } from '../../../packages/core/src/parser/deckParser';
import { loadSidecar } from '../../../packages/core/src/parser/sidecarLoader';
import {
  validateSidecarSlideIds,
  validateSidecarSchema,
  SlideDiagnosticSeverity,
} from '../../../packages/core/src/parser/deckValidator';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Three-slide Markdown with explicit <!-- id: --> comments */
const THREE_SLIDE_MD = [
  '<!-- id: intro -->',
  '# Introduction',
  '',
  'Welcome to the demo.',
  '',
  '---',
  '',
  '<!-- id: setup -->',
  '# Setup',
  '',
  'Install dependencies first.',
  '',
  '---',
  '',
  '<!-- id: demo -->',
  '# Live Demo',
  '',
  'Watch the magic happen.',
].join('\n');

/** Full sidecar YAML for the three slides above */
function buildFullSidecar(opts: {
  includeTerminalAction?: boolean;
  includeCheckpoint?: boolean;
} = {}): string {
  const lines: string[] = [
    'deck:',
    '  title: Integration Test Deck',
    '  theme: dark',
    '  slideBreak: blank',
    'slides:',
    '  - id: intro',
    '    cues:',
    '      - Welcome everyone to this session',
    '      - We will cover three sections today',
    '  - id: setup',
    '    cues:',
    '      - Walk through the install steps',
  ];

  if (opts.includeTerminalAction !== false) {
    lines.push(
      '    actions:',
      '      - type: terminal.run',
      '        cmd: npm install',
    );
  }

  lines.push(
    '  - id: demo',
    '    cues:',
    '      - Now the live demo',
  );

  if (opts.includeCheckpoint !== false) {
    lines.push('    checkpoint: demo-reached');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('sidecarIntegration — full .deck.md + .deck.yaml round-trip', () => {
  let tmpDir: string;
  let deckMdPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sidecar-integration-'));
    deckMdPath = path.join(tmpDir, 'demo.deck.md');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeDeckMd(content: string): void {
    fs.writeFileSync(deckMdPath, content, 'utf-8');
  }

  function writeDeckYaml(content: string): void {
    const sidecarPath = deckMdPath.replace(/\.deck\.md$/, '.deck.yaml');
    fs.writeFileSync(sidecarPath, content, 'utf-8');
  }

  describe('sidecar scenes', () => {
    const markdown = '# Introduction\n\nWelcome.\n\n# Live Demo\n\nRun the demo.';
    const sceneYaml = 'scenes:\n  - name: Opening\n    slide: introduction\n  - name: Demo\n    slide: live-demo\n';

    it('resolves title-derived IDs without frontmatter or explicit anchors', async () => {
      writeDeckMd(markdown);
      writeDeckYaml(sceneYaml);

      const result = await parseDeck(markdown, deckMdPath);

      expect(result.error).to.equal(undefined);
      expect(result.warnings).to.equal(undefined);
      expect(result.deck!.metadata.scenes).to.deep.equal([
        { name: 'Opening', slide: 0 }, { name: 'Demo', slide: 1 },
      ]);
    });

    it('keeps ID-based scene targets when slides are reordered', async () => {
      const reordered = '# Live Demo\n\nRun the demo.\n\n# Introduction\n\nWelcome.';
      writeDeckMd(reordered);
      writeDeckYaml(sceneYaml);

      const result = await parseDeck(reordered, deckMdPath);

      expect(result.deck!.metadata.scenes).to.deep.equal([
        { name: 'Opening', slide: 1 }, { name: 'Demo', slide: 0 },
      ]);
    });

    it('accepts explicit IDs and one-based numeric targets', async () => {
      const anchored = '# Introduction\n<!-- id: opening -->\n\nWelcome.\n\n# Live Demo\n\nRun the demo.';
      writeDeckMd(anchored);
      writeDeckYaml('scenes:\n  - name: Opening\n    slide: opening\n  - name: Demo\n    slide: 2\n');

      const result = await parseDeck(anchored, deckMdPath);

      expect(result.warnings).to.equal(undefined);
      expect(result.deck!.metadata.scenes).to.deep.equal([
        { name: 'Opening', slide: 0 }, { name: 'Demo', slide: 1 },
      ]);
    });

    it('preserves inline scene precedence, including an explicitly empty list', async () => {
      writeDeckYaml(sceneYaml);
      for (const [authored, expected] of [
        ['[{name: Inline, slide: 2}]', [{ name: 'Inline', slide: 1 }]],
        ['[]', []],
      ] as const) {
        const inline = `---\nscenes: ${authored}\n---\n${markdown}`;
        writeDeckMd(inline);
        const result = await parseDeck(inline, deckMdPath);
        expect(result.warnings).to.equal(undefined);
        expect(result.deck!.metadata.scenes).to.deep.equal(expected);
      }
    });

    it('warns about missing targets and duplicates without discarding valid scenes', async () => {
      writeDeckMd(markdown);
      writeDeckYaml([
        'scenes:',
        '  - {name: Missing, slide: missing-slide}',
        '  - {name: Opening, slide: introduction}',
        '  - {name: Opening, slide: live-demo}',
        '  - {name: Outside, slide: 3}',
      ].join('\n'));

      const result = await parseDeck(markdown, deckMdPath);

      expect(result.error).to.equal(undefined);
      expect(result.deck!.metadata.scenes).to.deep.equal([{ name: 'Opening', slide: 0 }]);
      expect(result.warnings).to.deep.equal([
        "[scenes] scenes[0]: no slide with id 'missing-slide'",
        "[scenes] scenes[2]: duplicate scene name 'Opening'",
        '[scenes] scenes[3]: slide 3 out of range [1, 2]',
      ]);
    });

    it('warns when the sidecar scene list is not an array', async () => {
      writeDeckMd(markdown);
      writeDeckYaml('scenes: invalid');
      const result = await parseDeck(markdown, deckMdPath);
      expect(result.error).to.equal(undefined);
      expect(result.deck!.metadata.scenes).to.deep.equal([]);
      expect(result.warnings).to.deep.equal(['[scenes] scenes must be an array']);
    });

    it('matches scene resolution in YAML-primary decks', async () => {
      writeDeckMd(markdown);
      writeDeckYaml(sceneYaml);
      const result = await parseDeck(markdown, deckMdPath);
      const manifest = await parseDeck(`content: demo.deck.md\n${sceneYaml}`, path.join(tmpDir, 'manifest.deck.yaml'));
      expect(manifest.error).to.equal(undefined);
      expect(result.deck!.metadata.scenes).to.deep.equal(manifest.deck!.metadata.scenes);
    });
  });

  it('merges cues by heading-derived IDs without explicit anchors', async () => {
    deckMdPath = path.join(tmpDir, 'a.md');
    const markdown = '## Some Slide 1\n\nContent\n\n## Some Slide 2\n\nMore content';
    writeDeckMd(markdown);
    fs.writeFileSync(
      path.join(tmpDir, 'a.deck.yaml'),
      [
        'items:',
        '  - id: some-slide-1',
        '    cues:',
        '      - First cue',
        '  - id: some-slide-2',
        '    cues:',
        '      - Second cue',
      ].join('\n'),
      'utf-8',
    );

    const { deck, error } = await parseDeck(markdown, deckMdPath);

    expect(error).to.equal(undefined);
    expect(deck!.slides.map(slide => ({ id: slide.id, cues: slide.cues }))).to.deep.equal([
      { id: 'some-slide-1', cues: ['First cue'] },
      { id: 'some-slide-2', cues: ['Second cue'] },
    ]);
  });

  // =========================================================================
  // Happy path — full merge
  // =========================================================================

  describe('happy path — three slides fully merged', () => {
    it('parses and returns a valid Deck with no error', async () => {
      writeDeckMd(THREE_SLIDE_MD);
      writeDeckYaml(buildFullSidecar());

      const result = await parseDeck(THREE_SLIDE_MD, deckMdPath);

      expect(result.error).to.be.undefined;
      expect(result.deck).to.not.be.undefined;
    });

    it('deck has exactly three slides', async () => {
      writeDeckMd(THREE_SLIDE_MD);
      writeDeckYaml(buildFullSidecar());

      const { deck } = await parseDeck(THREE_SLIDE_MD, deckMdPath);

      expect(deck!.slides).to.have.length(3);
    });

    it('slide IDs match the explicit <!-- id: --> comments', async () => {
      writeDeckMd(THREE_SLIDE_MD);
      writeDeckYaml(buildFullSidecar());

      const { deck } = await parseDeck(THREE_SLIDE_MD, deckMdPath);

      expect(deck!.slides[0].id).to.equal('intro');
      expect(deck!.slides[1].id).to.equal('setup');
      expect(deck!.slides[2].id).to.equal('demo');
    });

    it('cues are merged onto the intro slide', async () => {
      writeDeckMd(THREE_SLIDE_MD);
      writeDeckYaml(buildFullSidecar());

      const { deck } = await parseDeck(THREE_SLIDE_MD, deckMdPath);
      const intro = deck!.slides[0];

      expect(intro.cues).to.deep.equal([
        'Welcome everyone to this session',
        'We will cover three sections today',
      ]);
    });

    it('cues are merged onto the setup slide', async () => {
      writeDeckMd(THREE_SLIDE_MD);
      writeDeckYaml(buildFullSidecar());

      const { deck } = await parseDeck(THREE_SLIDE_MD, deckMdPath);
      const setup = deck!.slides[1];

      expect(setup.cues).to.deep.equal(['Walk through the install steps']);
    });

    it('terminal.run action is mapped onto the setup slide interactiveElements', async () => {
      writeDeckMd(THREE_SLIDE_MD);
      writeDeckYaml(buildFullSidecar());

      const { deck } = await parseDeck(THREE_SLIDE_MD, deckMdPath);
      const setup = deck!.slides[1];

      const sidecarEl = setup.interactiveElements.find(el => el.source === 'sidecar');
      expect(sidecarEl).to.exist;
      expect(sidecarEl!.action.type).to.equal('terminal.run');
      expect((sidecarEl!.action.params as Record<string, unknown>).command).to.equal(
        'npm install',
      );
    });

    it('sidecarActions raw entries are stored on the setup slide', async () => {
      writeDeckMd(THREE_SLIDE_MD);
      writeDeckYaml(buildFullSidecar());

      const { deck } = await parseDeck(THREE_SLIDE_MD, deckMdPath);
      const setup = deck!.slides[1];

      expect(setup.sidecarActions).to.have.length(1);
      expect(setup.sidecarActions![0].type).to.equal('terminal.run');
      expect(setup.sidecarActions![0].cmd).to.equal('npm install');
    });

    it('checkpoint is merged onto the demo slide', async () => {
      writeDeckMd(THREE_SLIDE_MD);
      writeDeckYaml(buildFullSidecar());

      const { deck } = await parseDeck(THREE_SLIDE_MD, deckMdPath);
      const demo = deck!.slides[2];

      expect(demo.checkpoint).to.equal('demo-reached');
    });

    it('slides not mentioned in sidecar pass through with no cues or checkpoint', async () => {
      const mdWithExtra = [
        THREE_SLIDE_MD,
        '',
        '---',
        '',
        '<!-- id: outro -->',
        '# Outro',
        '',
        'Thanks for attending.',
      ].join('\n');

      writeDeckMd(mdWithExtra);
      writeDeckYaml(buildFullSidecar()); // sidecar only covers intro/setup/demo

      const { deck } = await parseDeck(mdWithExtra, deckMdPath);
      const outro = deck!.slides[3];

      expect(outro.id).to.equal('outro');
      expect(outro.cues).to.be.undefined;
      expect(outro.checkpoint).to.be.undefined;
      expect(outro.sidecarActions).to.be.undefined;
      expect(outro.onEnterActions).to.deep.equal([]);
    });
  });

  // =========================================================================
  // Sidecar absent
  // =========================================================================

  describe('sidecar absent — .deck.md alone', () => {
    it('parseDeck returns a valid Deck with no error', async () => {
      // Add explicit frontmatter to use blank mode for this test
      const deckWithBlankDefault = `---\nsplit: blank\n---\n${THREE_SLIDE_MD}`;
      writeDeckMd(deckWithBlankDefault);
      // No .deck.yaml written

      const result = await parseDeck(deckWithBlankDefault, deckMdPath);

      expect(result.error).to.be.undefined;
      expect(result.deck).to.not.be.undefined;
    });

    it('all three slides are present', async () => {
      // Add explicit frontmatter to use blank mode for this test
      const deckWithBlankDefault = `---\nsplit: blank\n---\n${THREE_SLIDE_MD}`;
      writeDeckMd(deckWithBlankDefault);

      const { deck } = await parseDeck(deckWithBlankDefault, deckMdPath);

      expect(deck!.slides).to.have.length(3);
    });

    it('slide IDs are auto-assigned and not undefined', async () => {
      const plainMd = '# Slide One\n\n---\n\n# Slide Two\n\n---\n\n# Slide Three\n';
      writeDeckMd(plainMd);

      const { deck } = await parseDeck(plainMd, deckMdPath);

      for (const slide of deck!.slides) {
        expect(slide.id).to.be.a('string');
        expect(slide.id!.length).to.be.greaterThan(0);
      }
    });

    it('explicit <!-- id: --> IDs are preserved without a sidecar', async () => {
      // Add explicit frontmatter to use blank mode for this test
      const deckWithBlankDefault = `---\nsplit: blank\n---\n${THREE_SLIDE_MD}`;
      writeDeckMd(deckWithBlankDefault);

      const { deck } = await parseDeck(deckWithBlankDefault, deckMdPath);

      expect(deck!.slides[0].id).to.equal('intro');
      expect(deck!.slides[1].id).to.equal('setup');
      expect(deck!.slides[2].id).to.equal('demo');
    });

    it('no cues, actions, or checkpoints on any slide', async () => {
      // Add explicit frontmatter to use blank mode for this test
      const deckWithBlankDefault = `---\nsplit: blank\n---\n${THREE_SLIDE_MD}`;
      writeDeckMd(deckWithBlankDefault);

      const { deck } = await parseDeck(deckWithBlankDefault, deckMdPath);

      for (const slide of deck!.slides) {
        expect(slide.cues).to.be.undefined;
        expect(slide.checkpoint).to.be.undefined;
        expect(slide.sidecarActions).to.be.undefined;
        expect(slide.onEnterActions).to.deep.equal([]);
      }
    });
  });

  // =========================================================================
  // Sidecar added after parse — two consecutive parses differ correctly
  // =========================================================================

  describe('sidecar added after initial parse', () => {
    it('first parse has no cues; second parse after adding sidecar has cues', async () => {
      writeDeckMd(THREE_SLIDE_MD);

      const { deck: deckWithout } = await parseDeck(THREE_SLIDE_MD, deckMdPath);
      expect(deckWithout!.slides[0].cues).to.be.undefined;

      writeDeckYaml(buildFullSidecar());

      const { deck: deckWith } = await parseDeck(THREE_SLIDE_MD, deckMdPath);
      expect(deckWith!.slides[0].cues).to.deep.equal([
        'Welcome everyone to this session',
        'We will cover three sections today',
      ]);
    });

    it('first parse has no terminal action; second parse has it as interactiveElement', async () => {
      writeDeckMd(THREE_SLIDE_MD);

      const { deck: deckWithout } = await parseDeck(THREE_SLIDE_MD, deckMdPath);
      expect(deckWithout!.slides[1].interactiveElements.filter(el => el.source === 'sidecar')).to.have.length(0);

      writeDeckYaml(buildFullSidecar());

      const { deck: deckWith } = await parseDeck(THREE_SLIDE_MD, deckMdPath);
      const sidecarEls = deckWith!.slides[1].interactiveElements.filter(el => el.source === 'sidecar');
      expect(sidecarEls).to.have.length(1);
      expect(sidecarEls[0].action.type).to.equal('terminal.run');
    });

    it('first parse has no checkpoint on demo; second parse has it', async () => {
      writeDeckMd(THREE_SLIDE_MD);

      const { deck: deckWithout } = await parseDeck(THREE_SLIDE_MD, deckMdPath);
      expect(deckWithout!.slides[2].checkpoint).to.be.undefined;

      writeDeckYaml(buildFullSidecar());

      const { deck: deckWith } = await parseDeck(THREE_SLIDE_MD, deckMdPath);
      expect(deckWith!.slides[2].checkpoint).to.equal('demo-reached');
    });
  });

  // =========================================================================
  // Deck-level metadata from sidecar
  // =========================================================================

  describe('deck metadata merged from sidecar', () => {
    it('deck.title from sidecar reaches deck.metadata.title', async () => {
      writeDeckMd(THREE_SLIDE_MD);
      writeDeckYaml('deck:\n  title: "My Demo"\n  theme: dark\n');

      const { deck } = await parseDeck(THREE_SLIDE_MD, deckMdPath);

      expect(deck!.metadata.title).to.equal('My Demo');
    });

    it('deck.theme from sidecar reaches deck.metadata.theme', async () => {
      writeDeckMd(THREE_SLIDE_MD);
      writeDeckYaml('deck:\n  title: "My Demo"\n  theme: dark\n');

      const { deck } = await parseDeck(THREE_SLIDE_MD, deckMdPath);

      expect(deck!.metadata.theme).to.equal('dark');
    });

    it('inline frontmatter title takes precedence over sidecar title', async () => {
      const mdWithTitle = [
        '---',
        'title: Inline Title',
        '---',
        '',
        THREE_SLIDE_MD,
      ].join('\n');

      writeDeckMd(mdWithTitle);
      writeDeckYaml('deck:\n  title: "Sidecar Title"\n');

      const { deck } = await parseDeck(mdWithTitle, deckMdPath);

      expect(deck!.metadata.title).to.equal('Inline Title');
    });

    it('deck with no inline metadata gets all fields from sidecar', async () => {
      writeDeckMd(THREE_SLIDE_MD);
      writeDeckYaml('deck:\n  title: "Sidecar Only"\n  theme: light\n');

      const { deck } = await parseDeck(THREE_SLIDE_MD, deckMdPath);

      expect(deck!.metadata.title).to.equal('Sidecar Only');
      expect(deck!.metadata.theme).to.equal('light');
    });

    it('sidecar listFragmentMode reaches fragment processing', async () => {
      writeDeckMd('- A\n- B\n- C');
      writeDeckYaml('deck:\n  listFragmentMode: each\n');

      const { deck } = await parseDeck('- A\n- B\n- C', deckMdPath);

      expect(deck!.metadata.listFragmentMode).to.equal('each');
      expect(deck!.slides[0].html).to.not.match(/<ul[^>]*class="fragment"/);
      expect(deck!.slides[0].html).to.contain('<li class="fragment" data-fragment="1" data-fragment-animation="fade">A</li>');
      expect(deck!.slides[0].html).to.contain('<li class="fragment" data-fragment="2" data-fragment-animation="fade">B</li>');
      expect(deck!.slides[0].html).to.contain('<li class="fragment" data-fragment="3" data-fragment-animation="fade">C</li>');
    });
  });

  // =========================================================================
  // Sidecar with unknown slide ID
  // =========================================================================

  describe('sidecar references an unknown slide ID', () => {
    it('parseDeck completes without throwing', async () => {
      writeDeckMd(THREE_SLIDE_MD);
      writeDeckYaml([
        'slides:',
        '  - id: ghost-slide',
        '    cues:',
        '      - This slide does not exist in the deck',
        '  - id: intro',
        '    cues:',
        '      - This one does exist',
      ].join('\n'));

      const result = await parseDeck(THREE_SLIDE_MD, deckMdPath);

      expect(result.error).to.be.undefined;
      expect(result.deck).to.not.be.undefined;
    });

    it('known slides are still merged correctly', async () => {
      writeDeckMd(THREE_SLIDE_MD);
      writeDeckYaml([
        'slides:',
        '  - id: ghost-slide',
        '    cues:',
        '      - Ghost cue',
        '  - id: intro',
        '    cues:',
        '      - Real cue for intro',
      ].join('\n'));

      const { deck } = await parseDeck(THREE_SLIDE_MD, deckMdPath);

      expect(deck!.slides[0].id).to.equal('intro');
      expect(deck!.slides[0].cues).to.deep.equal(['Real cue for intro']);
    });

    it('slides not referenced in sidecar are unaffected', async () => {
      writeDeckMd(THREE_SLIDE_MD);
      writeDeckYaml([
        'slides:',
        '  - id: ghost-slide',
        '    checkpoint: ghost-cp',
      ].join('\n'));

      const { deck } = await parseDeck(THREE_SLIDE_MD, deckMdPath);

      for (const slide of deck!.slides) {
        expect(slide.checkpoint).to.be.undefined;
        expect(slide.cues).to.be.undefined;
      }
    });

    it('validateSidecarSlideIds produces a Warning diagnostic for the unknown ID', async () => {
      writeDeckMd(THREE_SLIDE_MD);
      writeDeckYaml([
        'slides:',
        '  - id: ghost-slide',
        '    cues:',
        '      - Ghost cue',
      ].join('\n'));

      const { deck } = await parseDeck(THREE_SLIDE_MD, deckMdPath);
      const sidecar = await loadSidecar(deckMdPath);

      expect(sidecar).to.not.be.null;
      const diagnostics = validateSidecarSlideIds(deck!.slides, sidecar!);

      expect(diagnostics).to.have.length(1);
      expect(diagnostics[0].severity).to.equal(SlideDiagnosticSeverity.Warning);
      expect(diagnostics[0].message).to.include('ghost-slide');
      expect(diagnostics[0].message).to.include('no matching slide found');
    });

    it('validateSidecarSlideIds produces no diagnostic when all IDs resolve', async () => {
      writeDeckMd(THREE_SLIDE_MD);
      writeDeckYaml(buildFullSidecar());

      const { deck } = await parseDeck(THREE_SLIDE_MD, deckMdPath);
      const sidecar = await loadSidecar(deckMdPath);

      const diagnostics = validateSidecarSlideIds(deck!.slides, sidecar!);

      expect(diagnostics).to.have.length(0);
    });
  });

  // =========================================================================
  // Malformed sidecar
  // =========================================================================

  describe('malformed sidecar YAML', () => {
    it('parseDeck completes without throwing', async () => {
      const deckWithBlankDefault = `---\nsplit: blank\n---\n${THREE_SLIDE_MD}`;
      writeDeckMd(deckWithBlankDefault);
      writeDeckYaml('deck:\n  title: Broken\n  theme: [unclosed');

      const result = await parseDeck(deckWithBlankDefault, deckMdPath);

      expect(result.error).to.be.undefined;
      expect(result.deck).to.not.be.undefined;
    });

    it('deck returns all three slides from the .deck.md', async () => {
      const deckWithBlankDefault = `---\nsplit: blank\n---\n${THREE_SLIDE_MD}`;
      writeDeckMd(deckWithBlankDefault);
      writeDeckYaml('deck:\n  title: Broken\n  theme: [unclosed');

      const { deck } = await parseDeck(deckWithBlankDefault, deckMdPath);

      expect(deck!.slides).to.have.length(3);
    });

    it('no sidecar data is applied to any slide', async () => {
      const deckWithBlankDefault = `---\nsplit: blank\n---\n${THREE_SLIDE_MD}`;
      writeDeckMd(deckWithBlankDefault);
      writeDeckYaml('slides:\n  - id: intro\n    cues:\n      - [invalid yaml\n');

      const { deck } = await parseDeck(deckWithBlankDefault, deckMdPath);

      for (const slide of deck!.slides) {
        expect(slide.cues).to.be.undefined;
        expect(slide.checkpoint).to.be.undefined;
        expect(slide.sidecarActions).to.be.undefined;
      }
    });

    it('deck metadata is not polluted from malformed sidecar', async () => {
      const deckWithBlankDefault = `---\nsplit: blank\n---\n${THREE_SLIDE_MD}`;
      writeDeckMd(deckWithBlankDefault);
      writeDeckYaml('deck: [not: valid: yaml');

      const { deck } = await parseDeck(deckWithBlankDefault, deckMdPath);

      // title and theme should not be set from the broken sidecar
      expect(deck!.metadata.title).to.be.undefined;
      expect(deck!.metadata.theme).to.be.undefined;
    });

    it('validateSidecarSchema produces an Error diagnostic for invalid YAML', () => {
      const malformedYaml = 'deck:\n  title: Broken\n  theme: [unclosed';

      const diagnostics = validateSidecarSchema(malformedYaml);

      expect(diagnostics).to.have.length.greaterThan(0);
      expect(diagnostics[0].severity).to.equal(SlideDiagnosticSeverity.Error);
      expect(diagnostics[0].message).to.include('YAML parse error');
    });
  });
});
