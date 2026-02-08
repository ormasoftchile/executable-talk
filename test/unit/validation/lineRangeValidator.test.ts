/**
 * Unit tests for LineRangeValidator
 * Per T011 — Tests written FIRST, must FAIL before implementation.
 */

import { expect } from 'chai';
import { LineRangeValidator } from '../../../src/validation/lineRangeValidator';
import { ValidationContext } from '../../../src/validation/types';
import { Deck } from '../../../src/models/deck';
import { Slide, createSlide } from '../../../src/models/slide';
import { createAction, ActionType } from '../../../src/models/action';

function makeContext(slides: Slide[], workspaceRoot = '/workspace'): ValidationContext {
  const deck: Deck = {
    filePath: `${workspaceRoot}/test.deck.md`,
    slides,
    currentSlideIndex: 0,
    metadata: {},
    envDeclarations: [],
    state: 'active',
  };
  return {
    deck,
    workspaceRoot,
    isTrusted: true,
    cancellationToken: { isCancellationRequested: false },
  };
}

function makeSlideWithHighlight(path: string, lines: string, index = 0): Slide {
  const slide = createSlide(index, '', '');
  const action = createAction('editor.highlight' as ActionType, { path, lines }, index);
  slide.interactiveElements = [{
    id: `el-${index}`,
    label: 'test',
    action,
    position: { line: 1, column: 1 },
    rawLink: '',
  }];
  return slide;
}

describe('LineRangeValidator', () => {
  let validator: LineRangeValidator;

  beforeEach(() => {
    validator = new LineRangeValidator();
  });

  it('should have a description', () => {
    expect(validator.description).to.be.a('string').and.not.be.empty;
  });

  it('should pass for a valid line range', async () => {
    // package.json has many lines — "1-5" should be valid
    const slide = makeSlideWithHighlight('package.json', '1-5');
    const context = makeContext([slide], process.cwd());

    const issues = await validator.run(context);

    const errors = issues.filter(i => i.severity === 'error' && i.message.includes('exceeds'));
    expect(errors).to.have.length(0);
  });

  it('should return error when range exceeds file length', async () => {
    // package.json has fewer than 99999 lines
    const slide = makeSlideWithHighlight('package.json', '99990-99999');
    const context = makeContext([slide], process.cwd());

    const issues = await validator.run(context);

    expect(issues).to.have.length.greaterThan(0);
    const err = issues.find(i => i.severity === 'error');
    expect(err).to.exist;
    expect(err!.message).to.include('exceeds file length');
    expect(err!.message).to.match(/\d+ lines/);
  });

  it('should only run for actions with lines param', async () => {
    // file.open without lines param should not trigger line range check
    const slide = createSlide(0, '', '');
    const action = createAction('file.open' as ActionType, { path: 'package.json' }, 0);
    slide.interactiveElements = [{
      id: 'el-0',
      label: 'test',
      action,
      position: { line: 1, column: 1 },
      rawLink: '',
    }];
    const context = makeContext([slide], process.cwd());

    const issues = await validator.run(context);

    expect(issues).to.have.length(0);
  });

  it('should handle single line range', async () => {
    const slide = makeSlideWithHighlight('package.json', '5');
    const context = makeContext([slide], process.cwd());

    const issues = await validator.run(context);

    expect(issues.filter(i => i.severity === 'error')).to.have.length(0);
  });

  it('should skip validation when file does not exist', async () => {
    const slide = makeSlideWithHighlight('nonexistent.ts', '1-5');
    const context = makeContext([slide], process.cwd());

    const issues = await validator.run(context);

    // Should not report line range error when file doesn't exist (FilePathValidator handles that)
    const lineErrors = issues.filter(i => i.message.includes('exceeds'));
    expect(lineErrors).to.have.length(0);
  });
});
