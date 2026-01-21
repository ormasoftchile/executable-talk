/**
 * WebviewProvider - manages presentation panel lifecycle
 * Per contracts/webview-lifecycle.md
 */

import * as vscode from 'vscode';
import {
  HostToWebviewMessage,
  SlideChangedPayload,
  DeckLoadedPayload,
  ErrorPayload,
  TrustStatusChangedPayload,
  RenderBlockUpdatePayload,
  NavigateMessage,
  ExecuteActionMessage,
  VscodeCommandMessage,
} from './messages';
import { isWebviewMessage, createMessageDispatcher, MessageHandlers } from './messageHandler';
import { Deck } from '../models/deck';

/**
 * Callback interface for webview events
 */
export interface WebviewCallbacks {
  onNavigate(direction: 'next' | 'previous' | 'first' | 'last', slideIndex?: number, showAllFragments?: boolean): void;
  onExecuteAction(actionId: string): void;
  onUndo(): void;
  onRedo(): void;
  onClose(): void;
  onReady(): void;
  onVscodeCommand?(commandId: string, args?: unknown[]): void;
}

/**
 * Provider for the presentation webview panel
 */
export class WebviewProvider implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private disposables: vscode.Disposable[] = [];
  private callbacks: WebviewCallbacks | undefined;
  private currentDeck: Deck | undefined;

  constructor(private readonly extensionUri: vscode.Uri) {}

  /**
   * Create and show the presentation panel
   */
  show(deck: Deck, callbacks: WebviewCallbacks): void {
    this.currentDeck = deck;
    this.callbacks = callbacks;

    if (this.panel) {
      // Panel already exists, reveal it
      this.panel.reveal(vscode.ViewColumn.One);
      this.updateContent();
      return;
    }

    // Create new webview panel
    this.panel = vscode.window.createWebviewPanel(
      'executableTalkPresentation',
      deck.title || 'Presentation',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'src', 'webview', 'assets'),
          vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'assets'),
        ],
      }
    );

    // Set panel icon
    this.panel.iconPath = {
      light: vscode.Uri.joinPath(this.extensionUri, 'resources', 'presentation-light.svg'),
      dark: vscode.Uri.joinPath(this.extensionUri, 'resources', 'presentation-dark.svg'),
    };

    // Set up message handler
    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      undefined,
      this.disposables
    );

    // Handle panel disposal
    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
        this.callbacks?.onClose();
      },
      undefined,
      this.disposables
    );

    // Set initial content
    this.updateContent();
  }

  /**
   * Close the presentation panel
   */
  close(): void {
    this.panel?.dispose();
    this.panel = undefined;
  }

  /**
   * Send slide changed message to webview
   */
  sendSlideChanged(payload: SlideChangedPayload): void {
    this.postMessage({ type: 'slideChanged', payload });
  }

  /**
   * Send deck loaded message to webview
   */
  sendDeckLoaded(payload: DeckLoadedPayload): void {
    this.postMessage({ type: 'deckLoaded', payload });
  }

  /**
   * Send error message to webview
   */
  sendError(payload: ErrorPayload): void {
    this.postMessage({ type: 'error', payload });
  }

  /**
   * Send trust status changed message to webview
   */
  sendTrustStatusChanged(payload: TrustStatusChangedPayload): void {
    this.postMessage({ type: 'trustStatusChanged', payload });
  }

  /**
   * Send action status changed message to webview
   */
  sendActionStatusChanged(actionId: string, status: 'running' | 'success' | 'failed', error?: string): void {
    this.postMessage({
      type: 'actionStatusChanged',
      payload: {
        actionId,
        status,
        error,
      },
    });
  }

  /**
   * Send render block update message to webview
   */
  sendRenderBlockUpdate(payload: RenderBlockUpdatePayload): void {
    this.postMessage({ type: 'renderBlockUpdate', payload });
  }

  /**
   * Check if panel is visible
   */
  isVisible(): boolean {
    return this.panel?.visible ?? false;
  }

  /**
   * Check if panel exists
   */
  isOpen(): boolean {
    return this.panel !== undefined;
  }

  /**
   * Dispose of the provider
   */
  dispose(): void {
    this.panel?.dispose();
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }

  // ============================================================================
  // Private methods
  // ============================================================================

  private postMessage(message: HostToWebviewMessage): void {
    void this.panel?.webview.postMessage(message);
  }

  private handleMessage(message: unknown): void {
    if (!isWebviewMessage(message) || !this.callbacks) {
      return;
    }

    // Create handlers that adapt between MessageHandlers and WebviewCallbacks
    const handlers: MessageHandlers = {
      onNavigate: (msg: NavigateMessage) => {
        const direction = msg.payload.direction === 'prev' ? 'previous' : 
                         msg.payload.direction as 'next' | 'previous' | 'first' | 'last';
        this.callbacks?.onNavigate(direction, msg.payload.slideIndex, msg.payload.showAllFragments);
      },
      onExecuteAction: (msg: ExecuteActionMessage) => {
        this.callbacks?.onExecuteAction(msg.payload.actionId);
      },
      onUndo: () => {
        this.callbacks?.onUndo();
      },
      onRedo: () => {
        this.callbacks?.onRedo();
      },
      onClose: () => {
        this.callbacks?.onClose();
      },
      onReady: () => {
        this.callbacks?.onReady();
      },
      onVscodeCommand: (msg: VscodeCommandMessage) => {
        this.callbacks?.onVscodeCommand?.(msg.payload.commandId, msg.payload.args);
      },
    };

    const dispatcher = createMessageDispatcher(handlers);
    void dispatcher(message);
  }

  private updateContent(): void {
    if (!this.panel || !this.currentDeck) {
      return;
    }

    const webview = this.panel.webview;

    // Get URIs for assets
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'src', 'webview', 'assets', 'presentation.css')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'src', 'webview', 'assets', 'presentation.js')
    );

    // Generate HTML with current deck data
    this.panel.webview.html = this.getHtmlContent(webview, cssUri, scriptUri);
  }

  private getHtmlContent(
    webview: vscode.Webview,
    cssUri: vscode.Uri,
    scriptUri: vscode.Uri
  ): string {
    const nonce = this.getNonce();

    // Get presentation options from metadata
    const options = (this.currentDeck?.metadata?.options ?? {}) as Record<string, unknown>;
    const toolbarConfig = this.getToolbarHtml(options.toolbar as boolean | string[] | undefined);

    // Serialize deck for webview
    const deckJson = JSON.stringify({
      title: this.currentDeck?.title,
      slideCount: this.currentDeck?.slides.length ?? 0,
      slides: this.currentDeck?.slides.map((slide, index) => ({
        index,
        content: slide.html,
        hasActions: slide.onEnterActions.length > 0 || slide.interactiveElements.length > 0,
        speakerNotes: slide.speakerNotes,
      })),
      options: {
        showSlideNumbers: options.showSlideNumbers ?? true,
        showProgress: options.showProgress ?? false,
        fontSize: options.fontSize ?? 'medium',
        theme: options.theme,
      },
    });

    // Build theme and fontSize classes
    const themeClass = options.theme === 'light' ? 'theme-light' : 'theme-dark';
    const fontSizeClass = `font-${(options.fontSize as string) || 'medium'}`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:;">
  <link href="${cssUri}" rel="stylesheet">
  <title>Presentation</title>
</head>
<body class="${themeClass} ${fontSizeClass}">
  <div id="presentation-container">
    <div id="slide-container">
      <div id="slide-content"></div>
    </div>
    <nav id="navigation">
      <button id="btn-first" title="First slide (Home)">⏮</button>
      <button id="btn-prev" title="Previous slide (←)">◀</button>
      <span id="slide-indicator">0 / 0</span>
      <button id="btn-next" title="Next slide (→)">▶</button>
      <button id="btn-last" title="Last slide (End)">⏭</button>
    </nav>
    ${toolbarConfig}
    <div id="action-overlay" class="hidden">
      <div id="action-status"></div>
    </div>
  </div>
  <script nonce="${nonce}">
    window.deckData = ${deckJson};
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  /**
   * Generate toolbar HTML based on configuration
   */
  private getToolbarHtml(toolbar?: boolean | string[]): string {
    // If toolbar is explicitly false, return empty
    if (toolbar === false) {
      return '';
    }

    // Define all available toolbar buttons
    const allButtons = {
      sidebar: '<button class="toolbar-btn" data-command="workbench.action.toggleSidebarVisibility" title="Toggle Sidebar (Cmd+B)"><span class="toolbar-icon">◧</span></button>',
      panel: '<button class="toolbar-btn" data-command="workbench.action.togglePanel" title="Toggle Panel (Cmd+J)"><span class="toolbar-icon">◫</span></button>',
      terminal: '<button class="toolbar-btn" data-command="workbench.action.terminal.toggleTerminal" title="Toggle Terminal"><span class="toolbar-icon">⌨</span></button>',
      activityBar: '<button class="toolbar-btn" data-command="workbench.action.toggleActivityBarVisibility" title="Toggle Activity Bar"><span class="toolbar-icon">☰</span></button>',
      zenMode: '<button class="toolbar-btn" data-command="workbench.action.toggleZenMode" title="Toggle Zen Mode"><span class="toolbar-icon">⛶</span></button>',
    };

    let buttons: string[];
    
    if (Array.isArray(toolbar)) {
      // Use specified buttons only
      buttons = toolbar
        .filter(btn => btn in allButtons)
        .map(btn => allButtons[btn as keyof typeof allButtons]);
    } else {
      // Default: all buttons with separator before zenMode
      buttons = [
        allButtons.sidebar,
        allButtons.panel,
        allButtons.terminal,
        allButtons.activityBar,
        '<div class="toolbar-separator"></div>',
        allButtons.zenMode,
      ];
    }

    if (buttons.length === 0) {
      return '';
    }

    return `<div id="toolbar" class="toolbar">${buttons.join('\n      ')}</div>`;
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
