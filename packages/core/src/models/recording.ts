/**
 * Recording mode types and interfaces for Deckpilot.
 * Captures timeline events during a presentation session for
 * post-production narration scripting and export.
 *
 * Pure TypeScript — no vscode imports.
 */

/**
 * All possible recording event types emitted during a session.
 */
export type RecordingEventType =
  | 'session.started'
  | 'session.stopped'
  | 'narration.cue.started'
  | 'slide.entered'
  | 'slide.exited'
  | 'fragment.revealed'
  | 'video.started'
  | 'video.ended'
  | 'video.failed'
  | 'action.triggered'
  | 'action.completed'
  | 'terminal.command.started'
  | 'terminal.command.completed'
  | 'file.opened'
  | 'editor.highlighted'
  | 'scene.restored'
  | 'manual.marker'
  | 'timing.paused'
  | 'timing.resumed'
  | 'retake.marked';

/**
 * Individual timeline event captured during recording.
 */
export interface RecordingEvent {
  /** Unique event identifier */
  id: string;
  /** Event type discriminator */
  type: RecordingEventType;
  /** Absolute timestamp (Date.now()) */
  timestamp: number;
  /** Milliseconds elapsed since session start */
  relativeTimeMs: number;
  /** Slide index at time of event (0-based) */
  slideIndex: number;
  /** Fragment index within slide, if applicable */
  fragmentIndex?: number;
  /** Arbitrary event-specific metadata */
  metadata?: Record<string, unknown>;
  /** Optional human-readable note */
  note?: string;
}

/**
 * Full recording session artifact produced on stop.
 */
export interface RecordingSession {
  appearance?: import('./appearance').ResolvedAppearance;
  /** Unique session identifier */
  sessionId: string;
  /** Absolute path to the .deck.md file */
  deckPath: string;
  /** Deck title from frontmatter, if available */
  deckTitle?: string;
  /** Absolute timestamp when recording started */
  recordingStartTime: number;
  /** Absolute timestamp when recording stopped */
  recordingEndTime?: number;
  /** Total duration in milliseconds */
  durationMs?: number;
  /** Directory containing all artifacts produced for this recording session. */
  outputDirectory?: string;
  /** Ordered list of all recorded events */
  events: RecordingEvent[];
  /** Derived script segments (populated at export time) */
  segments: RecordingSegment[];
  /** Intervals excluded from narration timing */
  ignoredIntervals: IgnoredInterval[];
  /** Manual markers placed during session */
  manualMarkers: ManualMarker[];
  /** External recorder metadata (if configured) */
  recorder?: RecorderMetadata;
  /** Post-production replacement decisions and composed output. */
  composition?: RecordingComposition;
  /** Composition failure while retaining the recoverable raw capture. */
  compositionError?: string;
  /** Metadata about the export environment */
  exportMetadata: ExportMetadata;
}

export interface RecordingCompositionDecision {
  videoId: string;
  src: string;
  captureStartMs: number;
  captureEndMs: number;
  sourceStartMs: number;
  sourceEndMs: number;
  outputStartMs: number;
  outputEndMs: number;
  audio: 'mute' | 'preserve' | 'duck';
}

export interface RecordingComposition {
  capturePath: string;
  outputPath: string;
  outputDurationMs: number;
  decisions: RecordingCompositionDecision[];
}

/**
 * Derived narration segment for post-production scripting.
 */
export interface RecordingSegment {
  /** Unique segment identifier */
  segmentId: string;
  /** Start offset from session start (ms) */
  startTimeMs: number;
  /** End offset from session start (ms) */
  endTimeMs: number;
  /** Segment duration (ms) */
  durationMs: number;
  /** Slide index this segment covers */
  slideIndex: number;
  /** Fragment index, if segment covers a specific fragment */
  fragmentIndex?: number;
  /** Slide title from frontmatter */
  slideTitle?: string;
  /** Voice-over cue text */
  cueText?: string;
  /** Speaker notes from slide */
  speakerNotes?: string;
  /** Human-readable summary of events in this segment */
  eventSummary: string;
  /** Draft narration text for this segment */
  draftNarration: string;
}

/**
 * Interval excluded from narration timing (e.g. retakes, pauses).
 */
export interface IgnoredInterval {
  /** Start offset from session start (ms) */
  startTimeMs: number;
  /** End offset from session start (ms) */
  endTimeMs: number;
  /** Reason for exclusion */
  reason?: string;
}

/**
 * Manual marker placed by presenter during recording.
 * Type defined now for Phase 2 implementation.
 */
export interface ManualMarker {
  /** Unique marker identifier */
  id: string;
  /** Marker type */
  type: 'narration' | 'pause' | 'resume' | 'retake' | 'ignore-start' | 'ignore-end';
  /** Milliseconds elapsed since session start */
  relativeTimeMs: number;
  /** Slide index at time of marker */
  slideIndex: number;
  /** Optional human-readable note */
  note?: string;
}

/**
 * Metadata about the export context.
 */
export interface ExportMetadata {
  /** Absolute timestamp when export was generated */
  generatedAt: number;
  /** Extension version string */
  extensionVersion: string;
  /** Platform identifier (process.platform) */
  platform: string;
  /** List of available export format identifiers */
  exportFormats: string[];
}

/**
 * Voice-over cue parsed from deck annotations.
 */
export interface VoiceOverCue {
  /** Slide index this cue belongs to */
  slideIndex: number;
  /** Fragment index, if cue targets a specific fragment */
  fragmentIndex?: number;
  /** Offset from video.started for timed video-item narration. */
  offsetMs?: number;
  /** Cue text */
  text: string;
  /** Source of the cue in the deck */
  source: 'comment' | 'frontmatter' | 'speaker-notes';
}

/**
 * Metadata about an external screen recorder session.
 */
export interface RecorderMetadata {
  /** Whether an external recorder was configured */
  configured: boolean;
  /** Whether the recorder launched successfully */
  started: boolean;
  /** Whether the recorder stopped successfully */
  stopped: boolean;
  /** The resolved output file path (if recorder started) */
  outputPath?: string;
  /** The start command that was executed */
  startCommand?: string;
  /** The stop command that was executed */
  stopCommand?: string;
  /** Error message if recorder failed */
  error?: string;
}
