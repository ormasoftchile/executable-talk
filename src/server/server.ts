/**
 * LSP Server entry point for Executable Talk.
 *
 * Creates an IPC-based language server that provides:
 * - Diagnostics (on open/change with debounce)
 * - Completion (action types, params, values, inline links, render directives)
 * - Hover (action types, params, inline links, render directives)
 * - Document symbols (slides → action blocks → steps)
 * - Folding ranges (frontmatter, slides, action blocks)
 * - Code actions (typo fixes, missing params, remove unknown params)
 * - Go-to-definition (file paths, launch configs)
 *
 * Per spec.md US-1 through US-7, plan.md phases 1-5,
 * and contracts/lsp-capabilities.md.
 */

import {
    createConnection,
    ProposedFeatures,
    TextDocuments,
    TextDocumentSyncKind,
    InitializeParams,
    InitializeResult,
    CompletionParams,
    HoverParams,
    DocumentSymbolParams,
    FoldingRangeParams,
    CodeActionParams,
    DefinitionParams,
    DidChangeConfigurationNotification,
    FileChangeType,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { DeckDocument } from './deckDocument';
import { DeckDocumentManager } from './deckDocumentManager';
import { DebounceManager } from './utils/debounce';
import { WorkspaceFileCache, CachedFile, CachedLaunchConfig } from './utils/workspaceFileCache';

import { onCompletion } from './capabilities/completionHandler';
import { computeDiagnostics } from './capabilities/diagnosticHandler';
import { onHover } from './capabilities/hoverHandler';
import { onDocumentSymbol } from './capabilities/documentSymbolHandler';
import { onFoldingRange } from './capabilities/foldingRangeHandler';
import { onCodeAction } from './capabilities/codeActionHandler';
import { onDefinition } from './capabilities/definitionHandler';

// ─── Connection & Managers ───────────────────────────────────────────────────

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const deckDocuments = new DeckDocumentManager();
const debounce = new DebounceManager(300);

let workspaceFileCache: WorkspaceFileCache | null = null;
let hasConfigurationCapability = false;

// ─── Initialization ──────────────────────────────────────────────────────────

connection.onInitialize((params: InitializeParams): InitializeResult => {
    const capabilities = params.capabilities;

    hasConfigurationCapability = !!(
        capabilities.workspace && capabilities.workspace.configuration
    );

    // Initialize workspace file cache if workspace folders are available
    if (params.workspaceFolders && params.workspaceFolders.length > 0) {
        workspaceFileCache = new WorkspaceFileCache(params.workspaceFolders[0].uri);
    }

    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Full,
            completionProvider: {
                triggerCharacters: [':', '/', ' ', '\n'],
                resolveProvider: false,
            },
            hoverProvider: true,
            documentSymbolProvider: true,
            foldingRangeProvider: true,
            codeActionProvider: true,
            definitionProvider: true,
        },
    };
});

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        void connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }

    // Request initial workspace file list
    if (workspaceFileCache) {
        void requestWorkspaceFiles();
        void requestLaunchConfigs();
    }
});

// ─── Document Sync ───────────────────────────────────────────────────────────

documents.onDidOpen((event) => {
    const doc = DeckDocument.create(
        event.document.uri,
        event.document.version,
        event.document.getText(),
    );
    deckDocuments.open(doc.uri, doc.version, doc.content);
    publishDiagnostics(doc);
});

documents.onDidChangeContent((event) => {
    const uri = event.document.uri;
    const doc = DeckDocument.create(
        uri,
        event.document.version,
        event.document.getText(),
    );
    deckDocuments.update(uri, doc.version, [], event.document.getText());

    // Debounce diagnostics to avoid flooding during rapid typing
    void debounce.schedule(uri, () => {
        const current = deckDocuments.get(uri);
        if (current) {
            publishDiagnostics(current);
        }
    });
});

documents.onDidClose((event) => {
    const uri = event.document.uri;
    deckDocuments.close(uri);
    debounce.cancel(uri);
    // Clear diagnostics for closed documents
    void connection.sendDiagnostics({ uri, diagnostics: [] });
});

// ─── Diagnostics ─────────────────────────────────────────────────────────────

