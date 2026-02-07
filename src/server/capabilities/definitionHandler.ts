/**
 * Definition handler for the LSP server.
 * Provides go-to-definition for file path parameters and launch config names.
 * Per spec.md FR-033 to FR-035.
 *
 * - path params → workspace file (via WorkspaceFileCache)
 * - configName params → .vscode/launch.json config entry
 */

import { Location, Position, Range } from 'vscode-languageserver-types';
import { DeckDocument, ActionBlockRange, StepRange, ParameterRange, containsPosition } from '../deckDocument';
import { getActionSchema, isKnownActionType } from '../../providers/actionSchema';
import { ActionType } from '../../models/action';
import { WorkspaceFileCache } from '../utils/workspaceFileCache';

/**
 * Handle textDocument/definition requests.
 */
export function onDefinition(
    document: DeckDocument,
    position: Position,
    workspaceFileCache: WorkspaceFileCache | null,
): Location | null {
    // Check action blocks
    for (const slide of document.slides) {
        for (const block of slide.actionBlocks) {
            const loc = getBlockDefinition(block, position, workspaceFileCache);
            if (loc) {
                return loc;
            }
            // Check steps within sequence blocks
            for (const step of block.steps) {
                const stepLoc = getStepDefinition(step, position, workspaceFileCache);
                if (stepLoc) {
                    return stepLoc;
                }
            }
        }

        // Check inline action links
        for (const link of slide.actionLinks) {
            if (!containsPosition(link.range, position)) {
                continue;
            }
            const pathParam = link.params.get('path');
            if (pathParam && containsPosition(pathParam.range, position) && workspaceFileCache) {
                const uri = workspaceFileCache.resolveUri(pathParam.value);
                if (uri) {
                    return Location.create(uri, Range.create(0, 0, 0, 0));
                }
            }
        }
    }

    return null;
}

// ─── Block Definition ────────────────────────────────────────────────────────

function getBlockDefinition(
    block: ActionBlockRange,
    position: Position,
    workspaceFileCache: WorkspaceFileCache | null,
): Location | null {
    // Only check if cursor is inside this block's content range
    if (!containsPosition(block.contentRange, position)) {
        return null;
    }

    return getDefinitionFromParams(block.actionType, block.parameters, position, workspaceFileCache);
}

function getStepDefinition(
    step: StepRange,
    position: Position,
    workspaceFileCache: WorkspaceFileCache | null,
): Location | null {
    if (!containsPosition(step.range, position)) {
        return null;
    }
    return getDefinitionFromParams(step.actionType, step.parameters, position, workspaceFileCache);
}

function getDefinitionFromParams(
    actionType: string | undefined,
    parameters: ParameterRange[],
    position: Position,
    workspaceFileCache: WorkspaceFileCache | null,
): Location | null {
    if (!actionType || !isKnownActionType(actionType)) {
        return null;
    }

    const schema = getActionSchema(actionType as ActionType);
    if (!schema) {
        return null;
    }

    for (const param of parameters) {
        if (!containsPosition(param.valueRange, position)) {
            continue;
        }

        const paramSchema = schema.parameters.find(p => p.name === param.key);
        if (!paramSchema) {
            continue;
        }

        // File path parameters → resolve to workspace file
        if (paramSchema.completionKind === 'file' && workspaceFileCache) {
            const uri = workspaceFileCache.resolveUri(String(param.value));
            if (uri) {
                return Location.create(uri, Range.create(0, 0, 0, 0));
            }
        }

        // Launch config parameters → resolve to launch.json entry
        if (paramSchema.completionKind === 'launchConfig' && workspaceFileCache) {
            const location = workspaceFileCache.resolveLaunchConfig(String(param.value));
            if (location) {
                return location;
            }
        }
    }

    return null;
}
