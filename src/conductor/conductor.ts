/**
 * Conductor - orchestrates presentation navigation, actions, and state
 */

import * as vscode from 'vscode';
import { Deck } from '../models/deck';
import { EnvStatus, EnvStatusEntry, ResolvedEnv } from '../models/env';
import { Slide } from '../models/slide';
import { Action, ActionType } from '../models/action';
import { StateStack } from './stateStack';
import { SnapshotFactory } from './snapshotFactory';
import { NavigationHistory } from './navigationHistory';
import { SceneStore } from './sceneStore';
import { WebviewProvider, WebviewCallbacks } from '../webview/webviewProvider';
import { PresenterViewProvider } from '../webview/presenterViewProvider';
import { getActionRegistry } from '../actions/registry';
import { isTrusted, onTrustChanged } from '../utils/workspaceTrust';
import { enterZenMode, exitZenMode, resetZenModeState } from '../utils/zenMode';
import { parseRenderDirectives, resolveDirective, createLoadingPlaceholder, formatAsCommandBlock, renderCommand, StreamCallback, renderBlockElements } from '../renderer';
import { parseDeck } from '../parser';
import { PreflightValidator } from '../validation/preflightValidator';
import { ValidationReport, ValidationIssue } from '../validation/types';
import { EnvFileLoader, EnvResolver } from '../env';

/**
 * Actions that require workspace trust
 */
const TRUSTED_ACTION_TYPES: ActionType[] = ['terminal.run', 'debug.start'];

/**
 * Main orchestrator for presentation lifecycle
 */
export class Conductor implements vscode.Disposable {
  private deck: Deck | undefined;
  private currentSlideIndex = 0;
  private stateStack: StateStack;
  private snapshotFactory: SnapshotFactory;
  private navigationHistory: NavigationHistory;
  private sceneStore: SceneStore;
  private webviewProvider: WebviewProvider;
  private presenterViewProvider: PresenterViewProvider;
  private disposables: vscode.Disposable[] = [];
  private outputChannel: vscode.OutputChannel;
  private validationOutputChannel: vscode.OutputChannel;
  private validationDiagnostics: vscode.DiagnosticCollection;
  private cancellationTokenSource: vscode.CancellationTokenSource | undefined;
  private envFileLoader: EnvFileLoader;
  private envResolver: EnvResolver;
  private resolvedEnv: ResolvedEnv | undefined;

  constructor(extensionUri: vscode.Uri) {
    this.stateStack = new StateStack();
    this.snapshotFactory = new SnapshotFactory();
    this.navigationHistory = new NavigationHistory();
    this.sceneStore = new SceneStore();
    this.webviewProvider = new WebviewProvider(extensionUri);
    this.presenterViewProvider = new PresenterViewProvider(extensionUri);

    this.outputChannel = vscode.window.createOutputChannel('Executable Talk');
    this.validationOutputChannel = vscode.window.createOutputChannel('Executable Talk Validation');
    this.validationDiagnostics = vscode.languages.createDiagnosticCollection('Executable Talk: Validation');
    this.disposables.push(this.outputChannel, this.validationOutputChannel, this.validationDiagnostics);

    // Env resolution dependencies (Feature 006)
    this.envFileLoader = new EnvFileLoader();
    this.envResolver = new EnvResolver();

    // Listen for workspace trust changes
    this.disposables.push(
      onTrustChanged((trusted) => {
        this.webviewProvider.sendTrustStatusChanged({ isTrusted: trusted });
      })
    );
  }

  /**
   * Open a deck for presentation
   */
  async openDeck(deck: Deck): Promise<void> {
    // Clear previous state
    this.stateStack.clear();
    this.snapshotFactory.clearTracking();
    resetZenModeState();

    // Set up deck
    this.deck = deck;
    this.deck.state = 'loading';
    this.currentSlideIndex = 0;

    // Resolve environment variables (Feature 006 — T016)
    await this.resolveEnvironment(deck);

    // Load authored scenes from deck frontmatter (T044 [US5])
    if (deck.metadata?.scenes && deck.metadata.scenes.length > 0) {
      this.sceneStore.loadAuthored(deck.metadata.scenes);
    }

    // Render slides
    this.renderSlides();

    // Check if deck contains executable actions and show first-use warning
    const hasExecutableActions = this.deckHasExecutableActions(deck);
    if (hasExecutableActions) {
      const proceed = await this.showFirstUseConfirmation(deck);
      if (!proceed) {
        this.deck.state = 'idle';
        return;
      }
    }

    // Enter Zen Mode if enabled (default: true)
    const zenModeEnabled = deck.metadata?.options?.zenMode !== false;
    if (zenModeEnabled) {
      await enterZenMode();
    }

    // Create webview callbacks
    const callbacks: WebviewCallbacks = {
      onNavigate: (direction, slideIndex, showAllFragments) => this.handleNavigate(direction, slideIndex, showAllFragments),
      onExecuteAction: (actionId) => void this.handleExecuteAction(actionId),
      onUndo: () => this.handleUndo(),
      onRedo: () => this.handleRedo(),
      onClose: () => void this.close(),
      onReady: () => this.handleReady(),
      onVscodeCommand: (commandId, args) => void this.handleVscodeCommand(commandId, args),
      onGoBack: () => this.handleGoBack(),
      onSaveScene: (sceneName) => void this.handleSaveScene(sceneName),
      onRestoreScene: (sceneName) => void this.handleRestoreScene(sceneName),
      onDeleteScene: (sceneName) => this.handleDeleteScene(sceneName),
    };

    // Show presentation
    this.webviewProvider.show(this.deck, callbacks);
    this.deck.state = 'active';
  }

