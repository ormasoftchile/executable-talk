/**
 * Conductor - orchestrates presentation navigation, actions, and state
 */

import * as vscode from 'vscode';
import { Deck } from '../models/deck';
import { Slide } from '../models/slide';
import { Action, ActionType } from '../models/action';
import { StateStack } from './stateStack';
import { SnapshotFactory } from './snapshotFactory';
import { WebviewProvider, WebviewCallbacks } from '../webview/webviewProvider';
import { PresenterViewProvider } from '../webview/presenterViewProvider';
import { getActionRegistry } from '../actions/registry';
import { isTrusted, onTrustChanged } from '../utils/workspaceTrust';
import { enterZenMode, exitZenMode, resetZenModeState } from '../utils/zenMode';
import { parseRenderDirectives, resolveDirective } from '../renderer';
import MarkdownIt from 'markdown-it';

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
  private webviewProvider: WebviewProvider;
  private presenterViewProvider: PresenterViewProvider;
  private disposables: vscode.Disposable[] = [];
  private md: MarkdownIt;
  private outputChannel: vscode.OutputChannel;
  private cancellationTokenSource: vscode.CancellationTokenSource | undefined;

  constructor(extensionUri: vscode.Uri) {
    this.stateStack = new StateStack();
    this.snapshotFactory = new SnapshotFactory();
    this.webviewProvider = new WebviewProvider(extensionUri);
    this.presenterViewProvider = new PresenterViewProvider(extensionUri);
    this.md = new MarkdownIt({
      html: true,
      linkify: true,
      typographer: true,
    });

    this.outputChannel = vscode.window.createOutputChannel('Executable Talk');
    this.disposables.push(this.outputChannel);

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

    // Enter Zen Mode
    await enterZenMode();

    // Create webview callbacks
    const callbacks: WebviewCallbacks = {
      onNavigate: (direction, slideIndex) => this.handleNavigate(direction, slideIndex),
      onExecuteAction: (actionId) => void this.handleExecuteAction(actionId),
      onUndo: () => this.handleUndo(),
      onRedo: () => this.handleRedo(),
      onClose: () => void this.close(),
      onReady: () => this.handleReady(),
    };

    // Show presentation
    this.webviewProvider.show(this.deck, callbacks);
    this.deck.state = 'active';
  }

  /**
   * Navigate to a specific slide
   */
  async goToSlide(index: number): Promise<void> {
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
    const resolvedHtml = await this.resolveSlideRenderDirectives(slide);

    // Send slide changed to webview
    this.webviewProvider.sendSlideChanged({
      slideIndex: targetIndex,
      totalSlides: this.deck.slides.length,
      slideHtml: resolvedHtml,
      canUndo: this.stateStack.canUndo(),
      canRedo: this.stateStack.canRedo(),
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
    await this.goToSlide(this.currentSlideIndex + 1);
  }

  /**
   * Navigate to previous slide
   */
  async previousSlide(): Promise<void> {
    await this.goToSlide(this.currentSlideIndex - 1);
  }

  /**
   * Navigate to first slide
   */
  async firstSlide(): Promise<void> {
    await this.goToSlide(0);
  }

  /**
   * Navigate to last slide
   */
  async lastSlide(): Promise<void> {
    if (this.deck) {
      await this.goToSlide(this.deck.slides.length - 1);
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
        const resolvedHtml = await this.resolveSlideRenderDirectives(slide);
        
        this.webviewProvider.sendSlideChanged({
          slideIndex: snapshot.slideIndex,
          totalSlides: this.deck.slides.length,
          slideHtml: resolvedHtml,
          canUndo: this.stateStack.canUndo(),
          canRedo: this.stateStack.canRedo(),
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
   * Reset presentation to initial state
   */
  async reset(): Promise<void> {
    // Clear all state
    this.stateStack.clear();
    this.snapshotFactory.disposeDecorations();
    this.snapshotFactory.clearTracking();

    // Go back to first slide
    if (this.deck) {
      this.currentSlideIndex = 0;
      this.deck.currentSlideIndex = 0;
      await this.goToSlide(0);
    }
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

  private handleNavigate(direction: 'next' | 'previous' | 'first' | 'last', _slideIndex?: number): void {
    switch (direction) {
      case 'next':
        void this.nextSlide();
        break;
      case 'previous':
        void this.previousSlide();
        break;
      case 'first':
        void this.firstSlide();
        break;
      case 'last':
        void this.lastSlide();
        break;
    }
  }

  private async handleExecuteAction(actionId: string): Promise<void> {
    if (!this.deck) {
      return;
    }

    this.outputChannel.appendLine(`[DEBUG] Executing action: ${actionId}`);

    // Capture snapshot before action
    const snapshot = this.snapshotFactory.capture(this.currentSlideIndex, `Before action ${actionId}`);
    this.stateStack.push(snapshot);

    // Find action by ID
    const slide = this.deck.slides[this.currentSlideIndex];
    
    this.outputChannel.appendLine(`[DEBUG] Current slide index: ${this.currentSlideIndex}`);
    this.outputChannel.appendLine(`[DEBUG] Interactive elements: ${slide.interactiveElements.length}`);
    for (const el of slide.interactiveElements) {
      this.outputChannel.appendLine(`[DEBUG]   Element: id=${el.action.id}, rawLink=${el.rawLink}`);
    }
    
    const action = this.findActionById(slide, actionId);

    if (action) {
      this.outputChannel.appendLine(`[DEBUG] Found action: ${action.type}`);
      await this.executeAction(action, actionId);
    } else {
      this.outputChannel.appendLine(`[DEBUG] Action not found!`);
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

  private handleReady(): void {
    if (this.deck) {
      const firstSlide = this.deck.slides[0];
      this.webviewProvider.sendDeckLoaded({
        title: this.deck.title,
        author: this.deck.author,
        totalSlides: this.deck.slides.length,
        currentSlideIndex: 0,
        slideHtml: firstSlide?.html ?? '',
        speakerNotes: firstSlide?.speakerNotes,
        interactiveElements: firstSlide?.interactiveElements.map(el => ({
          id: el.id,
          label: el.label,
          actionType: el.action.type,
        })) ?? [],
      });

      // Show first slide
      void this.goToSlide(0);
    }
  }

  private renderSlides(): void {
    if (!this.deck) {
      return;
    }

    for (const slide of this.deck.slides) {
      slide.html = this.md.render(slide.content);
    }
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
      const context: import('../actions/types').ExecutionContext = {
        workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '',
        deckFilePath: this.deck?.filePath ?? '',
        currentSlideIndex: this.currentSlideIndex,
        isWorkspaceTrusted: isTrusted(),
        cancellationToken: this.cancellationTokenSource.token,
        outputChannel: this.outputChannel,
      };

      const result = await executor.execute(action, context);

      if (result.success) {
        this.webviewProvider.sendActionStatusChanged(statusId, 'success');
        
        // Track opened resources
        if (action.type === 'file.open' && typeof action.params.path === 'string') {
          this.snapshotFactory.trackOpenedEditor(action.params.path);
        }
      } else {
        this.webviewProvider.sendActionStatusChanged(
          statusId,
          'failed',
          result.error
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
   * Resolve render directives in slide content and return updated HTML
   */
  private async resolveSlideRenderDirectives(slide: Slide): Promise<string> {
    // If no render directives, return original HTML
    if (!slide.renderDirectives || slide.renderDirectives.length === 0) {
      return slide.html;
    }

    // Parse the full directives from raw content
    const directives = parseRenderDirectives(slide.content, slide.index);
    if (directives.length === 0) {
      return slide.html;
    }

    // Resolve each directive
    const resolvedBlocks = await Promise.all(
      directives.map(d => resolveDirective(d))
    );

    // Replace directive placeholders in HTML with rendered content
    // The directives appear as links in the HTML, we need to replace them
    let html = slide.html;
    
    for (let i = 0; i < directives.length; i++) {
      const directive = directives[i];
      const block = resolvedBlocks[i];
      
      // Find the rendered link in HTML and replace with block
      // The markdown renderer turns [label](render:...) into <a href="render:...">label</a>
      const linkPattern = new RegExp(
        `<a\\s+href="render:${directive.type}[^"]*"[^>]*>[^<]*</a>`,
        'g'
      );
      html = html.replace(linkPattern, block.html);
      
      // Also handle empty labels which become <a href="..."></a>
      const emptyLinkPattern = new RegExp(
        `<a\\s+href="render:${directive.type}[^"]*"[^>]*></a>`,
        'g'
      );
      html = html.replace(emptyLinkPattern, block.html);
    }

    return html;
  }
}
