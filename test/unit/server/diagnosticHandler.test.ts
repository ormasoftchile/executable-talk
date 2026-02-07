import { expect } from 'chai';
import { DeckDocument } from '../../../src/server/deckDocument';
import { computeDiagnostics, DiagnosticCodes } from '../../../src/server/capabilities/diagnosticHandler';

describe('diagnosticHandler', () => {
    function makeDoc(content: string): DeckDocument {
        return DeckDocument.create('file:///test.deck.md', 1, content);
    }

    it('should report no diagnostics for valid action block', () => {
        const doc = makeDoc([
            '# Slide',
            '',
            '```action',
            'type: file.open',
            'path: src/main.ts',
            '```',
        ].join('\n'));

        const diags = computeDiagnostics(doc);
        expect(diags).to.deep.equal([]);
    });

    it('should report ET002 for missing type', () => {
        const doc = makeDoc([
            '# Slide',
            '',
            '```action',
            'path: src/main.ts',
            '```',
        ].join('\n'));

        const diags = computeDiagnostics(doc);
        const et002 = diags.filter(d => d.code === DiagnosticCodes.MISSING_TYPE);
        expect(et002.length).to.be.greaterThan(0);
    });

    it('should report ET003 for unknown type', () => {
        const doc = makeDoc([
            '# Slide',
            '',
            '```action',
            'type: bogus.action',
            '```',
        ].join('\n'));

        const diags = computeDiagnostics(doc);
        const et003 = diags.filter(d => d.code === DiagnosticCodes.UNKNOWN_TYPE);
        expect(et003.length).to.be.greaterThan(0);
    });

    it('should report ET004 for missing required parameter', () => {
        const doc = makeDoc([
            '# Slide',
            '',
            '```action',
            'type: file.open',
            '```',
        ].join('\n'));

        const diags = computeDiagnostics(doc);
        const et004 = diags.filter(d => d.code === DiagnosticCodes.MISSING_REQUIRED_PARAM);
        expect(et004.length).to.be.greaterThan(0);
    });

    it('should report ET005 for unknown parameter', () => {
        const doc = makeDoc([
            '# Slide',
            '',
            '```action',
            'type: file.open',
            'path: src/main.ts',
            'bogus: value',
            '```',
        ].join('\n'));

        const diags = computeDiagnostics(doc);
        const et005 = diags.filter(d => d.code === DiagnosticCodes.UNKNOWN_PARAM);
        expect(et005.length).to.be.greaterThan(0);
    });

    it('should report ET010 for unclosed action block', () => {
        const doc = makeDoc([
            '# Slide',
            '',
            '```action',
            'type: file.open',
            'path: src/main.ts',
        ].join('\n'));

        const diags = computeDiagnostics(doc);
        const et010 = diags.filter(d => d.code === DiagnosticCodes.UNCLOSED_BLOCK);
        expect(et010.length).to.be.greaterThan(0);
    });

    it('should report ET015 for empty action block', () => {
        const doc = makeDoc([
            '# Slide',
            '',
            '```action',
            '```',
        ].join('\n'));

        const diags = computeDiagnostics(doc);
        const et015 = diags.filter(d => d.code === DiagnosticCodes.EMPTY_BLOCK);
        expect(et015.length).to.be.greaterThan(0);
    });

    it('should report ET011 for unknown inline action link type', () => {
        const doc = makeDoc('# Slide\n\n[Click](action:bogus.type?p=v)');
        const diags = computeDiagnostics(doc);
        const et011 = diags.filter(d => d.code === DiagnosticCodes.INLINE_LINK_UNKNOWN_TYPE);
        expect(et011.length).to.be.greaterThan(0);
    });

    it('should not parse unknown render directive types (parser filters them)', () => {
        // The DeckDocument parser only captures file|command|diff render types,
        // so 'render:bogus' is never parsed as a directive and produces no diagnostics.
        const doc = makeDoc('# Slide\n\n[](render:bogus?p=v)');
        const diags = computeDiagnostics(doc);
        expect(diags).to.deep.equal([]);
    });

    it('should validate sequence step types (ET006)', () => {
        // Steps that begin with `- type:` pattern are parsed; a step with an
        // unknown type should trigger ET007 (step unknown type)
        const doc = makeDoc([
            '# Slide',
            '',
            '```action',
            'type: sequence',
            'steps:',
            '  - type: bogus.action',
            '    path: src/main.ts',
            '```',
        ].join('\n'));

        const diags = computeDiagnostics(doc);
        const stepDiags = diags.filter(d =>
            d.code === DiagnosticCodes.STEP_UNKNOWN_TYPE
        );
        expect(stepDiags.length).to.be.greaterThan(0);
    });

    it('should not report diagnostics for valid render directives', () => {
        const doc = makeDoc('# Slide\n\n[](render:file?path=src/main.ts)');
        const diags = computeDiagnostics(doc);
        expect(diags).to.deep.equal([]);
    });
});
