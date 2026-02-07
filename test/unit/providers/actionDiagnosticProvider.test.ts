/**
 * Unit tests for ActionDiagnosticProvider
 * Per T034 — Tests written FIRST, must FAIL before implementation.
 */

import { expect } from 'chai';

// This import will FAIL until T039 is implemented
import { ActionDiagnosticProvider } from '../../../src/providers/actionDiagnosticProvider';

/**
 * Mock TextDocument for provider testing.
 */
function mockDocument(lines: string[], uri?: string): {
  lineCount: number;
  lineAt(line: number): { text: string };
  getText(): string;
  uri: { fsPath: string; toString(): string };
  languageId: string;
} {
  const fsPath = uri ?? '/workspace/demo.deck.md';
  return {
    lineCount: lines.length,
    lineAt(line: number) {
      return { text: lines[line] ?? '' };
    },
    getText() {
      return lines.join('\n');
    },
    uri: { fsPath, toString: () => fsPath },
    languageId: 'deck-markdown',
  };
}

describe('ActionDiagnosticProvider', () => {
  let provider: ActionDiagnosticProvider;

  beforeEach(() => {
    provider = new ActionDiagnosticProvider();
  });

  afterEach(() => {
    provider.dispose();
  });

  it('should produce Error diagnostic for unknown action type', () => {
    const doc = mockDocument([
      '```action',
      'type: nonexistent.action',
      '```',
    ]);

    const diagnostics = provider.computeDiagnostics(doc as any);
    expect(diagnostics.length).to.be.greaterThan(0);
    const unknownTypeDiag = diagnostics.find((d: any) =>
      d.message.includes('Unknown action type') || d.message.includes('nonexistent.action')
    );
    expect(unknownTypeDiag).to.not.be.undefined;
  });

  it('should produce Error diagnostic for missing required param', () => {
    const doc = mockDocument([
      '```action',
      'type: file.open',
      '```',
    ]);

    const diagnostics = provider.computeDiagnostics(doc as any);
    // file.open requires 'path'
    const missingParam = diagnostics.find((d: any) =>
      d.message.includes('path') && d.message.toLowerCase().includes('required')
    );
    expect(missingParam).to.not.be.undefined;
  });

  it('should produce Warning diagnostic for unknown param key', () => {
    const doc = mockDocument([
      '```action',
      'type: file.open',
      'path: src/main.ts',
      'unknownParam: value',
      '```',
    ]);

    const diagnostics = provider.computeDiagnostics(doc as any);
    const unknownKey = diagnostics.find((d: any) =>
      d.message.includes('unknownParam')
    );
    expect(unknownKey).to.not.be.undefined;
  });

  it('should produce Error diagnostic for invalid YAML syntax', () => {
    const doc = mockDocument([
      '```action',
      'type: file.open',
      '  bad: - indentation: [',
      '```',
    ]);

    const diagnostics = provider.computeDiagnostics(doc as any);
    expect(diagnostics.length).to.be.greaterThan(0);
  });

  it('should produce no diagnostics for a valid action block', () => {
    const doc = mockDocument([
      '```action',
      'type: file.open',
      'path: src/main.ts',
      '```',
    ]);

    const diagnostics = provider.computeDiagnostics(doc as any);
    expect(diagnostics.length).to.equal(0);
  });

  it('should clear diagnostics (return empty) when no action blocks present', () => {
    const doc = mockDocument([
      '# Just markdown',
      'No action blocks here.',
    ]);

    const diagnostics = provider.computeDiagnostics(doc as any);
    expect(diagnostics.length).to.equal(0);
  });
});
