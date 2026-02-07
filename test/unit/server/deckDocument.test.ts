import { expect } from 'chai';
import { DeckDocument } from '../../../src/server/deckDocument';
import { Position } from 'vscode-languageserver-types';

describe('DeckDocument', () => {
    describe('create', () => {
        it('should parse a single-slide document', () => {
            const content = '# Hello World\n\nSome content.';
            const doc = DeckDocument.create('file:///test.deck.md', 1, content);

            expect(doc.slides.length).to.equal(1);
            expect(doc.slides[0].index).to.equal(0);
            expect(doc.slides[0].title).to.equal('Hello World');
        });

        it('should parse multiple slides separated by ---', () => {
            const content = '# Slide 1\n\nContent 1\n\n---\n\n# Slide 2\n\nContent 2';
            const doc = DeckDocument.create('file:///test.deck.md', 1, content);

            expect(doc.slides.length).to.equal(2);
            expect(doc.slides[0].title).to.equal('Slide 1');
            expect(doc.slides[1].title).to.equal('Slide 2');
        });

        it('should detect YAML frontmatter', () => {
            const content = '---\ntitle: My Deck\n---\n\n# First Slide';
            const doc = DeckDocument.create('file:///test.deck.md', 1, content);

            expect(doc.frontmatterRange).to.not.be.undefined;
            expect(doc.frontmatterRange!.start.line).to.equal(0);
        });

        it('should parse action blocks', () => {
            const content = [
                '# Slide 1',
                '',
                '```action',
                'type: file.open',
                'path: src/main.ts',
                '```',
            ].join('\n');

            const doc = DeckDocument.create('file:///test.deck.md', 1, content);
            expect(doc.slides[0].actionBlocks.length).to.equal(1);

            const block = doc.slides[0].actionBlocks[0];
            expect(block.actionType).to.equal('file.open');
            expect(block.unclosed).to.be.false;
        });

        it('should detect unclosed action blocks', () => {
            const content = [
                '# Slide 1',
                '',
                '```action',
                'type: file.open',
                'path: src/main.ts',
                // No closing ```
            ].join('\n');

            const doc = DeckDocument.create('file:///test.deck.md', 1, content);
            expect(doc.slides[0].actionBlocks.length).to.equal(1);
            expect(doc.slides[0].actionBlocks[0].unclosed).to.be.true;
        });

        it('should parse inline action links', () => {
            const content = '# Slide\n\n[Open File](action:file.open?path=src/main.ts)';
            const doc = DeckDocument.create('file:///test.deck.md', 1, content);

            expect(doc.slides[0].actionLinks.length).to.equal(1);
            const link = doc.slides[0].actionLinks[0];
            expect(link.type).to.equal('file.open');
            expect(link.label).to.equal('Open File');
        });

        it('should parse render directives', () => {
            const content = '# Slide\n\n[](render:file?path=src/main.ts)';
            const doc = DeckDocument.create('file:///test.deck.md', 1, content);

            expect(doc.slides[0].renderDirectives.length).to.equal(1);
            expect(doc.slides[0].renderDirectives[0].type).to.equal('file');
        });

        it('should parse sequence action blocks with steps', () => {
            const content = [
                '# Slide',
                '',
                '```action',
                'type: sequence',
                'steps:',
                '  - type: file.open',
                '    path: src/a.ts',
                '  - type: editor.highlight',
                '    path: src/a.ts',
                '    lines: "10-20"',
                '```',
            ].join('\n');

            const doc = DeckDocument.create('file:///test.deck.md', 1, content);
            const block = doc.slides[0].actionBlocks[0];
            expect(block.actionType).to.equal('sequence');
            expect(block.steps.length).to.equal(2);
            expect(block.steps[0].actionType).to.equal('file.open');
            expect(block.steps[1].actionType).to.equal('editor.highlight');
        });
    });

    describe('applyChange', () => {
        it('should return a new document with updated content', () => {
            const content = '# Slide 1\n\nOld content';
            const doc = DeckDocument.create('file:///test.deck.md', 1, content);

            const newContent = '# Slide 1\n\nNew content';
            const updated = DeckDocument.applyChange(doc, 2, newContent);

            expect(updated.version).to.equal(2);
            expect(updated.content).to.equal(newContent);
        });
    });

    describe('getLine / lineCount', () => {
        it('should return correct line count', () => {
            const doc = DeckDocument.create('file:///test.deck.md', 1, 'a\nb\nc');
            expect(doc.lineCount).to.equal(3);
        });

        it('should return correct line text', () => {
            const doc = DeckDocument.create('file:///test.deck.md', 1, 'line0\nline1\nline2');
            expect(doc.getLine(0)).to.equal('line0');
            expect(doc.getLine(1)).to.equal('line1');
            expect(doc.getLine(2)).to.equal('line2');
        });

        it('should return empty string for out-of-bounds line', () => {
            const doc = DeckDocument.create('file:///test.deck.md', 1, 'hello');
            expect(doc.getLine(99)).to.equal('');
        });
    });

    describe('findSlideAt', () => {
        it('should find the correct slide by position', () => {
            const content = '# Slide 1\n\n---\n\n# Slide 2';
            const doc = DeckDocument.create('file:///test.deck.md', 1, content);

            const s1 = doc.findSlideAt(Position.create(0, 0));
            expect(s1).to.not.be.undefined;
            expect(s1!.index).to.equal(0);

            const s2 = doc.findSlideAt(Position.create(4, 0));
            expect(s2).to.not.be.undefined;
            expect(s2!.index).to.equal(1);
        });
    });

    describe('findActionBlockAt', () => {
        it('should find action block at position inside block', () => {
            const content = [
                '# Slide',
                '',
                '```action',
                'type: file.open',
                'path: src/main.ts',
                '```',
            ].join('\n');

            const doc = DeckDocument.create('file:///test.deck.md', 1, content);
            const block = doc.findActionBlockAt(Position.create(3, 5));
            expect(block).to.not.be.undefined;
            expect(block!.actionType).to.equal('file.open');
        });

        it('should return undefined when outside action blocks', () => {
            const content = '# Slide\n\nSome text';
            const doc = DeckDocument.create('file:///test.deck.md', 1, content);
            const block = doc.findActionBlockAt(Position.create(0, 0));
            expect(block).to.be.undefined;
        });
    });

    describe('parameters', () => {
        it('should extract parameter ranges with correct keys', () => {
            const content = [
                '# Slide',
                '',
                '```action',
                'type: file.open',
                'path: src/main.ts',
                'line: 10',
                '```',
            ].join('\n');

            const doc = DeckDocument.create('file:///test.deck.md', 1, content);
            const block = doc.slides[0].actionBlocks[0];
            const paramKeys = block.parameters.map(p => p.key);
            expect(paramKeys).to.include('path');
            expect(paramKeys).to.include('line');
        });
    });
});
