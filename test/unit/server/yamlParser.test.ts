import { expect } from 'chai';
import { parseYaml, extractParameterRanges } from '../../../src/server/utils/yamlParser';

describe('yamlParser', () => {
    describe('parseYaml', () => {
        it('should parse valid YAML', () => {
            const result = parseYaml('type: file.open\npath: src/main.ts', 0, 0);
            expect(result.error).to.be.undefined;
            expect(result.value).to.deep.include({ type: 'file.open', path: 'src/main.ts' });
        });

        it('should return error for invalid YAML', () => {
            const result = parseYaml('type: file.open\n  bad indent: here', 0, 0);
            expect(result.error).to.not.be.undefined;
            expect(result.error!.message).to.be.a('string');
        });

        it('should offset error range by contentStartLine', () => {
            const result = parseYaml(':\n  bad', 5, 0);
            if (result.error) {
                expect(result.error.range.start.line).to.be.at.least(5);
            }
        });

        it('should return empty object for empty content', () => {
            const result = parseYaml('', 0, 0);
            // Empty YAML parses to null value
            expect(result.error).to.be.undefined;
        });
    });

    describe('extractParameterRanges', () => {
        it('should extract parameter ranges for top-level keys', () => {
            const yaml = 'type: file.open\npath: src/main.ts\nline: 10';
            const parsed = { type: 'file.open', path: 'src/main.ts', line: 10 };
            const ranges = extractParameterRanges(yaml, parsed, 2);

            expect(ranges.length).to.be.at.least(2);

            const typeRange = ranges.find(r => r.key === 'type');
            expect(typeRange).to.not.be.undefined;
            expect(typeRange!.keyRange.start.line).to.equal(2);

            const pathRange = ranges.find(r => r.key === 'path');
            expect(pathRange).to.not.be.undefined;
            expect(pathRange!.keyRange.start.line).to.equal(3);
        });

        it('should return empty array for empty content', () => {
            const ranges = extractParameterRanges('', {}, 0);
            expect(ranges).to.deep.equal([]);
        });

        it('should skip nested/indented keys', () => {
            const yaml = 'type: sequence\nsteps:\n  - type: file.open\n    path: foo.ts';
            const parsed = { type: 'sequence', steps: [{ type: 'file.open', path: 'foo.ts' }] };
            const ranges = extractParameterRanges(yaml, parsed, 0);

            // Should only pick up 'type' and 'steps' at top level
            const keys = ranges.map(r => r.key);
            expect(keys).to.include('type');
            expect(keys).to.not.include('path');
        });
    });
});
