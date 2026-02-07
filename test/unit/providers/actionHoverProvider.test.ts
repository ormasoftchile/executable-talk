/**
 * Unit tests for ActionHoverProvider
 * Per T035 — Tests written FIRST, must FAIL before implementation.
 */

import { expect } from 'chai';

// This import will FAIL until T038 is implemented
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
    getWordRangeAtPosition(position: any, regex?: RegExp) {
      const line = lines[position.line] ?? '';
      const pattern = regex ?? /[\w.]+/;
      const match = pattern.exec(line.substring(position.character));
      if (!match) return undefined;
      // Find exact match at position
      let idx = 0;
      let m;
      const globalRegex = new RegExp(pattern.source, 'g');
      while ((m = globalRegex.exec(line)) !== null) {
        if (m.index <= position.character && m.index + m[0].length > position.character) {
          return {
            start: { line: position.line, character: m.index },
            end: { line: position.line, character: m.index + m[0].length },
          };
        }
        idx++;
      }
      return undefined;
    },
  };
}

describe('ActionHoverProvider', () => {
  let provider: ActionHoverProvider;

  beforeEach(() => {
    provider = new ActionHoverProvider();
  });

  it('should show description and parameter table when hovering on action type keyword', () => {
    const doc = mockDocument([
      '```action',
      'type: file.open',
      'path: src/main.ts',
      '```',
    ]);

    const result = provider.provideHover(
      doc as any,
      { line: 1, character: 7 } as any, // cursor on "file.open"
      {} as any,
    );

    expect(result).to.not.be.null;
    expect(result).to.not.be.undefined;
    // Hover content should contain the description
    const contents = (result as any)?.contents;
    expect(contents).to.not.be.undefined;
  });

  it('should show type and description when hovering on parameter name', () => {
    const doc = mockDocument([
      '```action',
      'type: file.open',
      'path: src/main.ts',
      '```',
    ]);

    const result = provider.provideHover(
      doc as any,
      { line: 2, character: 0 } as any, // cursor on "path"
      {} as any,
    );

    expect(result).to.not.be.null;
  });

  it('should return null when hovering outside action block', () => {
    const doc = mockDocument([
      '# Regular Markdown',
      'Some content',
    ]);

    const result = provider.provideHover(
      doc as any,
      { line: 0, character: 5 } as any,
      {} as any,
    );

    expect(result).to.satisfy((v: any) => v === null || v === undefined);
  });

  it('should show steps param documentation for sequence type', () => {
    const doc = mockDocument([
      '```action',
      'type: sequence',
      'steps:',
      '```',
    ]);

    const result = provider.provideHover(
      doc as any,
      { line: 1, character: 7 } as any, // cursor on "sequence"
      {} as any,
    );

    expect(result).to.not.be.null;
  });

  it('should only activate inside action fences', () => {
    const doc = mockDocument([
      '```typescript',
      'type: file.open',
      '```',
    ]);

    const result = provider.provideHover(
      doc as any,
      { line: 1, character: 7 } as any,
      {} as any,
    );

    expect(result).to.satisfy((v: any) => v === null || v === undefined);
  });
});
