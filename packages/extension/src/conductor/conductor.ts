/**
 * Conductor - orchestrates presentation navigation, actions, and state
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { Deck } from '@deckpilot/core/models/deck';
import { EnvStatus, EnvStatusEntry, ResolvedEnv } from '@deckpilot/core/models/env';
import { Slide } from '@deckpilot/core/models/slide';
import { Action, ActionType } from '@deckpilot/core/models/action';
import { StateStack } from './stateStack';
import { SnapshotFactory } from './snapshotFactory';
import { NavigationHistory } from './navigationHistory';
import { SceneStore } from './sceneStore';
import { RecordingState } from './recordingState';
import { WebviewProvider, WebviewCallbacks } from '../webview/webviewProvider';
import { PresenterViewProvider } from '../webview/presenterViewProvider';
import { getActionRegistry } from '../actions/registry';
import { isTrusted, onTrustChanged } from '../utils/workspaceTrust';
import { enterZenMode, exitZenMode, resetZenModeState } from '../utils/zenMode';
import { parseRenderDirectives, resolveDirective, createLoadingPlaceholder, formatAsCommandBlock, renderCommand, StreamCallback, injectBlockElements } from '../renderer';
import { DiagramRendererRegistry } from '../renderer/diagram/registry';
import { parseDeck } from '@deckpilot/core/parser';
import { PreflightValidator } from '../validation/preflightValidator';
import { ValidationReport, ValidationIssue } from '../validation/types';
import { EnvFileLoader, EnvResolver, SecretScrubber } from '@deckpilot/core/env';
import { OnboardingStepState, StepStatus, ValidationResult } from '@deckpilot/core/models/onboarding';
import { RecordingSession, VoiceOverCue } from '@deckpilot/core/models/recording';
import {
  createSlideEnteredEvent,
  createSlideExitedEvent,
  createNarrationCueStartedEvent,
  createFragmentRevealedEvent,
  createVideoPlaybackEvent,
  createActionTriggeredEvent,
  createActionCompletedEvent,
  createSceneRestoredEvent,
} from '../recording/recordingEventFactory';
import { parseCues } from '../recording/cueParser';
import { buildSegments } from '../recording/segmentBuilder';
import {
  RecorderOrchestrator,
  RecorderWindowTarget,
  captureActiveRecordingWindow,
  getRecorderConfig,
} from '../recording/recorderOrchestrator';
import {
  buildAutoPilotPlan,
  AutoPilotStep,
  AutoPilotConfig,
  NarrationTiming,
  resolveAutoPilotConfig,
} from '../recording/autoPilot';
import { resolveRecordingOutputLayout } from '../recording/outputLayout';
import { buildTimingSummary, parseMaxDuration, requirePlanWithinBudget } from '../recording/durationBudget';
import {
  composeRecordedVideo,
  probeRecordedMediaDuration,
  resolveVideoBaseDirectory,
  validateVideoSources,
} from '../recording/videoComposer';
import { alignRecordingSessionToCapture } from '../recording/videoCompositionPlan';
import { disposeBrowserPanel } from '../browser';
import { diagramLog } from '../utils/diagramLogger';
import { DiagramService, annotateDiagramPlaceholders } from '../services/diagramService';
import { AppearanceService } from '../services/appearanceService';
import { appearanceCss, type ResolvedAppearance } from '@deckpilot/core/models/appearance';
import type { VideoPlaybackMessage } from '../webview/messages';

/**
 * Actions that require workspace trust
 */
const TRUSTED_ACTION_TYPES: ActionType[] = ['terminal.run', 'debug.start'];
const RECORDER_STARTUP_ALLOWANCE_MS = 2000;

export interface NarrationSetup {
  deckPath: string;
  cues: VoiceOverCue[];
  outputDirectory: string;
  narrationDirectory: string;
}

/**
 * Merge the attributes of an enclosing <p> (class/data-fragment*) onto the
 * outer <div> of a render-block placeholder so the placeholder participates in
 * the slide's fragment sequence after we drop the invalid <p><div></div></p>.
 */
