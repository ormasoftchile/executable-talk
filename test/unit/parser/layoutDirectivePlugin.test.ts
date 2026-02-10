import { expect } from 'chai';
import { transformLayoutDirectives } from '../../../src/parser/layoutDirectivePlugin';

describe('Layout Directive Plugin', () => {
  describe('transformLayoutDirectives', () => {
    it('should transform :::center block', () => {
      const input = ':::center\nBig idea\n:::';
      const result = transformLayoutDirectives(input);
      expect(result).to.equal('<div class="layout-center">\nBig idea\n</div>');
    });

    it('should transform :::columns with :::left and :::right', () => {
      const input = ':::columns\n:::left\nText\n:::\n:::right\nCode\n:::\n:::';
      const result = transformLayoutDirectives(input);
      expect(result).to.contain('<div class="layout-columns">');
      expect(result).to.contain('<div class="layout-left">');
      expect(result).to.contain('<div class="layout-right">');
      expect(result).to.contain('Text');
      expect(result).to.contain('Code');
    });

    it('should pass through content with no directives', () => {
      const input = '# Hello\n\nSome text';
      const result = transformLayoutDirectives(input);
      expect(result).to.equal(input);
    });

    it('should close unclosed directives gracefully', () => {
      const input = ':::center\nContent without close';
      const result = transformLayoutDirectives(input);
      expect(result).to.contain('<div class="layout-center">');
      expect(result).to.contain('</div>');
    });

    it('should handle nested directives', () => {
      const input = ':::columns\n:::left\nLeft content\n:::\n:::right\nRight content\n:::\n:::';
      const result = transformLayoutDirectives(input);
      // Count divs
      const openDivs = (result.match(/<div/g) || []).length;
      const closeDivs = (result.match(/<\/div>/g) || []).length;
      expect(openDivs).to.equal(closeDivs);
    });

    it('should not transform directives inside fenced code blocks', () => {
      const input = '```\n:::center\nsome code\n:::\n```';
      const result = transformLayoutDirectives(input);
      expect(result).to.contain(':::center');
      expect(result).to.not.contain('<div');
    });
  });
});
