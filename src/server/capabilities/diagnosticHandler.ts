/**
 * Diagnostic handler for the LSP server.
 * Computes and publishes diagnostics for action blocks, inline links, and render directives.
 * Per spec.md US-1, FR-017 to FR-022, and contracts/lsp-capabilities.md.
 */

import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver-types';
import { DeckDocument, ActionBlockRange, ActionLinkRange, RenderDirectiveRange } from '../deckDocument';
import {
    isKnownActionType,
    getRequiredParams,
    getValidParamNames,
    ACTION_SCHEMAS,
} from '../../providers/actionSchema';
import { ActionType } from '../../models/action';

const SOURCE = 'Executable Talk';

/** Meta-fields allowed in any action block but not declared in schema */
const META_FIELDS = new Set(['type', 'label', 'description']);

// ─── Diagnostic Codes ────────────────────────────────────────────────────────

export const DiagnosticCodes = {
    YAML_PARSE_ERROR: 'ET001',
    MISSING_TYPE: 'ET002',
    UNKNOWN_TYPE: 'ET003',
    MISSING_REQUIRED_PARAM: 'ET004',
    UNKNOWN_PARAM: 'ET005',
    STEP_MISSING_TYPE: 'ET006',
    STEP_UNKNOWN_TYPE: 'ET007',
    STEP_MISSING_REQUIRED_PARAM: 'ET008',
    STEP_UNKNOWN_PARAM: 'ET009',
    UNCLOSED_BLOCK: 'ET010',
    INLINE_LINK_UNKNOWN_TYPE: 'ET011',
    INLINE_LINK_UNKNOWN_PARAM: 'ET012',
    RENDER_DIRECTIVE_UNKNOWN_TYPE: 'ET013',
    RENDER_DIRECTIVE_UNKNOWN_PARAM: 'ET014',
    EMPTY_BLOCK: 'ET015',
} as const;

// ─── Main Entry Point ────────────────────────────────────────────────────────

/**
 * Compute all diagnostics for a DeckDocument.
 */
export function computeDiagnostics(document: DeckDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    for (const slide of document.slides) {
        // Validate action blocks
        for (const block of slide.actionBlocks) {
            diagnostics.push(...validateActionBlock(block));
        }

        // Validate inline action links
        for (const link of slide.actionLinks) {
            diagnostics.push(...validateActionLink(link));
        }

        // Validate render directives
        for (const directive of slide.renderDirectives) {
            diagnostics.push(...validateRenderDirective(directive));
        }
    }

    return diagnostics;
}

// ─── Action Block Validation ─────────────────────────────────────────────────

function validateActionBlock(block: ActionBlockRange): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // ET010: Unclosed block
    if (block.unclosed) {
        diagnostics.push(createDiagnostic(
            DiagnosticCodes.UNCLOSED_BLOCK,
            'Unclosed action block — missing closing ```',
            Range.create(block.range.start.line, 0, block.range.start.line, 10),
            DiagnosticSeverity.Warning,
        ));
    }

    // ET001: YAML parse error
    if (block.parseError) {
        diagnostics.push(createDiagnostic(
            DiagnosticCodes.YAML_PARSE_ERROR,
            block.parseError.message,
            block.parseError.range,
            DiagnosticSeverity.Error,
        ));
        return diagnostics; // Can't validate further if YAML is broken
    }

    // ET015: Empty block
    if (!block.parsedYaml || block.yamlContent.trim().length === 0) {
        diagnostics.push(createDiagnostic(
            DiagnosticCodes.EMPTY_BLOCK,
            'Empty action block',
            block.range,
            DiagnosticSeverity.Hint,
        ));
        return diagnostics;
    }

    // ET002: Missing type field
    if (!block.actionType) {
        diagnostics.push(createDiagnostic(
            DiagnosticCodes.MISSING_TYPE,
            "Action block must have a 'type' field",
            Range.create(
                block.contentRange.start.line, 0,
                block.contentRange.start.line, block.yamlContent.split('\n')[0]?.length ?? 0,
            ),
            DiagnosticSeverity.Error,
        ));
        return diagnostics;
    }

    // ET003: Unknown action type
    if (!isKnownActionType(block.actionType)) {
        diagnostics.push(createDiagnostic(
            DiagnosticCodes.UNKNOWN_TYPE,
            `Unknown action type: '${block.actionType}'`,
            block.typeRange ?? block.contentRange,
            DiagnosticSeverity.Error,
        ));
        return diagnostics;
    }

    const actionType = block.actionType as ActionType;

    // ET004: Missing required parameters
    const requiredParams = getRequiredParams(actionType);
    const presentParams = block.parameters.map(p => p.key);
    for (const required of requiredParams) {
        if (!presentParams.includes(required)) {
            // Point to last line of content (insertion point)
            diagnostics.push(createDiagnostic(
                DiagnosticCodes.MISSING_REQUIRED_PARAM,
                `Missing required parameter: '${required}'`,
                Range.create(
                    block.contentRange.end.line, 0,
                    block.contentRange.end.line, 0,
                ),
                DiagnosticSeverity.Error,
            ));
        }
    }

    // ET005: Unknown parameter names
    const validParams = getValidParamNames(actionType);
    for (const param of block.parameters) {
        if (!validParams.includes(param.key) && !META_FIELDS.has(param.key)) {
            diagnostics.push(createDiagnostic(
                DiagnosticCodes.UNKNOWN_PARAM,
                `Unknown parameter '${param.key}' for action type '${actionType}'`,
                param.keyRange,
                DiagnosticSeverity.Warning,
            ));
        }
    }

    // Validate sequence steps
    if (actionType === 'sequence') {
        diagnostics.push(...validateSequenceSteps(block));
    }

    return diagnostics;
}

