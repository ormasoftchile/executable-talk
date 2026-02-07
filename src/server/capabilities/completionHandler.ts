/**
 * Completion handler for the LSP server.
 * Provides context-aware completions for action blocks, inline links, and render directives.
 * Per spec.md US-2, FR-010 to FR-016, and contracts/lsp-capabilities.md.
 */

import {
    CompletionItem,
    CompletionItemKind,
    InsertTextFormat,
    Range,
    TextEdit,
} from 'vscode-languageserver-types';
import { CompletionParams } from 'vscode-languageserver-protocol';
import { DeckDocument } from '../deckDocument';
import { detectContext, ActionContext } from '../contextDetector';
import {
    ACTION_SCHEMAS,
    getActionSchema,
    isKnownActionType,
} from '../../providers/actionSchema';
import { ActionType } from '../../models/action';

/**
 * Handle textDocument/completion requests.
 */
export function onCompletion(
    document: DeckDocument,
    params: CompletionParams,
): CompletionItem[] | null {
    const position = params.position;

    // Check for inline action link completion
    const inlineLinkItems = getInlineLinkCompletions(document, position);
    if (inlineLinkItems) {
        return inlineLinkItems;
    }

    // Check for render directive completion
    const renderItems = getRenderDirectiveCompletions(document, position);
    if (renderItems) {
        return renderItems;
    }

    // Action block completion
    const context = detectContext(document, position);
    return getContextCompletions(context);
}

function getContextCompletions(context: ActionContext): CompletionItem[] | null {
    switch (context.kind) {
        case 'type-value':
            return getTypeCompletions(context.partialValue, context.replaceRange, false);
        case 'param-name':
            return getParamNameCompletions(
                context.actionType,
                context.existingParams,
                context.insertRange,
            );
        case 'param-value':
            return getParamValueCompletions(
                context.actionType,
                context.paramName,
                context.partialValue,
                context.replaceRange,
            );
        case 'step-context': {
            // Recurse but exclude 'sequence' from type completions in steps
            const inner = context.innerContext;
            if (inner.kind === 'type-value') {
                return getTypeCompletions(inner.partialValue, inner.replaceRange, true);
            }
            return getContextCompletions(inner);
        }
        case 'unknown':
            return null;
    }
}

/**
 * Get action type completions.
 */
function getTypeCompletions(
    partialValue: string,
    replaceRange: Range,
    excludeSequence: boolean,
): CompletionItem[] {
    const items: CompletionItem[] = [];
    for (const [type, schema] of ACTION_SCHEMAS) {
        if (excludeSequence && type === 'sequence') {
            continue;
        }
        if (partialValue && !type.startsWith(partialValue)) {
            continue;
        }
        items.push({
            label: type,
            kind: CompletionItemKind.Value,
            detail: schema.description,
            documentation: schema.requiresTrust
                ? `⚠️ Requires Workspace Trust\n\n${schema.description}`
                : schema.description,
            textEdit: TextEdit.replace(replaceRange, type),
            insertTextFormat: InsertTextFormat.PlainText,
            sortText: type,
        });
    }
    return items;
}

/**
 * Get parameter name completions for a given action type.
 */
function getParamNameCompletions(
    actionType: string,
    existingParams: string[],
    insertRange: Range,
): CompletionItem[] | null {
    if (!isKnownActionType(actionType)) {
        return null;
    }
    const schema = getActionSchema(actionType as ActionType);
    if (!schema) {
        return null;
    }

    const items: CompletionItem[] = [];
    for (const param of schema.parameters) {
        if (existingParams.includes(param.name)) {
            continue;
        }
        items.push({
            label: param.name,
            kind: CompletionItemKind.Property,
            detail: `${param.type}${param.required ? ' (required)' : ''}`,
            documentation: param.description,
            textEdit: TextEdit.replace(insertRange, `${param.name}: `),
            insertTextFormat: InsertTextFormat.PlainText,
            // Sort required params first
            sortText: `${param.required ? '0' : '1'}_${param.name}`,
        });
    }
    return items.length > 0 ? items : null;
}

/**
 * Get parameter value completions.
 */
function getParamValueCompletions(
    actionType: string,
    paramName: string,
    _partialValue: string,
    replaceRange: Range,
): CompletionItem[] | null {
    if (!isKnownActionType(actionType)) {
        return null;
    }
    const schema = getActionSchema(actionType as ActionType);
    if (!schema) {
        return null;
    }

    const param = schema.parameters.find(p => p.name === paramName);
    if (!param) {
        return null;
    }

    // Enum values
    if (param.enum) {
        return param.enum.map(value => ({
            label: value,
            kind: CompletionItemKind.EnumMember,
            textEdit: TextEdit.replace(replaceRange, value),
            insertTextFormat: InsertTextFormat.PlainText,
        }));
    }

    // Boolean values
    if (param.type === 'boolean') {
        return ['true', 'false'].map(value => ({
            label: value,
            kind: CompletionItemKind.Value,
            textEdit: TextEdit.replace(replaceRange, value),
            insertTextFormat: InsertTextFormat.PlainText,
        }));
    }

    // File path completions would be provided by WorkspaceFileCache
    // For now, return null (no static completions for file paths)
    return null;
}

/**
 * Get completions for inline action link types.
 * Detects `[label](action:▌)` pattern on the current line.
 */
function getInlineLinkCompletions(
    document: DeckDocument,
    position: { line: number; character: number },
): CompletionItem[] | null {
    const line = document.getLine(position.line);
    // Check if cursor is after 'action:' in an inline link
    const beforeCursor = line.substring(0, position.character);
    const match = beforeCursor.match(/\[[^\]]*\]\(action:([a-z.]*)$/);
    if (!match) {
        return null;
    }

    const partialType = match[1];
    const typeStart = position.character - partialType.length;
    const replaceRange = Range.create(
        position.line, typeStart,
        position.line, position.character,
    );

    return getTypeCompletions(partialType, replaceRange, false);
}

/**
 * Get completions for render directive types.
 * Detects `[label](render:▌)` pattern on the current line.
 */
function getRenderDirectiveCompletions(
    document: DeckDocument,
    position: { line: number; character: number },
): CompletionItem[] | null {
    const line = document.getLine(position.line);
    const beforeCursor = line.substring(0, position.character);
    const match = beforeCursor.match(/\[[^\]]*\]\(render:([a-z]*)$/);
    if (!match) {
        return null;
    }

    const partialType = match[1];
    const typeStart = position.character - partialType.length;
    const replaceRange = Range.create(
        position.line, typeStart,
        position.line, position.character,
    );

    const renderTypes = [
        { name: 'file', description: 'Render the contents of a file inline.' },
        { name: 'command', description: 'Render the output of a shell command inline.' },
        { name: 'diff', description: 'Render a diff view between two files or content blocks.' },
    ];

    return renderTypes
        .filter(t => t.name.startsWith(partialType))
        .map(t => ({
            label: t.name,
            kind: CompletionItemKind.Value,
            detail: t.description,
            textEdit: TextEdit.replace(replaceRange, t.name),
            insertTextFormat: InsertTextFormat.PlainText,
        }));
}
