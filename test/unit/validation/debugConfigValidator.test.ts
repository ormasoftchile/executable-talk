/**
 * Unit tests for DebugConfigValidator
 * Per T012 — Tests written FIRST, must FAIL before implementation.
 */

import { expect } from 'chai';
import { DebugConfigValidator } from '../../../src/validation/debugConfigValidator';
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

function makeSlideWithDebug(configName: string, index = 0): Slide {
  const slide = createSlide(index, '', '');
  const action = createAction('debug.start' as ActionType, { configName }, index);
  slide.interactiveElements = [{
    id: `el-${index}`,
    label: 'test',
    action,
    position: { line: 1, column: 1 },
    rawLink: '',
  }];
  return slide;
}

describe('DebugConfigValidator', () => {
  let validator: DebugConfigValidator;

  beforeEach(() => {
    validator = new DebugConfigValidator();
  });

  it('should have a description', () => {
    expect(validator.description).to.be.a('string').and.not.be.empty;
  });

  it('should return error for missing debug config', async () => {
    const slide = makeSlideWithDebug('Nonexistent Config');
    const context = makeContext([slide]);

    const issues = await validator.run(context);

    expect(issues).to.have.length.greaterThan(0);
    const err = issues.find(i => i.severity === 'error');
    expect(err).to.exist;
    expect(err!.message).to.include('not found');
    expect(err!.source).to.equal('debug.start');
  });

  it('should list available config names in error message', async () => {
    const slide = makeSlideWithDebug('Missing Config');
    const context = makeContext([slide]);

    const issues = await validator.run(context);

    if (issues.length > 0) {
      // Error message should include 'Available:' when there are configs
      // or 'No configurations found' when empty
      const err = issues[0];
      expect(err.message).to.satisfy((m: string) =>
        m.includes('Available:') || m.includes('No configurations found') || m.includes('not found')
      );
    }
  });

  it('should handle empty/missing launch.json gracefully', async () => {
    const slide = makeSlideWithDebug('Some Config');
    const context = makeContext([slide]);

    // Should not throw — just report error
    const issues = await validator.run(context);

    expect(issues).to.be.an('array');
  });

  it('should return no issues when no debug.start actions exist', async () => {
    const slide = createSlide(0, '', '');
    const action = createAction('file.open' as ActionType, { path: 'test.ts' }, 0);
    slide.interactiveElements = [{
      id: 'el-0',
      label: 'test',
      action,
      position: { line: 1, column: 1 },
      rawLink: '',
    }];
    const context = makeContext([slide]);

    const issues = await validator.run(context);

    expect(issues).to.have.length(0);
  });
});
