import { expect } from 'chai';
import { DeckDocument } from '../../../src/server/deckDocument';
import { onDocumentSymbol } from '../../../src/server/capabilities/documentSymbolHandler';
import { SymbolKind } from 'vscode-languageserver-types';

describe('documentSymbolHandler', () => {
    function makeDoc(content: string): DeckDocument {
        return DeckDocument.create('file:///test.deck.md', 1, content);
    }

    it('should return one Module symbol per slide', () => {
        const doc = makeDoc('# Slide 1\n\n---\n\n# Slide 2');
        const symbols = onDocumentSymbol(doc);

        expect(symbols.length).to.equal(2);
        expect(symbols[0].kind).to.equal(SymbolKind.Module);
        expect(symbols[0].name).to.equal('Slide 1');
        expect(symbols[1].name).to.equal('Slide 2');
    });

    it('should use "Slide N" when no title is found', () => {
        const doc = makeDoc('Some content\n\n---\n\nMore content');
        const symbols = onDocumentSymbol(doc);

        expect(symbols[0].name).to.match(/Slide \d+/);
    });

    it('should nest action blocks as Function symbols', () => {
        const doc = makeDoc([
            '# Slide',
            '',
            '```action',
            'type: file.open',
            'path: src/main.ts',
            '```',
        ].join('\n'));

        const symbols = onDocumentSymbol(doc);
        expect(symbols.length).to.equal(1);
        const slideSymbol = symbols[0];
        expect(slideSymbol.children).to.not.be.undefined;
        expect(slideSymbol.children!.length).to.equal(1);
        expect(slideSymbol.children![0].kind).to.equal(SymbolKind.Function);
        expect(slideSymbol.children![0].name).to.include('file.open');
    });

    it('should nest sequence steps as Event symbols', () => {
        const doc = makeDoc([
            '# Slide',
            '',
            '```action',
            'type: sequence',
            'steps:',
            '  - type: file.open',
            '    path: src/a.ts',
            '  - type: terminal.run',
            '    command: echo hi',
            '```',
        ].join('\n'));

        const symbols = onDocumentSymbol(doc);
        const actionSymbol = symbols[0].children![0];
        expect(actionSymbol.children).to.not.be.undefined;
        expect(actionSymbol.children!.length).to.equal(2);
        expect(actionSymbol.children![0].kind).to.equal(SymbolKind.Event);
        expect(actionSymbol.children![0].name).to.include('file.open');
    });

    it('should include render directives as Object symbols', () => {
        const doc = makeDoc('# Slide\n\n[](render:file?path=src/main.ts)');
        const symbols = onDocumentSymbol(doc);
        const slideSymbol = symbols[0];

        expect(slideSymbol.children).to.not.be.undefined;
        const renderSymbols = slideSymbol.children!.filter(s => s.kind === SymbolKind.Object);
        expect(renderSymbols.length).to.equal(1);
        expect(renderSymbols[0].name).to.include('render: file');
    });

    it('should return empty array for empty document', () => {
        const doc = makeDoc('');
        const symbols = onDocumentSymbol(doc);
        expect(symbols.length).to.be.at.least(0);
    });
});
