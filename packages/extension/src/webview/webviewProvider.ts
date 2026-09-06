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
  GoBackMessage,
  SaveSceneMessage,
  RestoreSceneMessage,
  DeleteSceneMessage,
  EnvSetupRequestMessage,
  EnvStatusChangedPayload,
  OpenSlidePickerPayload,
  OpenScenePickerPayload,
  SceneChangedPayload,
  WarningPayload,
  StepStatusChangedPayload,
  OnboardingStateLoadedPayload,
  RetryStepPayload,
  ResetToCheckpointPayload,
  FragmentRevealedMessage,
  FragmentRevealedPayload,
  RecordingMarkerMessage,
  RecordingMarkerPayload,
  RecordingStatusPayload,
  SlideRenderedPayload,
  VideoPlaybackMessage,
} from './messages';
import { isWebviewMessage, createMessageDispatcher, MessageHandlers } from './messageHandler';
import { Deck } from '@deckpilot/core/models/deck';
import { ActionType } from '@deckpilot/core/models/action';
import { injectBlockElements } from '@deckpilot/core/renderer/blockElementRenderer';
import { SequenceErrorDetail } from '../actions/errors';
import { appearanceCss, type ResolvedAppearance } from '@deckpilot/core/models/appearance';
import type { AppearanceService } from '../services/appearanceService';

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
  onGoBack?(): void;
  onSaveScene?(sceneName: string): void;
  onRestoreScene?(sceneName: string): void;
  onDeleteScene?(sceneName: string): void;
  onEnvSetupRequest?(): void;
  onRetryStep?(payload: RetryStepPayload): Promise<void>;
  onResetToCheckpoint?(payload: ResetToCheckpointPayload): Promise<void>;
  onFragmentRevealed?(payload: FragmentRevealedPayload): void;
  onRecordingMarker?(payload: RecordingMarkerPayload): void;
  onSlideRendered?(payload: SlideRenderedPayload): void;
  onVideoPlayback?(message: VideoPlaybackMessage): void;
}

/**
 * Provider for the presentation webview panel
 */
