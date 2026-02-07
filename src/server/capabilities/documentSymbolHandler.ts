/**
 * Document symbols handler for the LSP server.
 * Provides hierarchical document outline: slides, action blocks, render directives.
 * Per spec.md FR-027 to FR-029.
 */

import {
    DocumentSymbol,
    SymbolKind,
} from 'vscode-languageserver-types';
import { DeckDocument, SlideRange, ActionBlockRange, RenderDirectiveRange } from '../deckDocument';

/**
 * Handle textDocument/documentSymbol requests.
 */
export function onDocumentSymbol(document: DeckDocument): DocumentSymbol[] {
    const symbols: DocumentSymbol[] = [];

    for (const slide of document.slides) {
        symbols.push(buildSlideSymbol(slide));
    }

    return symbols;
}

// ─── Symbol Builders ─────────────────────────────────────────────────────────

function buildSlideSymbol(slide: SlideRange): DocumentSymbol {
    const name = slide.title || `Slide ${slide.index + 1}`;
    const children: DocumentSymbol[] = [];

    for (const block of slide.actionBlocks) {
        children.push(buildActionBlockSymbol(block));
    }

    for (const directive of slide.renderDirectives) {
        children.push(buildRenderDirectiveSymbol(directive));
    }

    return {
        name,
        kind: SymbolKind.Module,
        range: slide.range,
        selectionRange: slide.range, // select entire slide
        children,
    };
}

function buildActionBlockSymbol(block: ActionBlockRange): DocumentSymbol {
    const actionType = block.actionType || 'unknown';
    const name = `action: ${actionType}`;
    const children: DocumentSymbol[] = [];

    // Add step children for sequence blocks
    for (let i = 0; i < block.steps.length; i++) {
        const step = block.steps[i];
        const stepType = step.actionType || 'unknown';
        children.push({
            name: `step ${i + 1}: ${stepType}`,
            kind: SymbolKind.Event,
            range: step.range,
            selectionRange: step.typeRange || step.range,
        });
    }

    return {
        name,
        kind: SymbolKind.Function,
        range: block.range,
        selectionRange: block.typeRange || block.range,
        children: children.length > 0 ? children : undefined,
    };
}

function buildRenderDirectiveSymbol(directive: RenderDirectiveRange): DocumentSymbol {
    return {
        name: `render: ${directive.type}`,
        kind: SymbolKind.Object,
        range: directive.range,
        selectionRange: directive.typeRange,
    };
}
