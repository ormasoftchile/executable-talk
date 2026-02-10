import { expect } from 'chai';
import { extractCheckpoint } from '../../../src/parser/checkpointParser';
import { createSlide } from '../../../src/models/slide';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: true });

describe('Checkpoint Parsing', () => {
  it('should extract checkpoint ID from slide content', () => {
    const content = '# Step 1\n<!-- checkpoint: setup-complete -->\nDo the thing.';
    const { checkpoint, cleanedContent } = extractCheckpoint(content);
    expect(checkpoint).to.equal('setup-complete');
    const html = md.render(cleanedContent);
    const slide = createSlide(0, cleanedContent, html, undefined, checkpoint);
    expect(slide.checkpoint).to.equal('setup-complete');
  });

  it('should strip checkpoint comment from rendered HTML', () => {
    const content = '# Step 1\n<!-- checkpoint: my-checkpoint -->\nSome text.';
    const { checkpoint, cleanedContent } = extractCheckpoint(content);
    const html = md.render(cleanedContent);
    expect(html).to.not.contain('checkpoint:');
    expect(html).to.not.contain('my-checkpoint');
    const slide = createSlide(0, cleanedContent, html, undefined, checkpoint);
    expect(slide.html).to.not.contain('checkpoint:');
    expect(slide.html).to.not.contain('my-checkpoint');
  });

  it('should handle slides without checkpoints', () => {
    const content = '# Regular Slide\nNo checkpoint here.';
    const { checkpoint, cleanedContent } = extractCheckpoint(content);
    expect(checkpoint).to.be.undefined;
    const slide = createSlide(0, cleanedContent, md.render(cleanedContent), undefined, checkpoint);
    expect(slide.checkpoint).to.be.undefined;
  });

  it('should handle checkpoint with hyphens and underscores', () => {
    const content = '<!-- checkpoint: step_2-verified -->\nContent';
    const { checkpoint } = extractCheckpoint(content);
    expect(checkpoint).to.equal('step_2-verified');
  });

  it('should only extract first checkpoint per slide', () => {
    const content = '<!-- checkpoint: first -->\n<!-- checkpoint: second -->\nContent';
    const { checkpoint } = extractCheckpoint(content);
    expect(checkpoint).to.equal('first');
  });
});
