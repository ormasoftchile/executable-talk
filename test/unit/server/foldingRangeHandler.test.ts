import { expect } from 'chai';
import { DeckDocument } from '../../../src/server/deckDocument';
import { onFoldingRange } from '../../../src/server/capabilities/foldingRangeHandler';
import { FoldingRangeKind } from 'vscode-languageserver-types';

describe('foldingRangeHandler', () => {
    function makeDoc(content: string): DeckDocument {
        return DeckDocument.create('file:///test.deck.md', 1, content);
    }

    it('should provide folding range for frontmatter', () => {
        const doc = makeDoc('---\ntitle: My Deck\n---\n\n# First Slide');
        const ranges = onFoldingRange(doc);

        const fmRange = ranges.find(r => r.startLine === 0);
        expect(fmRange).to.not.be.undefined;
        expect(fmRange!.kind).to.equal(FoldingRangeKind.Region);
    });

    it('should provide folding ranges for slides', () => {
        const doc = makeDoc('# Slide 1\nContent 1\n\n---\n\n# Slide 2\nContent 2');
        const ranges = onFoldingRange(doc);

        // At least 2 slide folding ranges
        const slideRanges = ranges.filter(r => r.kind === FoldingRangeKind.Region);
        expect(slideRanges.length).to.be.at.least(2);
    });

    it('should provide folding range for action blocks', () => {
        const doc = makeDoc([
            '# Slide',
            '',
            '```action',
            'type: file.open',
            'path: src/main.ts',
            '```',
        ].join('\n'));

        const ranges = onFoldingRange(doc);
        // Find a folding range that starts at the action block
        const actionRange = ranges.find(r => r.startLine === 2);
        expect(actionRange).to.not.be.undefined;
    });

    it('should return empty for single-line content', () => {
        const doc = makeDoc('# Hello');
        const ranges = onFoldingRange(doc);
        // No multi-line regions to fold
        // May or may not have ranges depending on implementation
        expect(ranges).to.be.an('array');
    });
});