function publishDiagnostics(doc: DeckDocument): void {
    const diagnostics = computeDiagnostics(doc);
    void connection.sendDiagnostics({ uri: doc.uri, diagnostics });
}

// ─── Completion ──────────────────────────────────────────────────────────────

connection.onCompletion((params: CompletionParams) => {
    const doc = deckDocuments.get(params.textDocument.uri);
    if (!doc) {
        return null;
    }
    return onCompletion(doc, params);
});

// ─── Hover ───────────────────────────────────────────────────────────────────

connection.onHover((params: HoverParams) => {
    const doc = deckDocuments.get(params.textDocument.uri);
    if (!doc) {
        return null;
    }
    return onHover(doc, params.position);
});

// ─── Document Symbols ────────────────────────────────────────────────────────

connection.onDocumentSymbol((params: DocumentSymbolParams) => {
    const doc = deckDocuments.get(params.textDocument.uri);
    if (!doc) {
        return [];
    }
    return onDocumentSymbol(doc);
});

// ─── Folding Ranges ──────────────────────────────────────────────────────────

connection.onFoldingRanges((params: FoldingRangeParams) => {
    const doc = deckDocuments.get(params.textDocument.uri);
    if (!doc) {
        return [];
    }
    return onFoldingRange(doc);
});

// ─── Code Actions ────────────────────────────────────────────────────────────

connection.onCodeAction((params: CodeActionParams) => {
    const doc = deckDocuments.get(params.textDocument.uri);
    if (!doc) {
        return [];
    }
    const actions = onCodeAction(doc, params.range, params.context.diagnostics);

    // Replace the __URI__ placeholder with the actual document URI
    for (const action of actions) {
        if (action.edit?.changes) {
            const edits = action.edit.changes['__URI__'];
            if (edits) {
                delete action.edit.changes['__URI__'];
                action.edit.changes[params.textDocument.uri] = edits;
            }
        }
    }

    return actions;
});

// ─── Definition ──────────────────────────────────────────────────────────────

connection.onDefinition((params: DefinitionParams) => {
    const doc = deckDocuments.get(params.textDocument.uri);
    if (!doc) {
        return null;
    }
    return onDefinition(doc, params.position, workspaceFileCache);
});

// ─── Workspace File Cache ────────────────────────────────────────────────────

/**
 * Request workspace file listing from the client via a custom request.
 * The client is expected to implement 'executableTalk/workspaceFiles'.
 */
async function requestWorkspaceFiles(): Promise<void> {
    try {
        const files = await connection.sendRequest<CachedFile[]>(
            'executableTalk/workspaceFiles',
        );
        workspaceFileCache?.setFiles(files);
    } catch {
        // Client may not support custom request — degrade gracefully
    }
}

/**
 * Request launch configuration names from the client.
 */
async function requestLaunchConfigs(): Promise<void> {
    try {
        const configs = await connection.sendRequest<CachedLaunchConfig[]>(
            'executableTalk/launchConfigs',
        );
        workspaceFileCache?.setLaunchConfigs(configs);
    } catch {
        // Client may not support custom request — degrade gracefully
    }
}

// Refresh cache on watched file changes
connection.onDidChangeWatchedFiles((params) => {
    if (!workspaceFileCache) {
        return;
    }

    let needsRefresh = false;
    for (const change of params.changes) {
        if (change.uri.endsWith('launch.json')) {
            void requestLaunchConfigs();
        }
        if (change.type === FileChangeType.Created) {
            needsRefresh = true;
        } else if (change.type === FileChangeType.Deleted) {
            workspaceFileCache.removeFile(change.uri);
        }
    }

    if (needsRefresh) {
        void requestWorkspaceFiles();
    }
});

// ─── Configuration ───────────────────────────────────────────────────────────

connection.onDidChangeConfiguration((_change) => {
    // Re-validate all open documents when configuration changes
    for (const key of deckDocuments.keys()) {
        const doc = deckDocuments.get(key);
        if (doc) {
            publishDiagnostics(doc);
        }
    }
});

// ─── Start ───────────────────────────────────────────────────────────────────

documents.listen(connection);
connection.listen();
