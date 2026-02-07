/**
 * Integration test for Validate Deck command (end-to-end)
 * Per T024 — creates a deck with intentional errors and verifies
 * that PreflightValidator produces a structured report with correct issues.
 *
 * NOTE: Cannot import parseDeck here because slideParser transitively
 * imports the vscode module (via renderer). We construct the Deck model
 * directly and exercise the full validation pipeline.
 */

import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PreflightValidator } from '../../src/validation/preflightValidator';
import { ValidationContext, ValidationReport } from '../../src/validation/types';
import { Deck } from '../../src/models/deck';
import { Slide, createSlide } from '../../src/models/slide';
import { createAction, ActionType } from '../../src/models/action';

/**
 * Build a Deck with intentional errors for preflight validation testing.
 *
 * Slide 0: file.open with nonexistent file
 * Slide 1: editor.highlight with out-of-range lines on package.json
 * Slide 2: debug.start with nonexistent config
 * Slide 3: terminal.run with unavailable command
 */
function buildErrorDeck(workspaceRoot: string): Deck {
  const slides: Slide[] = [];

  // Slide 0: missing file
  const s0 = createSlide(0, '# Missing file', '<h1>Missing file</h1>');
  s0.interactiveElements = [{
    id: 'el-0',
    label: 'Open',
    action: createAction('file.open' as ActionType, { path: 'nonexistent/file-that-does-not-exist.ts' }, 0),
    position: { line: 1, column: 1 },
    rawLink: '[Open](action:file.open?path=nonexistent/file-that-does-not-exist.ts)',
  }];
  slides.push(s0);

  // Slide 1: out-of-range highlight on package.json (which exists in tmpDir)
  const s1 = createSlide(1, '# Out of range', '<h1>Out of range</h1>');
  s1.interactiveElements = [{
    id: 'el-1',
    label: 'Highlight',
    action: createAction('editor.highlight' as ActionType, { path: 'package.json', lines: '9999-10000' }, 1),
    position: { line: 1, column: 1 },
    rawLink: '[Highlight](action:editor.highlight?path=package.json&lines=9999-10000)',
  }];
  slides.push(s1);

  // Slide 2: nonexistent debug config
  const s2 = createSlide(2, '# Bad debug config', '<h1>Bad debug config</h1>');
  s2.interactiveElements = [{
    id: 'el-2',
    label: 'Debug',
    action: createAction('debug.start' as ActionType, { configName: 'NonExistentConfig' }, 2),
    position: { line: 1, column: 1 },
    rawLink: '[Debug](action:debug.start?configName=NonExistentConfig)',
  }];
  slides.push(s2);

  // Slide 3: unavailable command
  const s3 = createSlide(3, '# Bad command', '<h1>Bad command</h1>');
  s3.interactiveElements = [{
    id: 'el-3',
    label: 'Run',
    action: createAction('terminal.run' as ActionType, { command: 'xyzzy_nonexistent_command_12345' }, 3),
    position: { line: 1, column: 1 },
    rawLink: '[Run](action:terminal.run?command=xyzzy_nonexistent_command_12345)',
  }];
  slides.push(s3);

  return {
    filePath: path.join(workspaceRoot, 'test.deck.md'),
    slides,
    currentSlideIndex: 0,
    metadata: { title: 'Integration Test Deck' },
    state: 'active',
  };
}

describe('Preflight Command Integration', () => {
  let tmpDir: string;
  let deck: Deck;

  before(() => {
    // Create a temporary workspace directory with a small package.json
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-talk-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'test' }),
      'utf-8',
    );

    deck = buildErrorDeck(tmpDir);
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should have 4 slides with actions', () => {
    expect(deck.slides.length).to.equal(4);
    for (const slide of deck.slides) {
      expect(slide.interactiveElements.length).to.equal(1);
    }
  });

  it('should detect missing file for file.open action', async () => {
    const report = await runValidation(tmpDir, deck);

    const fileIssues = report.issues.filter(
      (i) => i.source === 'file.open' && i.severity === 'error',
    );
    expect(fileIssues.length).to.be.greaterThan(0);
    expect(fileIssues[0].message).to.include('not found');
  });

  it('should detect out-of-range line highlight', async () => {
    const report = await runValidation(tmpDir, deck);

    // package.json exists in tmpDir but is only ~1 line, so range 9999-10000 exceeds
    const lineIssues = report.issues.filter(
      (i) => i.source === 'editor.highlight' && i.severity === 'error',
    );
    expect(lineIssues.length).to.be.greaterThan(0);
    expect(lineIssues[0].message).to.match(/exceeds file length/i);
  });

  it('should detect nonexistent debug configuration', async () => {
    const report = await runValidation(tmpDir, deck);

    const debugIssues = report.issues.filter(
      (i) => i.source === 'debug.start' && i.severity === 'error',
    );
    expect(debugIssues.length).to.be.greaterThan(0);
    expect(debugIssues[0].message).to.include('NonExistentConfig');
  });

  it('should detect unavailable command with warning severity', async () => {
    const report = await runValidation(tmpDir, deck);

    const cmdIssues = report.issues.filter(
      (i) => i.source === 'terminal.run' && (i.severity === 'warning' || i.severity === 'info'),
    );
    expect(cmdIssues.length).to.be.greaterThan(0);
    expect(cmdIssues[0].message).to.include('xyzzy_nonexistent_command_12345');
  });

  it('should emit trust warnings when workspace is untrusted', async () => {
    const report = await runValidation(tmpDir, deck, { isTrusted: false });

    const trustIssues = report.issues.filter(
      (i) => i.message.includes('Workspace Trust'),
    );
    // terminal.run and debug.start both require trust
    expect(trustIssues.length).to.be.greaterThanOrEqual(2);
    trustIssues.forEach((issue) => {
      expect(issue.severity).to.equal('warning');
    });
  });

  it('should set passed=false when errors exist', async () => {
    const report = await runValidation(tmpDir, deck);
    expect(report.passed).to.be.false;
    expect(report.issues.some((i) => i.severity === 'error')).to.be.true;
  });

  it('should include metadata in report', async () => {
    const report = await runValidation(tmpDir, deck);
    expect(report.deckFilePath).to.equal(path.join(tmpDir, 'test.deck.md'));
    expect(report.slideCount).to.equal(4);
    expect(report.checksPerformed).to.be.greaterThan(0);
    expect(report.durationMs).to.be.a('number');
    expect(report.timestamp).to.be.a('number');
  });
});

/**
 * Helper: run PreflightValidator with the given workspace root and deck.
 */
async function runValidation(
  workspaceRoot: string,
  deck: Deck,
  opts: { isTrusted?: boolean } = {},
): Promise<ValidationReport> {
  const context: ValidationContext = {
    deck,
    workspaceRoot,
    isTrusted: opts.isTrusted ?? true,
    cancellationToken: { isCancellationRequested: false },
  };

  const validator = new PreflightValidator();
  return validator.validate(context);
}
