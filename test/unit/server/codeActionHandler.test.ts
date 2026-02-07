import { expect } from 'chai';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver-types';
import { DeckDocument } from '../../../src/server/deckDocument';
import { onCodeAction } from '../../../src/server/capabilities/codeActionHandler';
import { levenshtein } from '../../../src/server/capabilities/codeActionHandler';
import { DiagnosticCodes } from '../../../src/server/capabilities/diagnosticHandler';

describe('codeActionHandler', () => {
    function makeDoc(content: string): DeckDocument {
        return DeckDocument.create('file:///test.deck.md', 1, content);
    }

    function makeDiag(code: string, message: string, startLine: number, startChar: number, endLine: number, endChar: number): Diagnostic {
        return {
            range: Range.create(startLine, startChar, endLine, endChar),
            message,
            severity: DiagnosticSeverity.Error,
            source: 'Executable Talk',
            code,
        };
    }

    describe('levenshtein', () => {
        it('should return 0 for identical strings', () => {
            expect(levenshtein('abc', 'abc')).to.equal(0);
        });

        it('should return string length for empty comparison', () => {
            expect(levenshtein('abc', '')).to.equal(3);
            expect(levenshtein('', 'abc')).to.equal(3);
        });

        it('should compute correct distance', () => {
            expect(levenshtein('file.open', 'file.opn')).to.equal(1);
            expect(levenshtein('file.open', 'flie.open')).to.equal(2);
            expect(levenshtein('terminal.run', 'terminal.rn')).to.equal(1);
        });

        it('should return large distance for very different strings', () => {
            expect(levenshtein('abc', 'xyz')).to.be.greaterThan(2);
        });
    });

    describe('onCodeAction', () => {
        it('should suggest typo corrections for ET003 (unknown type)', () => {
            const doc = makeDoc([
                '# Slide',
                '',
                '```action',
                'type: file.opn',
                '```',
            ].join('\n'));

            const diag = makeDiag(
                DiagnosticCodes.UNKNOWN_TYPE,
                "Unknown action type 'file.opn'",
                3, 6, 3, 14,
            );

            const actions = onCodeAction(doc, Range.create(3, 0, 3, 14), [diag]);
            expect(actions.length).to.be.greaterThan(0);
            const fixAction = actions.find(a => a.title.includes('file.open'));
            expect(fixAction).to.not.be.undefined;
        });

        it('should suggest adding missing required parameter for ET004', () => {
            const doc = makeDoc([
                '# Slide',
                '',
                '```action',
                'type: file.open',
                '```',
            ].join('\n'));

            const diag = makeDiag(
                DiagnosticCodes.MISSING_REQUIRED_PARAM,
                "Required parameter 'path' is missing for 'file.open'",
                3, 0, 3, 15,
            );

            const actions = onCodeAction(doc, Range.create(3, 0, 4, 0), [diag]);
            expect(actions.length).to.be.greaterThan(0);
            const addAction = actions.find(a => a.title.includes('path'));
            expect(addAction).to.not.be.undefined;
        });

        it('should suggest removing unknown parameter for ET005', () => {
            const doc = makeDoc([
                '# Slide',
                '',
                '```action',
                'type: file.open',
                'path: src/main.ts',
                'bogus: value',
                '```',
            ].join('\n'));

            const diag = makeDiag(
                DiagnosticCodes.UNKNOWN_PARAM,
                "Unknown parameter 'bogus' for 'file.open'",
                5, 0, 5, 5,
            );

            const actions = onCodeAction(doc, Range.create(5, 0, 5, 12), [diag]);
            expect(actions.length).to.be.greaterThan(0);
            const removeAction = actions.find(a => a.title.includes('Remove'));
            expect(removeAction).to.not.be.undefined;
        });

        it('should return empty array for unrelated diagnostics', () => {
            const doc = makeDoc('# Slide');
            const diag = makeDiag(
                'UNRELATED',
                'Some other issue',
                0, 0, 0, 7,
            );

            const actions = onCodeAction(doc, Range.create(0, 0, 0, 7), [diag]);
            expect(actions).to.deep.equal([]);
        });
    });
});
