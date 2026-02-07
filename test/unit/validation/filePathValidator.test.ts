/**
 * Unit tests for FilePathValidator
 * Per T010 — Tests written FIRST, must FAIL before implementation.
 */

import { expect } from 'chai';
import { FilePathValidator } from '../../../src/validation/filePathValidator';
import { ValidationContext } from '../../../src/validation/types';
import { Deck } from '../../../src/models/deck';
import { Slide, createSlide } from '../../../src/models/slide';
import { createAction } from '../../../src/models/action';

function makeContext(slides: Slide[], workspaceRoot = '/workspace'): ValidationContext {
  const deck: Deck = {
    filePath: `${workspaceRoot}/test.deck.md`,
    slides,
    currentSlideIndex: 0,
    metadata: {},
    state: 'active',
  };
  return {
    deck,
    workspaceRoot,
    isTrusted: true,
    cancellationToken: { isCancellationRequested: false },
  };
}

function makeSlideWithAction(type: string, params: Record<string, unknown>, index = 0): Slide {
  const slide = createSlide(index, '', '');
  const action = createAction(type as import('../../../src/models/action').ActionType, params, index);
  slide.interactiveElements = [{
    id: `el-${index}`,
    label: 'test',
    action,
    position: { line: 1, column: 1 },
    rawLink: '',
  }];
  return slide;
}

function makeSlideWithDirective(type: string, rawDirective: string, index = 0): Slide {
  const slide = createSlide(index, '', '');
  slide.renderDirectives = [{
    id: `dir-${index}`,
    type: type as 'file' | 'command' | 'diff',
    rawDirective,
    position: { start: 0, end: 10 },
  }];
  return slide;
}

describe('FilePathValidator', () => {
  let validator: FilePathValidator;

  beforeEach(() => {
    validator = new FilePathValidator();
  });

  it('should have a description', () => {
    expect(validator.description).to.be.a('string').and.not.be.empty;
  });

  it('should return no issues for existing files', async () => {
    // Use a file we know exists
    const slide = makeSlideWithAction('file.open', { path: 'package.json' });
    const context = makeContext([slide], process.cwd());

    const issues = await validator.run(context);

    const fileErrors = issues.filter(i => i.severity === 'error' && i.message.includes('not found'));
    expect(fileErrors).to.have.length(0);
  });

  it('should return error for missing file', async () => {
    const slide = makeSlideWithAction('file.open', { path: 'nonexistent/file.ts' });
    const context = makeContext([slide], process.cwd());

    const issues = await validator.run(context);

    expect(issues).to.have.length.greaterThan(0);
    const err = issues.find(i => i.severity === 'error');
    expect(err).to.exist;
    expect(err!.message).to.include('not found');
    expect(err!.source).to.equal('file.open');
  });

  it('should resolve paths relative to workspaceRoot', async () => {
    const slide = makeSlideWithAction('file.open', { path: 'src/extension.ts' });
    const context = makeContext([slide], process.cwd());

    const issues = await validator.run(context);

    const fileErrors = issues.filter(i => i.severity === 'error' && i.message.includes('not found'));
    expect(fileErrors).to.have.length(0);
  });

  it('should validate paths from editor.highlight actions', async () => {
    const slide = makeSlideWithAction('editor.highlight', { path: 'missing.ts', lines: '1-5' });
    const context = makeContext([slide], process.cwd());

    const issues = await validator.run(context);

    expect(issues.some(i => i.severity === 'error')).to.be.true;
  });

  it('should validate paths from render:file directives', async () => {
    const slide = makeSlideWithDirective('file', '[Show](render:file?path=missing.ts)');
    const context = makeContext([slide], process.cwd());

    const issues = await validator.run(context);

    expect(issues.some(i => i.severity === 'error')).to.be.true;
  });

  it('should validate paths from render:diff directives', async () => {
    const slide = makeSlideWithDirective('diff', '[Diff](render:diff?left=missing.ts&right=also-missing.ts)');
    const context = makeContext([slide], process.cwd());

    const issues = await validator.run(context);

    expect(issues.some(i => i.severity === 'error')).to.be.true;
  });

  it('should check multiple files in parallel', async () => {
    const slide1 = makeSlideWithAction('file.open', { path: 'missing1.ts' }, 0);
    const slide2 = makeSlideWithAction('file.open', { path: 'missing2.ts' }, 1);
    const context = makeContext([slide1, slide2], process.cwd());

    const issues = await validator.run(context);

    // Should find errors for both missing files
    expect(issues.filter(i => i.severity === 'error')).to.have.length(2);
  });
});
