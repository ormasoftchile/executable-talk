import type { RecordingEvent, RecordingSegment, RecordingSession } from '@deckpilot/core/models/recording';
import type { NarrationTiming } from './autoPilot';

export function buildNarrationSegments(
  session: RecordingSession,
  timings: readonly NarrationTiming[],
): RecordingSegment[] {
  const starts = new Map<number, RecordingEvent>();
  for (const event of session.events) {
    if (event.type !== 'narration.cue.started') {
      continue;
    }
    const cueIndex = event.metadata?.cueIndex;
    if (typeof cueIndex !== 'number' || !timings.some(timing => timing.cueIndex === cueIndex)) {
      throw new Error(`Recording contains an unknown narration cue ${String(cueIndex)}.`);
    }
    if (starts.has(cueIndex)) {
      throw new Error(`Recording started narration cue ${cueIndex} more than once.`);
    }
    starts.set(cueIndex, event);
  }

  const segments: RecordingSegment[] = [];
  let previousEnd = 0;
  for (const timing of timings) {
    const event = starts.get(timing.cueIndex);
    if (!event) {
      throw new Error(`Recording did not schedule narration cue ${timing.cueIndex}; recorded takes are preserved.`);
    }
    const start = event.relativeTimeMs;
    if (!Number.isFinite(start) || start < previousEnd ||
        !Number.isFinite(timing.durationMs) || timing.durationMs <= 0) {
      throw new Error(`Recording has invalid timing for narration cue ${timing.cueIndex}.`);
    }
    const startTimeMs = Math.round(start);
    const endTimeMs = Math.round(start + timing.durationMs);
    segments.push({
      segmentId: `narration-cue-${timing.cueIndex}`,
      startTimeMs,
      endTimeMs,
      durationMs: endTimeMs - startTimeMs,
      slideIndex: event.slideIndex,
      slideTitle: session.segments.find(segment => segment.slideIndex === event.slideIndex && segment.slideTitle)?.slideTitle,
      cueText: timing.text,
      draftNarration: timing.text,
      eventSummary: '',
    });
    previousEnd = endTimeMs;
  }
  return segments;
}