  /**
   * Navigate to a specific slide
   */
  async goToSlide(index: number, showAllFragments?: boolean): Promise<void> {
    if (!this.deck) {
      return;
    }

    // Bounds check
    const targetIndex = Math.max(0, Math.min(index, this.deck.slides.length - 1));

    // Capture snapshot before navigation
    const snapshot = this.snapshotFactory.capture(this.currentSlideIndex, `Before slide ${targetIndex + 1}`);
    this.stateStack.push(snapshot);

    // Update current index
    this.currentSlideIndex = targetIndex;
    this.deck.currentSlideIndex = targetIndex;

    // Get current slide
    const slide = this.deck.slides[targetIndex];

    // Resolve render directives in slide content
    const resolvedHtml = this.resolveSlideRenderDirectives(slide);

    // Send slide changed to webview
    this.webviewProvider.sendSlideChanged({
      slideIndex: targetIndex,
      totalSlides: this.deck.slides.length,
      slideHtml: resolvedHtml,
      canUndo: this.stateStack.canUndo(),
      canRedo: this.stateStack.canRedo(),
      showAllFragments,
      fragmentCount: slide.fragmentCount,
      navigationHistory: this.navigationHistory.getRecent(10),
      canGoBack: this.navigationHistory.canGoBack(),
      totalHistoryEntries: this.navigationHistory.length,
    });

    // Sync presenter view if visible
    this.presenterViewProvider.updateSlide(targetIndex);

    // Execute onEnter actions if any
    if (slide.onEnterActions && slide.onEnterActions.length > 0) {
      await this.executeSlideActions(slide);
    }
  }

  /**
   * Navigate to next slide
   */
  async nextSlide(): Promise<void> {
    if (this.deck && this.currentSlideIndex < this.deck.slides.length - 1) {
      const targetIndex = this.currentSlideIndex + 1;
      const title = this.deck.slides[targetIndex]?.frontmatter?.title;
      this.navigationHistory.push(targetIndex, 'sequential', title);
    }
    await this.goToSlide(this.currentSlideIndex + 1);
  }

  /**
   * Navigate to previous slide
   */
  async previousSlide(showAllFragments?: boolean): Promise<void> {
    if (this.deck && this.currentSlideIndex > 0) {
      const targetIndex = this.currentSlideIndex - 1;
      const title = this.deck.slides[targetIndex]?.frontmatter?.title;
      this.navigationHistory.push(targetIndex, 'sequential', title);
    }
    await this.goToSlide(this.currentSlideIndex - 1, showAllFragments);
  }

  /**
   * Navigate to first slide
   */
  async firstSlide(): Promise<void> {
    if (this.deck) {
      const title = this.deck.slides[0]?.frontmatter?.title;
      this.navigationHistory.push(0, 'sequential', title);
    }
    await this.goToSlide(0);
  }

  /**
   * Navigate to last slide
   */
  async lastSlide(): Promise<void> {
    if (this.deck) {
      const lastIndex = this.deck.slides.length - 1;
      const title = this.deck.slides[lastIndex]?.frontmatter?.title;
      this.navigationHistory.push(lastIndex, 'sequential', title);
      await this.goToSlide(lastIndex);
    }
  }