export class WebviewProvider implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private disposables: vscode.Disposable[] = [];
  private callbacks: WebviewCallbacks | undefined;
  private currentDeck: Deck | undefined;
  private appearanceRequest = 0;
  private appearanceAcks = new Map<number, () => void>();

  constructor(private readonly extensionUri: vscode.Uri, private readonly appearanceService?: AppearanceService) {}

  async sendAppearance(appearance: ResolvedAppearance, blocks: Array<{ blockId: string; html: string }>, slideIndex?: number, waitForPaint = false): Promise<void> {
    const requestId = ++this.appearanceRequest;
    let painted = Promise.resolve();
    if (waitForPaint && this.panel) {
      painted = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.appearanceAcks.delete(requestId);
          reject(new Error('Timed out waiting for the recording appearance to paint.'));
        }, 10000);
        this.appearanceAcks.set(requestId, () => { clearTimeout(timer); resolve(); });
      });
    }
    this.postMessage({ type: 'appearanceChanged', payload: { appearance, css: appearanceCss(appearance), blocks, slideIndex, requestId } });
    await painted;
  }

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
      'deckPilotPresentation',
      deck.title || 'Presentation',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'packages', 'extension', 'src', 'webview', 'assets'),
          vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'assets'),
          // Include workspace folders for loading local images
          ...(vscode.workspace.workspaceFolders?.map(f => f.uri) || []),
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
    // Transform image URLs in the HTML to webview URIs
    const transformedPayload = {
      ...payload,
      slideHtml: this.transformImageUrls(payload.slideHtml),
      diagramBlocks: payload.diagramBlocks?.map(block => ({ ...block, html: this.transformImageUrls(block.html) })),
    };
    this.postMessage({ type: 'slideChanged', payload: transformedPayload });
  }

  /**
   * Send deck loaded message to webview
   */
  sendDeckLoaded(payload: DeckLoadedPayload): void {
    // Transform image URLs in the HTML to webview URIs
    const transformedPayload = {
      ...payload,
      slideHtml: this.transformImageUrls(payload.slideHtml),
    };
    this.postMessage({ type: 'deckLoaded', payload: transformedPayload });
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
  sendActionStatusChanged(
    actionId: string,
    status: 'running' | 'success' | 'failed',
    error?: string,
    detail?: {
      actionType?: ActionType;
      actionTarget?: string;
      sequenceDetail?: SequenceErrorDetail;
    }
  ): void {
    this.postMessage({
      type: 'actionStatusChanged',
      payload: {
        actionId,
        status,
        error,
        ...(detail?.actionType && { actionType: detail.actionType }),
        ...(detail?.actionTarget && { actionTarget: detail.actionTarget }),
        ...(detail?.sequenceDetail && { sequenceDetail: detail.sequenceDetail }),
      },
    });
  }

  /**
   * Send render block update message to webview
   */
  sendRenderBlockUpdate(payload: RenderBlockUpdatePayload): void {
    // Transform image URLs in the HTML to webview URIs
    const transformedPayload = {
      ...payload,
      html: this.transformImageUrls(payload.html),
    };
    this.postMessage({ type: 'renderBlockUpdate', payload: transformedPayload });
  }

  /**
   * Send open slide picker command to webview.
   * Per contracts/navigation-protocol.md.
   */
  sendOpenSlidePicker(payload: OpenSlidePickerPayload): void {
    this.postMessage({ type: 'openSlidePicker', payload });
  }

  /**
   * Send open scene picker command to webview.
   * Per contracts/scene-store.md.
   */
  sendOpenScenePicker(payload: OpenScenePickerPayload): void {
    this.postMessage({ type: 'openScenePicker', payload });
  }

  /**
   * Send open scene name input command to webview.
   * Per contracts/scene-store.md.
   */
  sendOpenSceneNameInput(): void {
    this.postMessage({ type: 'openSceneNameInput', payload: {} });
  }

  /**
   * Send scene changed notification to webview.
   * Per contracts/scene-store.md.
   */
  sendSceneChanged(payload: SceneChangedPayload): void {
    this.postMessage({ type: 'sceneChanged', payload });
  }

  /**
   * Send warning notification to webview.
   * Per contracts/navigation-protocol.md.
   */
  sendWarning(payload: WarningPayload): void {
    this.postMessage({ type: 'warning', payload });
  }

  /**
   * Send env status changed message to webview (Feature 006).
   */
  sendEnvStatusChanged(envStatus: EnvStatusChangedPayload): void {
    this.postMessage({ type: 'envStatusChanged', payload: envStatus });
  }

  /**
   * Send step status changed message to webview
   */
  sendStepStatusChanged(payload: StepStatusChangedPayload): void {
    this.postMessage({ type: 'stepStatusChanged', payload });
  }

  /**
   * Send onboarding state loaded message to webview
   */
  sendOnboardingStateLoaded(payload: OnboardingStateLoadedPayload): void {
    this.postMessage({ type: 'onboardingStateLoaded', payload });
  }

  /**
   * Send recording status message to webview
   */
  sendRecordingStatus(payload: RecordingStatusPayload): void {
    this.postMessage({ type: 'recordingStatus', payload });
  }

  /**
   * Tell the webview to advance (reveal next fragment or go to next slide).
   * Used by auto-pilot mode.
   */
  sendAdvancePresentation(): void {
    this.postMessage({ type: 'advancePresentation', payload: {} });
  }

  /**
   * Tell the webview to trigger a specific action button.
   * Used by auto-pilot mode.
   */
  sendTriggerAction(actionId: string): void {
    this.postMessage({ type: 'triggerAction', payload: { actionId } });
  }

  /**
   * Bring the presentation panel to focus.
   */
  reveal(): void {
    this.panel?.reveal(undefined, false);
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
    if (message && typeof message === 'object' && 'type' in message && message.type === 'appearanceApplied'
      && 'requestId' in message && typeof message.requestId === 'number') {
      this.appearanceAcks.get(message.requestId)?.();
      this.appearanceAcks.delete(message.requestId);
      return;
    }
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
      onGoBack: (_msg: GoBackMessage) => {
        this.callbacks?.onGoBack?.();
      },
      onSaveScene: (msg: SaveSceneMessage) => {
        this.callbacks?.onSaveScene?.(msg.payload.sceneName);
      },
      onRestoreScene: (msg: RestoreSceneMessage) => {
        this.callbacks?.onRestoreScene?.(msg.payload.sceneName);
      },
      onDeleteScene: (msg: DeleteSceneMessage) => {
        this.callbacks?.onDeleteScene?.(msg.payload.sceneName);
      },
      onEnvSetupRequest: (_msg: EnvSetupRequestMessage) => {
        this.callbacks?.onEnvSetupRequest?.();
      },
      onRetryStep: async (payload: RetryStepPayload) => {
        await this.callbacks?.onRetryStep?.(payload);
      },
      onResetToCheckpoint: async (payload: ResetToCheckpointPayload) => {
        await this.callbacks?.onResetToCheckpoint?.(payload);
      },
      onFragmentRevealed: (msg: FragmentRevealedMessage) => {
        this.callbacks?.onFragmentRevealed?.(msg.payload);
      },
      onRecordingMarker: (msg: RecordingMarkerMessage) => {
        this.callbacks?.onRecordingMarker?.(msg.payload);
      },
      onSlideRendered: (payload: SlideRenderedPayload) => {
        this.callbacks?.onSlideRendered?.(payload);
      },
      onVideoPlayback: (message: VideoPlaybackMessage) => {
        this.callbacks?.onVideoPlayback?.(message);
      },
    };

    const dispatcher = createMessageDispatcher(handlers);
    void dispatcher(message);
  }

  /**
   * Transform local image URLs in HTML to webview URIs
   * Handles both relative paths and file:// URLs
   */
  private transformImageUrls(html: string): string {
    if (!this.panel || !this.currentDeck) {
      return html;
    }

    const webview = this.panel.webview;
    
    // Get the directory of the deck file for resolving relative paths
    const deckFilePath = this.currentDeck.filePath;
    const deckDir = vscode.Uri.file(deckFilePath).with({ 
      path: vscode.Uri.file(deckFilePath).path.replace(/\/[^/]+$/, '') 
    });

    // Transform src attributes in local image and video tags.
    // Match: src="path" or src='path' (not starting with http, https, data, or webview URI scheme)
    return html.replace(
      /(<(?:img|video|source)\b[^>]*\ssrc=["'])(?!https?:|data:|vscode-webview:)([^"']+)(["'][^>]*>)/gi,
      (_match, prefix: string, src: string, suffix: string) => {
        try {
          // Decode HTML entities in the src
          const decodedSrc = src.replace(/&amp;/g, '&');
          
          // Handle file:// URLs
          let fileUri: vscode.Uri;
          if (decodedSrc.startsWith('file://')) {
            fileUri = vscode.Uri.parse(decodedSrc);
          } else if (decodedSrc.startsWith('/')) {
            // Absolute path
            fileUri = vscode.Uri.file(decodedSrc);
          } else {
            // Relative path - resolve against deck file's directory
            fileUri = vscode.Uri.joinPath(deckDir, decodedSrc);
          }
          
          // Convert to webview URI
          const webviewUri = webview.asWebviewUri(fileUri);
          return `${prefix}${webviewUri.toString()}${suffix}`;
        } catch (error) {
          // If transformation fails, return original
          console.warn('Failed to transform media URL:', src, error);
          return _match;
        }
      }
    );
  }

  private updateContent(): void {
    if (!this.panel || !this.currentDeck) {
      return;
    }

    const webview = this.panel.webview;

    // Get URIs for assets
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'packages', 'extension', 'src', 'webview', 'assets', 'presentation.css')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'packages', 'extension', 'src', 'webview', 'assets', 'presentation.js')
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
    const mermaidScriptUrl = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';

    // Get presentation options from metadata
    const options = (this.currentDeck?.metadata?.options ?? {}) as Record<string, unknown>;
    // Support mode at top-level frontmatter or inside options
    const deckMode = (options.mode ?? this.currentDeck?.metadata?.mode ?? 'presentation') as string;
    const toolbarConfig = this.getToolbarHtml(options.toolbar as boolean | string[] | undefined);

    // Serialize deck for webview
    const deckJson = JSON.stringify({
      title: this.currentDeck?.title,
      deckPath: this.currentDeck?.filePath,
      slideCount: this.currentDeck?.slides.length ?? 0,
      slides: this.currentDeck?.slides.map((slide, index) => {
        return {
          index,
          content: injectBlockElements(slide.html, slide),
          hasActions: slide.onEnterActions.length > 0 || slide.interactiveElements.length > 0,
          speakerNotes: slide.speakerNotes,
          checkpoint: slide.checkpoint,
        };
      }),
      options: {
        showSlideNumbers: options.showSlideNumbers ?? true,
        showProgress: options.showProgress ?? false,
        fontSize: options.fontSize ?? 'medium',
        theme: options.theme,
        transition: options.transition ?? 'slide',
        mode: deckMode,
      },
    });

    // Build theme and fontSize classes
    const themeClass = (() => {
      switch (options.theme) {
        case 'light': return 'theme-light';
        case 'minimal': return 'theme-minimal';
        case 'contrast': return 'theme-contrast';
        case 'dark':
        default: return 'theme-dark';
      }
    })();
    const fontSizeClass = `font-${(options.fontSize as string) || 'medium'}`;
    const modeClass = deckMode === 'onboarding' ? 'mode-onboarding' : 'mode-presentation';
    const appearance = this.currentDeck && this.appearanceService?.get(this.currentDeck);
    const appearanceStyle = appearance ? appearanceCss(appearance).replace(/"/g, '&quot;') : '';
    const fontUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri,
      'packages', 'extension', 'src', 'webview', 'assets', 'appearance-fonts.css'));

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net; font-src ${webview.cspSource} data:; img-src ${webview.cspSource} https: data:; media-src ${webview.cspSource};">
  <link href="${cssUri}" rel="stylesheet">
  <link href="${fontUri}" rel="stylesheet">
  <title>Presentation</title>
