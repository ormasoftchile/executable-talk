/**
 * PreviewProvider — opens a side-panel webview that re-renders a .deck.md as
 * the author types. Pure render path: no executors, no state stack, no trust
 * checks, no recording. Click handlers in the webview are no-ops.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { parseDeck } from '@deckpilot/core/parser/deckParser';
import { readDeckContentImport } from '@deckpilot/core/parser';
import { matter } from '@deckpilot/core/parser/frontmatter';
import { collectWatchPaths } from './collectWatchPaths';
import { renderPreviewError, renderPreviewHtml, RenderPreviewOptions } from './previewRenderer';
import { WatchedSources } from './watchedSources';
import { DiagramRendererRegistry } from '../renderer/diagram/registry';
import { RenderBlockUpdatePayload } from '../webview/messages';
import { DiagramService, annotateDiagramPlaceholders } from '../services/diagramService';
import { AppearanceService } from '../services/appearanceService';
import { appearanceCss, type ResolvedAppearance } from '@deckpilot/core/models/appearance';
import type { Deck } from '@deckpilot/core/models/deck';

const DEBOUNCE_MS = 150;
const VIEW_TYPE = 'deckPilotPreview';

export class PreviewProvider implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private deckUri: vscode.Uri | undefined;
  /** URI the slides' sourceRange maps to: deckUri normally, or the imported
   * content file when the wrapper declares `content:`. Used for cursor follow
   * and reverse sync. */
  private sourceUri: vscode.Uri | undefined;
  private slideRanges: Array<{ index: number; start: number; end: number }> = [];
  private readonly watched: WatchedSources;
  private readonly diagramService: DiagramService;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private disposables: vscode.Disposable[] = [];
  private nonce = generateNonce();
  private refreshVersion = 0;
  private currentDeck: Deck | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    diagramRegistry: DiagramRendererRegistry,
    private readonly appearanceService: AppearanceService = new AppearanceService(),
  ) {
    this.watched = new WatchedSources(() => this.scheduleRefresh());
    this.diagramService = new DiagramService(diagramRegistry);
  }

  async show(deckUri: vscode.Uri): Promise<void> {
    this.deckUri = deckUri;

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside, true);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        VIEW_TYPE,
        previewTitle(deckUri),
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: this.computeResourceRoots(),
        },
      );
      this.panel.onDidDispose(() => this.disposePanel(), null, this.disposables);
      this.attachDocumentListener();
      this.attachSelectionListener();
      this.attachMessageListener();
      this.disposables.push(this.appearanceService.onDidChange((filePath, appearance) => {
        if (this.currentDeck?.filePath === filePath) void this.updateAppearance(appearance);
      }));
    }

    this.panel.title = previewTitle(deckUri);
    await this.refresh(true);
  }

  private attachDocumentListener(): void {
    const changeDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.contentChanges.length === 0) {
        return;
      }
      const changedUri = e.document.uri;
      if (
        (this.deckUri && (changedUri.toString() === this.deckUri.toString() || changedUri.fsPath === this.deckUri.fsPath)) ||
        this.watched.has(changedUri.fsPath)
      ) {
        this.scheduleRefresh();
      }
    });
    this.disposables.push(changeDisposable);
  }

  /** Cursor follow: editor caret moves → preview scrolls to matching slide. */
  private attachSelectionListener(): void {
    const d = vscode.window.onDidChangeTextEditorSelection((e) => {
      if (!this.panel || !this.sourceUri) {
        return;
      }
      const docUri = e.textEditor.document.uri;
      if (docUri.toString() !== this.sourceUri.toString() && docUri.fsPath !== this.sourceUri.fsPath) {
        return;
      }
      const line = e.selections[0]?.active.line;
      if (typeof line !== 'number') {
        return;
      }
      const slide = this.getSlideForLine(line);
      if (slide) {
        void this.panel.webview.postMessage({ type: 'scrollToSlide', slideIndex: slide.index });
      }
    });
    this.disposables.push(d);
  }

  /** Find the slide corresponding to a line number, handling gaps between slide boundaries. */
  private getSlideForLine(line: number): { index: number; start: number; end: number } | undefined {
    if (this.slideRanges.length === 0) {
      return undefined;
    }
    const exact = this.slideRanges.find((r) => line >= r.start && line <= r.end);
    if (exact) {
      return exact;
    }
    for (let i = this.slideRanges.length - 1; i >= 0; i--) {
      if (line >= this.slideRanges[i].start) {
        return this.slideRanges[i];
      }
    }
    return this.slideRanges[0];
  }

  /** Reverse sync: webview click on a slide → reveal source line in editor. */
  private attachMessageListener(): void {
    const d = this.panel!.webview.onDidReceiveMessage((msg: unknown) => {
      if (!msg || typeof msg !== 'object') {
        return;
      }
      const m = msg as { type?: string; slideIndex?: number };
      if (m.type === 'appearanceMenu' && this.currentDeck) {
        void this.appearanceService.showMenu(this.currentDeck.filePath);
      }
      if (m.type === 'revealSource' && typeof m.slideIndex === 'number') {
        void this.revealSlideSource(m.slideIndex);
      }
    });
    this.disposables.push(d);
  }

  private async revealSlideSource(slideIndex: number): Promise<void> {
    if (!this.sourceUri) {
      return;
    }
    const range = this.slideRanges.find((r) => r.index === slideIndex);
    if (!range) {
      return;
    }
    const doc = await vscode.workspace.openTextDocument(this.sourceUri);
    const editor = await vscode.window.showTextDocument(doc, {
      viewColumn: vscode.ViewColumn.One,
      preserveFocus: false,
    });
    const targetLine = Math.min(range.start, doc.lineCount - 1);
    const pos = new vscode.Position(targetLine, 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(
      new vscode.Range(pos, pos),
      vscode.TextEditorRevealType.InCenterIfOutsideViewport,
    );
  }

  private scheduleRefresh(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      void this.refresh();
    }, DEBOUNCE_MS);
  }

  private async refresh(waitForDiagrams = false): Promise<void> {
    if (!this.panel || !this.deckUri) {
      return;
    }
    const renderOpts = this.buildRenderOptions();
    let raw: string;
    try {
      raw = await this.readLive(this.deckUri);
    } catch (err) {
      this.panel.webview.html = renderPreviewError(
        `Failed to read deck file: ${(err as Error).message}`,
        renderOpts,
      );
      return;
    }

    const isYamlDeck = this.deckUri.fsPath.endsWith('.deck.yaml');
    // Markdown decks: splice live (unsaved) imported content into the wrapper.
    // YAML decks: parseDeck reads `content:` itself, so give it a live resolver
    // that returns unsaved editor text for the imported file.
    const content = isYamlDeck ? raw : await this.inlineContentImport(raw, this.deckUri.fsPath);
    const result = await parseDeck(content, this.deckUri.fsPath, {
      readImport: (abs) => this.readOpenDoc(abs),
    });
    if (result.error || !result.deck) {
      this.panel.webview.html = renderPreviewError(
        result.error ?? 'Parse failed',
        renderOpts,
      );
      // Even on parse failure, keep watching the raw deck's referenced files
      // so the next save/keystroke in them retriggers a refresh.
      this.watched.sync(this.extraWatchPathsFromRaw(raw));
      return;
    }

    const workspaceRoot = this.resolveBasePath(result.deck);
    this.currentDeck = result.deck;
    const appearance = this.appearanceService.configure(result.deck);
    const diagramThemeDefault = result.deck.metadata.diagrams?.theme;
    for (const slide of result.deck.slides) {
      slide.html = annotateDiagramPlaceholders(slide.html, workspaceRoot, diagramThemeDefault);
    }

    const refreshVersion = ++this.refreshVersion;
    const initialBlocks = waitForDiagrams
      ? (await Promise.all(result.deck.slides.map(slide => this.diagramService.resolveSlideBlocks(slide.html, appearance, result.deck!.metadata.diagrams)))).flat()
      : undefined;
    if (!this.panel || refreshVersion !== this.refreshVersion) {
      return;
    }
    this.panel.webview.html = renderPreviewHtml(result.deck, {
      ...renderOpts,
      warnings: [...(result.warnings ?? []), ...appearance.warnings],
      appearance,
      initialBlocks,
    });
    if (!waitForDiagrams) {
      void this.resolvePreviewDiagrams(result.deck.slides.map((slide) => slide.html), refreshVersion);
    }
    const paths = new Set(collectWatchPaths(result.deck));
    for (const extra of this.extraWatchPathsFromRaw(raw)) {
      paths.add(extra);
    }
    this.watched.sync([...paths]);

    // Track slide source ranges and the URI those ranges map to (the imported
    // content file when `content:` is in use, otherwise the deck itself).
    this.slideRanges = result.deck.slides
      .filter((s) => s.sourceRange)
      .map((s) => ({ index: s.index, start: s.sourceRange!.start, end: s.sourceRange!.end }));
    const importTargets = this.extraWatchPathsFromRaw(raw);
    this.sourceUri = importTargets.length > 0
      ? vscode.Uri.file(importTargets[0])
      : this.deckUri;
  }

  private resolveBasePath(deck: Awaited<ReturnType<typeof parseDeck>>['deck']): string {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    const deckBasePath = deck?.metadata?.basePath;
    if (typeof deckBasePath === 'string' && deckBasePath.trim().length > 0 && this.deckUri) {
      return path.resolve(path.dirname(this.deckUri.fsPath), deckBasePath);
    }
    return workspaceRoot;
  }

  /**
   * Extract paths the synthetic (post-inline) parsed deck would no longer
   * surface — the `content:` import target, for both `.deck.md` (frontmatter)
   * and `.deck.yaml` (top-level key) decks.
   */
  private extraWatchPathsFromRaw(raw: string): string[] {
    const importPath = readDeckContentImport(raw, this.deckUri!.fsPath);
    if (!importPath) {
      return [];
    }
    const deckDir = path.dirname(this.deckUri!.fsPath);
    return [path.isAbsolute(importPath) ? importPath : path.resolve(deckDir, importPath)];
  }

  /** Return the live (possibly unsaved) text of an open document, or undefined. */
  private readOpenDoc(fsPath: string): string | undefined {
    return vscode.workspace.textDocuments.find((d) => d.uri.fsPath === fsPath)?.getText();
  }

  private async readLive(docUri: vscode.Uri): Promise<string> {
    const openDoc = vscode.workspace.textDocuments.find(
      (d) => d.uri.toString() === docUri.toString() || (docUri.scheme !== 'untitled' && d.uri.fsPath === docUri.fsPath),
    );
    if (openDoc) {
      return openDoc.getText();
    }
    if (docUri.scheme === 'untitled') {
      const doc = await vscode.workspace.openTextDocument(docUri);
      return doc.getText();
    }
    return fs.promises.readFile(docUri.fsPath, 'utf-8');
  }

  /**
   * If the wrapper deck declares `content: <path>` and that imported file is
   * currently open in an editor with unsaved edits, splice its live body into
   * the wrapper so the preview reflects keystrokes (not just saves). When the
   * import file isn't open, we leave the directive in place and let parseDeck
   * read it from disk.
   */
  private async inlineContentImport(raw: string, deckPath: string): Promise<string> {
    let parsed: { data: Record<string, unknown>; content: string };
    try {
      parsed = matter(raw);
    } catch {
      return raw;
    }
    const importPath = typeof parsed.data.content === 'string' ? parsed.data.content.trim() : '';
    if (!importPath) {
      return raw;
    }
    const resolved = path.isAbsolute(importPath)
      ? importPath
      : path.resolve(path.dirname(deckPath), importPath);
    const openDoc = vscode.workspace.textDocuments.find(
      (d) => d.uri.fsPath === resolved,
    );
    if (!openDoc) {
      return raw;
    }
    let importedBody: string;
    try {
      importedBody = matter(openDoc.getText()).content;
    } catch {
      return raw;
    }

    // Preserve the wrapper's original frontmatter byte-for-byte (it may carry
    // sidecar references, env declarations, etc. that don't survive a naive
    // YAML round-trip). We only strip the `content:` line so the parser
    // doesn't try to re-import from disk, then replace the wrapper body with
    // the live imported body.
    const fenceMatch = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/.exec(raw);
    if (!fenceMatch) {
      return raw;
    }
    const yamlBlock = fenceMatch[1];
    const strippedYaml = yamlBlock
      .split(/\r?\n/)
      .filter((line) => !/^\s*content\s*:/.test(line))
      .join('\n');
    const fm = `---\n${strippedYaml}\n---\n`;
    return `${fm}${importedBody}`;
  }

  private buildRenderOptions(): RenderPreviewOptions {
    const webview = this.panel!.webview;
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        'packages',
        'extension',
        'src',
        'webview',
        'assets',
        'preview.css',
      ),
    );
    return {
      webview,
      cspSource: webview.cspSource,
      nonce: this.nonce,
      cssUri,
      fontsUri: webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri,
        'packages', 'extension', 'src', 'webview', 'assets', 'appearance-fonts.css')),
      deckPath: this.deckUri!.fsPath,
    };
  }

  private async resolvePreviewDiagrams(slidesHtml: string[], refreshVersion: number): Promise<void> {
    const deck = this.currentDeck;
    const appearance = deck ? this.appearanceService.get(deck) : undefined;
    for (const slideHtml of slidesHtml) {
      const updates = await this.diagramService.resolveSlideBlocks(slideHtml, appearance, deck?.metadata.diagrams);
      for (const update of updates) {
        if (!this.panel || refreshVersion !== this.refreshVersion || (deck && this.appearanceService.get(deck).revision !== appearance?.revision)) {
          return;
        }
        await this.sendRenderBlockUpdate({
          blockId: update.blockId,
          html: update.html,
          status: update.html.includes('diagram-block--error') ? 'error' : 'success',
        });
      }
    }
  }

  private async sendRenderBlockUpdate(payload: RenderBlockUpdatePayload): Promise<void> {
    await this.panel?.webview.postMessage({ type: 'renderBlockUpdate', payload });
  }

  private async updateAppearance(appearance: ResolvedAppearance): Promise<void> {
    const deck = this.currentDeck;
    const version = this.refreshVersion;
    if (!deck || !this.panel) return;
    const groups = await Promise.all(deck.slides.map(slide =>
      this.diagramService.resolveSlideBlocks(slide.html, appearance, deck.metadata.diagrams)));
    if (!this.panel || this.currentDeck !== deck || this.refreshVersion !== version || this.appearanceService.get(deck).revision !== appearance.revision) return;
    await this.panel.webview.postMessage({ type: 'appearanceChanged', payload: {
      appearance, css: appearanceCss(appearance), blocks: groups.flat(),
    } });
  }

  private computeResourceRoots(): vscode.Uri[] {
    const roots: vscode.Uri[] = [
      vscode.Uri.joinPath(this.extensionUri, 'packages', 'extension', 'src', 'webview', 'assets'),
    ];
    if (vscode.workspace.workspaceFolders) {
      for (const f of vscode.workspace.workspaceFolders) {
        roots.push(f.uri);
      }
    }
    if (this.deckUri && this.deckUri.scheme !== 'untitled') {
      roots.push(vscode.Uri.file(path.dirname(this.deckUri.fsPath)));
    }
    return roots;
  }

  private disposePanel(): void {
    this.panel = undefined;
    this.deckUri = undefined;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    this.watched.dispose();
  }

  dispose(): void {
    this.panel?.dispose();
    this.disposePanel();
  }
}

function previewTitle(deckUri: vscode.Uri): string {
  const name = deckUri.scheme === 'untitled' ? (deckUri.path || 'Untitled') : path.basename(deckUri.fsPath);
  return `Preview: ${name}`;
}

function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}
