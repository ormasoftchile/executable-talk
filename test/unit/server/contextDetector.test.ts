import { expect } from 'chai';
import { Position } from 'vscode-languageserver-types';
import { DeckDocument } from '../../../src/server/deckDocument';
import { detectContext } from '../../../src/server/contextDetector';

describe('contextDetector', () => {
    function makeDoc(content: string): DeckDocument {
        return DeckDocument.create('file:///test.deck.md', 1, content);
    }

    it('should return unknown for positions outside action blocks', () => {
        const doc = makeDoc('# Slide\n\nSome text');
        const ctx = detectContext(doc, Position.create(0, 0));
        expect(ctx.kind).to.equal('unknown');
    });

    it('should detect type-value context on the type: line', () => {
        const doc = makeDoc([
            '# Slide',
            '',
            '```action',
            'type: file',
            '```',
        ].join('\n'));

        const ctx = detectContext(doc, Position.create(3, 10));
        expect(ctx.kind).to.equal('type-value');
        if (ctx.kind === 'type-value') {
            expect(ctx.partialValue).to.equal('file');
        }
    });

    it('should detect param-value context on a param line', () => {
        const doc = makeDoc([
            '# Slide',
            '',
            '```action',
            'type: file.open',
            'path: src/ma',
            '```',
        ].join('\n'));

        const ctx = detectContext(doc, Position.create(4, 10));
        expect(ctx.kind).to.equal('param-value');
        if (ctx.kind === 'param-value') {
            expect(ctx.paramName).to.equal('path');
            expect(ctx.actionType).to.equal('file.open');
        }
    });

    it('should detect param-name context on an empty line inside block', () => {
        const doc = makeDoc([
            '# Slide',
            '',
            '```action',
            'type: file.open',
            '',
            '```',
        ].join('\n'));

        const ctx = detectContext(doc, Position.create(4, 0));
        expect(ctx.kind).to.equal('param-name');
        if (ctx.kind === 'param-name') {
            expect(ctx.actionType).to.equal('file.open');
        }
    });

    it('should detect type-value context when no type is set', () => {
        const doc = makeDoc([
            '# Slide',
            '',
            '```action',
            '',
            '```',
        ].join('\n'));

        const ctx = detectContext(doc, Position.create(3, 0));
        expect(ctx.kind).to.equal('type-value');
    });

    it('should detect step-context inside a sequence block', () => {
        const doc = makeDoc([
            '# Slide',
            '',
            '```action',
            'type: sequence',
            'steps:',
            '  - type: file.open',
            '    path: src/main.ts',
            '```',
        ].join('\n'));

        const ctx = detectContext(doc, Position.create(6, 10));
        expect(ctx.kind).to.equal('step-context');
    });
});
