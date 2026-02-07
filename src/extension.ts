import * as vscode from 'vscode';
import { Conductor } from './conductor';
import { parseDeck } from './parser';
import { registerAllExecutors } from './actions';
import { ActionCompletionProvider } from './providers/actionCompletionProvider';
import { ActionHoverProvider } from './providers/actionHoverProvider';
import { ActionDiagnosticProvider } from './providers/actionDiagnosticProvider';

let conductor: Conductor | undefined;

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

    // T014: Go to slide command — opens slide picker in the Webview
    const goToSlideDisposable = vscode.commands.registerCommand(
        'executableTalk.goToSlide',
        () => {
            conductor?.openSlidePicker();
        }
    );

    // T024/T025: Save/Restore scene commands — send messages to Webview
    const saveSceneDisposable = vscode.commands.registerCommand(
        'executableTalk.saveScene',
        () => {
            conductor?.requestSaveScene();
        }
    );

    const restoreSceneDisposable = vscode.commands.registerCommand(
        'executableTalk.restoreScene',
        () => {
            conductor?.requestRestoreScene();
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

    // Register authoring assistance providers (US4)
    const documentSelector: vscode.DocumentSelector = { language: 'deck-markdown' };

    const completionProvider = new ActionCompletionProvider();
    const completionDisposable = vscode.languages.registerCompletionItemProvider(
        documentSelector,
        {
            provideCompletionItems(document, position, token, context) {
                const items = completionProvider.provideCompletionItems(document, position, token, context);
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
                    // Ensure items always show regardless of typed text
                    ci.filterText = item.insertText ?? item.label;
                    return ci;
                });
                // isIncomplete: re-query on every keystroke so items aren't
                // filtered away when the typed text doesn't match any label
                return new vscode.CompletionList(vsItems, /* isIncomplete */ true);
            },
        },
        ':', '/', ' ',
    );

    const hoverProvider = new ActionHoverProvider();
    const hoverDisposable = vscode.languages.registerHoverProvider(
        documentSelector,
        {
            provideHover(document, position, token) {
                const result = hoverProvider.provideHover(document, position, token);
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

    // Update diagnostics on document open and change
    const onChangeDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
        updateDiagnostics(e.document);
    });
    const onOpenDisposable = vscode.workspace.onDidOpenTextDocument((doc) => {
        updateDiagnostics(doc);
    });
    const onCloseDisposable = vscode.workspace.onDidCloseTextDocument((doc) => {
        diagnosticCollection.delete(doc.uri);
    });

    // Update diagnostics for all currently open deck-markdown documents
    for (const doc of vscode.workspace.textDocuments) {
        updateDiagnostics(doc);
    }

    context.subscriptions.push(
        openPresentationDisposable,
        closePresentationDisposable,
        resetPresentationDisposable,
        nextSlideDisposable,
        previousSlideDisposable,
        openPresenterViewDisposable,
        goToSlideDisposable,
        saveSceneDisposable,
        restoreSceneDisposable,
        validateDeckDisposable,
        completionDisposable,
        hoverDisposable,
        diagnosticCollection,
        onChangeDisposable,
        onOpenDisposable,
        onCloseDisposable,
        { dispose() { diagnosticProvider.dispose(); } }
    );
}

export function deactivate(): void {
    console.log('Executable Talk extension is now deactivated');
    conductor?.dispose();
    conductor = undefined;
}