// ─── Sequence Step Validation ────────────────────────────────────────────────

function validateSequenceSteps(block: ActionBlockRange): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    for (const step of block.steps) {
        // ET006: Step missing type
        if (!step.actionType) {
            diagnostics.push(createDiagnostic(
                DiagnosticCodes.STEP_MISSING_TYPE,
                "Each step must have a 'type' field",
                Range.create(step.range.start.line, 0, step.range.start.line, 20),
                DiagnosticSeverity.Error,
            ));
            continue;
        }

        // ET007: Step unknown type
        if (!isKnownActionType(step.actionType)) {
            diagnostics.push(createDiagnostic(
                DiagnosticCodes.STEP_UNKNOWN_TYPE,
                `Unknown action type in step: '${step.actionType}'`,
                step.typeRange ?? step.range,
                DiagnosticSeverity.Error,
            ));
            continue;
        }

        const stepType = step.actionType as ActionType;

        // ET008: Step missing required param
        const requiredParams = getRequiredParams(stepType);
        const presentParams = step.parameters.map(p => p.key);
        for (const required of requiredParams) {
            if (!presentParams.includes(required)) {
                diagnostics.push(createDiagnostic(
                    DiagnosticCodes.STEP_MISSING_REQUIRED_PARAM,
                    `Step missing required parameter: '${required}'`,
                    Range.create(step.range.end.line, 0, step.range.end.line, 0),
                    DiagnosticSeverity.Error,
                ));
            }
        }

        // ET009: Step unknown param
        const validParams = getValidParamNames(stepType);
        for (const param of step.parameters) {
            if (!validParams.includes(param.key) && !META_FIELDS.has(param.key)) {
                diagnostics.push(createDiagnostic(
                    DiagnosticCodes.STEP_UNKNOWN_PARAM,
                    `Unknown parameter '${param.key}' for step type '${stepType}'`,
                    param.keyRange,
                    DiagnosticSeverity.Warning,
                ));
            }
        }
    }

    return diagnostics;
}

// ─── Inline Link Validation ──────────────────────────────────────────────────

function validateActionLink(link: ActionLinkRange): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const knownTypes = Array.from(ACTION_SCHEMAS.keys()) as string[];

    // ET011: Unknown action type in inline link
    if (!knownTypes.includes(link.type)) {
        diagnostics.push(createDiagnostic(
            DiagnosticCodes.INLINE_LINK_UNKNOWN_TYPE,
            `Unknown action type in inline link: '${link.type}'`,
            link.typeRange,
            DiagnosticSeverity.Error,
        ));
        return diagnostics;
    }

    // ET012: Unknown parameters in inline link
    if (isKnownActionType(link.type)) {
        const validParams = getValidParamNames(link.type as ActionType);
        for (const [key, paramInfo] of link.params) {
            if (!validParams.includes(key) && !META_FIELDS.has(key)) {
                diagnostics.push(createDiagnostic(
                    DiagnosticCodes.INLINE_LINK_UNKNOWN_PARAM,
                    `Unknown parameter '${key}' for action type '${link.type}'`,
                    paramInfo.range,
                    DiagnosticSeverity.Warning,
                ));
            }
        }
    }

    return diagnostics;
}

// ─── Render Directive Validation ─────────────────────────────────────────────

const VALID_RENDER_TYPES = new Set(['file', 'command', 'diff']);

const RENDER_PARAM_SCHEMAS: Record<string, Set<string>> = {
    file: new Set(['path', 'lines', 'startPattern', 'endPattern', 'format', 'lang', 'watch']),
    command: new Set(['cmd', 'timeout', 'format', 'cwd', 'shell', 'cached', 'onError', 'fallback', 'retries', 'stream']),
    diff: new Set(['path', 'before', 'after', 'left', 'right', 'mode', 'context']),
};

function validateRenderDirective(directive: RenderDirectiveRange): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // ET013: Unknown render type
    if (!VALID_RENDER_TYPES.has(directive.type)) {
        diagnostics.push(createDiagnostic(
            DiagnosticCodes.RENDER_DIRECTIVE_UNKNOWN_TYPE,
            `Unknown render type: '${directive.type}'`,
            directive.typeRange,
            DiagnosticSeverity.Error,
        ));
        return diagnostics;
    }

    // ET014: Unknown render parameter
    const validParams = RENDER_PARAM_SCHEMAS[directive.type];
    if (validParams) {
        for (const [key, paramInfo] of directive.params) {
            if (!validParams.has(key)) {
                diagnostics.push(createDiagnostic(
                    DiagnosticCodes.RENDER_DIRECTIVE_UNKNOWN_PARAM,
                    `Unknown parameter '${key}' for render type '${directive.type}'`,
                    paramInfo.range,
                    DiagnosticSeverity.Warning,
                ));
            }
        }
    }

    return diagnostics;
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function createDiagnostic(
    code: string,
    message: string,
    range: Range,
    severity: DiagnosticSeverity,
): Diagnostic {
    return {
        range,
        message,
        severity,
        source: SOURCE,
        code,
    };
}
