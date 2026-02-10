import { expect } from 'chai';
import { transformLayoutDirectives } from '../../../src/parser/layoutDirectivePlugin';

describe('Layout Directive Plugin', () => {
  describe('transformLayoutDirectives', () => {
    it('should transform :::center block', () => {
      const input = ':::center\nBig idea\n:::';
      const result = transformLayoutDirectives(input);
      expect(result).to.equal('<div class="layout-center">\n\nBig idea\n\n</div>');
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
      // Blank line after opening tag ensures markdown-it renders inner content
      expect(result).to.contain('<div class="layout-center">\n\nContent without close');
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

    it('should transform :::advanced into details/summary', () => {
      const input = ':::advanced\nSome advanced content\n:::';
      const result = transformLayoutDirectives(input);
      expect(result).to.contain('<details class="disclosure-advanced">');
      expect(result).to.contain('<summary>Advanced</summary>');
      expect(result).to.contain('</details>');
      expect(result).to.contain('Some advanced content');
    });

    it('should transform :::optional with badge', () => {
      const input = ':::optional\nOptional step content\n:::';
      const result = transformLayoutDirectives(input);
      expect(result).to.contain('<div class="step-optional">');
      expect(result).to.contain('<span class="optional-badge">Optional</span>');
      expect(result).to.contain('Optional step content');
      expect(result).to.contain('</div>');
    });

    it('should handle mixed layout and disclosure directives', () => {
      const input = ':::columns\n:::left\nText\n:::\n:::right\n:::advanced\nDetails\n:::\n:::\n:::';
      const result = transformLayoutDirectives(input);
      expect(result).to.contain('<div class="layout-columns">');
      expect(result).to.contain('<details class="disclosure-advanced">');
      expect(result).to.contain('</details>');
      expect(result).to.contain('</div>');
    });
  });
});
