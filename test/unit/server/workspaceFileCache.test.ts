import { expect } from 'chai';
import { WorkspaceFileCache } from '../../../src/server/utils/workspaceFileCache';

describe('WorkspaceFileCache', () => {
    let cache: WorkspaceFileCache;

    beforeEach(() => {
        cache = new WorkspaceFileCache('file:///workspace');
        cache.setFiles([
            { relativePath: 'src/main.ts', uri: 'file:///workspace/src/main.ts' },
            { relativePath: 'src/utils/helper.ts', uri: 'file:///workspace/src/utils/helper.ts' },
            { relativePath: 'README.md', uri: 'file:///workspace/README.md' },
        ]);
    });

    afterEach(() => {
        cache.dispose();
    });

    describe('filterByPrefix', () => {
        it('should filter files by prefix', () => {
            const results = cache.filterByPrefix('src/');
            expect(results.length).to.equal(2);
        });

        it('should be case-insensitive', () => {
            const results = cache.filterByPrefix('SRC/');
            expect(results.length).to.equal(2);
        });

        it('should return empty for non-matching prefix', () => {
            const results = cache.filterByPrefix('dist/');
            expect(results.length).to.equal(0);
        });
    });

    describe('filterBySubstring', () => {
        it('should filter files containing substring', () => {
            const results = cache.filterBySubstring('helper');
            expect(results.length).to.equal(1);
            expect(results[0].relativePath).to.equal('src/utils/helper.ts');
        });
    });

    describe('resolveUri', () => {
        it('should resolve existing file to URI', () => {
            const uri = cache.resolveUri('src/main.ts');
            expect(uri).to.equal('file:///workspace/src/main.ts');
        });

        it('should return null for non-existent file', () => {
            const uri = cache.resolveUri('does/not/exist.ts');
            expect(uri).to.be.null;
        });

        it('should normalize backslashes', () => {
            const uri = cache.resolveUri('src\\main.ts');
            expect(uri).to.equal('file:///workspace/src/main.ts');
        });
    });

    describe('hasFile', () => {
        it('should return true for existing files', () => {
            expect(cache.hasFile('src/main.ts')).to.be.true;
        });

        it('should return false for non-existent files', () => {
            expect(cache.hasFile('missing.ts')).to.be.false;
        });
    });

    describe('addFile / removeFile', () => {
        it('should add a file', () => {
            cache.addFile({ relativePath: 'new-file.ts', uri: 'file:///workspace/new-file.ts' });
            expect(cache.hasFile('new-file.ts')).to.be.true;
        });

        it('should not add duplicate files', () => {
            const beforeCount = cache.getFiles().length;
            cache.addFile({ relativePath: 'src/main.ts', uri: 'file:///workspace/src/main.ts' });
            expect(cache.getFiles().length).to.equal(beforeCount);
        });

        it('should remove a file', () => {
            cache.removeFile('file:///workspace/README.md');
            expect(cache.hasFile('README.md')).to.be.false;
        });
    });

    describe('launch configs', () => {
        beforeEach(() => {
            cache.setLaunchConfigs([
                { name: 'Launch App', uri: 'file:///workspace/.vscode/launch.json', line: 3 },
                { name: 'Debug Tests', uri: 'file:///workspace/.vscode/launch.json', line: 15 },
            ]);
        });

        it('should resolve launch config by name', () => {
            const loc = cache.resolveLaunchConfig('Launch App');
            expect(loc).to.not.be.null;
            expect(loc!.uri).to.include('launch.json');
            expect(loc!.range.start.line).to.equal(3);
        });

        it('should return null for unknown config name', () => {
            const loc = cache.resolveLaunchConfig('Unknown Config');
            expect(loc).to.be.null;
        });

        it('should filter configs by prefix', () => {
            const results = cache.filterLaunchConfigsByPrefix('Launch');
            expect(results.length).to.equal(1);
            expect(results[0].name).to.equal('Launch App');
        });
    });

    describe('dispose', () => {
        it('should clear all data', () => {
            cache.dispose();
            expect(cache.getFiles().length).to.equal(0);
            expect(cache.getLaunchConfigs().length).to.equal(0);
        });
    });
});
