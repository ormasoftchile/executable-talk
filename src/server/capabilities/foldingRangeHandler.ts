/**
 * Folding range handler for the LSP server.
 * Provides folding regions for slides, action blocks, and frontmatter.
 * Per spec.md FR-036 to FR-038.
 */

import { FoldingRange, FoldingRangeKind } from 'vscode-languageserver-types';
import { DeckDocument } from '../deckDocument';

/**
 * Handle textDocument/foldingRange requests.
 */
export function onFoldingRange(document: DeckDocument): FoldingRange[] {
    const ranges: FoldingRange[] = [];

    // Frontmatter folding
    if (document.frontmatterRange) {
        ranges.push({
            startLine: document.frontmatterRange.start.line,
            endLine: document.frontmatterRange.end.line,
            kind: FoldingRangeKind.Region,
        });
    }

    // Slide folding: from slide start to just before next slide delimiter (or EOF)
    for (const slide of document.slides) {
        // Only fold slides that span more than 1 line
        if (slide.range.end.line > slide.range.start.line) {
            ranges.push({
                startLine: slide.range.start.line,
                endLine: slide.range.end.line,
                kind: FoldingRangeKind.Region,
            });
        }
    }

    // Action block folding (```action ... ```)
    for (const slide of document.slides) {
        for (const block of slide.actionBlocks) {
            if (block.range.end.line > block.range.start.line) {
                ranges.push({
                    startLine: block.range.start.line,
                    endLine: block.range.end.line,
                    kind: FoldingRangeKind.Region,
                });
            }
        }
    }

    return ranges;
}
