import * as vscode from 'vscode';
import { Conductor } from './conductor';
import { parseDeck } from './parser';
import { registerAllExecutors } from './actions';

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

    context.subscriptions.push(
        openPresentationDisposable,
        closePresentationDisposable,
        resetPresentationDisposable,
        nextSlideDisposable,
        previousSlideDisposable,
        openPresenterViewDisposable
    );
}

export function deactivate(): void {
    console.log('Executable Talk extension is now deactivated');
    conductor?.dispose();
    conductor = undefined;
}
