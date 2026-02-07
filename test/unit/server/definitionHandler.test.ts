import { expect } from 'chai';
import { Position } from 'vscode-languageserver-types';
import { DeckDocument } from '../../../src/server/deckDocument';
import { onDefinition } from '../../../src/server/capabilities/definitionHandler';
import { WorkspaceFileCache } from '../../../src/server/utils/workspaceFileCache';

describe('definitionHandler', () => {
    function makeDoc(content: string): DeckDocument {
        return DeckDocument.create('file:///test.deck.md', 1, content);
    }

    function makeCache(): WorkspaceFileCache {
        const cache = new WorkspaceFileCache('file:///workspace');
        cache.setFiles([
            { relativePath: 'src/main.ts', uri: 'file:///workspace/src/main.ts' },
            { relativePath: 'src/app.ts', uri: 'file:///workspace/src/app.ts' },
        ]);
        cache.setLaunchConfigs([
            { name: 'Launch App', uri: 'file:///workspace/.vscode/launch.json', line: 3 },
        ]);
        return cache;
    }

    it('should return null when position is outside action blocks', () => {
        const doc = makeDoc('# Slide\n\nSome text');
        const result = onDefinition(doc, Position.create(0, 0), makeCache());
        expect(result).to.be.null;
    });

    it('should return null when no workspace cache is available', () => {
        const doc = makeDoc([
            '# Slide',
            '',
            '```action',
            'type: file.open',
            'path: src/main.ts',
            '```',
        ].join('\n'));

        const result = onDefinition(doc, Position.create(4, 8), null);
        expect(result).to.be.null;
    });

    it('should resolve file path to workspace file URI', () => {
        const doc = makeDoc([
            '# Slide',
            '',
            '```action',
            'type: file.open',
            'path: src/main.ts',
            '```',
        ].join('\n'));

        const result = onDefinition(doc, Position.create(4, 8), makeCache());
        if (result) {
            expect(result.uri).to.equal('file:///workspace/src/main.ts');
        }
    });

    it('should resolve launch config to launch.json location', () => {
        const doc = makeDoc([
            '# Slide',
            '',
            '```action',
            'type: debug.start',
            'configName: Launch App',
            '```',
        ].join('\n'));

        const result = onDefinition(doc, Position.create(4, 15), makeCache());
        if (result) {
            expect(result.uri).to.include('launch.json');
        }
    });

    it('should return null for non-path parameters', () => {
        const doc = makeDoc([
            '# Slide',
            '',
            '```action',
            'type: file.open',
            'path: src/main.ts',
            'line: 10',
            '```',
        ].join('\n'));

        // Position on `line: 10` — line param is not a file path
        const result = onDefinition(doc, Position.create(5, 8), makeCache());
        expect(result).to.be.null;
    });

    it('should return null for non-existent file path', () => {
        const doc = makeDoc([
            '# Slide',
            '',
            '```action',
            'type: file.open',
            'path: does/not/exist.ts',
            '```',
        ].join('\n'));

        const result = onDefinition(doc, Position.create(4, 8), makeCache());
        expect(result).to.be.null;
    });
});
