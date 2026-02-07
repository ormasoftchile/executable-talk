/**
 * Hover handler for the LSP server.
 * Provides hover documentation for action types, parameters, inline links, and render directives.
 * Per spec.md US-3, FR-023 to FR-026, and contracts/lsp-capabilities.md.
 */

import { Hover, MarkupKind, Position, Range } from 'vscode-languageserver-types';
import { DeckDocument, containsPosition } from '../deckDocument';
import { getActionSchema, isKnownActionType } from '../../providers/actionSchema';
import { ActionType } from '../../models/action';

/**
 * Handle textDocument/hover requests.
 */
export function onHover(
    document: DeckDocument,
    position: Position,
): Hover | null {
    // Check inline action links
    const linkHover = getActionLinkHover(document, position);
    if (linkHover) {
        return linkHover;
    }

    // Check render directives
    const renderHover = getRenderDirectiveHover(document, position);
    if (renderHover) {
        return renderHover;
    }

    // Check action blocks
    return getActionBlockHover(document, position);
}

// ─── Action Block Hover ──────────────────────────────────────────────────────

function getActionBlockHover(document: DeckDocument, position: Position): Hover | null {
    const block = document.findActionBlockAt(position);
    if (!block) {
        return null;
    }

    // Hover on action type value
    if (block.typeRange && containsPosition(block.typeRange, position)) {
        return getTypeHover(block.actionType, block.typeRange);
    }

    // Hover on parameter name
    for (const param of block.parameters) {
        if (containsPosition(param.keyRange, position)) {
            return getParamHover(block.actionType, param.key, param.keyRange);
        }
    }

    // Hover on step type or param
    for (const step of block.steps) {
        if (step.typeRange && containsPosition(step.typeRange, position)) {
            return getTypeHover(step.actionType, step.typeRange);
        }
        for (const param of step.parameters) {
            if (containsPosition(param.keyRange, position)) {
                return getParamHover(step.actionType, param.key, param.keyRange);
            }
        }
    }

    return null;
}

/**
 * Build hover for an action type value.
 */
function getTypeHover(actionType: string | undefined, range: Range): Hover | null {
    if (!actionType || !isKnownActionType(actionType)) {
        return null;
    }
    const schema = getActionSchema(actionType as ActionType);
    if (!schema) {
        return null;
    }

    const trustWarning = schema.requiresTrust
        ? '⚠️ **Requires Workspace Trust**\n\n'
        : '';

    const paramTable = schema.parameters.map(p => {
        const required = p.required ? '✅' : '';
        const enumVals = p.enum ? ` (${p.enum.join(', ')})` : '';
        return `| \`${p.name}\` | \`${p.type}\` | ${required} | ${p.description}${enumVals} |`;
    }).join('\n');

    const markdown = [
        `### \`${schema.type}\``,
        '',
        trustWarning + schema.description,
        '',
        '| Parameter | Type | Required | Description |',
        '|-----------|------|----------|-------------|',
        paramTable,
    ].join('\n');

    return {
        contents: { kind: MarkupKind.Markdown, value: markdown },
        range,
    };
}

/**
 * Build hover for a parameter name.
 */
function getParamHover(
    actionType: string | undefined,
    paramName: string,
    range: Range,
): Hover | null {
    if (!actionType || !isKnownActionType(actionType)) {
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

    const lines = [
        `**\`${param.name}\`** — \`${param.type}\`${param.required ? ' *(required)*' : ''}`,
        '',
        param.description,
    ];

    if (param.enum) {
        lines.push('', `Allowed values: ${param.enum.map(v => `\`${v}\``).join(', ')}`);
    }

    return {
        contents: { kind: MarkupKind.Markdown, value: lines.join('\n') },
        range,
    };
}

// ─── Inline Action Link Hover ────────────────────────────────────────────────

function getActionLinkHover(document: DeckDocument, position: Position): Hover | null {
    for (const slide of document.slides) {
        for (const link of slide.actionLinks) {
            if (!containsPosition(link.range, position)) {
                continue;
            }
            // Hover on the type portion
            if (containsPosition(link.typeRange, position)) {
                return getTypeHover(link.type, link.typeRange);
            }
            // Hover on the full link — show summary
            if (isKnownActionType(link.type)) {
                const schema = getActionSchema(link.type as ActionType);
                if (schema) {
                    const paramSummary = Array.from(link.params.entries())
                        .map(([k, v]) => `- \`${k}\`: \`${v.value}\``)
                        .join('\n');

                    const markdown = [
                        `### Action: \`${link.type}\``,
                        '',
                        schema.description,
                        '',
                        paramSummary || '*No parameters*',
                    ].join('\n');

                    return {
                        contents: { kind: MarkupKind.Markdown, value: markdown },
                        range: link.range,
                    };
                }
            }
        }
    }
    return null;
}

// ─── Render Directive Hover ──────────────────────────────────────────────────

const RENDER_TYPE_DESCRIPTIONS: Record<string, string> = {
    file: 'Renders the contents of a file inline in the slide.',
    command: 'Renders the output of a shell command inline in the slide.',
    diff: 'Renders a diff view between two files or content blocks.',
};

function getRenderDirectiveHover(document: DeckDocument, position: Position): Hover | null {
    for (const slide of document.slides) {
        for (const directive of slide.renderDirectives) {
            if (!containsPosition(directive.range, position)) {
                continue;
            }
            // Hover on type
            if (containsPosition(directive.typeRange, position)) {
                const desc = RENDER_TYPE_DESCRIPTIONS[directive.type] || 'Unknown render type';
                return {
                    contents: { kind: MarkupKind.Markdown, value: `### \`render:${directive.type}\`\n\n${desc}` },
                    range: directive.typeRange,
                };
            }
            // Hover on full directive
            const desc = RENDER_TYPE_DESCRIPTIONS[directive.type] || 'Unknown render type';
            const paramSummary = Array.from(directive.params.entries())
                .map(([k, v]) => `- \`${k}\`: \`${v.value}\``)
                .join('\n');

            return {
                contents: {
                    kind: MarkupKind.Markdown,
                    value: `### \`render:${directive.type}\`\n\n${desc}\n\n${paramSummary || '*No parameters*'}`,
                },
                range: directive.range,
            };
        }
    }
    return null;
}
