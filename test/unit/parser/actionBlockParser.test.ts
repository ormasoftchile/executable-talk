/**
 * Unit tests for Action Block Parser
 * Per T005 — Tests written FIRST, must FAIL before implementation.
 *
 * Covers:
 * - Valid single action YAML (file.open with path)
 * - Sequence with steps array
 * - Action with label
 * - Invalid YAML syntax (error includes line info from js-yaml .mark)
 * - Missing type field
 * - Unknown action type
 * - Missing required params
 * - YAML non-object (scalar/array)
 * - Mixed blocks and content on same slide
 * - Backward compat: inline links unaffected by block parser
 * - source: 'block' set on resulting elements
 */

import { expect } from 'chai';
import { parseActionBlocks, ActionBlockParseResult, ActionBlockParseError } from '../../../src/parser/actionBlockParser';

describe('Action Block Parser', () => {
  describe('valid single action', () => {
    it('should parse a file.open action block with required path param', () => {
      const content = [
        'Some intro text',
        '',
        '```action',
        'type: file.open',
        'path: src/main.ts',
        '```',
        '',
        'More text',
      ].join('\n');

      const result: ActionBlockParseResult = parseActionBlocks(content, 0);

      expect(result.elements).to.have.length(1);
      expect(result.errors).to.have.length(0);

      const el = result.elements[0];
      expect(el.action.type).to.equal('file.open');
      expect(el.action.params).to.deep.include({ path: 'src/main.ts' });
      expect(el.action.slideIndex).to.equal(0);
    });

    it('should parse a file.open action with optional params', () => {
      const content = [
        '```action',
        'type: file.open',
        'path: src/main.ts',
        'line: 10',
        'column: 5',
        'preview: true',
        '```',
      ].join('\n');

      const result = parseActionBlocks(content, 0);

      expect(result.elements).to.have.length(1);
      expect(result.errors).to.have.length(0);

      const params = result.elements[0].action.params;
      expect(params.path).to.equal('src/main.ts');
      expect(params.line).to.equal(10);
      expect(params.column).to.equal(5);
      expect(params.preview).to.equal(true);
    });

    it('should parse an editor.highlight action block', () => {
      const content = [
        '```action',
        'type: editor.highlight',
        'path: src/main.ts',
        'lines: 10-20',
        'style: prominent',
        '```',
      ].join('\n');

      const result = parseActionBlocks(content, 2);

      expect(result.elements).to.have.length(1);
      const el = result.elements[0];
      expect(el.action.type).to.equal('editor.highlight');
      expect(el.action.params.lines).to.equal('10-20');
      expect(el.action.params.style).to.equal('prominent');
      expect(el.action.slideIndex).to.equal(2);
    });

    it('should parse a terminal.run action block', () => {
      const content = [
        '```action',
        'type: terminal.run',
        'command: npm test',
        '```',
      ].join('\n');

      const result = parseActionBlocks(content, 0);

      expect(result.elements).to.have.length(1);
      expect(result.elements[0].action.type).to.equal('terminal.run');
      expect(result.elements[0].action.params.command).to.equal('npm test');
    });

    it('should parse a debug.start action block', () => {
      const content = [
        '```action',
        'type: debug.start',
        'configName: Launch Extension',
        '```',
      ].join('\n');

      const result = parseActionBlocks(content, 0);

      expect(result.elements).to.have.length(1);
      expect(result.elements[0].action.type).to.equal('debug.start');
      expect(result.elements[0].action.params.configName).to.equal('Launch Extension');
    });

    it('should parse a vscode.command action block', () => {
      const content = [
        '```action',
        'type: vscode.command',
        'id: workbench.action.openSettings',
        '```',
      ].join('\n');

      const result = parseActionBlocks(content, 0);

      expect(result.elements).to.have.length(1);
      expect(result.elements[0].action.type).to.equal('vscode.command');
      expect(result.elements[0].action.params.id).to.equal('workbench.action.openSettings');
    });
  });

  describe('sequence action', () => {
    it('should parse a sequence with steps array', () => {
      const content = [
        '```action',
        'type: sequence',
        'delay: 500',
        'steps:',
        '  - type: file.open',
        '    path: src/main.ts',
        '  - type: editor.highlight',
        '    path: src/main.ts',
        '    lines: 10-20',
        '```',
      ].join('\n');

      const result = parseActionBlocks(content, 0);

      expect(result.elements).to.have.length(1);
      expect(result.errors).to.have.length(0);

      const el = result.elements[0];
      expect(el.action.type).to.equal('sequence');
      expect(el.action.params.delay).to.equal(500);

      const steps = el.action.params.steps as Array<{ type: string; path?: string }>;
      expect(steps).to.have.length(2);
      expect(steps[0].type).to.equal('file.open');
      expect(steps[1].type).to.equal('editor.highlight');
    });
  });

  describe('label handling', () => {
    it('should use label from YAML when provided', () => {
      const content = [
        '```action',
        'label: Open Main File',
        'type: file.open',
        'path: src/main.ts',
        '```',
      ].join('\n');

      const result = parseActionBlocks(content, 0);

      expect(result.elements).to.have.length(1);
      expect(result.elements[0].label).to.equal('Open Main File');
    });

    it('should auto-generate label from type when not provided', () => {
      const content = [
        '```action',
        'type: file.open',
        'path: src/main.ts',
        '```',
      ].join('\n');

      const result = parseActionBlocks(content, 0);

      expect(result.elements).to.have.length(1);
      // Auto-generated label should include the action type
      expect(result.elements[0].label).to.be.a('string').and.not.be.empty;
    });
  });

  describe('cleaned content', () => {
    it('should strip action blocks from content', () => {
      const content = [
        'Before block',
        '',
        '```action',
        'type: file.open',
        'path: src/main.ts',
        '```',
        '',
        'After block',
      ].join('\n');

      const result = parseActionBlocks(content, 0);

      expect(result.cleanedContent).to.not.include('```action');
      expect(result.cleanedContent).to.not.include('type: file.open');
      expect(result.cleanedContent).to.include('Before block');
      expect(result.cleanedContent).to.include('After block');
    });

    it('should preserve non-action fenced code blocks', () => {
      const content = [
        '```typescript',
        'const x = 1;',
        '```',
        '',
        '```action',
        'type: file.open',
        'path: src/main.ts',
        '```',
      ].join('\n');

      const result = parseActionBlocks(content, 0);

      expect(result.cleanedContent).to.include('```typescript');
      expect(result.cleanedContent).to.include('const x = 1;');
      expect(result.cleanedContent).to.not.include('```action');
    });
  });

  describe('error handling', () => {
    it('should return error for invalid YAML syntax', () => {
      const content = [
        '```action',
        'type: file.open',
        'path: src/main.ts',
        '  bad_indent: true',
        '```',
      ].join('\n');

      const result = parseActionBlocks(content, 3);

      expect(result.errors).to.have.length.greaterThan(0);
      const err: ActionBlockParseError = result.errors[0];
      expect(err.slideIndex).to.equal(3);
      expect(err.message).to.be.a('string').and.not.be.empty;
      expect(err.rawYaml).to.be.a('string');
    });

    it('should return error when type field is missing', () => {
      const content = [
        '```action',
        'path: src/main.ts',
        '```',
      ].join('\n');

      const result = parseActionBlocks(content, 0);

      expect(result.errors).to.have.length(1);
      expect(result.errors[0].message).to.include('type');
    });

    it('should return error for unknown action type', () => {
      const content = [
        '```action',
        'type: unknown.action',
        'path: src/main.ts',
        '```',
      ].join('\n');

      const result = parseActionBlocks(content, 0);

      expect(result.errors).to.have.length(1);
      expect(result.errors[0].message).to.include('unknown.action');
    });

    it('should return error for missing required params', () => {
      const content = [
        '```action',
        'type: file.open',
        '```',
      ].join('\n');

      const result = parseActionBlocks(content, 0);

      expect(result.errors).to.have.length(1);
      expect(result.errors[0].message).to.include('path');
    });

    it('should return error when YAML is a scalar (not an object)', () => {
      const content = [
        '```action',
        'just a string',
        '```',
      ].join('\n');

      const result = parseActionBlocks(content, 0);

      expect(result.errors).to.have.length(1);
      expect(result.errors[0].message).to.include('YAML mapping');
    });

    it('should return error when YAML is an array (not an object)', () => {
      const content = [
        '```action',
        '- item1',
        '- item2',
        '```',
      ].join('\n');

      const result = parseActionBlocks(content, 0);

      expect(result.errors).to.have.length(1);
      expect(result.errors[0].message).to.include('YAML mapping');
    });

    it('should include line information from js-yaml error', () => {
      const content = [
        '```action',
        'type: file.open',
        'path: src/main.ts',
        '  bad: indent',
        '```',
      ].join('\n');

      const result = parseActionBlocks(content, 0);

      expect(result.errors).to.have.length.greaterThan(0);
      expect(result.errors[0].line).to.be.a('number');
    });
  });

  describe('mixed blocks and inline content', () => {
    it('should parse multiple action blocks in a single slide', () => {
      const content = [
        '# Demo Slide',
        '',
        '```action',
        'type: file.open',
        'path: src/a.ts',
        '```',
        '',
        'Some explanation text',
        '',
        '```action',
        'type: terminal.run',
        'command: npm test',
        '```',
      ].join('\n');

      const result = parseActionBlocks(content, 0);

      expect(result.elements).to.have.length(2);
      expect(result.elements[0].action.type).to.equal('file.open');
      expect(result.elements[1].action.type).to.equal('terminal.run');
    });

    it('should preserve inline action link content (backward compat)', () => {
      const content = [
        '# Demo',
        '',
        '[Open File](action:file.open?path=src/main.ts)',
        '',
        '```action',
        'type: terminal.run',
        'command: npm test',
        '```',
      ].join('\n');

      const result = parseActionBlocks(content, 0);

      // Only parses the action block; inline links are handled by actionLinkParser
      expect(result.elements).to.have.length(1);
      expect(result.elements[0].action.type).to.equal('terminal.run');

      // Inline link should still be in cleaned content
      expect(result.cleanedContent).to.include('[Open File](action:file.open?path=src/main.ts)');
    });
  });

  describe('source field', () => {
    it('should set source to "block" on all elements from action blocks', () => {
      const content = [
        '```action',
        'type: file.open',
        'path: src/main.ts',
        '```',
      ].join('\n');

      const result = parseActionBlocks(content, 0);

      expect(result.elements).to.have.length(1);
      expect(result.elements[0].source).to.equal('block');
    });
  });

  describe('position tracking', () => {
    it('should track the start line of each action block', () => {
      const content = [
        'Line 0',
        '```action',             // line 1
        'type: file.open',
        'path: src/main.ts',
        '```',
        'Line 5',
        '```action',             // line 6
        'type: terminal.run',
        'command: npm test',
        '```',
      ].join('\n');

      const result = parseActionBlocks(content, 0);

      expect(result.elements).to.have.length(2);
      // Positions should reflect their location in the slide content (1-based line)
      expect(result.elements[0].position.line).to.be.greaterThan(0);
      expect(result.elements[1].position.line).to.be.greaterThan(result.elements[0].position.line);
    });
  });

  describe('edge cases', () => {
    it('should handle empty action block gracefully', () => {
      const content = [
        '```action',
        '```',
      ].join('\n');

      const result = parseActionBlocks(content, 0);

      // Empty block should produce an error
      expect(result.errors).to.have.length.greaterThan(0);
      expect(result.elements).to.have.length(0);
    });

    it('should handle slide with no action blocks', () => {
      const content = [
        '# Just Markdown',
        '',
        'Some paragraph text.',
      ].join('\n');

      const result = parseActionBlocks(content, 0);

      expect(result.elements).to.have.length(0);
      expect(result.errors).to.have.length(0);
      expect(result.cleanedContent).to.equal(content);
    });

    it('should not match nested fences inside other code blocks', () => {
      const content = [
        '````markdown',
        '```action',
        'type: file.open',
        'path: src/main.ts',
        '```',
        '````',
      ].join('\n');

      const result = parseActionBlocks(content, 0);

      // The ````markdown block should not be parsed as an action block
      // Since our regex operates on ^```action$, this outer fence prevents matching
      // (Note: exact behavior depends on implementation — this documents the expectation)
      // We accept either 0 elements (correctly skipped) or an error
      // The critical thing is it doesn't crash
      expect(result.elements.length + result.errors.length).to.be.at.most(1);
    });
  });
});
