import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Conductor } from './conductor';
import { parseDeck, readDeckContentImport } from '@deckpilot/core/parser';
import { registerAllExecutors } from './actions';
import {
    ActionCompletionProvider,
    ActionHoverProvider,
    ActionDiagnosticProvider,
} from '@deckpilot/language';
import { EnvRuleValidator } from './validation/envRuleValidator';
import { DeckModelContentProvider, showResolvedDeckModel } from './commands/showResolvedModel';
import { extractMetadataToSidecar } from './commands/extractMetadata';
import {
    installAuthoringSkills,
    maybeOfferAuthoringSkillsInstall
} from './commands/installAuthoringSkills';
import { PreviewProvider } from './preview';
import type { DeckpilotDiagramAPI, IDiagramRenderer } from '@deckpilot/core/renderer/diagramRenderer';
import { diagramLog, initializeDiagramLogger } from './utils/diagramLogger';
import { findLatestNarrationArtifacts } from './dubbing/dubbingDiscovery';
import {
    assembleNarrationProject,
    launchNarration,
    prepareNarrationProject,
    recordNarrationProject,
    resyncNarrationProject,
} from './dubbing/dubbingLauncher';
import {
    createNarrationProject,
    loadDeckNarrationSetup,
    loadNarrationTimings,
    seedNarrationProject,
    stageNarrationProjectForSession,
} from './dubbing/narrationProject';
import {
    captureActiveRecordingWindow,
    getRecorderConfig,
} from './recording/recorderOrchestrator';
import { recordingDeckName } from './recording/outputLayout';
import { isExplicitDeckPath } from './deckRecognition';
import {
    offerNarrationPreparation,
    requiresNarrationUpdate,
    runAutoRecordPreflight,
    selectAutoRecordDeckPath,
} from './recording/autoRecordPrerequisite';

let conductor: Conductor | undefined;
let previewProvider: PreviewProvider | undefined;
let narrationWorkflowRunning = false;

async function showRecordingComplete(
    message: string,
    allFiles: string[],
    captionFile: string,
    deckDirectory: string,
    videoPath?: string,
    offerNarration = true,
): Promise<void> {
    const choices = offerNarration && videoPath
        ? ['Record Narration', 'Open Script']
        : ['Open Script'];
    const choice = await vscode.window.showInformationMessage(message, ...choices);
    if (choice === 'Record Narration' && videoPath) {
        await launchNarration({ videoPath, srtPath: captionFile, modifiedMs: Date.now() }, deckDirectory);
        return;
    }
    if (choice === 'Open Script') {
        const mdFile = allFiles.find(file => file.endsWith('.md'));
        if (mdFile) {
            const document = await vscode.workspace.openTextDocument(mdFile);
            await vscode.window.showTextDocument(document);
        }
    }
}

/**
 * Resolves a deck URI from the active editor.
 *
 * - `.deck.md` → returned as-is.
 * - `.deck.yaml` with a sibling `.deck.md` → the paired `.deck.md` (sidecar).
 * - `.deck.yaml` with no sibling `.deck.md` but a `content:` pointer →
 *   itself (a standalone YAML-primary deck manifest).
 * - Plain `.md` with a companion `.deck.yaml` → returned as-is.
 * - Any other file → searches the workspace for a deck whose `content:`
 *   resolves to the active file.
 */
