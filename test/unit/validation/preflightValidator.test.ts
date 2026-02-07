/**
 * Unit tests for PreflightValidator orchestrator
 * Per T014 — Tests written FIRST, must FAIL before implementation.
 */

import { expect } from 'chai';
import { PreflightValidator } from '../../../src/validation/preflightValidator';
import { ValidationContext, ValidationReport } from '../../../src/validation/types';
import { Deck } from '../../../src/models/deck';
import { Slide, createSlide } from '../../../src/models/slide';
import { createAction, ActionType } from '../../../src/models/action';

function makeDeck(slides: Slide[], filePath = '/workspace/test.deck.md'): Deck {
  return {
    filePath,
    slides,
    currentSlideIndex: 0,
    metadata: {},
    state: 'active',
  };
}

function makeContext(slides: Slide[], opts: { isTrusted?: boolean; workspaceRoot?: string } = {}): ValidationContext {
  const workspaceRoot = opts.workspaceRoot ?? process.cwd();
  return {
    deck: makeDeck(slides, `${workspaceRoot}/test.deck.md`),
    workspaceRoot,
    isTrusted: opts.isTrusted ?? true,
    cancellationToken: { isCancellationRequested: false },
  };
}

function makeSlideWithAction(type: string, params: Record<string, unknown>, index = 0): Slide {
  const slide = createSlide(index, '', '');
  const action = createAction(type as ActionType, params, index);
  slide.interactiveElements = [{
    id: `el-${index}`,
    label: 'test',
    action,
    position: { line: 1, column: 1 },
    rawLink: '',
  }];
  return slide;
}

describe('PreflightValidator', () => {
  let validator: PreflightValidator;

  beforeEach(() => {
    validator = new PreflightValidator();
  });

  it('should produce success report for all-pass deck', async () => {
    // Use a file that exists
    const slide = makeSlideWithAction('file.open', { path: 'package.json' });
    const context = makeContext([slide]);

    const report: ValidationReport = await validator.validate(context);

    expect(report.passed).to.be.true;
    expect(report.checksPerformed).to.be.greaterThan(0);
    expect(report.slideCount).to.equal(1);
  });

  it('should report mixed results with severity, slide, source, and description', async () => {
    const slide1 = makeSlideWithAction('file.open', { path: 'nonexistent.ts' }, 0);
    const slide2 = makeSlideWithAction('file.open', { path: 'package.json' }, 1);
    const context = makeContext([slide1, slide2]);

    const report = await validator.validate(context);

    expect(report.passed).to.be.false;
    expect(report.issues.length).to.be.greaterThan(0);

    const errIssue = report.issues.find(i => i.severity === 'error');
    expect(errIssue).to.exist;
    expect(errIssue!.slideIndex).to.be.a('number');
    expect(errIssue!.source).to.be.a('string');
    expect(errIssue!.message).to.be.a('string');
  });

  it('should succeed for empty deck (no actions)', async () => {
    const slide = createSlide(0, '# Empty slide', '<h1>Empty slide</h1>');
    const context = makeContext([slide]);

    const report = await validator.validate(context);

    expect(report.passed).to.be.true;
    expect(report.actionCount).to.equal(0);
  });

  it('should respect cancellation token', async () => {
    const slide = makeSlideWithAction('file.open', { path: 'package.json' });
    const context = makeContext([slide]);
    context.cancellationToken = { isCancellationRequested: true };

    const report = await validator.validate(context);

    // Should finish without errors (may skip some checks)
    expect(report).to.have.property('passed');
  });

  it('should emit warning for trust-requiring actions in untrusted workspace', async () => {
    const slide = makeSlideWithAction('terminal.run', { command: 'npm test' });
    const context = makeContext([slide], { isTrusted: false });

    const report = await validator.validate(context);

    const trustWarning = report.issues.find(
      i => i.severity === 'warning' && i.message.includes('trust')
    );
    expect(trustWarning).to.exist;
  });

  it('should set passed=false only when errors exist (warnings alone = pass)', async () => {
    // A trust warning shouldn't cause failure
    const slide = makeSlideWithAction('terminal.run', { command: 'node --version' });
    const context = makeContext([slide], { isTrusted: false });

    const report = await validator.validate(context);

    // There should be a trust warning
    const warnings = report.issues.filter(i => i.severity === 'warning');
    expect(warnings.length).to.be.greaterThan(0);

    // But passed should still be true (no errors)
    const errors = report.issues.filter(i => i.severity === 'error');
    if (errors.length === 0) {
      expect(report.passed).to.be.true;
    }
  });

  it('should include check counts in report', async () => {
    const slide = makeSlideWithAction('file.open', { path: 'package.json' });
    const context = makeContext([slide]);

    const report = await validator.validate(context);

    expect(report.checksPerformed).to.be.a('number');
    expect(report.slideCount).to.be.a('number');
    expect(report.actionCount).to.be.a('number');
    expect(report.durationMs).to.be.a('number');
    expect(report.timestamp).to.be.a('number');
  });
});
