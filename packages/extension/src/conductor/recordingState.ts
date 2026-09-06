/**
 * RecordingState — thin wrapper held by Conductor to manage recording.
 *
 * Delegates all recording logic to RecordingController.
 * Provides convenience accessors used by the Conductor hooks.
 */

import { RecordingEvent, RecordingSession, ManualMarker } from '@deckpilot/core/models/recording';
import { RecordingController } from '../recording/recordingController';

/**
 * Conductor-owned recording state holder.
 */
export class RecordingState {
  private controller: RecordingController;

  constructor() {
    this.controller = new RecordingController();
  }

  /**
   * Start a new recording session.
   */
  startRecording(deckPath: string, deckTitle?: string, slideIndex?: number, sessionId?: string, appearance?: RecordingSession['appearance']): void {
    this.controller.startRecording(deckPath, deckTitle, slideIndex, sessionId, appearance);
  }

  /**
   * Stop the current recording and return the session artifact.
   */
  stopRecording(slideIndex?: number): RecordingSession | undefined {
    return this.controller.stopRecording(slideIndex);
  }

  /**
   * Whether a recording is currently active.
   */
  isRecording(): boolean {
    return this.controller.isActive();
  }

  /**
   * Record an event (no-op when not recording).
   */
  recordEvent(event: RecordingEvent): void {
    this.controller.recordEvent(event);
  }

  recordEventAt(event: RecordingEvent, relativeTimeMs: number): void {
    this.controller.recordEventAt(event, relativeTimeMs);
  }

  /**
   * Milliseconds elapsed since recording started.
   */
  getElapsedMs(): number {
    return this.controller.getElapsedMs();
  }

  /**
   * Pause narration timing.
   */
  pauseTiming(slideIndex: number, note?: string): void {
    this.controller.pauseTiming(slideIndex, note);
  }

  /**
   * Resume narration timing.
   */
  resumeTiming(slideIndex: number, note?: string): void {
    this.controller.resumeTiming(slideIndex, note);
  }

  /**
   * Whether timing is currently paused.
   */
  isPaused(): boolean {
    return this.controller.isPaused();
  }

  /**
   * Mark a retake point.
   */
  markRetake(slideIndex: number, note?: string): void {
    this.controller.markRetake(slideIndex, note);
  }

  /**
   * Insert a manual marker.
   */
  insertMarker(slideIndex: number, markerType: ManualMarker['type'], note?: string): void {
    this.controller.insertMarker(slideIndex, markerType, note);
  }

  /**
   * Get the current session snapshot (for live preview).
   */
  getSession(): RecordingSession | undefined {
    if (!this.controller.isActive()) {
      return undefined;
    }
    return this.controller.getSession();
  }
}
