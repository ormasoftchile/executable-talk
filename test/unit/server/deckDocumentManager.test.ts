import { expect } from 'chai';
import { DeckDocumentManager } from '../../../src/server/deckDocumentManager';

describe('DeckDocumentManager', () => {
    let manager: DeckDocumentManager;

    beforeEach(() => {
        manager = new DeckDocumentManager();
    });

    afterEach(() => {
        manager.dispose();
    });

    it('should open and retrieve a document', () => {
        manager.open('file:///test.deck.md', 1, '# Slide 1');
        const doc = manager.get('file:///test.deck.md');
        expect(doc).to.not.be.undefined;
        expect(doc!.slides.length).to.equal(1);
    });

    it('should report has correctly', () => {
        expect(manager.has('file:///test.deck.md')).to.be.false;
        manager.open('file:///test.deck.md', 1, '# Slide');
        expect(manager.has('file:///test.deck.md')).to.be.true;
    });

    it('should update a document', () => {
        manager.open('file:///test.deck.md', 1, '# Slide 1');
        manager.update('file:///test.deck.md', 2, [], '# Slide 1\n\n---\n\n# Slide 2');
        const doc = manager.get('file:///test.deck.md');
        expect(doc!.slides.length).to.equal(2);
        expect(doc!.version).to.equal(2);
    });

    it('should close and remove a document', () => {
        manager.open('file:///test.deck.md', 1, '# Slide');
        manager.close('file:///test.deck.md');
        expect(manager.has('file:///test.deck.md')).to.be.false;
    });

    it('should list all keys', () => {
        manager.open('file:///a.deck.md', 1, '# A');
        manager.open('file:///b.deck.md', 1, '# B');
        const keys = Array.from(manager.keys());
        expect(keys).to.include('file:///a.deck.md');
        expect(keys).to.include('file:///b.deck.md');
    });

    it('should dispose all documents', () => {
        manager.open('file:///a.deck.md', 1, '# A');
        manager.open('file:///b.deck.md', 1, '# B');
        manager.dispose();
        expect(manager.has('file:///a.deck.md')).to.be.false;
        expect(manager.has('file:///b.deck.md')).to.be.false;
    });
});