</head>
<body class="${themeClass} ${fontSizeClass} ${modeClass}${appearance ? ' adaptive-appearance' : ''}" style="${appearanceStyle}">
  ${appearance ? '<button id="appearance-menu" title="Appearance" aria-label="Appearance">Appearance</button>' : ''}
  <div id="presentation-container">
    <div id="progress-bar" class="hidden"></div>
    <div id="slide-container">
      <div id="slide-content"></div>
    </div>
    <div id="onboarding-controls" class="hidden">
      <div id="step-progress"></div>
      <div id="step-actions">
        <button id="btn-retry" class="onboarding-btn hidden" title="Retry this step">🔄 Retry Step</button>
        <button id="btn-reset" class="onboarding-btn hidden" title="Reset to checkpoint">⏪ Reset to Checkpoint</button>
      </div>
      <div id="validation-result" class="hidden"></div>
    </div>
    <nav id="navigation">
      <button id="btn-first" title="First slide (Home)">⏮</button>
      <button id="btn-prev" title="Previous slide (←)">◀</button>
      <span id="slide-indicator">0 / 0</span>
      <button id="btn-next" title="Next slide (→)">▶</button>
      <button id="btn-last" title="Last slide (End)">⏭</button>
    </nav>
    ${toolbarConfig}
    <div id="env-badge" class="env-badge hidden" title="Environment variables status"></div>
    <div id="action-overlay" class="hidden" role="alert" aria-live="assertive">
      <div id="action-status"></div>
    </div>
  </div>
  <script nonce="${nonce}">
    window.deckData = ${deckJson};
  </script>
  <script nonce="${nonce}" src="${mermaidScriptUrl}"></script>
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