  /**
   * Undo the last action/navigation
   */
  async undo(): Promise<void> {
    const snapshot = this.stateStack.undo();
    if (snapshot) {
      await this.snapshotFactory.restore(snapshot);
      
      // Navigate to snapshot's slide
      this.currentSlideIndex = snapshot.slideIndex;
      if (this.deck) {
        this.deck.currentSlideIndex = snapshot.slideIndex;
        const slide = this.deck.slides[snapshot.slideIndex];
        
        // Resolve render directives
        const resolvedHtml = this.resolveSlideRenderDirectives(slide);
        
        this.webviewProvider.sendSlideChanged({
          slideIndex: snapshot.slideIndex,
          totalSlides: this.deck.slides.length,
          slideHtml: resolvedHtml,
          canUndo: this.stateStack.canUndo(),
          canRedo: this.stateStack.canRedo(),
          navigationHistory: this.navigationHistory.getRecent(10),
          canGoBack: this.navigationHistory.canGoBack(),
          totalHistoryEntries: this.navigationHistory.length,
        });
      }
    }
  }

  /**
   * Redo a previously undone action
   */
  async redo(): Promise<void> {
    const snapshot = this.stateStack.redo();
    if (snapshot) {
      // For redo, we just navigate to the slide
      // The actions will need to be re-executed
      await this.goToSlide(snapshot.slideIndex);
    }
  }

  /**
   * Close the presentation
   */
  async close(): Promise<void> {
    // Exit Zen Mode
    await exitZenMode();

    // Clear state
    this.stateStack.clear();
    this.snapshotFactory.disposeDecorations();
    this.snapshotFactory.clearTracking();

    // Close webview and presenter view
    this.webviewProvider.close();
    this.presenterViewProvider.close();

    // Update deck state
    if (this.deck) {
      this.deck.state = 'closed';
    }
  }

  /**
   * Open the presenter view (speaker notes + next slide preview)
   */
  openPresenterView(): void {
    if (!this.deck) {
      void vscode.window.showWarningMessage('No presentation is currently open');
      return;
    }
    this.presenterViewProvider.show(this.deck, this.currentSlideIndex);
  }

  /**
   * Close the presenter view
   */
  closePresenterView(): void {
    this.presenterViewProvider.close();
  }

  /**
   * Validate deck — runs preflight checks and reports results via
   * DiagnosticCollection, OutputChannel, and notification toast.
   * Per T022 and contracts/preflight-validation.md.
   */
  async validateDeck(document: vscode.TextDocument): Promise<ValidationReport | undefined> {
    const content = document.getText();
    const filePath = document.uri.fsPath;

    // Parse the deck first
    const parseResult = parseDeck(content, filePath);
    if (!parseResult.deck) {
      void vscode.window.showWarningMessage(
        `Cannot validate: ${parseResult.error || 'Failed to parse deck'}`
      );
      return undefined;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';

    // Run validation with progress
    const report = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Validating deck...',
        cancellable: true,
      },
      async (_progress, token) => {
        const validator = new PreflightValidator();
        return validator.validate({
          deck: parseResult.deck!,
          workspaceRoot,
          isTrusted: isTrusted(),
          cancellationToken: token,
        });
      }
    );

    // Map issues to diagnostics
    this.applyDiagnostics(document.uri, report.issues);

    // Write to output channel
    this.writeValidationLog(report);

    // Show summary notification
    this.showValidationSummary(report);