async function resolveDeckUri(editor: vscode.TextEditor | undefined): Promise<vscode.Uri | undefined> {
    if (!editor) {
        return undefined;
    }

    const doc = editor.document;
    const isMarkdown = doc.languageId === 'markdown' || doc.languageId === 'deck-markdown';

    if (doc.uri.scheme === 'untitled' && isMarkdown) {
        return doc.uri;
    }

    const filePath = doc.uri.fsPath;

    if (filePath.endsWith('.deck.md')) {
        return doc.uri;
    }

    if (filePath.endsWith('.deck.yaml')) {
        const deckMdPath = filePath.replace(/\.deck\.yaml$/, '.deck.md');
        if (fs.existsSync(deckMdPath)) {
            return vscode.Uri.file(deckMdPath); // sidecar → its .deck.md
        }
        const plainMdPath = filePath.replace(/\.deck\.yaml$/, '.md');
        if (fs.existsSync(plainMdPath)) {
            return vscode.Uri.file(plainMdPath); // sidecar → its .md
        }
        // Standalone YAML-primary deck: valid when it declares `content:`.
        if (readDeckContentImport(doc.getText(), filePath)) {
            return doc.uri;
        }
        return undefined;
    }

    if (isMarkdown && isExplicitDeckPath(filePath)) {
        return doc.uri;
    }

    const importer = await findDeckImporting(filePath);
    if (importer) {
        return importer;
    }

    if (isMarkdown && treatAllMarkdownAsDeck(doc.uri)) {
        return doc.uri;
    }

    // If the file is inside recordings/ or is an exported script, resolve the source deck
    if (filePath.includes('/recordings/') || filePath.includes('\\recordings\\') || filePath.endsWith('voiceover-script.md')) {
        let curDir = path.dirname(filePath);
        for (let i = 0; i < 3; i++) {
            const sessionJsonPath = path.join(curDir, 'recording-session.json');
            if (fs.existsSync(sessionJsonPath)) {
                try {
                    const data: unknown = JSON.parse(fs.readFileSync(sessionJsonPath, 'utf8'));
                    if (typeof data === 'object' && data !== null && 'deckPath' in data &&
                        typeof data.deckPath === 'string' && data.deckPath && fs.existsSync(data.deckPath)) {
                        return vscode.Uri.file(data.deckPath);
                    }
                } catch {
                    // ignore parse error
                }
            }
            const parent = path.dirname(curDir);
            if (parent === curDir) { break; }
            curDir = parent;
        }
        const match = filePath.match(/[/\\]recordings[/\\]([^/\\]+)/);
        if (match) {
            const deckName = match[1];
            const decks = await findDeckFiles();
            const found = decks.find(d => path.basename(d.fsPath).startsWith(deckName));
            if (found) {
                return found;
            }
        }
        return undefined;
    }

    // Any markdown document can be presented directly as a deck
    if (
        isMarkdown ||
        filePath.endsWith('.md')
    ) {
        return doc.uri;
    }
    return undefined;
}

/**
 * Scans the workspace for deck files (`*.deck.md` or `*.deck.yaml`) whose
 * `content:` declaration resolves to `targetFsPath`. Returns the first match.
 */
async function findDeckImporting(targetFsPath: string): Promise<vscode.Uri | undefined> {
    const decks = await findDeckFiles();
    for (const deckUri of decks) {
        try {
            const buf = await vscode.workspace.fs.readFile(deckUri);
            const raw = Buffer.from(buf).toString('utf-8');
            const importPath = readDeckContentImport(raw, deckUri.fsPath);
            if (!importPath) {
                continue;
            }
            const deckDir = path.dirname(deckUri.fsPath);
            const resolved = path.isAbsolute(importPath)
                ? importPath
                : path.resolve(deckDir, importPath);
            if (resolved === targetFsPath) {
                return deckUri;
            }
        } catch {
            // ignore unreadable / unparseable decks
        }
    }
    return undefined;
}

/**
 * Resolve a deck URI from an explicit resource (e.g. a file passed by an
 * editor-title / context-menu command) or, when absent, the active editor.
 */
async function resolveDeckUriFromArg(resource: vscode.Uri | undefined): Promise<vscode.Uri | undefined> {
    if (resource) {
        return resolveDeckUriForResource(resource);
    }
    return resolveDeckUri(vscode.window.activeTextEditor);
}

/**
 * Resolve a deck URI from a concrete file URI (open or on disk):
 *  - `.deck.md` → itself.
 *  - `.deck.yaml` → sibling `.deck.md` or `.md`, else itself when it declares `content:`.
 *  - any other file → the deck whose `content:` imports it, or itself when it
 *    is allowed by explicit-deck recognition or `treatAllMarkdownAsDeck`.
 */
async function resolveDeckUriForResource(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
    if (uri.scheme === 'untitled') {
        const openDoc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
        if (openDoc && (openDoc.languageId === 'markdown' || openDoc.languageId === 'deck-markdown')) {
            return uri;
        }
    }

    const filePath = uri.fsPath;
    if (filePath.endsWith('.deck.md')) {
        return uri;
    }
    if (filePath.endsWith('.deck.yaml')) {
        const deckMdPath = filePath.replace(/\.deck\.yaml$/, '.deck.md');
        if (fs.existsSync(deckMdPath)) {
            return vscode.Uri.file(deckMdPath);
        }
        const plainMdPath = filePath.replace(/\.deck\.yaml$/, '.md');
        if (fs.existsSync(plainMdPath)) {
            return vscode.Uri.file(plainMdPath);
        }
        let raw: string | undefined;
        try {
            const openDoc = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === filePath);
            raw = openDoc ? openDoc.getText() : await fs.promises.readFile(filePath, 'utf-8');
        } catch {
            raw = undefined;
        }
        return raw && readDeckContentImport(raw, filePath) ? uri : undefined;
    }
    if (filePath.endsWith('.md') && isExplicitDeckPath(filePath)) {
        return uri;
    }
    const importer = await findDeckImporting(filePath);
    if (importer) {
        return importer;
    }
    if (filePath.endsWith('.md') && treatAllMarkdownAsDeck(uri)) {
        return uri;
    }
    return undefined;
}