function mergePAttrsIntoPlaceholder(placeholderHtml: string, pAttrs: string): string {
  const classMatch = pAttrs.match(/\bclass="([^"]*)"/);
  const fragMatch = pAttrs.match(/\bdata-fragment="(\d+)"/);
  const animMatch = pAttrs.match(/\bdata-fragment-animation="([\w-]+)"/);

  if (!classMatch && !fragMatch && !animMatch) {
    return placeholderHtml;
  }

  let merged = placeholderHtml;
  if (classMatch) {
    const extraClasses = classMatch[1].trim();
    if (extraClasses) {
      merged = merged.replace(
        /class="render-block render-block-loading"/,
        `class="render-block render-block-loading ${extraClasses}"`,
      );
    }
  }
  const dataAttrs: string[] = [];
  if (fragMatch) { dataAttrs.push(`data-fragment="${fragMatch[1]}"`); }
  if (animMatch) { dataAttrs.push(`data-fragment-animation="${animMatch[1]}"`); }
  if (dataAttrs.length > 0) {
    merged = merged.replace(
      /(<div class="render-block render-block-loading[^"]*")/,
      `$1 ${dataAttrs.join(' ')}`,
    );
  }
  return merged;
}

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
  private secretScrubber: SecretScrubber;
  private resolvedEnv: ResolvedEnv | undefined;
  private envFileWatcher: vscode.Disposable | undefined;
  private envDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  private sidecarFileWatcher: vscode.Disposable | undefined;
  private sidecarDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  private onboardingSteps: OnboardingStepState[] = [];
  private recordingState: RecordingState;
  private diagramRegistry: DiagramRendererRegistry;
  private diagramService: DiagramService;
  private recorderOrchestrator: RecorderOrchestrator | undefined;
  private recordingOutputDirectory: string | undefined;
  private autoPilotRunning = false;
  private editorDemo: {
    existingTabs: Set<vscode.Tab>;
    openedTabs?: vscode.Tab[];
    layout: unknown;
  } | undefined;
  private slideRenderVersion = 0;
  private pendingVideoNarrationCues = new Map<
    number,
    Array<{ cueIndex: number; offsetMs: number }>
  >();
  private autoPilotConfig: AutoPilotConfig = resolveAutoPilotConfig();
  private narrationTimings: readonly NarrationTiming[] = [];
  /** Pending slide render callback — resolved when webview confirms render complete */
  private pendingSlideRender: { slideIndex: number; resolve: () => void } | undefined;
  private pendingAdvance: ((advanced: boolean) => void) | undefined;
  private videoPlaybackStatus = new Map<number, 'playing' | 'ended' | 'failed'>();
  private videoPlaybackWaiters = new Map<number, (error?: string) => void>();

  private appearanceService = new AppearanceService();

  constructor(extensionUri: vscode.Uri) {
    this.stateStack = new StateStack();
    this.snapshotFactory = new SnapshotFactory();
    this.navigationHistory = new NavigationHistory();
    this.sceneStore = new SceneStore();
    this.webviewProvider = new WebviewProvider(extensionUri, this.appearanceService);
    this.presenterViewProvider = new PresenterViewProvider(extensionUri);

    this.outputChannel = vscode.window.createOutputChannel('Deckpilot');
    this.validationOutputChannel = vscode.window.createOutputChannel('Deckpilot Validation');
    this.validationDiagnostics = vscode.languages.createDiagnosticCollection('Deckpilot: Validation');
    this.disposables.push(this.outputChannel, this.validationOutputChannel, this.validationDiagnostics);

    // Env resolution dependencies (Feature 006)
    this.envFileLoader = new EnvFileLoader();
    this.envResolver = new EnvResolver();
    this.secretScrubber = new SecretScrubber();
    this.recordingState = new RecordingState();
    this.diagramRegistry = new DiagramRendererRegistry();
    this.diagramService = new DiagramService(this.diagramRegistry);
    this.disposables.push(this.appearanceService, this.appearanceService.onDidChange((filePath, appearance) => {
      if (this.deck?.filePath === filePath) void this.updateAppearance(appearance);
    }));

    // Listen for workspace trust changes
    this.disposables.push(
      onTrustChanged((trusted) => {
        this.webviewProvider.sendTrustStatusChanged({ isTrusted: trusted });
      })
    );
  }

  getDiagramRegistry(): DiagramRendererRegistry {
    return this.diagramRegistry;
  }

  getAppearanceService(): AppearanceService {
    return this.appearanceService;
  }

  private async updateAppearance(appearance: ResolvedAppearance, waitForPaint = false): Promise<void> {
    if (!this.webviewProvider.isOpen()) return;
    const deck = this.deck;
    const index = this.currentSlideIndex;
    const slide = deck?.slides[index];
    if (!deck || !slide) return;
    const html = annotateDiagramPlaceholders(slide.html, this.resolvedBasePath(), deck.metadata.diagrams?.theme);
    const blocks = await this.diagramService.resolveSlideBlocks(html, appearance, deck.metadata.diagrams);
    if (this.deck !== deck || this.currentSlideIndex !== index || this.appearanceService.get(deck).revision !== appearance.revision) return;
    await this.webviewProvider.sendAppearance(appearance, blocks, index, waitForPaint);
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
    this.appearanceService.configure(deck);

    // Resolve environment variables (Feature 006 — T016)
    await this.resolveEnvironment(deck);

    // Guided setup toast (Feature 006 — T036)
    if (deck.envDeclarations.length > 0) {
      const envFile = await this.envFileLoader.loadEnvFile(deck.filePath);
      if (!envFile.exists) {
        this.showEnvSetupToast(deck);
      }
      // Start file watcher for .deck.env (Feature 006 — T039)
      this.startEnvFileWatcher(deck);
    }

    // Start file watcher for .deck.yaml sidecar (DA-13)
    this.startSidecarFileWatcher(deck);

    // Load authored scenes from deck frontmatter (T044 [US5])
    if (deck.metadata?.scenes && deck.metadata.scenes.length > 0) {
      this.sceneStore.loadAuthored(deck.metadata.scenes);
    }

    // Initialize onboarding step tracking
    if (this.isOnboardingMode()) {
      this.onboardingSteps = deck.slides.map((slide, index) => ({
        slideIndex: index,
        checkpoint: slide.checkpoint,
        status: index === 0 ? 'active' : 'pending' as StepStatus,
      }));
    } else {
      this.onboardingSteps = [];
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

    // Enter Zen Mode if enabled (default: false)
    const zenModeEnabled = deck.metadata?.options?.zenMode === true;
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
      onEnvSetupRequest: () => void this.handleEnvSetupRequest(),
      onRetryStep: async (payload) => {
        const step = this.onboardingSteps[payload.stepIndex];
        if (step) {
          step.status = 'active';
          step.validationResult = undefined;
          this.sendStepStatusChanged(payload.stepIndex, 'active');
          await this.goToSlide(payload.stepIndex);
        }
      },
      onResetToCheckpoint: async (payload) => {
        const step = this.onboardingSteps[payload.stepIndex];
        if (step?.checkpoint) {
          const entry = this.sceneStore.restore(step.checkpoint);
          if (entry?.snapshot) {
            await this.snapshotFactory.restorePartial(entry.snapshot);
          }
          step.status = 'active';
          step.validationResult = undefined;
          this.sendStepStatusChanged(payload.stepIndex, 'active');
          await this.goToSlide(payload.stepIndex);
        }
      },
      onFragmentRevealed: (payload) => {
        this.onFragmentRevealed(payload.slideIndex, payload.fragmentIndex, payload.fragmentCount, payload.timestamp);
      },
      onRecordingMarker: (payload) => {
        this.onRecordingMarker(payload.markerType, payload.note);
      },
      onSlideRendered: (payload) => {
        this.handleSlideRendered(payload.slideIndex);
      },
      onVideoPlayback: (message) => {
        this.handleVideoPlayback(message);
      },
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
    const deck = this.deck;
    const renderVersion = ++this.slideRenderVersion;
    const isCurrent = () => this.deck === deck && deck.state !== 'closed' && renderVersion === this.slideRenderVersion;

    // Bounds check
    const targetIndex = Math.max(0, Math.min(index, this.deck.slides.length - 1));

    // Capture snapshot before navigation
    const snapshot = this.snapshotFactory.capture(this.currentSlideIndex, `Before slide ${targetIndex + 1}`);
    this.stateStack.push(snapshot);

    // Record slide exit/enter if recording is active
    const previousSlideIndex = this.currentSlideIndex;

    // Update current index
    this.currentSlideIndex = targetIndex;
    this.deck.currentSlideIndex = targetIndex;

    // Get current slide
    const slide = this.deck.slides[targetIndex];
    if (slide.video) {
      this.videoPlaybackStatus.delete(targetIndex);
      this.videoPlaybackWaiters.delete(targetIndex);
    }

    // Emit recording events after index update
    if (this.recordingState.isRecording()) {
      if (previousSlideIndex !== targetIndex) {
        this.recordingState.recordEvent(
          createSlideExitedEvent(previousSlideIndex),
        );
      }
      this.recordingState.recordEvent(
        createSlideEnteredEvent(
          targetIndex,
          previousSlideIndex,
          'sequential',
          slide.fragmentCount,
          slide.frontmatter?.title,
        ),
      );
    }

    // Resolve render directives in slide content
    const resolvedHtml = annotateDiagramPlaceholders(
      this.resolveSlideRenderDirectives(slide),
      this.resolvedBasePath(),
      this.deck.metadata.diagrams?.theme,
    );
    const directives = slide.renderDirectives?.length ? parseRenderDirectives(slide.content, slide.index) : [];
    const contentBlocks = await Promise.all(directives.filter(directive => directive.type !== 'command').map(async directive => {
      try {
        const block = await resolveDirective(directive, this.resolvedBasePath());
        return { blockId: directive.id, html: block.html };
      } catch {
        return { blockId: directive.id, html: '<div class="render-block render-block-error">Content could not be loaded.</div>' };
      }
    }));
    if (!isCurrent()) return;
    let appearance = this.appearanceService.get(deck);
    let diagramBlocks: Array<{ blockId: string; html: string }> = [];
    if (slide.diagramBlocks?.length) {
      do {
        appearance = this.appearanceService.get(deck);
        diagramBlocks = await this.diagramService.resolveSlideBlocks(resolvedHtml, appearance, deck.metadata.diagrams);
        if (!isCurrent()) return;
      } while (this.appearanceService.get(deck).revision !== appearance.revision);
    }

    // Send slide changed to webview
    this.webviewProvider.sendSlideChanged({
      slideIndex: targetIndex,
      appearance,
      appearanceCss: appearanceCss(appearance),
      diagramBlocks: [...contentBlocks, ...diagramBlocks],
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
    const commands = directives.filter(directive => directive.type === 'command');
    if (commands.length) void this.resolveDirectivesAsync(commands);

    // Sync presenter view if visible
    this.presenterViewProvider.updateSlide(targetIndex);

    // In onboarding mode: auto-save checkpoint and update step status
    if (this.isOnboardingMode() && this.onboardingSteps.length > 0) {
      const step = this.onboardingSteps[targetIndex];
      if (step && step.status === 'pending') {
        step.status = 'active';
        this.sendStepStatusChanged(targetIndex, 'active');
      }
      if (step?.checkpoint) {
        try {
          const cpSnapshot = this.snapshotFactory.capture(targetIndex, `Checkpoint: ${step.checkpoint}`);
          this.sceneStore.save(step.checkpoint, cpSnapshot, targetIndex);
        } catch { /* best-effort checkpoint save */ }
      }
    }

    // Execute onEnter actions AFTER the slide is rendered and visible
    if (slide.onEnterActions && slide.onEnterActions.length > 0) {
      await this.waitForSlideRender(targetIndex);
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
    await this.goToSlide(0, true);
  }

  /**
   * Navigate to last slide
   */
  async lastSlide(): Promise<void> {
    if (this.deck) {
      const lastIndex = this.deck.slides.length - 1;
      const title = this.deck.slides[lastIndex]?.frontmatter?.title;
      this.navigationHistory.push(lastIndex, 'sequential', title);
      await this.goToSlide(lastIndex, true);
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
          showAllFragments: true,
          fragmentCount: slide.fragmentCount,
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
      await this.goToSlide(snapshot.slideIndex, true);
    }
  }

  /**
   * Close the presentation
   */
  async close(): Promise<void> {
    // Cancel any running auto-pilot so its loop and delays stop immediately
    this.cancelAutoPilot();

    // Auto-stop any active recording session (Feature: Recording Mode — Auto-stop on presentation exit)
    if (this.recordingState.isRecording()) {
      this.outputChannel.appendLine('[Recording] Auto-stopping recording due to presentation close');
      await this.stopRecording();
    }

    // Exit Zen Mode
    await exitZenMode();

    // Dispose env file watcher (Feature 006 — T040)
    this.disposeEnvFileWatcher();

    // Dispose sidecar file watcher (DA-13)
    this.disposeSidecarFileWatcher();

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
    const parseResult = await parseDeck(content, filePath);
    if (!parseResult.deck) {
      diagramLog(`[conductor] Validation parse failed for ${filePath}: ${parseResult.error || 'Failed to parse deck'}`);
      void vscode.window.showWarningMessage(
        `Cannot validate: ${parseResult.error || 'Failed to parse deck'}`
      );
      return undefined;
    }
    diagramLog(`[conductor] Deck parsed. Slides: ${parseResult.deck.slides.length}. Slide 0 diagramBlocks: ${parseResult.deck.slides[0]?.diagramBlocks?.length ?? 0}`);

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
          envDeclarations: this.deck?.envDeclarations,
          resolvedEnv: this.resolvedEnv,
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
      diag.source = 'Deckpilot';
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
    ch.appendLine('Deckpilot: Validate Deck');
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
   * Called by deckPilot.goToSlide command (T014).
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
   * Return the currently active deck, if any.
   */
  getDeck(): Deck | undefined {
    return this.deck;
  }

  // ============================================================================
  // Recording control (Feature: Recording Mode — Phase 1)
  // ============================================================================

  /**
   * Start recording the current presentation session.
   * Optionally launches an external screen recorder if configured.
   * No-op if already recording or no deck is open.
   */
  async startRecording(
    outputDirectory?: string,
    windowTarget?: RecorderWindowTarget,
  ): Promise<void> {
    if (!this.deck || this.recordingState.isRecording()) {
      return;
    }
    const recordingDeck = this.deck;
    const appearance = this.appearanceService.freeze(recordingDeck);
    try {
    await this.updateAppearance(appearance, true);
    const recordingWindowTarget = windowTarget ?? await captureActiveRecordingWindow();

    const sessionId = randomUUID();
    const startedAt = Date.now();
    const recorderConfig = getRecorderConfig();
    recorderConfig.windowScope = this.deck.metadata.recording?.windowScope ?? recorderConfig.windowScope;
    const outputLayout = resolveRecordingOutputLayout({
      deckPath: this.deck.filePath,
      sessionId,
      startedAt,
      exportOutputDir: this.deck.metadata.export?.outputDir,
      recorderOutputDir: recorderConfig.outputDir,
    });
    this.recordingOutputDirectory = outputDirectory ?? outputLayout.sessionDirectory;
    recorderConfig.outputDir = this.recordingOutputDirectory;
    this.outputChannel.appendLine(
      `[Recording] Recorder config — start: "${recorderConfig.startCommand}", stop: "${recorderConfig.stopCommand}", dir: "${recorderConfig.outputDir}", scope: "${recorderConfig.windowScope}"`,
    );
    this.recorderOrchestrator = new RecorderOrchestrator(recorderConfig, this.outputChannel);
    if (this.recorderOrchestrator.isConfigured()) {
      this.outputChannel.appendLine(`[Recording] Launching recorder for session ${sessionId}`);
      const started = await this.recorderOrchestrator.start(
        sessionId,
        this.deck.filePath,
        recordingWindowTarget,
      );
      if (!started) {
        void vscode.window.showWarningMessage(
          'External recorder failed to start. Timeline logging continues.',
        );
      }
    } else {
      this.outputChannel.appendLine('[Recording] No external recorder configured');
    }

    this.recordingState.startRecording(
      this.deck.filePath,
      this.deck.title,
      this.currentSlideIndex,
      sessionId,
      { ...appearance, rendererVersions: this.diagramRegistry.getVersions() },
    );

    this.outputChannel.appendLine('[Recording] Session started');
    } catch (error) {
      this.appearanceService.release(recordingDeck);
      throw error;
    }
  }

  /**
   * Stop the active recording and return the session artifact.
   * Also stops the external recorder if one was launched.
   * Returns undefined if not recording.
   */
  async stopRecording(): Promise<RecordingSession | undefined> {
    const activeSession = this.recordingState.getSession();
    if (!activeSession) return undefined;
    const recordingDeck = this.deck;
    try {

    const session = this.recordingState.stopRecording(this.currentSlideIndex);
    if (this.recorderOrchestrator) {
      await this.recorderOrchestrator.stop(activeSession.sessionId);
    }
    if (session && this.deck) {
      session.outputDirectory = this.recordingOutputDirectory;

      // Stop external recorder and attach metadata
      if (this.recorderOrchestrator) {
        session.recorder = this.recorderOrchestrator.getMetadata();
        this.recorderOrchestrator.dispose();
        this.recorderOrchestrator = undefined;
      }

      if (session.recorder?.stopped && session.recorder.outputPath) {
        try {
          const captureDurationMs = await probeRecordedMediaDuration(session.recorder.outputPath);
          const offsetMs = alignRecordingSessionToCapture(session, captureDurationMs);
          this.outputChannel.appendLine(
            `[Recording] Aligned event clock to capture (${offsetMs}ms startup offset)`,
          );
        } catch (error) {
          this.outputChannel.appendLine(
            `[Recording] Could not align event clock: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      if (session.recorder?.stopped && this.deck.slides.some(slide => slide.video)) {
        try {
          const baseDirectory = this.resolvedVideoBasePath();
          const composed = await composeRecordedVideo(
            session,
            baseDirectory,
          );
          if (composed) {
            session.composition = composed.composition;
            for (const event of session.events) {
              event.relativeTimeMs = composed.plan.mapTime(event.relativeTimeMs);
              event.timestamp = session.recordingStartTime + event.relativeTimeMs;
            }
            for (const interval of session.ignoredIntervals) {
              interval.startTimeMs = composed.plan.mapTime(interval.startTimeMs);
              interval.endTimeMs = composed.plan.mapTime(interval.endTimeMs);
            }
            session.durationMs = composed.plan.outputDurationMs;
            session.recordingEndTime = session.recordingStartTime + composed.plan.outputDurationMs;
            this.outputChannel.appendLine(
              `[Recording] Composed ${composed.plan.decisions.length} video item(s): ${composed.composition.outputPath}`,
            );
          }
        } catch (error) {
          session.compositionError = error instanceof Error ? error.message : String(error);
          this.outputChannel.appendLine(`[Recording] Composition failed: ${session.compositionError}`);
          void vscode.window.showWarningMessage(
            `Video composition failed; the raw capture was retained. ${session.compositionError}`,
          );
        }
      }

      const cues = parseCues(this.deck.slides);
      session.segments = buildSegments(
        session.events,
        cues,
        this.deck.slides,
        session.ignoredIntervals,
        this.narrationTimings,
      );
      this.narrationTimings = [];
      this.outputChannel.appendLine(
        `[Recording] Session stopped — ${session.events.length} events, ` +
        `${session.segments.length} segments, ${session.durationMs ?? 0}ms`,
      );
      this.recordingOutputDirectory = undefined;
    }
    return session;
    } finally {
      if (recordingDeck) this.appearanceService.release(recordingDeck);
    }
  }

  /**
   * Whether a recording session is currently active.
   */
  isRecording(): boolean {
    return this.recordingState.isRecording();
  }

  /**
   * Whether auto-pilot is currently driving the presentation.
   */
  isAutoPilotActive(): boolean {
    return this.autoPilotRunning;
  }

  createNarrationSetup(): NarrationSetup | undefined {
    if (!this.deck) {
      return undefined;
    }
    const startedAt = Date.now();
    const recorderConfig = getRecorderConfig();
    const outputLayout = resolveRecordingOutputLayout({
      deckPath: this.deck.filePath,
      sessionId: randomUUID(),
      startedAt,
      exportOutputDir: this.deck.metadata.export?.outputDir,
      recorderOutputDir: recorderConfig.outputDir,
    });
    return {
      deckPath: this.deck.filePath,
      cues: parseCues(this.deck.slides),
      outputDirectory: outputLayout.sessionDirectory,
      narrationDirectory: outputLayout.narrationDirectory,
    };
  }

  async refreshDeckFromDisk(): Promise<void> {
    if (!this.deck?.filePath) {
      throw new Error('The active presentation has no deck file.');
    }
    const content = await fs.promises.readFile(this.deck.filePath, 'utf8');
    const parseResult = await parseDeck(content, this.deck.filePath);
    if (!parseResult.deck) {
      throw new Error(parseResult.error ?? 'Failed to parse the active deck.');
    }
    await this.openDeck(parseResult.deck);
  }

  /**
   * Auto-record the entire deck: start recording, drive the presentation
   * using measured narration timing, then stop recording.
   * Returns the final session artifact when complete.
   */
  async autoRecord(
    narrationTimings: readonly NarrationTiming[] = [],
    outputDirectory?: string,
    windowTarget?: RecorderWindowTarget,
  ): Promise<RecordingSession | undefined> {
    if (!this.deck) {
      return undefined;
    }
    if (this.autoPilotRunning) {
      return undefined;
    }

    let videoDurations: Map<number, number>;
    try {
      videoDurations = await validateVideoSources(this.deck.slides, this.resolvedVideoBasePath());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`[AutoPilot] Video preflight failed: ${message}`);
      void vscode.window.showErrorMessage(`Cannot auto-record: ${message}`);
      return undefined;
    }

    this.autoPilotRunning = true;
    try {
    this.outputChannel.appendLine('[AutoPilot] Building execution plan...');

    // Resolve pacing config: deck frontmatter overrides → defaults
    const overrides = (this.deck.metadata.autoRecord ?? {}) as Partial<AutoPilotConfig>;
    this.autoPilotConfig = resolveAutoPilotConfig(overrides);
    if (Object.keys(overrides).length > 0) {
      this.outputChannel.appendLine(
        `[AutoPilot] Pacing overrides: ${JSON.stringify(overrides)}`,
      );
    }

    const layoutSlides = await Promise.all(this.deck.slides.map(async slide => {
      const slideHtml = annotateDiagramPlaceholders(this.resolveSlideRenderDirectives(slide), this.resolvedBasePath(), this.deck!.metadata.diagrams?.theme);
      const diagramBlocks = slide.diagramBlocks?.length
        ? await this.diagramService.resolveSlideBlocks(slideHtml, this.appearanceService.get(this.deck!), this.deck!.metadata.diagrams)
        : [];
      return { slideHtml, diagramBlocks };
    }));
    const renderedLayouts = await this.webviewProvider.prepareRecordingLayout(layoutSlides);

    // Build the plan from slides
    const maxDurationMs = parseMaxDuration(this.deck.metadata.recording?.maxDuration);
    if (maxDurationMs !== undefined) {
      const summary = buildTimingSummary(this.deck.slides, this.autoPilotConfig, narrationTimings, maxDurationMs, videoDurations, renderedLayouts);
      this.outputChannel.appendLine(`[AutoPilot] Duration estimate: ${summary.plannedMs}ms; limit: ${maxDurationMs}ms. Final video verification required.`);
      requirePlanWithinBudget(summary);
    }
    const plan = buildAutoPilotPlan(
      this.deck.slides,
      this.autoPilotConfig,
      narrationTimings,
      videoDurations,
      renderedLayouts,
    );
    this.pendingVideoNarrationCues = new Map(
      plan
        .filter(step => step.type === 'play-video')
        .map(step => [step.slideIndex, step.narrationCues ?? []]),
    );
    this.narrationTimings = narrationTimings;
    this.outputChannel.appendLine(`[AutoPilot] Plan: ${plan.length} steps`);
    for (const step of plan) {
      this.outputChannel.appendLine(`  ${step.type} (${step.durationMs}ms) — ${step.label}`);
    }

    // Start recording (with external recorder if configured)
    await this.startRecording(outputDirectory, windowTarget);

    if (
      this.recorderOrchestrator?.getMetadata().started &&
      !this.recorderOrchestrator.hasConfirmedOutputReady()
    ) {
      this.outputChannel.appendLine(
        `[AutoPilot] Waiting ${RECORDER_STARTUP_ALLOWANCE_MS}ms for recorder media startup`,
      );
      await this.delay(RECORDER_STARTUP_ALLOWANCE_MS);
    }

    let firstStepIndex = 0;
    const initialStep = plan[0];
    if (initialStep?.type === 'wait' && initialStep.label === 'Initial delay') {
      await this.executeAutoPilotStep(initialStep);
      firstStepIndex = 1;
    }

    // Re-enter the first item after pre-roll. This event is the exact anchor
    // for its narration and restarts a video that may have previewed on open.
    await this.goToSlide(0);

    // Execute the plan
    try {
      for (const step of plan.slice(firstStepIndex)) {
        if (!this.autoPilotRunning) {
          this.outputChannel.appendLine('[AutoPilot] Cancelled');
          break;
        }

        await this.executeAutoPilotStep(step);
      }
    } catch (err) {
      this.outputChannel.appendLine(
        `[AutoPilot] Error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Stop recording
    this.outputChannel.appendLine('[AutoPilot] Complete — stopping recording');
    return await this.stopRecording();
    } finally {
      await this.cleanupAutoPilotRun();
    }
  }

  private async beginEditorDemo(): Promise<void> {
    await this.restoreEditorDemo();
    this.editorDemo = {
      existingTabs: new Set(vscode.window.tabGroups.all.flatMap(group => group.tabs)),
      layout: await vscode.commands.executeCommand('vscode.getEditorLayout'),
    };
  }

  private captureEditorDemoTabs(): void {
    const demo = this.editorDemo;
    if (demo) {
      demo.openedTabs = vscode.window.tabGroups.all.flatMap(group => group.tabs)
        .filter(tab => !demo.existingTabs.has(tab));
    }
  }

  private async restoreEditorDemo(): Promise<void> {
    const demo = this.editorDemo;
    if (!demo) {
      return;
    }
    if (!demo.openedTabs) {
      this.captureEditorDemoTabs();
    }
    this.editorDemo = undefined;
    try {
      const currentTabs = new Set(vscode.window.tabGroups.all.flatMap(group => group.tabs));
      const toClose = (demo.openedTabs ?? []).filter(tab => currentTabs.has(tab) && !tab.isDirty);
      if (toClose.length > 0) {
        await vscode.window.tabGroups.close(toClose, true);
      }
      const remaining = vscode.window.tabGroups.all.flatMap(group => group.tabs);
      if (demo.layout && remaining.every(tab => demo.existingTabs.has(tab))) {
        await vscode.commands.executeCommand('vscode.setEditorLayout', demo.layout);
      }
    } catch (error) {
      this.outputChannel.appendLine(`[AutoPilot] Editor demo cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.webviewProvider.reveal();
    }
  }

  private async cleanupAutoPilotRun(): Promise<void> {
    this.autoPilotRunning = false;
    await this.restoreEditorDemo();
    this.pendingVideoNarrationCues.clear();
    this.narrationTimings = [];

    if (this.recordingState.isRecording()) {
      try {
        await this.stopRecording();
      } catch (error) {
        this.outputChannel.appendLine(
          `[AutoPilot] Cleanup failed while stopping recording: ${error instanceof Error ? error.message : String(error)}`,
        );
        this.recordingState.stopRecording(this.currentSlideIndex);
      }
    }

    if (this.recorderOrchestrator) {
      this.recorderOrchestrator.dispose();
      this.recorderOrchestrator = undefined;
    }
    this.recordingOutputDirectory = undefined;
  }

  /**
   * Cancel a running auto-pilot session.
   */
  cancelAutoPilot(): void {
    this.autoPilotRunning = false;
    this.pendingAdvance?.(false);
  }

  /**
   * Execute a single auto-pilot step.
   */
  private async executeAutoPilotStep(step: AutoPilotStep): Promise<void> {
    this.outputChannel.appendLine(`[AutoPilot] >> ${step.type} (${step.durationMs}ms) — ${step.label}`);

    if (step.type !== 'play-video') {
      const stepStartMs = this.recordingState.getElapsedMs();
      for (const cue of step.narrationCues ?? []) {
        this.recordingState.recordEventAt(
          createNarrationCueStartedEvent(step.slideIndex, cue.cueIndex),
          stepStartMs + cue.offsetMs,
        );
      }
    }

    switch (step.type) {
      case 'advance': {
        // Send advance and wait for the slideChanged or fragmentRevealed
        // callback to confirm it happened.
        const advanced = await this.waitForAdvance();
        if (!advanced) {
          this.outputChannel.appendLine('[AutoPilot]   advance timed out');
        }
        break;
      }

      case 'trigger-action':
        if (step.actionId) {
          if (step.restoreEditors) {
            await this.beginEditorDemo();
          }
          try {
            await this.handleExecuteAction(step.actionId);
          } catch (e) {
            this.outputChannel.appendLine(`[AutoPilot]   error: ${e instanceof Error ? e.message : String(e)}`);
          }
          // Give the UI time to settle after the action
          await this.delay(this.autoPilotConfig.postActionMs);
          if (step.restoreEditors) {
            this.captureEditorDemoTabs();
          }
        }
        break;

      case 'restore-editors':
        try {
          await this.delay(step.durationMs);
        } finally {
          await this.restoreEditorDemo();
        }
        break;

      case 'refocus':
        // Files are open beside the webview. Wait, then close them.
        await this.delay(step.durationMs);
        await vscode.commands.executeCommand('workbench.action.closeEditorsInOtherGroups');
        await this.delay(500);
        break;

      case 'wait':
        await this.delay(step.durationMs);
        break;

      case 'play-video':
        {
          const startedAt = Date.now();
          await this.waitForVideoPlayback(step.slideIndex);
          const remainingMs = step.durationMs - (Date.now() - startedAt);
          if (remainingMs > 0) {
            await this.delay(remainingMs);
          }
        }
        break;

      case 'close-panel':
        await vscode.commands.executeCommand('workbench.action.closePanel');
        await this.delay(500);
        break;
    }
  }

  private handleVideoPlayback(message: VideoPlaybackMessage): void {
    const { payload } = message;
    const type = message.type === 'videoPlaybackStarted'
      ? 'video.started'
      : message.type === 'videoPlaybackEnded'
        ? 'video.ended'
        : 'video.failed';
    const status = message.type === 'videoPlaybackStarted'
      ? 'playing'
      : message.type === 'videoPlaybackEnded'
        ? 'ended'
        : 'failed';
    this.videoPlaybackStatus.set(payload.slideIndex, status);

    if (this.recordingState.isRecording()) {
      const video = this.deck?.slides[payload.slideIndex]?.video;
      const videoEvent = createVideoPlaybackEvent(type, payload.slideIndex, {
        videoId: payload.videoId,
        src: video?.src ?? payload.src,
        trimStartMs: video?.trimStartMs,
        trimEndMs: video?.trimEndMs,
        audio: video?.audio,
        currentTimeMs: payload.currentTimeMs,
        error: payload.error,
      }, payload.timestamp);
      this.recordingState.recordEvent(videoEvent);
      if (type === 'video.started') {
        for (const cue of this.pendingVideoNarrationCues.get(payload.slideIndex) ?? []) {
          this.recordingState.recordEventAt(
            createNarrationCueStartedEvent(payload.slideIndex, cue.cueIndex),
            videoEvent.relativeTimeMs + cue.offsetMs,
          );
        }
        this.pendingVideoNarrationCues.delete(payload.slideIndex);
      }
    }

    if (status !== 'playing') {
      this.videoPlaybackWaiters.get(payload.slideIndex)?.(payload.error);
      this.videoPlaybackWaiters.delete(payload.slideIndex);
    }
  }

  private async waitForVideoPlayback(slideIndex: number): Promise<void> {
    const status = this.videoPlaybackStatus.get(slideIndex);
    if (status === 'ended') {
      return;
    }
    if (status === 'failed') {
      throw new Error(`Video playback failed on item ${slideIndex + 1}`);
    }

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.videoPlaybackWaiters.delete(slideIndex);
        reject(new Error(`Video playback timed out on item ${slideIndex + 1}`));
      }, 30 * 60 * 1000);
      this.videoPlaybackWaiters.set(slideIndex, (error) => {
        clearTimeout(timeout);
        if (error) {
          reject(new Error(error));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Send advance to webview and wait for confirmation that the slide
   * or fragment actually changed. Times out after 3 seconds.
   */
  private waitForAdvance(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const prevSlide = this.currentSlideIndex;
      let resolved = false;

      const finish = (advanced: boolean): void => {
        if (resolved) return;
        resolved = true;
        clearInterval(checkInterval);
        clearTimeout(timeout);
        if (this.pendingAdvance === finish) {
          this.pendingAdvance = undefined;
        }
        resolve(advanced);
      };
      this.pendingAdvance = finish;

      // Listen for the slide index to change (confirms navigation happened)
      const checkInterval = setInterval(() => {
        if (this.currentSlideIndex !== prevSlide) {
          finish(true);
        }
      }, 100);

      const timeout = setTimeout(() => {
        finish(false);
      }, 3000);

      this.webviewProvider.sendAdvancePresentation();
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          clearInterval(poll);
          resolve();
        }
      };
      const timer = setTimeout(finish, ms);
      // Poll cancellation flag every 50ms so long waits abort promptly
      const poll = setInterval(() => {
        if (!this.autoPilotRunning) { finish(); }
      }, 50);
    });
  }

  /**
   * Handle a fragment.revealed callback from the webview.
   * Emits a recording event when recording is active.
   */
  onFragmentRevealed(slideIndex: number, fragmentIndex: number, fragmentCount: number, timestamp?: number): void {
    if (this.recordingState.isRecording()) {
      this.recordingState.recordEvent(
        createFragmentRevealedEvent(slideIndex, fragmentIndex, fragmentCount, timestamp),
      );
    }
    this.pendingAdvance?.(true);
  }

  /**
   * Handle a recording marker from the webview or command.
   */
  onRecordingMarker(markerType: 'narration' | 'pause' | 'resume' | 'retake', note?: string): void {
    if (!this.recordingState.isRecording()) {
      return;
    }
    if (markerType === 'pause') {
      this.pauseRecordingTiming(note);
    } else if (markerType === 'resume') {
      this.resumeRecordingTiming(note);
    } else if (markerType === 'retake') {
      this.markRetake(note);
    } else {
      this.recordingState.insertMarker(this.currentSlideIndex, markerType, note);
    }
  }

  /**
   * Pause narration timing during recording.
   */
  pauseRecordingTiming(note?: string): void {
    this.recordingState.pauseTiming(this.currentSlideIndex, note);
    this.outputChannel.appendLine('[Recording] Timing paused');
  }

  /**
   * Resume narration timing during recording.
   */
  resumeRecordingTiming(note?: string): void {
    this.recordingState.resumeTiming(this.currentSlideIndex, note);
    this.outputChannel.appendLine('[Recording] Timing resumed');
  }

  /**
   * Whether recording timing is currently paused.
   */
  isRecordingPaused(): boolean {
    return this.recordingState.isPaused();
  }

  /**
   * Mark a retake point during recording.
   */
  markRetake(note?: string): void {
    this.recordingState.markRetake(this.currentSlideIndex, note);
    this.outputChannel.appendLine('[Recording] Retake marked');
  }

  /**
   * Insert a narration marker during recording.
   */
  insertNarrationMarker(note?: string): void {
    this.recordingState.insertMarker(this.currentSlideIndex, 'narration', note);
    this.outputChannel.appendLine('[Recording] Narration marker inserted');
  }

  /**
   * Dispose of the conductor
   */
  dispose(): void {
    this.disposeEnvFileWatcher();
    this.recorderOrchestrator?.dispose();
    this.webviewProvider.dispose();
    this.presenterViewProvider.dispose();
    this.snapshotFactory.disposeDecorations();
    disposeBrowserPanel();
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }

  // ============================================================================
  // Private methods
  // ============================================================================

  /**
   * Resolve the effective base path for relative file resolution.
   * If deck frontmatter declares basePath, resolve it relative to the deck file's directory.
   * Otherwise fall back to workspace root.
   */
  private resolvedBasePath(): string {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    const deckBasePath = this.deck?.metadata?.basePath;
    if (deckBasePath && this.deck) {
      const deckDir = path.dirname(this.deck.filePath);
      return path.resolve(deckDir, deckBasePath);
    }
    return workspaceRoot;
  }

  private resolvedVideoBasePath(): string {
    if (!this.deck) {
      return '';
    }
    return resolveVideoBaseDirectory(this.deck.filePath, this.deck.metadata.basePath);
  }

  /**
   * Interpolate {{VAR}} in action-preview code elements using the resolved env.
   * Secrets remain as {{VAR}}. No-op if no resolved env.
   */
  private interpolatePreviewHtml(html: string): string {
    if (!this.resolvedEnv) {
      return html;
    }
    const resolvedEnv = this.resolvedEnv;
    return html.replace(
      /(<code class="action-preview">)([\s\S]*?)(<\/code>)/g,
      (_, open: string, content: string, close: string) =>
        `${open}${this.envResolver.interpolateStringForDisplay(content, resolvedEnv)}${close}`,
    );
  }

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
    await this.goToSlide(slideIndex, true);
  }

  /**
   * Handle goBack navigation — return to the previously visited slide.
   * Per contracts/navigation-protocol.md.
   */
  private handleGoBack(): void {
    const previousSlideIndex = this.navigationHistory.goBack();
    if (previousSlideIndex !== null) {
      void this.goToSlide(previousSlideIndex, true);
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

    // Record scene.restored if recording
    if (this.recordingState.isRecording()) {
      this.recordingState.recordEvent(
        createSceneRestoredEvent(entry.slideIndex, sceneName),
      );
    }

    await this.goToSlide(entry.slideIndex, true);

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
   * Check if the current deck is in onboarding mode.
   * Supports mode at top-level frontmatter or inside options.
   */
  private isOnboardingMode(): boolean {
    const meta = this.deck?.metadata;
    return (meta?.options?.mode ?? (meta as Record<string, unknown>)?.mode) === 'onboarding';
  }

  /**
   * Send stepStatusChanged message to Webview (onboarding mode).
   */
  private sendStepStatusChanged(stepIndex: number, status: StepStatus, validationResult?: ValidationResult): void {
    this.webviewProvider.sendStepStatusChanged({ stepIndex, status, validationResult });
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
      const firstSlideHtml = firstSlide ? injectBlockElements(firstSlide.html, firstSlide) : '';
      this.webviewProvider.sendDeckLoaded({
        title: this.deck.title,
        author: this.deck.author,
        theme: this.deck.metadata.theme,
        totalSlides: this.deck.slides.length,
        currentSlideIndex: 0,
        slideHtml: firstSlideHtml,
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

      // Send onboarding state if in onboarding mode
      if (this.isOnboardingMode() && this.onboardingSteps.length > 0) {
        this.webviewProvider.sendOnboardingStateLoaded({
          steps: this.onboardingSteps.map(s => ({
            slideIndex: s.slideIndex,
            checkpoint: s.checkpoint,
            status: s.status,
          })),
        });
      }
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

  /**
   * Wait for the webview to confirm that the slide has been rendered.
   * Uses a promise that is resolved when handleSlideRendered is called.
   * Times out after 2 seconds to avoid blocking forever if webview doesn't respond.
   */
  private waitForSlideRender(slideIndex: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.pendingSlideRender = { slideIndex, resolve };
      // Safety timeout — don't block forever if webview doesn't respond
      setTimeout(() => {
        if (this.pendingSlideRender?.slideIndex === slideIndex) {
          this.pendingSlideRender = undefined;
          resolve();
        }
      }, 2000);
    });
  }

  /**
   * Handle slideRendered message from webview.
   * Resolves the pending promise so onEnterActions can execute.
   */
  private handleSlideRendered(slideIndex: number): void {
    if (this.pendingSlideRender && this.pendingSlideRender.slideIndex === slideIndex) {
      const { resolve } = this.pendingSlideRender;
      this.pendingSlideRender = undefined;
      resolve();
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

    // In auto-pilot mode the webview runs in a separate context and postMessage
    // delivery is async.  Without a brief pause the VS Code side-effect
    // (terminal open, editor highlight, …) fires before the webview has had a
    // chance to render the 'running' button state and any showCommand preview,
    // causing recordings to show the action result before the command label.
    if (this.autoPilotRunning) {
      await this.delay(300);
    }

    // Record action.triggered if recording (scrub sensitive params)
    if (this.recordingState.isRecording()) {
      let scrubbedTarget = typeof action.params?.path === 'string'
        ? action.params.path
        : typeof action.params?.command === 'string'
          ? action.params.command
          : undefined;
      if (scrubbedTarget && this.resolvedEnv) {
        scrubbedTarget = this.secretScrubber.scrub(scrubbedTarget, this.resolvedEnv);
      }
      this.recordingState.recordEvent(
        createActionTriggeredEvent(this.currentSlideIndex, action.id, action.type, scrubbedTarget),
      );
    }

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
          action.params,
          this.resolvedEnv,
        );
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        executionAction = { ...action, params: execParams as Record<string, string> };
      }

      const context: import('../actions/types').ExecutionContext = {
        workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '',
        basePath: this.resolvedBasePath(),
        deckFilePath: this.deck?.filePath ?? '',
        currentSlideIndex: this.currentSlideIndex,
        isWorkspaceTrusted: isTrusted(),
        cancellationToken: this.cancellationTokenSource.token,
        outputChannel: this.outputChannel,
        autoPilotMode: this.autoPilotRunning && !this.editorDemo,
      };

      const result = await executor.execute(executionAction, context);

      if (result.success) {
        this.webviewProvider.sendActionStatusChanged(statusId, 'success');
        
        // Track opened resources
        if (action.type === 'file.open' && typeof action.params.path === 'string') {
          this.snapshotFactory.trackOpenedEditor(action.params.path);
        }

        // Update onboarding step status on action success
        if (this.isOnboardingMode()) {
          const stepIdx = this.currentSlideIndex;
          const step = this.onboardingSteps[stepIdx];
          if (step) {
            if (action.type.startsWith('validate.')) {
              step.status = 'completed';
              step.validationResult = {
                passed: true,
                message: 'Validation passed',
                output: result.actionTarget,
              };
              this.sendStepStatusChanged(stepIdx, 'completed', step.validationResult);
            } else {
              step.status = 'completed';
              this.sendStepStatusChanged(stepIdx, 'completed');
            }
          }
        }
      } else {
        // Forward rich error detail for toast display (per error-feedback contract, T030)
        // Scrub secret values from error messages before sending to webview (T031)
        const scrubbedError = this.resolvedEnv
          ? this.secretScrubber.scrub(result.error ?? '', this.resolvedEnv)
          : result.error;
        this.webviewProvider.sendActionStatusChanged(
          statusId,
          'failed',
          scrubbedError,
          {
            actionType: result.actionType ?? action.type,
            actionTarget: result.actionTarget,
            sequenceDetail: result.sequenceDetail,
          }
        );

        // Update onboarding step status on action failure
        if (this.isOnboardingMode()) {
          const stepIdx = this.currentSlideIndex;
          const step = this.onboardingSteps[stepIdx];
          if (step) {
            step.status = 'failed';
            if (action.type.startsWith('validate.')) {
              step.validationResult = {
                passed: false,
                message: result.error || 'Validation failed',
              };
              this.sendStepStatusChanged(stepIdx, 'failed', step.validationResult);
            } else {
              this.sendStepStatusChanged(stepIdx, 'failed');
            }
          }
        }
      }

      // Record action.completed if recording
      if (this.recordingState.isRecording()) {
        const scrubbedErr = !result.success && result.error && this.resolvedEnv
          ? this.secretScrubber.scrub(result.error, this.resolvedEnv)
          : result.error;
        this.recordingState.recordEvent(
          createActionCompletedEvent(
            this.currentSlideIndex,
            action.id,
            action.type,
            result.success,
            result.durationMs,
            scrubbedErr,
          ),
        );
      }
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'Unknown error';
      // Scrub secret values from catch-block error messages (T031)
      const scrubbedMessage = this.resolvedEnv
        ? this.secretScrubber.scrub(rawMessage, this.resolvedEnv)
        : rawMessage;
      this.webviewProvider.sendActionStatusChanged(
        statusId,
        'failed',
        scrubbedMessage
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
   * Show guided setup toast when .deck.env is missing (Feature 006 — T036).
   */
  private showEnvSetupToast(deck: Deck): void {
    void vscode.window.showInformationMessage(
      'This deck requires environment setup',
      'Set Up Now',
    ).then((choice) => {
      if (choice === 'Set Up Now') {
        void this.runEnvSetup(deck);
      }
    });
  }

  /**
   * Handle envSetupRequest from webview (Feature 006 — T038).
   */
  private async handleEnvSetupRequest(): Promise<void> {
    if (this.deck) {
      await this.runEnvSetup(this.deck);
    }
  }

  /**
   * Run guided environment setup: generate template, create .deck.env, open in editor (Feature 006 — T037).
   */
  private async runEnvSetup(deck: Deck): Promise<void> {
    if (!deck.envDeclarations || deck.envDeclarations.length === 0) {
      return;
    }

    const deckBasename = path.basename(deck.filePath);
    const examplePath = deck.filePath.replace(/\.deck\.md$/, '.deck.env.example');
    const envPath = deck.filePath.replace(/\.deck\.md$/, '.deck.env');

    try {
      // Generate .deck.env.example if not exists
      if (!fs.existsSync(examplePath)) {
        const template = this.envFileLoader.generateTemplate(deck.envDeclarations, deckBasename);
        fs.writeFileSync(examplePath, template, 'utf-8');
        this.outputChannel.appendLine(`[Env] Generated template: ${examplePath}`);
      }

      // Create .deck.env from example if not exists
      if (!fs.existsSync(envPath)) {
        fs.copyFileSync(examplePath, envPath);
        this.outputChannel.appendLine(`[Env] Created env file: ${envPath}`);
      }

      // Open .deck.env in editor
      const doc = await vscode.workspace.openTextDocument(envPath);
      await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });

      void vscode.window.showInformationMessage(
        'Fill in the values for your environment variables',
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.outputChannel.appendLine(`[Env] Setup failed: ${msg}`);
      void vscode.window.showErrorMessage(`Environment setup failed: ${msg}`);
    }
  }

  /**
   * Start watching .deck.env file for changes (Feature 006 — T039).
   * 500ms debounce, re-parses and re-resolves env, updates webview.
   */
  private startEnvFileWatcher(deck: Deck): void {
    // Dispose existing watcher
    this.disposeEnvFileWatcher();

    const deckDir = path.dirname(deck.filePath);
    const pattern = new vscode.RelativePattern(deckDir, '*.deck.env');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    const onChange = () => {
      // Debounce 500ms
      if (this.envDebounceTimer) {
        clearTimeout(this.envDebounceTimer);
      }
      this.envDebounceTimer = setTimeout(() => {
        if (!this.deck) {
          return;
        }
        void (async () => {
          try {
            await this.resolveEnvironment(this.deck!);
            const envStatus = this.buildEnvStatus();
            if (envStatus) {
              this.webviewProvider.sendEnvStatusChanged({ envStatus });
            }
          } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            this.outputChannel.appendLine(`[Env] Watcher re-resolve failed: ${msg}`);
          }
        })();
      }, 500);
    };

    watcher.onDidChange(onChange);
    watcher.onDidCreate(onChange);
    watcher.onDidDelete(onChange);

    this.envFileWatcher = watcher;
    this.disposables.push(watcher);
  }

  /**
   * Dispose the env file watcher and debounce timer (Feature 006 — T040).
   */
  private disposeEnvFileWatcher(): void {
    if (this.envDebounceTimer) {
      clearTimeout(this.envDebounceTimer);
      this.envDebounceTimer = undefined;
    }
    if (this.envFileWatcher) {
      this.envFileWatcher.dispose();
      this.envFileWatcher = undefined;
    }
  }

  /**
   * Start watching .deck.yaml sidecar file for changes (DA-13).
   * 500ms debounce — re-reads .deck.md from disk and re-opens deck so sidecar changes
   * (create / edit / delete) are immediately reflected in the live presentation.
   */
  private startSidecarFileWatcher(deck: Deck): void {
    this.disposeSidecarFileWatcher();

    const deckDir = path.dirname(deck.filePath);
    const pattern = new vscode.RelativePattern(deckDir, '*.deck.yaml');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    const onChange = () => {
      if (this.sidecarDebounceTimer) {
        clearTimeout(this.sidecarDebounceTimer);
      }
      this.sidecarDebounceTimer = setTimeout(() => {
        if (!this.deck) {
          return;
        }
        void this.reloadDeckFromDisk(this.deck.filePath);
      }, 500);
    };

    watcher.onDidChange(onChange);
    watcher.onDidCreate(onChange);
    watcher.onDidDelete(onChange);

    this.sidecarFileWatcher = watcher;
    this.disposables.push(watcher);
  }

  /**
   * Dispose the sidecar file watcher and debounce timer (DA-13).
   */
  private disposeSidecarFileWatcher(): void {
    if (this.sidecarDebounceTimer) {
      clearTimeout(this.sidecarDebounceTimer);
      this.sidecarDebounceTimer = undefined;
    }
    if (this.sidecarFileWatcher) {
      this.sidecarFileWatcher.dispose();
      this.sidecarFileWatcher = undefined;
    }
  }

  /**
   * Reload deck from disk — re-reads .deck.md, re-parses (picks up new .deck.yaml state),
   * and re-opens the presentation. Called when sidecar file changes on disk (DA-13).
   * Graceful degradation: delete of .deck.yaml causes reload with null sidecar (merge engine
   * already handles null sidecar cleanly).
   */
  private async reloadDeckFromDisk(filePath: string): Promise<void> {
    try {
      diagramLog(`[conductor] Re-parsing deck from disk: ${filePath}`);
      await this.refreshDeckFromDisk();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.outputChannel.appendLine(`[Sidecar] Watcher reload failed: ${msg}`);
    }
  }

  /**
   * Resolve render directives in slide content and return updated HTML
   * Uses progressive loading: sends slide with placeholders first, then resolves async
   */
  private resolveSlideRenderDirectives(slide: Slide): string {
    // If no render directives, return HTML with block elements injected at placeholder positions
    if (!slide.renderDirectives || slide.renderDirectives.length === 0) {
      return this.interpolatePreviewHtml(injectBlockElements(slide.html, slide));
    }

    // Parse the full directives from raw content
    const directives = parseRenderDirectives(slide.content, slide.index);
    if (directives.length === 0) {
      return this.interpolatePreviewHtml(injectBlockElements(slide.html, slide));
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

      // Prefer matching the enclosing <p>…<a>…</a>…</p> so we can replace the
      // whole paragraph with the render-block <div>. A <div> inside <p> is
      // invalid HTML — browsers auto-close the <p>, which would strip away the
      // fragment class/attrs the fragment processor placed on it and cause the
      // block to render immediately instead of as a fragment step.
      const paragraphPattern = new RegExp(
        `<p\\b([^>]*)>\\s*<a\\s+href="${escapedUrl}"[^>]*>[^<]*</a>\\s*</p>`,
      );
      const pMatch = html.match(paragraphPattern);
      if (pMatch) {
        const pAttrs = pMatch[1];
        html = html.replace(paragraphPattern, mergePAttrsIntoPlaceholder(placeholder.html, pAttrs));
        continue;
      }

      // Fallback: just replace the <a> if the directive isn't in its own paragraph.
      const pattern = new RegExp(`<a\\s+href="${escapedUrl}"[^>]*>[^<]*</a>`);
      if (pattern.test(html)) {
        html = html.replace(pattern, placeholder.html);
      }
    }

    return this.interpolatePreviewHtml(injectBlockElements(html, slide));
  }

  /**
   * Resolve directives asynchronously and send updates to webview
   */
  private async resolveDirectivesAsync(directives: import('../renderer').RenderDirective[]): Promise<void> {
    const basePath = this.resolvedBasePath();
    for (const directive of directives) {
      try {
        // For command directives with streaming, use special handling
        if (directive.type === 'command' && directive.params.stream) {
          await this.resolveCommandWithStreaming(directive, basePath);
        } else {
          // Standard resolution
          const block = await resolveDirective(directive, basePath);
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
  private async resolveCommandWithStreaming(directive: import('../renderer').CommandRenderDirective, basePath?: string): Promise<void> {
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
    const result = await renderCommand(params, onStream, basePath);
    
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