    return report;
  }

  /**
   * Map ValidationIssues to VS Code diagnostics on the .deck.md file.
   */
  private applyDiagnostics(uri: vscode.Uri, issues: ValidationIssue[]): void {
    const diagnostics: vscode.Diagnostic[] = issues.map((issue) => {
      const line = (issue.line ?? 1) - 1; // Convert to 0-based
      const range = new vscode.Range(line, 0, line, 1000);
      const severity = issue.severity === 'error'
        ? vscode.DiagnosticSeverity.Error
        : issue.severity === 'warning'
          ? vscode.DiagnosticSeverity.Warning
          : vscode.DiagnosticSeverity.Information;

      const diag = new vscode.Diagnostic(range, issue.message, severity);
      diag.source = 'Executable Talk';
      return diag;
    });

    this.validationDiagnostics.set(uri, diagnostics);
  }

  /**
   * Write detailed validation log to the output channel.
   */
  private writeValidationLog(report: ValidationReport): void {
    const ch = this.validationOutputChannel;
    ch.appendLine('═══════════════════════════════════════════');
    ch.appendLine('Executable Talk: Validate Deck');
    ch.appendLine('═══════════════════════════════════════════');
    ch.appendLine(`File: ${report.deckFilePath}`);
    ch.appendLine(`Time: ${new Date(report.timestamp).toISOString()} (${report.durationMs}ms)`);
    ch.appendLine('');

    if (report.passed) {
      ch.appendLine(`✅ ${report.checksPerformed} checks passed`);
    } else {
      ch.appendLine(`❌ ${report.issues.filter(i => i.severity === 'error').length} error(s) found`);
    }

    const warnings = report.issues.filter(i => i.severity === 'warning').length;
    if (warnings > 0) {
      ch.appendLine(`⚠️  ${warnings} warning(s)`);
    }

    ch.appendLine(`   • ${report.slideCount} slides, ${report.actionCount} actions, ${report.renderDirectiveCount} render directives`);
    ch.appendLine('');

    for (const issue of report.issues) {
      const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
      ch.appendLine(`${icon} [Slide ${issue.slideIndex + 1}] ${issue.source}: ${issue.message}`);
    }

    ch.appendLine('');
  }

  /**
   * Show a summary notification with "Show Problems" action.
   */
  private showValidationSummary(report: ValidationReport): void {
    const errors = report.issues.filter(i => i.severity === 'error').length;
    const warnings = report.issues.filter(i => i.severity === 'warning').length;

    if (report.passed && warnings === 0) {
      void vscode.window.showInformationMessage(
        `✅ Deck validated: ${report.checksPerformed} checks passed`
      );
    } else if (report.passed) {
      void vscode.window.showWarningMessage(
        `⚠️ Deck validated with ${warnings} warning(s)`,
        'Show Problems'
      ).then(action => {
        if (action === 'Show Problems') {
          void vscode.commands.executeCommand('workbench.actions.view.problems');
        }
      });
    } else {
      void vscode.window.showErrorMessage(
        `❌ Deck validation failed: ${errors} error(s), ${warnings} warning(s)`,
        'Show Problems'
      ).then(action => {
        if (action === 'Show Problems') {
          void vscode.commands.executeCommand('workbench.actions.view.problems');
        }
      });
    }
  }

  /**
   * Reset presentation to initial state
   */
  async reset(): Promise<void> {
    // Clear all state
    this.stateStack.clear();
    this.snapshotFactory.disposeDecorations();
    this.snapshotFactory.clearTracking();
    this.navigationHistory.clear();
    this.sceneStore.clear();

    // Go back to first slide
    if (this.deck) {
      this.currentSlideIndex = 0;
      this.deck.currentSlideIndex = 0;
      await this.goToSlide(0);
    }
  }

  /**
   * Open the slide picker overlay in the Webview.
   * Per contracts/navigation-protocol.md — sends slide list to Webview.
   * Called by executableTalk.goToSlide command (T014).
   */
  openSlidePicker(): void {
    if (!this.deck) {
      return;
    }

    const slides = this.deck.slides.map((slide, i) => ({
      index: i,
      title: slide.frontmatter?.title ?? `Slide ${i + 1}`,
    }));

    this.webviewProvider.sendOpenSlidePicker({
      slides,
      currentIndex: this.currentSlideIndex,
    });
  }

  /**
   * Request the Webview to show the scene name input dialog.
   * Per contracts/scene-store.md — called by Ctrl+S keybinding (T024).
   */
  requestSaveScene(): void {
    if (!this.deck) {
      return;
    }
    this.webviewProvider.sendOpenSceneNameInput();
  }

  /**
   * Request the Webview to show the scene picker for restore.
   * Per contracts/scene-store.md — called by Ctrl+R keybinding (T025).
   */
  requestRestoreScene(): void {
    if (!this.deck) {
      return;
    }
    const scenes = this.sceneStore.list().map(e => ({
      name: e.name,
      slideIndex: e.slideIndex,
      isAuthored: e.origin === 'authored',
    }));
    this.webviewProvider.sendOpenScenePicker({ scenes });
  }

  /**
   * Check if presentation is active
   */
  isActive(): boolean {
    return this.webviewProvider.isOpen();
  }

  /**
   * Dispose of the conductor
   */
  dispose(): void {
    this.webviewProvider.dispose();
    this.presenterViewProvider.dispose();
    this.snapshotFactory.disposeDecorations();
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }

  // ============================================================================
  // Private methods
  // ============================================================================

  private handleNavigate(direction: 'next' | 'previous' | 'first' | 'last' | 'goto', slideIndex?: number, showAllFragments?: boolean): void {
    switch (direction) {
      case 'next':
        void this.nextSlide();
        break;
      case 'previous':
        void this.previousSlide(showAllFragments);
        break;
      case 'first':
        void this.firstSlide();
        break;
      case 'last':
        void this.lastSlide();
        break;
      case 'goto':
        if (slideIndex !== undefined) {
          void this.handleGoto(slideIndex);
        }
        break;
    }
  }

  /**
   * Handle goto navigation — jump to a specific slide by index.
   * Validates range, records history, captures snapshot, navigates.
   * Per contracts/navigation-protocol.md.
   */
  private async handleGoto(slideIndex: number): Promise<void> {
    if (!this.deck) {
      return;
    }

    // Validate slide index
    if (slideIndex < 0 || slideIndex >= this.deck.slides.length) {
      this.webviewProvider.sendError({
        code: 'INVALID_SLIDE_INDEX',
        message: `Slide index ${slideIndex} is out of range (0-${this.deck.slides.length - 1})`,
        recoverable: true,
      });
      return;
    }

    // Record where we came from in navigation history
    const currentSlide = this.deck.slides[this.currentSlideIndex];
    this.navigationHistory.push(
      this.currentSlideIndex,
      'jump',
      currentSlide?.frontmatter?.title
    );

    // Navigate
    await this.goToSlide(slideIndex);
  }

  /**
   * Handle goBack navigation — return to the previously visited slide.
   * Per contracts/navigation-protocol.md.
   */
  private handleGoBack(): void {
    const previousSlideIndex = this.navigationHistory.goBack();
    if (previousSlideIndex !== null) {
      void this.goToSlide(previousSlideIndex);
    } else {
      this.webviewProvider.sendWarning({
        code: 'NO_HISTORY',
        message: 'No navigation history to go back to',
      });
    }
  }

  /**
   * Handle saveScene message — save current IDE state as a named scene.
   * Per contracts/scene-store.md Save Flow (T026).
   */
  private async handleSaveScene(sceneName: string): Promise<void> {
    if (!this.deck) {
      return;
    }

    try {
      const snapshot = this.snapshotFactory.capture(this.currentSlideIndex, `Scene: ${sceneName}`);
      this.sceneStore.save(sceneName, snapshot, this.currentSlideIndex);

      // Notify Webview of updated scene list
      this.sendSceneChanged(sceneName);
      this.outputChannel.appendLine(`[Conductor] Scene "${sceneName}" saved at slide ${this.currentSlideIndex + 1}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save scene';
      this.webviewProvider.sendError({
        code: 'SCENE_SAVE_FAILED',
        message,
        recoverable: true,
      });
    }
  }

  /**
   * Handle restoreScene message — restore a previously saved scene.
   * Per contracts/scene-store.md Restore Flow (T027).
   */
  private async handleRestoreScene(sceneName: string): Promise<void> {
    if (!this.deck) {
      return;
    }

    const entry = this.sceneStore.restore(sceneName);
    if (!entry) {
      this.webviewProvider.sendError({
        code: 'SCENE_NOT_FOUND',
        message: `Scene "${sceneName}" not found`,
        recoverable: true,
      });
      return;
    }

    // Capture pre-restore snapshot (enables undo of restore)
    const preRestoreSnapshot = this.snapshotFactory.capture(this.currentSlideIndex, `Before restore: ${sceneName}`);
    this.stateStack.push(preRestoreSnapshot);

    // Restore IDE state from snapshot
    if (entry.snapshot) {
      const result = await this.snapshotFactory.restorePartial(entry.snapshot);
      if (!result.success && result.skipped.length > 0) {
        this.webviewProvider.sendWarning({
          code: 'PARTIAL_RESTORE',
          message: `${result.skipped.length} resource(s) could not be restored`,
        });
      }
    }

    // Navigate to the scene's slide
    this.navigationHistory.push(
      this.currentSlideIndex,
      'scene-restore',
      this.deck.slides[this.currentSlideIndex]?.frontmatter?.title
    );
    await this.goToSlide(entry.slideIndex);

    // Notify Webview
    this.sendSceneChanged(sceneName);
    this.outputChannel.appendLine(`[Conductor] Scene "${sceneName}" restored to slide ${entry.slideIndex + 1}`);
  }

  /**
   * Handle deleteScene message — delete a runtime scene.
   * Per contracts/scene-store.md (T027a).
   */
  private handleDeleteScene(sceneName: string): void {
    try {
      const deleted = this.sceneStore.delete(sceneName);
      if (!deleted) {
        this.webviewProvider.sendError({
          code: 'SCENE_NOT_FOUND',
          message: `Scene "${sceneName}" not found`,
          recoverable: true,
        });
        return;
      }

      this.sendSceneChanged();
      this.outputChannel.appendLine(`[Conductor] Scene "${sceneName}" deleted`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete scene';
      this.webviewProvider.sendError({
        code: 'SCENE_DELETE_FAILED',
        message,
        recoverable: true,
      });
    }
  }

  /**
   * Send sceneChanged message to Webview with current scene list.
   */
  private sendSceneChanged(activeSceneName?: string): void {
    const scenes = this.sceneStore.list().map(e => ({
      name: e.name,
      slideIndex: e.slideIndex,
      isAuthored: e.origin === 'authored',
      timestamp: e.timestamp,
    }));
    this.webviewProvider.sendSceneChanged({ scenes, activeSceneName });
  }

  private async handleExecuteAction(actionId: string): Promise<void> {
    if (!this.deck) {
      return;
    }

    // Capture snapshot before action
    const snapshot = this.snapshotFactory.capture(this.currentSlideIndex, `Before action ${actionId}`);
    this.stateStack.push(snapshot);

    // Find action by ID
    const slide = this.deck.slides[this.currentSlideIndex];
    const action = this.findActionById(slide, actionId);

    if (action) {
      await this.executeAction(action, actionId);
    } else {
      this.webviewProvider.sendError({
        code: 'UNKNOWN_ACTION',
        message: `Action "${actionId}" not found`,
        recoverable: true,
      });
      // Also update the action status to failed so button stops spinning
      this.webviewProvider.sendActionStatusChanged(actionId, 'failed', 'Action not found');
    }
  }

  private handleUndo(): void {
    void this.undo();
  }

  private handleRedo(): void {
    void this.redo();
  }

  /**
   * Handle VS Code command execution from toolbar
   */
  private async handleVscodeCommand(commandId: string, args?: unknown[]): Promise<void> {
    try {
      if (args && args.length > 0) {
        await vscode.commands.executeCommand(commandId, ...args);
      } else {
        await vscode.commands.executeCommand(commandId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.outputChannel.appendLine(`[Conductor] Failed to execute command '${commandId}': ${message}`);
    }
  }

  private handleReady(): void {
    if (this.deck) {
      const firstSlide = this.deck.slides[0];
      const firstSlideBlockHtml = firstSlide ? renderBlockElements(firstSlide) : '';
      this.webviewProvider.sendDeckLoaded({
        title: this.deck.title,
        author: this.deck.author,
        totalSlides: this.deck.slides.length,
        currentSlideIndex: 0,
        slideHtml: (firstSlide?.html ?? '') + firstSlideBlockHtml,
        speakerNotes: firstSlide?.speakerNotes,
        interactiveElements: firstSlide?.interactiveElements.map(el => ({
          id: el.id,
          label: el.label,
          actionType: el.action.type,
        })) ?? [],
        envStatus: this.buildEnvStatus(),
      });

      // Show first slide
      void this.goToSlide(0);
    }
  }

  private renderSlides(): void {
    // Note: Slides are already rendered with markdown-it and fragment processing
    // in slideParser.parseSlideContent(). This method is kept for backward 
    // compatibility but no longer re-renders the HTML.
    // The slide.html already contains the processed HTML from the parser.
  }

  private findActionById(slide: Slide, actionId: string): Action | undefined {
    // Check onEnter actions
    for (const action of slide.onEnterActions) {
      if (action.id === actionId) {
        return action;
      }
    }

    // Check interactive elements
    for (const element of slide.interactiveElements) {
      // Match by action ID, rawLink (full markdown), or action href (action:type?params)
      if (element.action.id === actionId || 
          element.rawLink === actionId ||
          element.rawLink.includes(`(${actionId})`)) {
        return element.action;
      }
    }

    return undefined;
  }

  private async executeSlideActions(slide: Slide): Promise<void> {
    for (const action of slide.onEnterActions) {
      await this.executeAction(action, action.id);
    }
  }

  private async executeAction(action: Action, webviewActionId?: string): Promise<void> {
    // Use the webview-friendly ID for status updates (falls back to action.id)
    const statusId = webviewActionId || action.id;
    
    // Check trust for restricted actions
    const requiresTrust = TRUSTED_ACTION_TYPES.includes(action.type);
    if (requiresTrust && !isTrusted()) {
      this.webviewProvider.sendActionStatusChanged(
        statusId,
        'failed',
        'Action requires workspace trust'
      );
      return;
    }

    // Get executor from registry
    const registry = getActionRegistry();
    const executor = registry.get(action.type);

    if (!executor) {
      this.webviewProvider.sendActionStatusChanged(
        statusId,
        'failed',
        `Unknown action type: ${action.type}`
      );
      return;
    }

    // Execute action
    this.webviewProvider.sendActionStatusChanged(statusId, 'running');

    // Create cancellation token for this action
    this.cancellationTokenSource?.dispose();
    this.cancellationTokenSource = new vscode.CancellationTokenSource();

    try {
      // Env interpolation before executor dispatch (Feature 006 — T019)
      // {{VAR}} interpolation runs BEFORE platformResolver.expandPlaceholders()
      let executionAction = action;
      if (this.resolvedEnv && action.params) {
        // Display path: for actionStatusChanged messages (secrets masked)
        // Execution path: for executor (secrets resolved)
        const execParams = this.envResolver.interpolateForExecution(
          action.params as Record<string, unknown>,
          this.resolvedEnv,
        );
        executionAction = { ...action, params: execParams as Record<string, string> };
      }

      const context: import('../actions/types').ExecutionContext = {
        workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '',
        deckFilePath: this.deck?.filePath ?? '',
        currentSlideIndex: this.currentSlideIndex,
        isWorkspaceTrusted: isTrusted(),
        cancellationToken: this.cancellationTokenSource.token,
        outputChannel: this.outputChannel,
      };

      const result = await executor.execute(executionAction, context);

      if (result.success) {
        this.webviewProvider.sendActionStatusChanged(statusId, 'success');
        
        // Track opened resources
        if (action.type === 'file.open' && typeof action.params.path === 'string') {
          this.snapshotFactory.trackOpenedEditor(action.params.path);
        }
      } else {
        // Forward rich error detail for toast display (per error-feedback contract, T030)
        this.webviewProvider.sendActionStatusChanged(
          statusId,
          'failed',
          result.error,
          {
            actionType: result.actionType ?? action.type,
            actionTarget: result.actionTarget,
            sequenceDetail: result.sequenceDetail,
          }
        );
      }
    } catch (error) {
      this.webviewProvider.sendActionStatusChanged(
        statusId,
        'failed',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Check if deck contains any executable actions
   */
  private deckHasExecutableActions(deck: Deck): boolean {
    for (const slide of deck.slides) {
      // Check onEnter actions
      if (slide.onEnterActions.length > 0) {
        return true;
      }
      // Check interactive elements
      if (slide.interactiveElements.length > 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Show first-use confirmation dialog per FR-023
   * Returns true if user wants to proceed
   */
  private async showFirstUseConfirmation(deck: Deck): Promise<boolean> {
    // Count actions by type
    const actionCounts = new Map<string, number>();
    let hasTrustedActions = false;

    for (const slide of deck.slides) {
      for (const action of slide.onEnterActions) {
        const count = actionCounts.get(action.type) || 0;
        actionCounts.set(action.type, count + 1);
        if (TRUSTED_ACTION_TYPES.includes(action.type)) {
          hasTrustedActions = true;
        }
      }
      for (const element of slide.interactiveElements) {
        const count = actionCounts.get(element.action.type) || 0;
        actionCounts.set(element.action.type, count + 1);
        if (TRUSTED_ACTION_TYPES.includes(element.action.type)) {
          hasTrustedActions = true;
        }
      }
    }

    // Build message
    const actionSummary = Array.from(actionCounts.entries())
      .map(([type, count]) => `${type}: ${count}`)
      .join(', ');

    let message = `This presentation contains executable actions (${actionSummary}).`;
    
    if (hasTrustedActions && !isTrusted()) {
      message += '\n\nSome actions require workspace trust and will be blocked.';
    }

    message += '\n\nDo you want to proceed?';

    const result = await vscode.window.showWarningMessage(
      message,
      { modal: true },
      'Proceed'
    );

    return result === 'Proceed';
  }

  /**
   * Resolve environment variables for a deck (Feature 006 — T016).
   * Loads .deck.env, merges with declarations, stores ResolvedEnv.
   */
  private async resolveEnvironment(deck: Deck): Promise<void> {
    if (!deck.envDeclarations || deck.envDeclarations.length === 0) {
      this.resolvedEnv = undefined;
      return;
    }

    try {
      // Load .deck.env sidecar file
      const envFile = await this.envFileLoader.loadEnvFile(deck.filePath);

      // Log env file parse errors as warnings
      for (const err of envFile.errors) {
        this.outputChannel.appendLine(`[Env] .deck.env line ${err.line}: ${err.message}`);
      }

      // Synchronous merge (no validation yet)
      this.resolvedEnv = this.envResolver.resolveDeclarations(
        deck.envDeclarations,
        envFile,
      );

      // Log resolution status
      const status = this.buildEnvStatus();
      if (status) {
        this.outputChannel.appendLine(
          `[Env] Resolved ${status.resolved}/${status.total} variables` +
          (status.missing.length > 0 ? ` (${status.missing.length} missing)` : '') +
          (status.hasSecrets ? ' [has secrets]' : '')
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown env resolution error';
      this.outputChannel.appendLine(`[Env] Resolution failed: ${msg}`);
      this.resolvedEnv = undefined;
    }
  }

  /**
   * Build EnvStatus DTO from current resolved env (Feature 006 — T018).
   */
  private buildEnvStatus(): EnvStatus | undefined {
    if (!this.resolvedEnv) {
      return undefined;
    }

    const variables: EnvStatusEntry[] = [];
    let resolved = 0;
    const missing: string[] = [];
    const invalid: string[] = [];
    let hasSecrets = false;

    for (const [, v] of this.resolvedEnv.variables) {
      variables.push({
        name: v.name,
        status: v.status,
        displayValue: v.displayValue,
      });

      if (v.status === 'resolved') {
        resolved++;
      } else if (v.status === 'resolved-invalid') {
        invalid.push(v.name);
      } else if (v.status === 'missing-required') {
        missing.push(v.name);
      }

      if (v.declaration.secret) {
        hasSecrets = true;
      }
    }

    return {
      total: this.resolvedEnv.variables.size,
      resolved,
      missing,
      invalid,
      hasSecrets,
      isComplete: this.resolvedEnv.isComplete,
      variables,
    };
  }

  /**
   * Resolve render directives in slide content and return updated HTML
   * Uses progressive loading: sends slide with placeholders first, then resolves async
   */
  private resolveSlideRenderDirectives(slide: Slide): string {
    const blockHtml = renderBlockElements(slide);

    // If no render directives, return original HTML + block elements
    if (!slide.renderDirectives || slide.renderDirectives.length === 0) {
      return slide.html + blockHtml;
    }

    // Parse the full directives from raw content
    const directives = parseRenderDirectives(slide.content, slide.index);
    if (directives.length === 0) {
      return slide.html + blockHtml;
    }

    // First pass: replace directive links with loading placeholders
    let html = slide.html;
    
    for (const directive of directives) {
      const placeholder = createLoadingPlaceholder(directive);
      
      // Extract the URL from the raw directive [label](url) -> url
      const urlMatch = directive.rawDirective.match(/\(([^)]+)\)/);
      if (!urlMatch) {
        continue;
      }
      
      // The URL in HTML has & encoded as &amp;
      const url = urlMatch[1].replace(/&/g, '&amp;');
      const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Match <a href="url">label</a> - the markdown renderer creates this
      const pattern = new RegExp(`<a\\s+href="${escapedUrl}"[^>]*>[^<]*</a>`);
      
      if (pattern.test(html)) {
        html = html.replace(pattern, placeholder.html);
      }
    }

    // Schedule async resolution of directives (don't await - let the slide show immediately)
    void this.resolveDirectivesAsync(directives);

    return html + blockHtml;
  }

  /**
   * Resolve directives asynchronously and send updates to webview
   */
  private async resolveDirectivesAsync(directives: import('../renderer').RenderDirective[]): Promise<void> {
    for (const directive of directives) {
      try {
        // For command directives with streaming, use special handling
        if (directive.type === 'command' && directive.params.stream) {
          await this.resolveCommandWithStreaming(directive);
        } else {
          // Standard resolution
          const block = await resolveDirective(directive);
          this.webviewProvider.sendRenderBlockUpdate({
            blockId: directive.id,
            html: block.html,
            status: 'success',
          });
        }
      } catch (error) {
        this.webviewProvider.sendRenderBlockUpdate({
          blockId: directive.id,
          html: `<div class="render-block render-block-error"><div class="render-block-content">${error instanceof Error ? error.message : 'Unknown error'}</div></div>`,
          status: 'error',
        });
      }
    }
  }

  /**
   * Resolve a command directive with streaming output
   */
  private async resolveCommandWithStreaming(directive: import('../renderer').CommandRenderDirective): Promise<void> {
    const params = directive.params;
    
    // Streaming callback to send chunks to webview
    const onStream: StreamCallback = (chunk: string, isError: boolean) => {
      this.webviewProvider.sendRenderBlockUpdate({
        blockId: directive.id,
        html: '',
        status: 'streaming',
        streamChunk: chunk,
        isError,
      });
    };
    
    // Execute command with streaming
    const result = await renderCommand(params, onStream);
    
    // Send final result
    const finalHtml = formatAsCommandBlock(
      result.output || '',
      params.cmd,
      result.exitCode ?? (result.success ? 0 : 1),
      params.format || 'code',
      result.timedOut
    );
    
    this.webviewProvider.sendRenderBlockUpdate({
      blockId: directive.id,
      html: finalHtml,
      status: result.success ? 'success' : 'error',
    });
  }
}
