import * as vscode from 'vscode';
import * as path from 'path';
import { Conductor } from './conductor';
import { parseDeck } from './parser';
import { registerAllExecutors } from './actions';
import { ActionCompletionProvider } from './providers/actionCompletionProvider';
import { ActionHoverProvider } from './providers/actionHoverProvider';
import { ActionDiagnosticProvider } from './providers/actionDiagnosticProvider';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node';

let conductor: Conductor | undefined;
let languageClient: LanguageClient | undefined;

export function activate(context: vscode.ExtensionContext): void {
    console.log('Executable Talk extension is now active');

    // Register all action executors
    registerAllExecutors();

    // Initialize conductor
    conductor = new Conductor(context.extensionUri);
    context.subscriptions.push(conductor);

    // Register commands
    const openPresentationDisposable = vscode.commands.registerCommand(
        'executableTalk.openPresentation',
        async () => {
            const editor = vscode.window.activeTextEditor;
            
            if (!editor) {
                void vscode.window.showWarningMessage('No active editor. Open a .deck.md file first.');
                return;
            }

            const document = editor.document;
            
            // Check if it's a deck file
            if (!document.fileName.endsWith('.deck.md')) {
                void vscode.window.showWarningMessage('Active file is not a .deck.md presentation file.');
                return;
            }

            try {
                // Parse the deck
                const content = document.getText();
                const result = parseDeck(content, document.uri.fsPath);

                if (result.error || !result.deck) {
                    void vscode.window.showWarningMessage(result.error || 'Failed to parse presentation.');
                    return;
                }

                if (result.deck.slides.length === 0) {
                    void vscode.window.showWarningMessage('Presentation has no slides.');
                    return;
                }

                // Open the presentation
                await conductor?.openDeck(result.deck);
            } catch (error) {
                void vscode.window.showErrorMessage(
                    `Failed to open presentation: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
            }
        }
    );

    const closePresentationDisposable = vscode.commands.registerCommand(
        'executableTalk.closePresentation',
        async () => {
            if (conductor?.isActive()) {
                await conductor.close();
            }
        }
    );

    const resetPresentationDisposable = vscode.commands.registerCommand(
        'executableTalk.resetPresentation',
        async () => {
            if (conductor?.isActive()) {
                await conductor.reset();
            }
        }
    );

    const nextSlideDisposable = vscode.commands.registerCommand(
        'executableTalk.nextSlide',
        async () => {
            if (conductor?.isActive()) {
                await conductor.nextSlide();
            }
        }
    );

    const previousSlideDisposable = vscode.commands.registerCommand(
        'executableTalk.previousSlide',
        async () => {
            if (conductor?.isActive()) {
                await conductor.previousSlide();
            }
        }
    );

    const openPresenterViewDisposable = vscode.commands.registerCommand(
        'executableTalk.openPresenterView',
        () => {
            conductor?.openPresenterView();
        }
    );

    const validateDeckDisposable = vscode.commands.registerCommand(
        'executableTalk.validateDeck',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || !editor.document.fileName.endsWith('.deck.md')) {
                void vscode.window.showWarningMessage('Open a .deck.md file first to validate.');
                return;
            }
            await conductor?.validateDeck(editor.document);
        }
    );

    // Register authoring assistance — LSP or legacy providers (US4)
    const useLsp = vscode.workspace.getConfiguration('executableTalk').get<boolean>('useLsp', true);
    const documentSelector: vscode.DocumentSelector = { language: 'deck-markdown' };

    if (useLsp) {
        // ─── LSP Client ──────────────────────────────────────────────────────
        const serverModule = context.asAbsolutePath(
            path.join('out', 'src', 'server', 'server.js'),
        );

        const serverOptions: ServerOptions = {
            run: { module: serverModule, transport: TransportKind.ipc },
            debug: {
                module: serverModule,
                transport: TransportKind.ipc,
                options: { execArgv: ['--nolazy', '--inspect=6009'] },
            },
        };

        const clientOptions: LanguageClientOptions = {
            documentSelector: [{ language: 'deck-markdown' }],
            synchronize: {
                fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc'),
            },
        };

        languageClient = new LanguageClient(
            'executableTalkLsp',
            'Executable Talk Language Server',
            serverOptions,
            clientOptions,
        );

        // Handle custom requests from the server
        languageClient.onRequest('executableTalk/workspaceFiles', async () => {
            return getWorkspaceFiles();
        });

        languageClient.onRequest('executableTalk/launchConfigs', async () => {
            return getLaunchConfigs();
        });

        void languageClient.start();
        context.subscriptions.push({ dispose: () => { void languageClient?.stop(); } });
    } else {
        // ─── Legacy Providers ────────────────────────────────────────────────
        registerLegacyProviders(context, documentSelector);
    }

    // Listen for configuration changes to hot-swap LSP ↔ legacy
    const configChangeDisposable = vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration('executableTalk.useLsp')) {
            void vscode.window.showInformationMessage(
                'Executable Talk: Restart VS Code to apply the LSP setting change.',
            );
        }
    });

    context.subscriptions.push(
        openPresentationDisposable,
        closePresentationDisposable,
        resetPresentationDisposable,
        nextSlideDisposable,
        previousSlideDisposable,
        openPresenterViewDisposable,
        validateDeckDisposable,
        configChangeDisposable,
    );
}

// ─── Legacy Provider Registration ────────────────────────────────────────────

function registerLegacyProviders(
    context: vscode.ExtensionContext,
    documentSelector: vscode.DocumentSelector,
): void {
    const completionProvider = new ActionCompletionProvider();
    const completionDisposable = vscode.languages.registerCompletionItemProvider(
        documentSelector,
        {
            provideCompletionItems(document, position, token, completionContext) {
                const items = completionProvider.provideCompletionItems(document, position, token, completionContext);
                if (!items) {
                    return undefined;
                }
                const vsItems = items.map((item) => {
                    const ci = new vscode.CompletionItem(item.label, item.kind);
                    ci.insertText = item.insertText;
                    ci.detail = item.detail;
                    ci.documentation = item.documentation;
                    if (item.range) {
                        const r = item.range;
                        ci.range = new vscode.Range(r.startLine, r.startChar, r.endLine, r.endChar);
                    }
                    ci.filterText = item.insertText ?? item.label;
                    return ci;
                });
                return new vscode.CompletionList(vsItems, true);
            },
        },
        ':', '/', ' ',
    );

    const hoverProvider = new ActionHoverProvider();
    const hoverDisposable = vscode.languages.registerHoverProvider(
        documentSelector,
        {
            provideHover(document, position, _token) {
                const result = hoverProvider.provideHover(document, position, _token);
                if (!result) {
                    return undefined;
                }
                return new vscode.Hover(
                    result.contents.map((c) => new vscode.MarkdownString(c)),
                    result.range ? new vscode.Range(
                        result.range.start.line, result.range.start.character,
                        result.range.end.line, result.range.end.character,
                    ) : undefined,
                );
            },
        },
    );

    const diagnosticProvider = new ActionDiagnosticProvider();
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('executableTalkActions');

    function updateDiagnostics(document: vscode.TextDocument): void {
        if (document.languageId !== 'deck-markdown') {
            return;
        }
        const results = diagnosticProvider.computeDiagnostics(document);
        const vscDiags = results.map((d) => {
            const diag = new vscode.Diagnostic(
                new vscode.Range(
                    d.range.start.line, d.range.start.character,
                    d.range.end.line, d.range.end.character,
                ),
                d.message,
                d.severity as number,
            );
            diag.source = d.source;
            return diag;
        });
        diagnosticCollection.set(document.uri, vscDiags);
    }

    const onChangeDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
        updateDiagnostics(e.document);
    });
    const onOpenDisposable = vscode.workspace.onDidOpenTextDocument((doc) => {
        updateDiagnostics(doc);
    });
    const onCloseDisposable = vscode.workspace.onDidCloseTextDocument((doc) => {
        diagnosticCollection.delete(doc.uri);
    });

    for (const doc of vscode.workspace.textDocuments) {
        updateDiagnostics(doc);
    }

    context.subscriptions.push(
        completionDisposable,
        hoverDisposable,
        diagnosticCollection,
        onChangeDisposable,
        onOpenDisposable,
        onCloseDisposable,
        { dispose() { diagnosticProvider.dispose(); } },
    );
}

// ─── Workspace File Helpers for LSP ──────────────────────────────────────────

interface CachedFileInfo {
    relativePath: string;
    uri: string;
}

interface CachedLaunchConfigInfo {
    name: string;
    uri: string;
    line: number;
}

async function getWorkspaceFiles(): Promise<CachedFileInfo[]> {
    const files: CachedFileInfo[] = [];
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return files;
    }

    const pattern = new vscode.RelativePattern(workspaceFolders[0], '**/*');
    const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 5000);

    for (const uri of uris) {
        const relativePath = vscode.workspace.asRelativePath(uri, false);
        files.push({ relativePath, uri: uri.toString() });
    }

    return files;
}

async function getLaunchConfigs(): Promise<CachedLaunchConfigInfo[]> {
    const configs: CachedLaunchConfigInfo[] = [];
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return configs;
    }

    for (const folder of workspaceFolders) {
        const launchUri = vscode.Uri.joinPath(folder.uri, '.vscode', 'launch.json');
        try {
            const content = await vscode.workspace.fs.readFile(launchUri);
            const text = Buffer.from(content).toString('utf-8');
            // Simple JSON parse to find configuration names
            const json = JSON.parse(text) as { configurations?: Array<{ name?: string }> };
            if (json.configurations && Array.isArray(json.configurations)) {
                for (let i = 0; i < json.configurations.length; i++) {
                    const config = json.configurations[i];
                    if (config?.name) {
                        // Rough line estimate: search for the name in text
                        const nameIdx = text.indexOf(`"name": "${config.name}"`);
                        const line = nameIdx >= 0
                            ? text.substring(0, nameIdx).split('\n').length - 1
                            : 0;
                        configs.push({
                            name: config.name,
                            uri: launchUri.toString(),
                            line,
                        });
                    }
                }
            }
        } catch {
            // launch.json doesn't exist or is invalid — ignore
        }
    }

    return configs;
}

export async function deactivate(): Promise<void> {
    console.log('Executable Talk extension is now deactivated');
    if (languageClient) {
        await languageClient.stop();
        languageClient = undefined;
    }
    conductor?.dispose();
    conductor = undefined;
}
