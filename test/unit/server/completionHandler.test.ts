import { expect } from 'chai';
import { Position } from 'vscode-languageserver-types';
import { CompletionParams } from 'vscode-languageserver-protocol';
import { DeckDocument } from '../../../src/server/deckDocument';
import { onCompletion } from '../../../src/server/capabilities/completionHandler';

describe('completionHandler', () => {
    function makeDoc(content: string): DeckDocument {
        return DeckDocument.create('file:///test.deck.md', 1, content);
    }

    function makeParams(line: number, character: number): CompletionParams {
        return {
            textDocument: { uri: 'file:///test.deck.md' },
            position: Position.create(line, character),
        };
    }

    it('should return null outside action blocks', () => {
        const doc = makeDoc('# Slide\n\nSome text');
        const result = onCompletion(doc, makeParams(0, 0));
        expect(result).to.be.null;
    });

    it('should offer type completions on the type: line', () => {
        const doc = makeDoc([
            '# Slide',
            '',
            '```action',
            'type: ',
            '```',
        ].join('\n'));

        const result = onCompletion(doc, makeParams(3, 6));
        expect(result).to.not.be.null;
        if (result) {
            const labels = result.map(i => i.label);
            expect(labels).to.include('file.open');
            expect(labels).to.include('terminal.run');
            expect(labels).to.include('sequence');
        }
    });

    it('should offer param name completions on empty line', () => {
        const doc = makeDoc([
            '# Slide',
            '',
            '```action',
            'type: file.open',
            '',
            '```',
        ].join('\n'));

        const result = onCompletion(doc, makeParams(4, 0));
        expect(result).to.not.be.null;
        if (result) {
            const labels = result.map(i => i.label);
            expect(labels).to.include('path');
        }
    });

    it('should offer param value completions for enum params', () => {
        const doc = makeDoc([
            '# Slide',
            '',
            '```action',
            'type: editor.highlight',
            'path: src/main.ts',
            'lines: "10-20"',
            'style: ',
            '```',
        ].join('\n'));

        const result = onCompletion(doc, makeParams(6, 7));
        expect(result).to.not.be.null;
        if (result) {
            const labels = result.map(i => i.label);
            expect(labels).to.include('subtle');
            expect(labels).to.include('prominent');
        }
    });

    it('should not offer already-existing params', () => {
        const doc = makeDoc([
            '# Slide',
            '',
            '```action',
            'type: file.open',
            'path: src/main.ts',
            '',
            '```',
        ].join('\n'));

        const result = onCompletion(doc, makeParams(5, 0));
        expect(result).to.not.be.null;
        if (result) {
            const labels = result.map(i => i.label);
            // 'path' is already used, should not appear again
            expect(labels).to.not.include('path');
        }
    });
});