/**
 * Find all deck files in the workspace. Uses two separate globs (rather than a
 * `{md,yaml}` brace group) for maximum compatibility across VS Code versions.
 */
async function findDeckFiles(): Promise<vscode.Uri[]> {
    const [md, yaml] = await Promise.all([
        vscode.workspace.findFiles('**/*.deck.md', '**/node_modules/**'),
        vscode.workspace.findFiles('**/*.deck.yaml', '**/node_modules/**'),
    ]);
    return [...md, ...yaml];
}

/**
 * Index of absolute paths of markdown files referenced by some deck's
 * `content:`. Maintained so the active-editor context key can be computed
 * synchronously (no per-switch workspace scan → no menu timing gaps).
 */
const deckContentFiles = new Set<string>();

/** Rebuild the deck→content index from the current workspace decks. */
async function rebuildDeckContentIndex(): Promise<void> {
    const decks = await findDeckFiles().catch(() => [] as vscode.Uri[]);
    const next = new Set<string>();
    for (const deckUri of decks) {
        try {
            const buf = await vscode.workspace.fs.readFile(deckUri);
            const raw = Buffer.from(buf).toString('utf-8');
            const importPath = readDeckContentImport(raw, deckUri.fsPath);
            if (!importPath) {
                continue;
            }
            const deckDir = path.dirname(deckUri.fsPath);
            const resolved = path.isAbsolute(importPath)
                ? importPath
                : path.resolve(deckDir, importPath);
            next.add(path.normalize(resolved));
        } catch {
            // ignore unreadable / unparseable decks
        }
    }
    deckContentFiles.clear();
    for (const p of next) {
        deckContentFiles.add(p);
    }
}

/**
 * Whether the `deckPilot.treatAllMarkdownAsDeck` setting is enabled for the
 * given resource. Read with the resource URI as scope so `resource`-scoped
 * per-workspace/folder overrides resolve correctly.
 */
function treatAllMarkdownAsDeck(uri: vscode.Uri | undefined): boolean {
    return (
        vscode.workspace
            .getConfiguration('deckPilot', uri)
            .get<boolean>('treatAllMarkdownAsDeck') ?? true
    );
}

/**
 * Update `when`-clause context keys for the active editor so the editor-title
 * icon and context-menu entries appear on deck files and on markdown files a
 * deck imports. The content check is a synchronous index lookup.
 */
async function updateDeckContextKeys(editor: vscode.TextEditor | undefined): Promise<void> {
    const doc = editor?.document;
    const filePath = doc?.uri.fsPath;
    const isMarkdown = doc?.languageId === 'markdown' || doc?.languageId === 'deck-markdown';
    const isUntitled = doc?.uri.scheme === 'untitled';
    const isDeck = (isUntitled && isMarkdown) || (!!filePath && (
        isExplicitDeckPath(filePath) ||
        (isMarkdown && treatAllMarkdownAsDeck(doc?.uri))
    ));
    const isContent = !!filePath && !isDeck && deckContentFiles.has(path.normalize(filePath));
    await vscode.commands.executeCommand('setContext', 'deckPilot.activeIsDeck', isDeck);
    await vscode.commands.executeCommand('setContext', 'deckPilot.activeIsDeckContent', isContent);
}

