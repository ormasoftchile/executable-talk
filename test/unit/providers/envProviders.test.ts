/**
 * Unit tests for env authoring assistance (T041 + T042)
 *
 * T041: Env completion tests
 * T042: Env hover tests
 */

import { expect } from 'chai';
import { ActionCompletionProvider } from '../../../src/providers/actionCompletionProvider';
import { ActionHoverProvider } from '../../../src/providers/actionHoverProvider';

/**
 * Mock TextDocument for provider testing.
 */
function mockDocument(lines: string[]): {
  lineCount: number;
  lineAt(line: number): { text: string };
  getText(): string;
  uri: { fsPath: string };
  languageId: string;
  offsetAt(pos: { line: number; character: number }): number;
  positionAt(offset: number): { line: number; character: number };
  getWordRangeAtPosition(position: any, regex?: RegExp): { start: { line: number; character: number }; end: { line: number; character: number } } | undefined;
} {
  return {
    lineCount: lines.length,
    lineAt(line: number) {
      return { text: lines[line] ?? '' };
    },
    getText() {
      return lines.join('\n');
    },
    uri: { fsPath: '/workspace/demo.deck.md' },
    languageId: 'deck-markdown',
    offsetAt(pos: { line: number; character: number }) {
      let offset = 0;
      for (let i = 0; i < pos.line && i < lines.length; i++) {
        offset += lines[i].length + 1;
      }
      return offset + pos.character;
    },
    positionAt(offset: number) {
      let remaining = offset;
      for (let i = 0; i < lines.length; i++) {
        if (remaining <= lines[i].length) {
          return { line: i, character: remaining };
        }
        remaining -= lines[i].length + 1;
      }
      return { line: lines.length - 1, character: 0 };
    },
    getWordRangeAtPosition(position: any, regex?: RegExp) {
      const line = lines[position.line] ?? '';
      const pattern = regex ?? /[\w.]+/;
      let m;
      const globalRegex = new RegExp(pattern.source, 'g');
      while ((m = globalRegex.exec(line)) !== null) {
        if (m.index <= position.character && m.index + m[0].length > position.character) {
          return {
            start: { line: position.line, character: m.index },
            end: { line: position.line, character: m.index + m[0].length },
          };
        }
      }
      return undefined;
    },
  };
}

// ─────────────────────────────────────────────────
// T041: Env Completion Tests
// ─────────────────────────────────────────────────

describe('ActionCompletionProvider — Env Completions (T041)', () => {
  let provider: ActionCompletionProvider;

  beforeEach(() => {
    provider = new ActionCompletionProvider();
  });

  it('should suggest env declaration properties when inside env: block', () => {
    const doc = mockDocument([
      '---',
      'title: Test',
      'env:',
      '  - ',
      '---',
      '# Slide 1',
    ]);

    const items = provider.provideCompletionItems(
      doc,
      { line: 3, character: 4 },
      null,
      {},
    );

    expect(items).to.not.be.null;
    const labels = items!.map(i => i.label);
    expect(labels).to.include('name');
    expect(labels).to.include('description');
    expect(labels).to.include('required');
    expect(labels).to.include('secret');
    expect(labels).to.include('validate');
    expect(labels).to.include('default');
  });

  it('should suggest validation rules when on validate: line', () => {
    const doc = mockDocument([
      '---',
      'title: Test',
      'env:',
      '  - name: MY_VAR',
      '    validate: ',
      '---',
      '# Slide 1',
    ]);

    const items = provider.provideCompletionItems(
      doc,
      { line: 4, character: 15 },
      null,
      {},
    );

    expect(items).to.not.be.null;
    const labels = items!.map(i => i.label);
    expect(labels).to.include('directory');
    expect(labels).to.include('file');
    expect(labels).to.include('command');
    expect(labels).to.include('url');
    expect(labels).to.include('port');
    expect(labels).to.include('regex:');
  });

  it('should suggest declared variable names when typing {{ in action params', () => {
    const doc = mockDocument([
      '---',
      'title: Test',
      'env:',
      '  - name: PROJECT_ROOT',
      '  - name: API_TOKEN',
      '---',
      '# Slide 1',
      '',
      '```action',
      'type: terminal.run',
      'command: cd {{',
      '```',
    ]);

    const items = provider.provideCompletionItems(
      doc,
      { line: 10, character: 14 },
      null,
      {},
    );

    expect(items).to.not.be.null;
    const labels = items!.map(i => i.label);
    expect(labels).to.include('PROJECT_ROOT');
    expect(labels).to.include('API_TOKEN');
  });

  it('should not suggest env properties outside env: block in frontmatter', () => {
    const doc = mockDocument([
      '---',
      'title: Test',
      '  ',
      '---',
      '# Slide 1',
    ]);

    const items = provider.provideCompletionItems(
      doc,
      { line: 2, character: 2 },
      null,
      {},
    );

    // Should not return env completions (could be null or non-env items)
    if (items) {
      const labels = items.map(i => i.label);
      expect(labels).to.not.include('validate');
      expect(labels).to.not.include('secret');
    }
  });

  it('should not suggest already-set properties in env entry', () => {
    const doc = mockDocument([
      '---',
      'title: Test',
      'env:',
      '  - name: MY_VAR',
      '    description: A var',
      '    ',
      '---',
      '# Slide 1',
    ]);

    const items = provider.provideCompletionItems(
      doc,
      { line: 5, character: 4 },
      null,
      {},
    );

    expect(items).to.not.be.null;
    const labels = items!.map(i => i.label);
    expect(labels).to.not.include('name');
    expect(labels).to.not.include('description');
    expect(labels).to.include('required');
    expect(labels).to.include('secret');
    expect(labels).to.include('validate');
    expect(labels).to.include('default');
  });
});

