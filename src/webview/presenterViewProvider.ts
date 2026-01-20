/**
 * PresenterViewProvider - manages presenter view panel with speaker notes
 * Per US6: Presenter View with Speaker Notes
 */

import * as vscode from 'vscode';
import { Deck } from '../models/deck';

/**
 * Message types for presenter view
 */
interface PresenterSlideChangedMessage {
  type: 'presenterSlideChanged';
  payload: {
    currentSlideIndex: number;
    totalSlides: number;
    currentSlideHtml: string;
    nextSlideHtml: string | null;
    speakerNotes: string | null;
    slideTitle: string;
  };
}

type PresenterMessage = PresenterSlideChangedMessage;

/**
 * Provider for the presenter view webview panel
 * Shows speaker notes and next slide preview
 */
export class PresenterViewProvider implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private disposables: vscode.Disposable[] = [];
  private currentDeck: Deck | undefined;
  private currentSlideIndex: number = 0;

  constructor(private readonly extensionUri: vscode.Uri) {}

  /**
   * Show the presenter view panel
   */
  show(deck: Deck, currentSlideIndex: number = 0): void {
    this.currentDeck = deck;
    this.currentSlideIndex = currentSlideIndex;

    if (this.panel) {
      // Panel already exists, reveal it
      this.panel.reveal(vscode.ViewColumn.Two);
      this.updateContent();
      return;
    }

    // Create new webview panel in secondary column
    this.panel = vscode.window.createWebviewPanel(
      'executableTalkPresenterView',
      'Presenter View',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'src', 'webview', 'assets'),
        ],
      }
    );

    // Set initial content
    this.panel.webview.html = this.getWebviewContent();

    // Handle panel disposal
    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
      },
      null,
      this.disposables
    );
  }

  /**
   * Close the presenter view panel
   */
  close(): void {
    this.panel?.dispose();
    this.panel = undefined;
    this.currentDeck = undefined;
    this.currentSlideIndex = 0;
  }

  /**
   * Update the presenter view when slide changes
   */
  updateSlide(slideIndex: number): void {
    this.currentSlideIndex = slideIndex;
    if (this.panel) {
      this.sendSlideUpdate();
    }
  }

  /**
   * Update deck reference (for refresh scenarios)
   */
  updateDeck(deck: Deck): void {
    this.currentDeck = deck;
    if (this.panel) {
      this.panel.webview.html = this.getWebviewContent();
    }
  }

  /**
   * Check if presenter view is visible
   */
  isVisible(): boolean {
    return this.panel?.visible ?? false;
  }

  /**
   * Send slide update to presenter view
   */
  private sendSlideUpdate(): void {
    if (!this.panel || !this.currentDeck) {
      return;
    }

    const currentSlide = this.currentDeck.slides[this.currentSlideIndex];
    const nextSlide = this.currentDeck.slides[this.currentSlideIndex + 1];

    const message: PresenterMessage = {
      type: 'presenterSlideChanged',
      payload: {
        currentSlideIndex: this.currentSlideIndex,
        totalSlides: this.currentDeck.slides.length,
        currentSlideHtml: currentSlide?.html ?? '',
        nextSlideHtml: nextSlide?.html ?? null,
        speakerNotes: currentSlide?.speakerNotes ?? null,
        slideTitle: currentSlide?.frontmatter?.title ?? `Slide ${this.currentSlideIndex + 1}`,
      },
    };

    void this.panel.webview.postMessage(message);
  }

  /**
   * Update webview content
   */
  private updateContent(): void {
    if (this.panel) {
      this.panel.webview.html = this.getWebviewContent();
    }
  }

  /**
   * Generate webview HTML content
   */
  private getWebviewContent(): string {
    const cssUri = this.panel?.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'src', 'webview', 'assets', 'presenter.css')
    );

    const currentSlide = this.currentDeck?.slides[this.currentSlideIndex];
    const nextSlide = this.currentDeck?.slides[this.currentSlideIndex + 1];
    const totalSlides = this.currentDeck?.slides.length ?? 0;

    const currentSlideHtml = currentSlide?.html ?? '';
    const nextSlideHtml = nextSlide?.html ?? '<p class="no-next">End of presentation</p>';
    const speakerNotes = currentSlide?.speakerNotes ?? '<p class="no-notes">No speaker notes for this slide</p>';
    const slideTitle = currentSlide?.frontmatter?.title ?? `Slide ${this.currentSlideIndex + 1}`;

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel?.webview.cspSource} 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>Presenter View</title>
  <link rel="stylesheet" href="${cssUri}">
  <style>
    /* Inline fallback styles in case CSS fails to load */
    body {
      font-family: var(--vscode-font-family, system-ui, -apple-system, sans-serif);
      margin: 0;
      padding: 16px;
      background: var(--vscode-editor-background, #1e1e1e);
      color: var(--vscode-editor-foreground, #cccccc);
      display: grid;
      grid-template-columns: 2fr 1fr;
      grid-template-rows: auto 1fr 1fr;
      gap: 16px;
      height: 100vh;
      box-sizing: border-box;
    }
    .header {
      grid-column: 1 / -1;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c);
    }
    .slide-counter {
      font-size: 18px;
      font-weight: 600;
    }
    .clock {
      font-family: monospace;
      font-size: 24px;
    }
    .current-slide {
      grid-row: 2 / 4;
      overflow: auto;
      background: var(--vscode-editor-background, #252526);
      border: 1px solid var(--vscode-panel-border, #3c3c3c);
      border-radius: 4px;
      padding: 16px;
    }
    .section-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--vscode-descriptionForeground, #9d9d9d);
      margin-bottom: 8px;
    }
    .speaker-notes {
      overflow: auto;
      background: var(--vscode-input-background, #3c3c3c);
      border: 1px solid var(--vscode-panel-border, #3c3c3c);
      border-radius: 4px;
      padding: 16px;
    }
    .notes-content {
      font-size: 18px;
      line-height: 1.6;
      white-space: pre-wrap;
    }
    .next-preview {
      overflow: auto;
      background: var(--vscode-editor-background, #252526);
      border: 1px solid var(--vscode-panel-border, #3c3c3c);
      border-radius: 4px;
      padding: 12px;
      opacity: 0.7;
    }
    .next-preview .preview-content {
      transform: scale(0.7);
      transform-origin: top left;
    }
    .no-notes, .no-next {
      color: var(--vscode-descriptionForeground, #9d9d9d);
      font-style: italic;
    }
  </style>
</head>
<body>
  <header class="header">
    <span class="slide-title" id="slideTitle">${this.escapeHtml(slideTitle)}</span>
    <span class="slide-counter" id="slideCounter">${this.currentSlideIndex + 1} / ${totalSlides}</span>
    <span class="clock" id="clock">--:--:--</span>
  </header>

  <section class="current-slide">
    <div class="section-label">Current Slide</div>
    <div class="slide-content" id="currentSlide">${currentSlideHtml}</div>
  </section>

  <section class="speaker-notes">
    <div class="section-label">Speaker Notes</div>
    <div class="notes-content" id="speakerNotes">${speakerNotes}</div>
  </section>

  <section class="next-preview">
    <div class="section-label">Next Slide</div>
    <div class="preview-content" id="nextSlide">${nextSlideHtml}</div>
  </section>

  <script>
    (function() {
      const vscode = acquireVsCodeApi();

      // Clock update
      function updateClock() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        document.getElementById('clock').textContent = hours + ':' + minutes + ':' + seconds;
      }
      setInterval(updateClock, 1000);
      updateClock();

      // Message handler
      window.addEventListener('message', (event) => {
        const message = event.data;
        
        if (message.type === 'presenterSlideChanged') {
          const payload = message.payload;
          
          document.getElementById('slideTitle').textContent = payload.slideTitle;
          document.getElementById('slideCounter').textContent = 
            (payload.currentSlideIndex + 1) + ' / ' + payload.totalSlides;
          document.getElementById('currentSlide').innerHTML = payload.currentSlideHtml;
          document.getElementById('speakerNotes').innerHTML = 
            payload.speakerNotes || '<p class="no-notes">No speaker notes for this slide</p>';
          document.getElementById('nextSlide').innerHTML = 
            payload.nextSlideHtml || '<p class="no-next">End of presentation</p>';
        }
      });
    })();
  </script>
</body>
</html>`;
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (c) => map[c] || c);
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.close();
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}