export function activate(context: vscode.ExtensionContext): DeckpilotDiagramAPI {
    console.log('Deckpilot extension is now active');
    initializeDiagramLogger(context);
    diagramLog('[extension] Diagram debug channel initialized');

    // Register all action executors
    registerAllExecutors();

    // Initialize conductor
    conductor = new Conductor(context.extensionUri);
    context.subscriptions.push(conductor);

    // Keep menu `when`-clause context keys in sync with the active editor, so
    // the editor-title icon and context-menu entries show on deck files and on
    // markdown files a deck imports. The deck→content index is built once and
    // refreshed whenever a deck file changes, so the per-switch check is fast.
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            void updateDeckContextKeys(editor);
        }),
    );
    const refreshDeckIndex = (): void => {
        void rebuildDeckContentIndex().then(() =>
            updateDeckContextKeys(vscode.window.activeTextEditor),
        );
    };
    refreshDeckIndex();
    const deckWatcher = vscode.workspace.createFileSystemWatcher('**/*.deck.{md,yaml}');
    deckWatcher.onDidCreate(refreshDeckIndex);
    deckWatcher.onDidChange(refreshDeckIndex);
    deckWatcher.onDidDelete(refreshDeckIndex);
    context.subscriptions.push(deckWatcher);

    // Re-evaluate the active editor's deck context keys immediately when the
    // `treatAllMarkdownAsDeck` setting is toggled, so the icon appears/hides
    // without needing an editor switch.
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('deckPilot.treatAllMarkdownAsDeck')) {
                void updateDeckContextKeys(vscode.window.activeTextEditor);
            }
        }),
    );

    // Register commands
    const openPresentationDisposable = vscode.commands.registerCommand(
        'deckPilot.openPresentation',
        async (resource?: vscode.Uri) => {
            const editor = vscode.window.activeTextEditor;
            
            // Resolve deck URI (.deck.md, .deck.yaml sidecar, or a content-imported file).
            const deckUri = await resolveDeckUriFromArg(resource);
            
            if (!deckUri) {
                const activeFile = editor?.document.fileName;
                if (activeFile?.endsWith('.deck.yaml')) {
                    void vscode.window.showWarningMessage(
                        'No paired .deck.md or .md file found. Create a markdown file alongside this sidecar.'
                    );
                } else {
                    void vscode.window.showWarningMessage('No active editor. Open a markdown (.md, .deck.md) file first.');
                }
                return;
            }

            try {
                // Load and parse the deck
                const deckDocument = await vscode.workspace.openTextDocument(deckUri);
                const content = deckDocument.getText();
                diagramLog(`[extension] Parsing deck for Start Presentation: ${deckUri.fsPath}`);
                const result = await parseDeck(content, deckUri.fsPath);

                if (result.error || !result.deck) {
                    diagramLog(`[extension] Deck parse failed for ${deckUri.fsPath}: ${result.error || 'Unknown parse error'}`);
                    void vscode.window.showWarningMessage(result.error || 'Failed to parse presentation.');
                    return;
                }

                diagramLog(`[conductor] Deck parsed. Slides: ${result.deck.slides.length}. Slide 0 diagramBlocks: ${result.deck.slides[0]?.diagramBlocks?.length ?? 0}`);

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
        'deckPilot.closePresentation',
        async () => {
            if (conductor?.isActive()) {
                await conductor.close();
            }
        }
    );

    const resetPresentationDisposable = vscode.commands.registerCommand(
        'deckPilot.resetPresentation',
        async () => {
            if (conductor?.isActive()) {
                await conductor.reset();
            }
        }
    );

    const nextSlideDisposable = vscode.commands.registerCommand(
        'deckPilot.nextSlide',
        async () => {
            if (conductor?.isActive()) {
                await conductor.nextSlide();
            }
        }
    );

    const previousSlideDisposable = vscode.commands.registerCommand(
        'deckPilot.previousSlide',
        async () => {
            if (conductor?.isActive()) {
                await conductor.previousSlide();
            }
        }
    );

    const openPresenterViewDisposable = vscode.commands.registerCommand(
        'deckPilot.openPresenterView',
        () => {
            conductor?.openPresenterView();
        }
    );

    // T014: Go to slide command — opens slide picker in the Webview
    const goToSlideDisposable = vscode.commands.registerCommand(
        'deckPilot.goToSlide',
        () => {
            conductor?.openSlidePicker();
        }
    );

    const openPreviewDisposable = vscode.commands.registerCommand(
        'deckPilot.openPreview',
        async (resource?: vscode.Uri) => {
            const deckUri = await resolveDeckUriFromArg(resource);
            if (!deckUri) {
                void vscode.window.showWarningMessage('Open a markdown (.md, .deck.md) file first to preview.');
                return;
            }
            if (!previewProvider) {
                previewProvider = new PreviewProvider(context.extensionUri, conductor!.getDiagramRegistry());
                context.subscriptions.push(previewProvider);
            }
            await previewProvider.show(deckUri);
        }
    );

    const validateDeckDisposable = vscode.commands.registerCommand(
        'deckPilot.validateDeck',
        async () => {
            const editor = vscode.window.activeTextEditor;
            
            // Resolve deck URI (.deck.md, .deck.yaml sidecar, or a content-imported file).
            const deckUri = await resolveDeckUri(editor);
            
            if (!deckUri) {
                const activeFile = editor?.document.fileName;
                if (activeFile?.endsWith('.deck.yaml')) {
                    void vscode.window.showWarningMessage(
                        'No paired .deck.md or .md file found. Create a markdown file alongside this sidecar.'
                    );
                } else {
                    void vscode.window.showWarningMessage('Open a markdown (.md, .deck.md) file first to validate.');
                }
                return;
            }
            
            // Load the deck document
            const deckDocument = await vscode.workspace.openTextDocument(deckUri);
            await conductor?.validateDeck(deckDocument);
        }
    );

    const startRecordingDisposable = vscode.commands.registerCommand(
        'deckPilot.startRecording',
        async () => {
            if (!conductor?.isActive()) {
                void vscode.window.showWarningMessage('Start a presentation first before recording.');
                return;
            }
            if (conductor.isRecording()) {
                void vscode.window.showWarningMessage('Recording is already active.');
                return;
            }
            const windowTarget = await captureActiveRecordingWindow();
            await conductor.startRecording(undefined, windowTarget);
            void vscode.window.showInformationMessage('🔴 Recording started');
        }
    );

    const stopRecordingDisposable = vscode.commands.registerCommand(
        'deckPilot.stopRecording',
        async () => {
            if (!conductor?.isRecording()) {
                void vscode.window.showWarningMessage('No active recording to stop.');
                return;
            }
            const session = await conductor.stopRecording();
            if (session) {
                const { RecordingSerializer } = await import('./recording/recordingSerializer');
                const { VoiceOverScriptGenerator } = await import('./recording/voiceOverScriptGenerator');
                const { CaptionsScaffoldGenerator } = await import('./recording/captionsScaffoldGenerator');

                const outputDir = session.outputDirectory ?? path.dirname(session.deckPath);
                const serializer = new RecordingSerializer();
                const scriptGen = new VoiceOverScriptGenerator();
                const captionGen = new CaptionsScaffoldGenerator();

                const sessionFiles = await serializer.exportSession(session, outputDir);
                const scriptFiles = await scriptGen.exportScripts(session, outputDir);

                // Export SRT next to the video file if recorder was used, otherwise next to the deck
                const captionDir = session.recorder?.outputPath
                    ? path.dirname(session.recorder.outputPath)
                    : outputDir;
                const captionFile = await captionGen.exportSrt(session, captionDir);

                const allFiles = [...sessionFiles, ...scriptFiles, captionFile];
                void showRecordingComplete(
                    `⏹️ Recording saved: ${allFiles.length} files exported`,
                    allFiles,
                    captionFile,
                    path.dirname(session.deckPath),
                    session.composition?.outputPath ?? session.recorder?.outputPath,
                );
            }
        }
    );

    // Recording marker commands (Phase 2)
    const markRetakeDisposable = vscode.commands.registerCommand(
        'deckPilot.markRetake',
        async () => {
            if (!conductor?.isRecording()) {
                void vscode.window.showWarningMessage('No active recording.');
                return;
            }
            const note = await vscode.window.showInputBox({
                prompt: 'Retake note (optional)',
                placeHolder: 'Describe what to redo...',
            });
            conductor.markRetake(note);
            void vscode.window.showInformationMessage('🔁 Retake point marked');
        }
    );

    const toggleRecordingPauseDisposable = vscode.commands.registerCommand(
        'deckPilot.toggleRecordingPause',
        async () => {
            if (!conductor?.isRecording()) {
                return;
            }
            if (conductor.isRecordingPaused()) {
                conductor.resumeRecordingTiming();
                void vscode.window.showInformationMessage('▶️ Timing resumed');
            } else {
                conductor.pauseRecordingTiming();
                void vscode.window.showInformationMessage('⏸️ Timing paused');
            }
        }
    );

    const autoRecordDisposable = vscode.commands.registerCommand(
        'deckPilot.autoRecord',
        async () => {
            if (conductor?.isRecording() || conductor?.isAutoPilotActive() || narrationWorkflowRunning) {
                await vscode.window.showErrorMessage('A recording or narration workflow is already running.', { modal: true });
                return;
            }

            const windowTarget = await captureActiveRecordingWindow();
            narrationWorkflowRunning = true;
            try {
                const presentedDeckPath = conductor?.isActive() &&
                    fs.existsSync(conductor.getDeck()?.filePath ?? '')
                    ? conductor.getDeck()?.filePath
                    : undefined;
                const editorDeckUri = presentedDeckPath
                    ? undefined
                    : await resolveDeckUri(vscode.window.activeTextEditor);
                const selectedDeckPath = selectAutoRecordDeckPath(
                    presentedDeckPath,
                    editorDeckUri?.fsPath,
                );
                const deckUri = presentedDeckPath && selectedDeckPath
                    ? vscode.Uri.file(selectedDeckPath)
                    : editorDeckUri;
                if (!deckUri) {
                    void vscode.window.showWarningMessage(
                        'Open the deck you want to auto-record.',
                    );
                    return;
                }

                const targetDeckUri = deckUri;
                const redirectToNarration = async (): Promise<void> => {
                    narrationWorkflowRunning = false;
                    await offerNarrationPreparation({
                        showWarning: (message, action) =>
                            vscode.window.showWarningMessage(message, { modal: true }, action),
                        executeCommand: command => vscode.commands.executeCommand(command),
                    });
                };
                const prepared = await runAutoRecordPreflight({
                    loadNarration: async () => {
                        const document = await vscode.workspace.openTextDocument(targetDeckUri);
                        const narrationSetup = await loadDeckNarrationSetup(
                            targetDeckUri.fsPath,
                            document.getText(),
                            getRecorderConfig().outputDir,
                        );
                        const project = await createNarrationProject(
                            narrationSetup.cues,
                            narrationSetup.narrationDirectory,
                        );
                        if (!project.hadExistingProject) {
                            await redirectToNarration();
                            return undefined;
                        }

                        try {
                            await resyncNarrationProject(
                                project.srtPath,
                                path.dirname(narrationSetup.deckPath),
                            );
                            const timings = await vscode.window.withProgress(
                                {
                                    location: vscode.ProgressLocation.Notification,
                                    title: 'Preparing narration takes',
                                },
                                async () => {
                                    await prepareNarrationProject(
                                        project.srtPath,
                                        path.dirname(narrationSetup.deckPath),
                                    );
                                    return loadNarrationTimings(project, narrationSetup.cues);
                                },
                            );
                            return { project, timings };
                        } catch (error) {
                            if (!requiresNarrationUpdate(error)) {
                                throw error;
                            }
                            await redirectToNarration();
                            return undefined;
                        }
                    },
                    confirmStart: async () => {
                        const choice = await vscode.window.showWarningMessage(
                            'Auto-Record will drive and capture the presentation using your prepared narration timings.',
                            { modal: true },
                            'Start',
                        );
                        return choice === 'Start';
                    },
                    openPresentation: async () => {
                        const activeDeckPath = conductor?.getDeck()?.filePath;
                        if (conductor?.isActive() && activeDeckPath &&
                            path.normalize(activeDeckPath) === path.normalize(targetDeckUri.fsPath)) {
                            await conductor.refreshDeckFromDisk();
                        } else {
                            await vscode.commands.executeCommand(
                                'deckPilot.openPresentation',
                                targetDeckUri,
                            );
                        }
                        return conductor?.isActive() === true &&
                            path.normalize(conductor.getDeck()?.filePath ?? '') ===
                                path.normalize(targetDeckUri.fsPath);
                    },
                });
                if (!prepared || !conductor?.isActive()) {
                    return;
                }

                const setup = conductor.createNarrationSetup();
                if (!setup) {
                    throw new Error('The active presentation has no loaded deck.');
                }
                const { project, timings } = prepared;

                void vscode.window.showInformationMessage('Auto-pilot started using measured narration timing.');
                const session = await conductor.autoRecord(timings, setup.outputDirectory, windowTarget);
                if (!session) {
                    return;
                }
                const { RecordingSerializer } = await import('./recording/recordingSerializer');
                const { VoiceOverScriptGenerator } = await import('./recording/voiceOverScriptGenerator');
                const { CaptionsScaffoldGenerator } = await import('./recording/captionsScaffoldGenerator');

                const outputDir = session.outputDirectory ?? path.dirname(session.deckPath);
                const serializer = new RecordingSerializer();
                const scriptGen = new VoiceOverScriptGenerator();
                const captionGen = new CaptionsScaffoldGenerator();

                const sessionFiles = await serializer.exportSession(session, outputDir);
                const scriptFiles = await scriptGen.exportNarrationScripts(session, outputDir, timings);

                const recordedVideo = session.composition?.outputPath ?? session.recorder?.outputPath;
                if (!recordedVideo) {
                    throw new Error(
                        'Presentation capture completed without a video. Configure deckPilot.recording.startCommand.',
                    );
                }

                const videoBasename = recordingDeckName(setup.deckPath);
                const sessionProject = await stageNarrationProjectForSession(
                    project,
                    outputDir,
                    captionGen.generateNarrationSrt(session, timings),
                    videoBasename,
                );
                const captionFile = sessionProject.srtPath;

                try {
                    await fs.promises.access(recordedVideo);
                } catch {
                    const errorDetail = session.compositionError ?? session.recorder?.error;
                    const reason = errorDetail ? ` (${errorDetail.trim()})` : '';
                    throw new Error(
                        `Presentation capture did not produce a video file at ${recordedVideo}.${reason} Check your screen recording configuration (deckPilot.recording.startCommand and deckPilot.recording.screenDevice).`,
                    );
                }
                const dubbedVideo = await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: 'Assembling narrated presentation',
                    },
                    async () => {
                        await resyncNarrationProject(
                            captionFile,
                            path.dirname(setup.deckPath),
                        );
                        return assembleNarrationProject(
                            captionFile,
                            recordedVideo,
                            path.dirname(setup.deckPath),
                        );
                    },
                );

                const allFiles = [
                    ...sessionFiles,
                    ...scriptFiles,
                    captionFile,
                    sessionProject.projectPath,
                    dubbedVideo,
                ];
                await showRecordingComplete(
                    `Auto-record complete: ${allFiles.length} files exported`,
                    allFiles,
                    captionFile,
                    path.dirname(session.deckPath),
                    dubbedVideo,
                    false,
                );
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                await vscode.window.showErrorMessage(`Auto-record failed: ${message}`, { modal: true });
            } finally {
                narrationWorkflowRunning = false;
            }
        }
    );

    const recordNarrationDisposable = vscode.commands.registerCommand(
        'deckPilot.recordNarration',
        async () => {
            let deckUri = await resolveDeckUri(vscode.window.activeTextEditor);
            if (!deckUri && conductor?.isActive()) {
                const activeDeck = conductor.getDeck();
                if (activeDeck?.filePath && fs.existsSync(activeDeck.filePath)) {
                    deckUri = vscode.Uri.file(activeDeck.filePath);
                }
            }
            if (!deckUri) {
                const allDecks = await findDeckFiles();
                if (allDecks.length === 1) {
                    deckUri = allDecks[0];
                } else if (allDecks.length > 1) {
                    const pick = await vscode.window.showQuickPick(
                        allDecks.map(d => ({
                            label: path.basename(d.fsPath),
                            description: path.relative(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '', d.fsPath),
                            uri: d,
                        })),
                        { placeHolder: 'Select the deck whose narration you want to record or update' },
                    );
                    if (pick) {
                        deckUri = pick.uri;
                    }
                }
            }
            if (!deckUri) {
                void vscode.window.showWarningMessage(
                    'Open the deck whose narration you want to record or update.',
                );
                return;
            }

            if (narrationWorkflowRunning) {
                await vscode.window.showErrorMessage('A narration workflow is already running.', { modal: true });
                return;
            }

            narrationWorkflowRunning = true;
            try {
                const document = await vscode.workspace.openTextDocument(deckUri);
                const setup = await loadDeckNarrationSetup(
                    deckUri.fsPath,
                    document.getText(),
                    getRecorderConfig().outputDir,
                );
                const persistentProjectPath = path.join(
                    setup.narrationDirectory,
                    'narration-project.json',
                );
                if (!fs.existsSync(persistentProjectPath)) {
                    const latest = await findLatestNarrationArtifacts([
                        path.dirname(setup.narrationDirectory),
                    ]);
                    if (latest) {
                        await seedNarrationProject(setup.narrationDirectory, latest.srtPath);
                    }
                }
                const project = await createNarrationProject(setup.cues, setup.narrationDirectory);
                if (project.hadExistingProject) {
                    await resyncNarrationProject(project.srtPath, path.dirname(setup.deckPath));
                }

                void vscode.window.showInformationMessage(
                    project.hadExistingProject
                        ? 'Existing takes were matched by cue text. Record only pending or changed cues.'
                        : 'Record the narration cues in srt-dubber, then quit to save the project.',
                );
                const recorded = await recordNarrationProject(
                    project.srtPath,
                    path.dirname(setup.deckPath),
                );
                if (!recorded) {
                    throw new Error('Narration recording did not complete successfully.');
                }

                try {
                    await prepareNarrationProject(project.srtPath, path.dirname(setup.deckPath));
                    const timings = await loadNarrationTimings(project, setup.cues);
                    void vscode.window.showInformationMessage(
                        `Narration ready: ${timings.length} cue${timings.length === 1 ? '' : 's'} prepared.`,
                    );
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    void vscode.window.showWarningMessage(
                        `Narration project saved, but some cues still need recording. ${message}`,
                    );
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                await vscode.window.showErrorMessage(`Narration update failed: ${message}`, { modal: true });
            } finally {
                narrationWorkflowRunning = false;
            }
        },
    );

    const cancelAutoRecordDisposable = vscode.commands.registerCommand(
        'deckPilot.cancelAutoRecord',
        () => {
            if (conductor?.isAutoPilotActive()) {
                conductor.cancelAutoPilot();
                void vscode.window.showInformationMessage('🛑 Auto-pilot cancelled');
            }
        }
    );

    // DA-23: Extract Metadata to Sidecar — scaffold .deck.yaml from active .deck.md
    const extractMetadataToSidecarDisposable = vscode.commands.registerCommand(
        'deckpilot.extractMetadataToSidecar',
        () => extractMetadataToSidecar()
    );

    // Install authoring skills (SKILL.md bundle) into the workspace
    const installAuthoringSkillsDisposable = vscode.commands.registerCommand(
        'deckPilot.installAuthoringSkills',
        () => installAuthoringSkills(context)
    );

    // DA-24: Show Resolved Deck Model — virtual read-only JSON document
    const deckModelProvider = new DeckModelContentProvider();
    const deckModelProviderDisposable = vscode.workspace.registerTextDocumentContentProvider(
        'deckpilot-model',
        deckModelProvider
    );

    const showResolvedDeckModelDisposable = vscode.commands.registerCommand(
        'deckpilot.showResolvedDeckModel',
        () => showResolvedDeckModel(deckModelProvider)
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

    const diagnosticProvider = new ActionDiagnosticProvider(new EnvRuleValidator());
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('deckPilotActions');

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
        if (doc.uri.fsPath.endsWith('.deck.md')) {
            diagramLog(`[extension] Deck file opened in editor (diagnostics only; presentation parse not triggered): ${doc.uri.fsPath}`);
        }
        updateDiagnostics(doc);
    });
    const onCloseDisposable = vscode.workspace.onDidCloseTextDocument((doc) => {
        diagnosticCollection.delete(doc.uri);
    });

    // Update diagnostics for all currently open deck-markdown documents
    for (const doc of vscode.workspace.textDocuments) {
        updateDiagnostics(doc);
    }

    // Watch .deck.env files — re-trigger deck-markdown diagnostics on env file changes (T049)
    const envFileWatcher = vscode.workspace.createFileSystemWatcher('**/*.deck.env');
    const refreshDiagnosticsOnEnvChange = () => {
        for (const doc of vscode.workspace.textDocuments) {
            if (doc.languageId === 'deck-markdown') {
                updateDiagnostics(doc);
            }
        }
    };
    envFileWatcher.onDidChange(refreshDiagnosticsOnEnvChange);
    envFileWatcher.onDidCreate(refreshDiagnosticsOnEnvChange);
    envFileWatcher.onDidDelete(refreshDiagnosticsOnEnvChange);

    // Watch .deck.yaml sidecar files — re-trigger deck-markdown diagnostics on sidecar changes (DA-13)
    const sidecarFileWatcher = vscode.workspace.createFileSystemWatcher('**/*.deck.yaml');
    sidecarFileWatcher.onDidChange(refreshDiagnosticsOnEnvChange);
    sidecarFileWatcher.onDidCreate(refreshDiagnosticsOnEnvChange);
    sidecarFileWatcher.onDidDelete(refreshDiagnosticsOnEnvChange);

    context.subscriptions.push(
        openPresentationDisposable,
        closePresentationDisposable,
        resetPresentationDisposable,
        nextSlideDisposable,
        previousSlideDisposable,
        openPresenterViewDisposable,
        goToSlideDisposable,
        openPreviewDisposable,
        validateDeckDisposable,
        startRecordingDisposable,
        stopRecordingDisposable,
        markRetakeDisposable,
        toggleRecordingPauseDisposable,
        autoRecordDisposable,
        recordNarrationDisposable,
        cancelAutoRecordDisposable,
        extractMetadataToSidecarDisposable,
        installAuthoringSkillsDisposable,
        deckModelProviderDisposable,
        showResolvedDeckModelDisposable,
        completionDisposable,
        hoverDisposable,
        diagnosticCollection,
        onChangeDisposable,
        onOpenDisposable,
        onCloseDisposable,
        envFileWatcher,
        sidecarFileWatcher,
        { dispose() { diagnosticProvider.dispose(); } }
    );

    // First-run: offer to install authoring skills into the workspace
    void maybeOfferAuthoringSkillsInstall(context);

    // Diagram plugin API — companion extensions register renderers here
    return {
        version: '0.9.36',
        registerDiagramRenderer(renderer: IDiagramRenderer): { dispose(): void } {
            return conductor?.getDiagramRegistry().register(renderer) ?? { dispose(): void {} };
        },
    };
}

export function deactivate(): void {
    console.log('Deckpilot extension is now deactivated');
    conductor?.dispose();
    conductor = undefined;
}
