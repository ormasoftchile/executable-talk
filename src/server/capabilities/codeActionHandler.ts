/**
 * Code action handler for the LSP server.
 * Provides quick-fix code actions associated with diagnostics.
 * Per spec.md FR-030 to FR-032.
 *
 * Supported code actions:
 * - Typo correction for action types (Levenshtein ≤ 2) → ET003
 * - Add missing required parameter → ET004
 * - Remove unknown parameter → ET005
 * - Typo correction for step types → ET007
 * - Add missing step required parameter → ET008
 * - Remove unknown step parameter → ET009
 */

import {
    CodeAction,
    CodeActionKind,
    Diagnostic,
    Range,
    TextEdit,
    Position,
} from 'vscode-languageserver-types';
import { DeckDocument, containsPosition } from '../deckDocument';
import { getKnownActionTypes } from '../../providers/actionSchema';
import { DiagnosticCodes } from './diagnosticHandler';

/**
 * Handle textDocument/codeAction requests.
 */
export function onCodeAction(
    document: DeckDocument,
    _range: Range,
    diagnostics: Diagnostic[],
): CodeAction[] {
    const actions: CodeAction[] = [];

    for (const diag of diagnostics) {
        switch (diag.code) {
            case DiagnosticCodes.UNKNOWN_TYPE:
            case DiagnosticCodes.STEP_UNKNOWN_TYPE:
                actions.push(...getTypoCorrections(diag));
                break;
            case DiagnosticCodes.MISSING_REQUIRED_PARAM:
            case DiagnosticCodes.STEP_MISSING_REQUIRED_PARAM:
                actions.push(...getMissingParamInsertions(document, diag));
                break;
            case DiagnosticCodes.UNKNOWN_PARAM:
            case DiagnosticCodes.STEP_UNKNOWN_PARAM:
                actions.push(...getUnknownParamRemovals(document, diag));
                break;
        }
    }

    return actions;
}

// ─── Typo Correction (ET003, ET007) ──────────────────────────────────────────

function getTypoCorrections(diag: Diagnostic): CodeAction[] {
    // Extract the unknown type from diagnostic message
    const match = diag.message.match(/Unknown (?:action|step) type '([^']+)'/);
    if (!match) {
        return [];
    }
    const unknownType = match[1];
    const knownTypes = getKnownActionTypes();
    const suggestions = knownTypes.filter(t => levenshtein(unknownType, t) <= 2);

    return suggestions.map(suggestion => ({
        title: `Change to '${suggestion}'`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        edit: {
            changes: {
                // The URI will be set by the caller — use placeholder
                ['__URI__']: [TextEdit.replace(diag.range, suggestion)],
            },
        },
        isPreferred: suggestions.length === 1,
    }));
}

// ─── Missing Required Param Insertion (ET004, ET008) ─────────────────────────

function getMissingParamInsertions(document: DeckDocument, diag: Diagnostic): CodeAction[] {
    // Extract missing param name and action type from diagnostic message
    const match = diag.message.match(/Required parameter '([^']+)' is missing for '([^']+)'/);
    if (!match) {
        return [];
    }
    const [, paramName] = match;

    // Find the action block containing this diagnostic
    const block = document.findActionBlockAt(diag.range.start);
    if (!block) {
        return [];
    }

    // Determine insertion position — after last parameter line or after type line
    let insertLine: number;
    if (block.parameters.length > 0) {
        const lastParam = block.parameters[block.parameters.length - 1];
        insertLine = lastParam.lineRange.end.line + 1;
    } else if (block.typeRange) {
        insertLine = block.typeRange.end.line + 1;
    } else {
        insertLine = block.contentRange.start.line;
    }

    const indent = '';  // YAML top-level, no indent
    const newText = `${indent}${paramName}: \n`;

    return [{
        title: `Add missing parameter '${paramName}'`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        edit: {
            changes: {
                ['__URI__']: [TextEdit.insert(Position.create(insertLine, 0), newText)],
            },
        },
    }];
}

// ─── Unknown Param Removal (ET005, ET009) ────────────────────────────────────

function getUnknownParamRemovals(document: DeckDocument, diag: Diagnostic): CodeAction[] {
    // Extract the unknown param name from the diagnostic message
    const match = diag.message.match(/Unknown parameter '([^']+)'/);
    if (!match) {
        return [];
    }

    // Find the parameter in the block to get its full line range
    const block = document.findActionBlockAt(diag.range.start);
    if (!block) {
        return [];
    }

    // Find the param with matching key range
    const param = block.parameters.find(p => containsPosition(p.keyRange, diag.range.start));
    if (!param) {
        // Fallback: remove the entire diagnostic range line
        return [{
            title: `Remove unknown parameter '${match[1]}'`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diag],
            edit: {
                changes: {
                    ['__URI__']: [TextEdit.del(Range.create(
                        Position.create(diag.range.start.line, 0),
                        Position.create(diag.range.start.line + 1, 0),
                    ))],
                },
            },
        }];
    }

    // Remove the full line containing the parameter
    return [{
        title: `Remove unknown parameter '${match[1]}'`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        edit: {
            changes: {
                ['__URI__']: [TextEdit.del(Range.create(
                    Position.create(param.lineRange.start.line, 0),
                    Position.create(param.lineRange.end.line + 1, 0),
                ))],
            },
        },
    }];
}

// ─── Levenshtein Distance ────────────────────────────────────────────────────

/**
 * Compute the Levenshtein edit distance between two strings.
 * Used for typo detection (suggestions when distance ≤ 2).
 */
export function levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;

    // Optimize for common cases
    if (m === 0) { return n; }
    if (n === 0) { return m; }
    if (a === b) { return 0; }

    // Use single-row DP
    const row = Array.from({ length: n + 1 }, (_, i) => i);

    for (let i = 1; i <= m; i++) {
        let prev = i;
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            const val = Math.min(
                row[j] + 1,          // deletion
                prev + 1,            // insertion
                row[j - 1] + cost,   // substitution
            );
            row[j - 1] = prev;
            prev = val;
        }
        row[n] = prev;
    }

    return row[n];
}
