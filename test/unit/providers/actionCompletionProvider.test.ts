/**
 * Unit tests for ActionCompletionProvider
 * Per T033 — Tests written FIRST, must FAIL before implementation.
 */

import { expect } from 'chai';

// This import will FAIL until T037 is implemented
import { ActionCompletionProvider } from '../../../src/providers/actionCompletionProvider';

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
  };
}

describe('ActionCompletionProvider', () => {
  let provider: ActionCompletionProvider;

  beforeEach(() => {
    provider = new ActionCompletionProvider();
  });

  it('should suggest all 6 action types when cursor is after type:', () => {
    const doc = mockDocument([
      '```action',
      'type: ',
      '```',
    ]);

    const items = provider.provideCompletionItems(
      doc as any,
      { line: 1, character: 6 } as any,
      {} as any,
      {} as any,
    );

    expect(items).to.not.be.null;
    const completionItems = items as any[];
    expect(completionItems.length).to.be.greaterThanOrEqual(6);

    const labels = completionItems.map((item: any) => item.label);
    expect(labels).to.include('file.open');
    expect(labels).to.include('editor.highlight');
    expect(labels).to.include('terminal.run');
    expect(labels).to.include('debug.start');
    expect(labels).to.include('sequence');
    expect(labels).to.include('vscode.command');
  });

  it('should suggest parameters scoped to the selected type (file.open)', () => {
    const doc = mockDocument([
      '```action',
      'type: file.open',
      '',
      '```',
    ]);

    const items = provider.provideCompletionItems(
      doc as any,
      { line: 2, character: 0 } as any,
      {} as any,
      {} as any,
    );

    expect(items).to.not.be.null;
    const completionItems = items as any[];
    const labels = completionItems.map((item: any) => item.label);
    expect(labels).to.include('path');
  });

  it('should not provide completions outside action blocks', () => {
    const doc = mockDocument([
      '# Regular Markdown',
      'Some content',
    ]);

    const items = provider.provideCompletionItems(
      doc as any,
      { line: 1, character: 0 } as any,
      {} as any,
      {} as any,
    );

    expect(items).to.satisfy((v: any) => v === null || v === undefined || (Array.isArray(v) && v.length === 0));
  });

  it('should include trigger characters : and /', () => {
    const triggers = provider.triggerCharacters;
    expect(triggers).to.include(':');
    expect(triggers).to.include('/');
  });

  it('should suggest parameters for terminal.run type', () => {
    const doc = mockDocument([
      '```action',
      'type: terminal.run',
      '',
      '```',
    ]);

    const items = provider.provideCompletionItems(
      doc as any,
      { line: 2, character: 0 } as any,
      {} as any,
      {} as any,
    );

    const completionItems = items as any[];
    const labels = completionItems.map((item: any) => item.label);
    expect(labels).to.include('command');
  });
});
