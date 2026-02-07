/**
 * Context detection for cursor position within a DeckDocument.
 * Determines what kind of completions or hover information to provide.
 * Per data-model.md ActionContext and research.md R3.
 */

import { Position, Range } from 'vscode-languageserver-types';
import { DeckDocument, ActionBlockRange, StepRange, containsPosition } from './deckDocument';

// ─── ActionContext Types ─────────────────────────────────────────────────────

export interface TypeValueContext {
    kind: 'type-value';
    block: ActionBlockRange;
    partialValue: string;
    replaceRange: Range;
}

export interface ParamNameContext {
    kind: 'param-name';
    block: ActionBlockRange;
    actionType: string;
    existingParams: string[];
    insertRange: Range;
}

export interface ParamValueContext {
    kind: 'param-value';
    block: ActionBlockRange;
    actionType: string;
    paramName: string;
    partialValue: string;
    replaceRange: Range;
}

export interface StepContext {
    kind: 'step-context';
    block: ActionBlockRange;
    step: StepRange;
    innerContext: TypeValueContext | ParamNameContext | ParamValueContext;
}

export interface UnknownContext {
    kind: 'unknown';
}

export type ActionContext =
    | TypeValueContext
    | ParamNameContext
    | ParamValueContext
    | StepContext
    | UnknownContext;

// ─── Detection ───────────────────────────────────────────────────────────────

/**
 * Detect the action context for the given cursor position.
 */
export function detectContext(document: DeckDocument, position: Position): ActionContext {
    // Find enclosing action block
    const block = document.findActionBlockAt(position);
    if (!block) {
        return { kind: 'unknown' };
    }

    const line = document.getLine(position.line);

    // Check if inside a step context
    if (block.actionType === 'sequence' && block.steps.length > 0) {
        const step = block.steps.find(s => containsPosition(s.range, position));
        if (step) {
            const innerContext = detectInnerContext(block, line, position, step);
            if (innerContext) {
                return {
                    kind: 'step-context',
                    block,
                    step,
                    innerContext,
                };
            }
        }
    }

    // Check for type: line
    const typeMatch = line.match(/^(\s*)type:\s*(.*)/);
    if (typeMatch) {
        const valueStart = line.indexOf(':') + 1;
        const wsAfterColon = line.slice(valueStart).length - line.slice(valueStart).trimStart().length;
        const actualValueStart = valueStart + wsAfterColon;
        const currentValue = typeMatch[2].trim();

        return {
            kind: 'type-value',
            block,
            partialValue: currentValue,
            replaceRange: Range.create(
                position.line, actualValueStart,
                position.line, actualValueStart + currentValue.length,
            ),
        };
    }

    // Check for parameter value context (key: value, cursor in value)
    const paramMatch = line.match(/^(\s*)(\w[\w.]*)\s*:\s*(.*)/);
    if (paramMatch) {
        const key = paramMatch[2];
        const valueText = paramMatch[3];
        const colonPos = line.indexOf(':', line.indexOf(key) + key.length);
        const wsAfterColon = line.slice(colonPos + 1).length - line.slice(colonPos + 1).trimStart().length;
        const valueStartChar = colonPos + 1 + wsAfterColon;

        // If cursor is in the value region
        if (position.character >= valueStartChar && key !== 'type') {
            const actionType = block.actionType;
            if (actionType) {
                return {
                    kind: 'param-value',
                    block,
                    actionType,
                    paramName: key,
                    partialValue: valueText.trim(),
                    replaceRange: Range.create(
                        position.line, valueStartChar,
                        position.line, valueStartChar + valueText.trimEnd().length,
                    ),
                };
            }
        }
    }

    // Default: param-name context (new line or empty line in block)
    const actionType = block.actionType;
    if (actionType) {
        const existingParams = block.parameters.map(p => p.key);
        return {
            kind: 'param-name',
            block,
            actionType,
            existingParams,
            insertRange: Range.create(position.line, 0, position.line, line.length),
        };
    }

    // If no type set yet, offer type completions
    return {
        kind: 'type-value',
        block,
        partialValue: '',
        replaceRange: Range.create(position.line, 0, position.line, line.length),
    };
}

/**
 * Detect inner context within a sequence step.
 */
function detectInnerContext(
    block: ActionBlockRange,
    line: string,
    position: Position,
    step: StepRange,
): TypeValueContext | ParamNameContext | ParamValueContext | undefined {
    // Check for step type line
    const stepTypeMatch = line.match(/(?:^\s*-\s+|\s+)type:\s*(.*)/);
    if (stepTypeMatch) {
        const valueText = stepTypeMatch[1].trim();
        const typeIdx = line.indexOf('type:');
        const colonPos = typeIdx + 4;
        const wsAfterColon = line.slice(colonPos + 1).length - line.slice(colonPos + 1).trimStart().length;
        const valueStart = colonPos + 1 + wsAfterColon;

        return {
            kind: 'type-value',
            block,
            partialValue: valueText,
            replaceRange: Range.create(
                position.line, valueStart,
                position.line, valueStart + valueText.length,
            ),
        };
    }

    // Check for step parameter value
    const paramMatch = line.match(/^\s{2,}(\w+):\s*(.*)/);
    if (paramMatch && paramMatch[1] !== 'type') {
        const key = paramMatch[1];
        const valueText = paramMatch[2];
        const colonPos = line.indexOf(':', line.indexOf(key) + key.length);
        const wsAfterColon = line.slice(colonPos + 1).length - line.slice(colonPos + 1).trimStart().length;
        const valueStartChar = colonPos + 1 + wsAfterColon;

        if (position.character >= valueStartChar && step.actionType) {
            return {
                kind: 'param-value',
                block,
                actionType: step.actionType,
                paramName: key,
                partialValue: valueText.trim(),
                replaceRange: Range.create(
                    position.line, valueStartChar,
                    position.line, valueStartChar + valueText.trimEnd().length,
                ),
            };
        }
    }

    // Default: param-name in step
    if (step.actionType) {
        const existingParams = step.parameters.map(p => p.key);
        return {
            kind: 'param-name',
            block,
            actionType: step.actionType,
            existingParams: [...existingParams, 'type'],
            insertRange: Range.create(position.line, 0, position.line, line.length),
        };
    }

    return undefined;
}
