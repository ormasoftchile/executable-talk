import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { VoiceOverCue } from '../../../packages/core/src/models/recording';
import {
  createNarrationProject,
  loadDeckNarrationSetup,
  loadNarrationTimings,
  loadAvailableNarrationTimings,
  seedNarrationProject,
  stageNarrationProjectForSession,
} from '../../../packages/extension/src/dubbing/narrationProject';

describe('narration project handoff', () => {
  let root: string;
  const cues: VoiceOverCue[] = [
    { slideIndex: 0, text: 'Opening narration.', source: 'comment' },
    { slideIndex: 0, fragmentIndex: 1, text: 'Fragment narration.', source: 'comment' },
  ];

  beforeEach(async () => {
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'deckpilot-narration-'));
  });

  afterEach(async () => {
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  it('writes an ordered SRT scaffold for recording', async () => {
    const project = await createNarrationProject(cues, root);
    const srt = await fs.promises.readFile(project.srtPath, 'utf8');

    expect(path.basename(project.srtPath)).to.equal('narration.srt');
    expect(path.basename(project.projectPath)).to.equal('narration-project.json');
    expect(srt).to.include('1\n');
    expect(srt).to.include('Opening narration.');
    expect(srt).to.include('2\n');
    expect(srt).to.include('Fragment narration.');
    expect(project.hadExistingProject).to.equal(false);
  });

  it('loads partial measured takes by text, not stale position, without rewriting the project', async () => {
    const projectPath = path.join(root, 'narration-project.json');
    const take = path.join(root, 'take.wav');
    const raw = path.join(root, 'raw.wav');
    await fs.promises.writeFile(raw, 'raw');
    await fs.promises.writeFile(take, 'processed');
    const entries = JSON.stringify([{ index: 9, text: cues[1].text, raw_take_path: raw,
      processed_take_path: take, processed_duration_ms: 3800 }]);
    await fs.promises.writeFile(projectPath, entries);
    expect(await loadAvailableNarrationTimings(projectPath, cues)).to.deep.equal([
      { cueIndex: 2, text: cues[1].text, durationMs: 3800 },
    ]);
    expect(await fs.promises.readFile(projectPath, 'utf8')).to.equal(entries);
    await fs.promises.utimes(raw, new Date(), new Date(Date.now() + 10000));
    expect(await loadAvailableNarrationTimings(projectPath, cues)).to.deep.equal([]);
    expect(await loadAvailableNarrationTimings(path.join(root, 'missing.json'), cues)).to.deep.equal([]);
  });

  it('does not call changed or missing audio measured', async () => {
    const projectPath = path.join(root, 'narration-project.json');
    await fs.promises.writeFile(projectPath, JSON.stringify([
      { index: 1, text: 'Previous wording.', processed_duration_ms: 1000, processed_take_path: 'old.wav' },
      { index: 2, text: cues[1].text, processed_duration_ms: 2000, processed_take_path: 'missing.wav' },
    ]));
    expect(await loadAvailableNarrationTimings(projectPath, cues)).to.deep.equal([]);
  });

  it('refreshes cues without replacing an existing narration project', async () => {
    const projectPath = path.join(root, 'narration-project.json');
    const existing = JSON.stringify([{ index: 1, raw_take_path: 'takes/1.wav' }]);
    await fs.promises.writeFile(projectPath, existing);

    const project = await createNarrationProject(cues, root);

    expect(project.hadExistingProject).to.equal(true);
    expect(await fs.promises.readFile(projectPath, 'utf8')).to.equal(existing);
  });

  it('loads cues and persistent storage directly from deck files', async () => {
    const deckPath = path.join(root, 'talk.deck.md');
    await fs.promises.writeFile(deckPath, '<!-- id: intro -->\n\n# Intro\n');
    await fs.promises.writeFile(path.join(root, 'talk.deck.yaml'), [
      'items:',
      '  - id: intro',
      '    cues:',
      '      - Narrate this opening.',
      'export:',
      '  outputDir: ./productions',
      '',
    ].join('\n'));

    const setup = await loadDeckNarrationSetup(deckPath, await fs.promises.readFile(deckPath, 'utf8'));

    expect(setup.cues.map(cue => cue.text)).to.deep.equal(['Narrate this opening.']);
    expect(setup.narrationDirectory).to.equal(path.join(root, 'productions', 'talk', 'narration'));
  });

  it('loads text-matched processed durations by cue index', async () => {
    const project = await createNarrationProject(cues, root);
    const processedDirectory = path.join(root, 'processed');
    await fs.promises.mkdir(processedDirectory);
    const firstTake = path.join(processedDirectory, '1.wav');
    const secondTake = path.join(processedDirectory, '2.wav');
    await Promise.all([
      fs.promises.writeFile(firstTake, 'first'),
      fs.promises.writeFile(secondTake, 'second'),
    ]);
    await fs.promises.writeFile(project.projectPath, JSON.stringify([
      {
        index: 1,
        text: 'Opening narration.',
        processed_take_path: firstTake,
        processed_duration_ms: 4123,
        status: 'ok',
      },
      {
        index: 2,
        text: 'Fragment narration.',
        processed_take_path: secondTake,
        processed_duration_ms: 2789,
        status: 'ok',
      },
    ]));

    expect(await loadNarrationTimings(project, cues)).to.deep.equal([
      { cueIndex: 1, text: 'Opening narration.', durationMs: 4123 },
      { cueIndex: 2, text: 'Fragment narration.', durationMs: 2789 },
    ]);
  });

  it('accepts case-only cue edits preserved by srt-dubber resync', async () => {
    const project = await createNarrationProject(cues, root);
    const processedDirectory = path.join(root, 'processed');
    await fs.promises.mkdir(processedDirectory);
    const take = path.join(processedDirectory, '1.wav');
    await fs.promises.writeFile(take, 'first');
    await fs.promises.writeFile(project.projectPath, JSON.stringify([{
      index: 1,
      text: 'opening NARRATION.',
      processed_take_path: take,
      processed_duration_ms: 1234,
      status: 'ok',
    }]));

    const timings = await loadNarrationTimings(project, [cues[0]]);

    expect(timings[0].durationMs).to.equal(1234);
  });

  it('stages persistent takes with session-specific final timing', async () => {
    const project = await createNarrationProject(cues, path.join(root, 'persistent'));
    const metadata = JSON.stringify([{ index: 1, raw_take_path: 'C:/takes/opening.wav' }]);
    await fs.promises.writeFile(project.projectPath, metadata);
    const sessionDirectory = path.join(root, 'session');
    const finalSrt = '1\n00:00:05,000 --> 00:00:07,000\nOpening narration.\n';

    const staged = await stageNarrationProjectForSession(project, sessionDirectory, finalSrt, 'talk');

    expect(await fs.promises.readFile(staged.srtPath, 'utf8')).to.equal(finalSrt);
    expect(await fs.promises.readFile(staged.projectPath, 'utf8')).to.equal(metadata);
    expect(path.basename(staged.srtPath)).to.equal('talk.srt');
    expect(path.basename(staged.projectPath)).to.equal('talk-project.json');
    expect(staged.hadExistingProject).to.equal(true);
  });

  it('seeds persistent narration metadata from an existing session once', async () => {
    const sessionDirectory = path.join(root, 'old-session');
    const narrationDirectory = path.join(root, 'persistent');
    await fs.promises.mkdir(sessionDirectory);
    const oldSrt = path.join(sessionDirectory, 'talk.srt');
    const oldProject = path.join(sessionDirectory, 'talk-project.json');
    const metadata = JSON.stringify([{ index: 1, raw_take_path: 'C:/old/takes/1.wav' }]);
    await fs.promises.writeFile(oldSrt, 'old cues');
    await fs.promises.writeFile(oldProject, metadata);

    expect(await seedNarrationProject(narrationDirectory, oldSrt)).to.equal(true);
    expect(await fs.promises.readFile(
      path.join(narrationDirectory, 'narration-project.json'),
      'utf8',
    )).to.equal(metadata);
    expect(await seedNarrationProject(narrationDirectory, oldSrt)).to.equal(false);
  });

  it('rejects an incomplete narration project', async () => {
    const project = await createNarrationProject(cues, root);
    await fs.promises.writeFile(project.projectPath, JSON.stringify([
      {
        index: 1,
        text: 'Opening narration.',
        processed_take_path: '',
        processed_duration_ms: -1,
        status: 'pending',
      },
    ]));

    let error: unknown;
    try {
      await loadNarrationTimings(project, cues);
    } catch (caught) {
      error = caught;
    }
    expect(error).to.be.instanceOf(Error);
    expect((error as Error).message).to.include('cue 1');
  });
});