// ─────────────────────────────────────────────────
// T042: Env Hover Tests
// ─────────────────────────────────────────────────

describe('ActionHoverProvider — Env Hover (T042)', () => {
  let provider: ActionHoverProvider;

  beforeEach(() => {
    provider = new ActionHoverProvider();
  });

  it('should show hover for env: key itself', () => {
    const doc = mockDocument([
      '---',
      'title: Test',
      'env:',
      '  - name: MY_VAR',
      '---',
      '# Slide 1',
    ]);

    const hover = provider.provideHover(
      doc,
      { line: 2, character: 1 },
      null,
    );

    expect(hover).to.not.be.null;
    expect(hover!.contents[0]).to.include('env');
    expect(hover!.contents[0]).to.include('Environment Variables');
  });

  it('should show hover for name property inside env: block', () => {
    const doc = mockDocument([
      '---',
      'title: Test',
      'env:',
      '  - name: MY_VAR',
      '---',
      '# Slide 1',
    ]);

    const hover = provider.provideHover(
      doc,
      { line: 3, character: 5 },
      null,
    );

    expect(hover).to.not.be.null;
    expect(hover!.contents[0]).to.include('name');
    expect(hover!.contents[0]).to.include('{{name}}');
  });

  it('should show hover for secret property with masking explanation', () => {
    const doc = mockDocument([
      '---',
      'title: Test',
      'env:',
      '  - name: TOKEN',
      '    secret: true',
      '---',
      '# Slide 1',
    ]);

    const hover = provider.provideHover(
      doc,
      { line: 4, character: 6 },
      null,
    );

    expect(hover).to.not.be.null;
    expect(hover!.contents[0]).to.include('secret');
    expect(hover!.contents[0]).to.include('mask');
  });

  it('should show hover for validate property with rule documentation', () => {
    const doc = mockDocument([
      '---',
      'title: Test',
      'env:',
      '  - name: MY_PATH',
      '    validate: directory',
      '---',
      '# Slide 1',
    ]);

    const hover = provider.provideHover(
      doc,
      { line: 4, character: 6 },
      null,
    );

    expect(hover).to.not.be.null;
    expect(hover!.contents[0]).to.include('validate');
    expect(hover!.contents[0]).to.include('directory');
    expect(hover!.contents[0]).to.include('file');
    expect(hover!.contents[0]).to.include('command');
  });

  it('should show hover for required property', () => {
    const doc = mockDocument([
      '---',
      'title: Test',
      'env:',
      '  - name: MY_VAR',
      '    required: true',
      '---',
      '# Slide 1',
    ]);

    const hover = provider.provideHover(
      doc,
      { line: 4, character: 6 },
      null,
    );

    expect(hover).to.not.be.null;
    expect(hover!.contents[0]).to.include('required');
  });

  it('should show hover for description property', () => {
    const doc = mockDocument([
      '---',
      'title: Test',
      'env:',
      '  - name: MY_VAR',
      '    description: some desc',
      '---',
      '# Slide 1',
    ]);

    const hover = provider.provideHover(
      doc,
      { line: 4, character: 6 },
      null,
    );

    expect(hover).to.not.be.null;
    expect(hover!.contents[0]).to.include('description');
  });

  it('should show hover for default property', () => {
    const doc = mockDocument([
      '---',
      'title: Test',
      'env:',
      '  - name: MY_VAR',
      '    default: foo',
      '---',
      '# Slide 1',
    ]);

    const hover = provider.provideHover(
      doc,
      { line: 4, character: 5 },
      null,
    );

    expect(hover).to.not.be.null;
    expect(hover!.contents[0]).to.include('default');
  });

  it('should not show env hover outside env: block', () => {
    const doc = mockDocument([
      '---',
      'title: Test',
      'author: Me',
      '---',
      '# Slide 1',
    ]);

    const hover = provider.provideHover(
      doc,
      { line: 2, character: 2 },
      null,
    );

    // Should not return hover (null or non-env hover)
    // author is not an env keyword so should be null
    expect(hover).to.be.null;
  });
});
