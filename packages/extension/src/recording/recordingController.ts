/**
 * RecordingController — owns the recording lifecycle.
 *
 * Manages start/stop, computes relative timestamps, and delegates
 * event storage to RecordingTimeline. Does NOT depend on the vscode
 * API — only the Conductor layer touches vscode.
 */

import {
  RecordingEvent,
  RecordingSession,
  ExportMetadata,
  ManualMarker,
  IgnoredInterval,
} from '@deckpilot/core/models/recording';
import { RecordingTimeline } from './recordingTimeline';
import {
  createSessionStartedEvent,
  createSessionStoppedEvent,
  createManualMarkerEvent,
  createTimingPausedEvent,
  createTimingResumedEvent,
  createRetakeMarkedEvent,
} from './recordingEventFactory';
import { randomUUID } from 'crypto';

/**
 * Main orchestrator for a single recording session.
 */
export class RecordingController {
  private timeline: RecordingTimeline;
  private recording = false;
  private paused = false;
  private startTime = 0;
  private pauseStartTime = 0;
  private totalPausedMs = 0;
  private sessionId = '';
  private deckPath = '';
  private deckTitle: string | undefined;
  private manualMarkers: ManualMarker[] = [];
  private ignoredIntervals: IgnoredInterval[] = [];
  private appearance: RecordingSession['appearance'];

  constructor() {
    this.timeline = new RecordingTimeline();
  }

  /**
   * Begin a new recording session.
   *
   * @param deckPath - Absolute path to the .deck.md file
   * @param deckTitle - Optional deck title from frontmatter
   * @param slideIndex - Current slide index at start (default 0)
   */
  startRecording(
    deckPath: string,
    deckTitle?: string,
    slideIndex = 0,
    sessionId: string = randomUUID(),
    appearance?: RecordingSession['appearance'],
  ): void {
    if (this.recording) {
      return; // already recording
    }

    this.sessionId = sessionId;
    this.appearance = appearance ? JSON.parse(JSON.stringify(appearance)) as RecordingSession['appearance'] : undefined;
    this.deckPath = deckPath;
    this.deckTitle = deckTitle;
    this.startTime = Date.now();
    this.recording = true;
    this.paused = false;
    this.pauseStartTime = 0;
    this.totalPausedMs = 0;
    this.manualMarkers = [];
    this.ignoredIntervals = [];
    this.timeline.clear();

    const event = createSessionStartedEvent(deckPath, slideIndex);
    this.recordEvent(event);
  }

  /**
   * Stop the current recording and return the full session artifact.
   * Returns undefined if not currently recording.
   */
  stopRecording(slideIndex = 0): RecordingSession | undefined {
    if (!this.recording) {
      return undefined;
    }

    const stopEvent = createSessionStoppedEvent(slideIndex);
    this.recordEvent(stopEvent);
    this.recording = false;

    return this.buildSession();
  }

  /**
   * Record an event, stamping relativeTimeMs from session start.
   * No-op if not currently recording.
   */
  recordEvent(event: RecordingEvent): void {
    if (!this.recording) {
      return;
    }
    event.relativeTimeMs = event.timestamp - this.startTime;
    this.timeline.addEvent(event);
  }

  recordEventAt(event: RecordingEvent, relativeTimeMs: number): void {
    if (!this.recording) return;
    event.relativeTimeMs = Math.max(0, Math.round(relativeTimeMs));
    event.timestamp = this.startTime + event.relativeTimeMs;
    this.timeline.addEvent(event);
  }

  /**
   * Whether a recording session is active.
   */
  isActive(): boolean {
    return this.recording;
  }

  /**
   * Milliseconds elapsed since recording started.
   * Returns 0 if not recording.
   */
  getElapsedMs(): number {
    if (!this.recording) {
      return 0;
    }
    return Date.now() - this.startTime;
  }

  /**
   * Whether timing is currently paused.
   */
  isPaused(): boolean {
    return this.paused;
  }

  /**
   * Pause narration timing. Events keep being logged but the paused
   * interval is excluded from narration pacing.
   */
  pauseTiming(slideIndex: number, note?: string): void {
    if (!this.recording || this.paused) {
      return;
    }
    this.paused = true;
    this.pauseStartTime = Date.now();
    this.recordEvent(createTimingPausedEvent(slideIndex, note));
  }

  /**
   * Resume narration timing after a pause.
   */
  resumeTiming(slideIndex: number, note?: string): void {
    if (!this.recording || !this.paused) {
      return;
    }
    const pauseEnd = Date.now();
    const pauseDuration = pauseEnd - this.pauseStartTime;
    this.totalPausedMs += pauseDuration;
    this.ignoredIntervals.push({
      startTimeMs: this.pauseStartTime - this.startTime,
      endTimeMs: pauseEnd - this.startTime,
      reason: note ?? 'timing paused',
    });
    this.paused = false;
    this.pauseStartTime = 0;
    this.recordEvent(createTimingResumedEvent(slideIndex, note));
  }

  /**
   * Mark a retake point. Presenter can use this to flag sections
   * that should be re-done in post-production.
   */
  markRetake(slideIndex: number, note?: string): void {
    if (!this.recording) {
      return;
    }
    this.recordEvent(createRetakeMarkedEvent(slideIndex, note));
    this.manualMarkers.push({
      id: randomUUID(),
      type: 'retake',
      relativeTimeMs: Date.now() - this.startTime,
      slideIndex,
      note,
    });
  }

  /**
   * Insert a manual narration marker. Used to flag spots where the
   * presenter wants to record a voice-over cue after the fact.
   */
  insertMarker(slideIndex: number, markerType: ManualMarker['type'], note?: string): void {
    if (!this.recording) {
      return;
    }
    this.recordEvent(createManualMarkerEvent(slideIndex, markerType, note));
    this.manualMarkers.push({
      id: randomUUID(),
      type: markerType,
      relativeTimeMs: Date.now() - this.startTime,
      slideIndex,
      note,
    });
  }

  /**
   * Total time spent in paused state (ms).
   */
  getTotalPausedMs(): number {
    if (this.paused) {
      return this.totalPausedMs + (Date.now() - this.pauseStartTime);
    }
    return this.totalPausedMs;
  }

  /**
   * Build and return a snapshot of the current RecordingSession
   * (useful for live preview / partial export while still recording).
   */
  getSession(): RecordingSession {
    return this.buildSession();
  }

  /** Expose timeline for testing */
  getTimeline(): RecordingTimeline {
    return this.timeline;
  }

  // ---------- private ----------

  private buildSession(): RecordingSession {
    const now = Date.now();
    const events = this.timeline.getEvents();
    const endTime = this.recording ? undefined : now;
    const duration = this.recording ? undefined : now - this.startTime;

    const exportMetadata: ExportMetadata = {
      generatedAt: now,
      extensionVersion: '', // populated by Conductor when it has access to context
      platform: typeof process !== 'undefined' ? process.platform : 'unknown',
      exportFormats: [],
    };

    return {
      sessionId: this.sessionId,
      ...(this.appearance ? { appearance: this.appearance } : {}),
      deckPath: this.deckPath,
      deckTitle: this.deckTitle,
      recordingStartTime: this.startTime,
      recordingEndTime: endTime,
      durationMs: duration,
      events,
      segments: [],           // populated at export time
      ignoredIntervals: [...this.ignoredIntervals],
      manualMarkers: [...this.manualMarkers],
      exportMetadata,
    };
  }
}
