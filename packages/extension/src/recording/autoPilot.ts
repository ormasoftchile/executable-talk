/**
 * AutoPilot — drives a presentation using measured narration timing,
 * with cue text length as a fallback when no recording is available.
 *
 * Used with recording mode to produce a hands-free screen capture
 * with properly timed captions.
 */

import { Slide } from '@deckpilot/core/models/slide';
import { VoiceOverCue } from '@deckpilot/core/models/recording';
import { parseCues } from '../recording/cueParser';

/**
 * Configuration for auto-pilot pacing.
 */
export interface AutoPilotConfig {
  /** Words per minute for reading pace (default: 150) */
  wordsPerMinute: number;
  /** Minimum display time per slide/fragment in ms (default: 2500) */
  minDisplayMs: number;
  /** Extra delay after an action executes in ms (default: 1500) */
  actionDelayMs: number;
  /** Breathing room after measured narration in ms (default: 400) */
  narrationGapMs: number;
  /** Time to show a file/editor before returning to the deck in ms (default: 3000) */
  fileViewMs: number;
  /** Delay before first slide in ms (default: 1000) */
  initialDelayMs: number;
  /** Delay after last slide before stopping in ms (default: 2000) */
  finalDelayMs: number;
  /** Settle time after an action executes in ms (default: 1200) */
  postActionMs: number;
}

const DEFAULT_CONFIG: AutoPilotConfig = {
  wordsPerMinute: 150,
  minDisplayMs: 2500,
  actionDelayMs: 1500,
  narrationGapMs: 400,
  fileViewMs: 3000,
  initialDelayMs: 1000,
  finalDelayMs: 2000,
  postActionMs: 1200,
};

/**
 * A single step in the auto-pilot execution plan.
 */
export interface AutoPilotStep {
  /** What to do */
  type: 'advance' | 'trigger-action' | 'wait' | 'close-panel' | 'refocus' | 'restore-editors' | 'play-video';
  /** How long to wait after this step (ms) */
  durationMs: number;
  /** Slide index this step belongs to */
  slideIndex: number;
  /** Fragment index, if this step reveals a fragment */
  fragmentIndex?: number;
  /** Action ID, if this step triggers an action */
  actionId?: string;
  restoreEditors?: boolean;
  /** Description for logging */
  label: string;
  /** Intentional start on the published presentation timeline. */
  timelineStartMs?: number;
  /** Narration cues starting during this step, relative to its start. */
  narrationCues?: Array<{ cueIndex: number; offsetMs: number }>;
}

export interface NarrationTiming {
  /** 1-based cue index matching the narration project/SRT entry. */
  cueIndex: number;
  /** Cue text used to guard against stale or reordered timing data. */
  text: string;
  /** Measured duration of the processed narration take. */
  durationMs: number;
}

export interface AutoPilotSlideLayout {
  fragmentCount: number;
  actionFragments: Record<string, number>;
}

/**
 * Resolve a partial config against built-in defaults.
 */
export function resolveAutoPilotConfig(config: Partial<AutoPilotConfig> = {}): AutoPilotConfig {
  return { ...DEFAULT_CONFIG, ...config };
}

/**
 * Build a complete execution plan for auto-piloting a deck.
 * The plan is a sequence of steps with calculated durations.
 */
export function buildAutoPilotPlan(
  slides: Slide[],
  config: Partial<AutoPilotConfig> = {},
  narrationTimings: readonly NarrationTiming[] = [],
  videoDurations: ReadonlyMap<number, number> = new Map(),
  renderedLayouts: readonly AutoPilotSlideLayout[] = [],
): AutoPilotStep[] {
  const cfg = resolveAutoPilotConfig(config);
  const cues = parseCues(slides);
  const measuredDurations = buildMeasuredDurationMap(cues, narrationTimings);
  const steps: AutoPilotStep[] = [];

  // Initial wait
  steps.push({
    type: 'wait',
    durationMs: cfg.initialDelayMs,
    slideIndex: 0,
    label: 'Initial delay',
  });

  for (let si = 0; si < slides.length; si++) {
    const layout = renderedLayouts[si];
    const slide = layout ? { ...slides[si], fragmentCount: layout.fragmentCount } : slides[si];

    if (si > 0) {
      // Advance to this slide
      steps.push({
        type: 'advance',
        durationMs: 0,
        slideIndex: si,
        label: `Advance to slide ${si + 1}`,
      });
    }

    if (slide.video) {
      const videoCues = cues.filter(cue => cue.slideIndex === si);
      const narrationSchedule = buildVideoNarrationSchedule(
        videoCues,
        measuredDurations,
        cfg.narrationGapMs,
      );
      steps.push({
        type: 'play-video',
        durationMs: Math.max(
          videoDurations.get(si) ?? 0,
          narrationSchedule.reduce(
            (latest, item) => Math.max(
              latest,
              item.offsetMs + item.durationMs + Math.max(0, cfg.narrationGapMs),
            ),
            0,
          ),
        ),
        slideIndex: si,
        label: `Play video: ${slide.video.id}`,
        narrationCues: narrationSchedule.map(item => ({
          cueIndex: cues.indexOf(item.cue) + 1,
          offsetMs: item.offsetMs,
        })),
      });
      continue;
    }

    const slideCues = cues.filter(cue => cue.slideIndex === si && cue.offsetMs === undefined);
    const sequenceCuesAfterReveals = slide.fragmentCount > 0 &&
      slideCues.length > 0 &&
      slideCues.every(cue => cue.source !== 'comment');
    const sequenceStaticCues = slide.fragmentCount === 0 &&
      slideCues.length > 0 &&
      slideCues.every(cue => cue.source !== 'comment');
    if (sequenceStaticCues) {
      for (const cue of slideCues) {
        steps.push({
          type: 'wait',
          durationMs: calculateDisplayTime(cue.text, cfg, measuredDurations.get(cue)),
          slideIndex: si,
          label: `Slide ${si + 1}: "${truncate(cue.text, 40)}"`,
          narrationCues: [{ cueIndex: cues.indexOf(cue) + 1, offsetMs: 0 }],
        });
      }
    } else if (!sequenceCuesAfterReveals) {
      const slideCue = findCue(cues, si, undefined);
      const slideWait = calculateDisplayTime(
        slideCue?.text,
        cfg,
        slideCue ? measuredDurations.get(slideCue) : undefined,
      );
      steps.push({
        type: 'wait',
        durationMs: slideWait,
        slideIndex: si,
        label: slideCue
          ? `Slide ${si + 1}: "${truncate(slideCue.text, 40)}"`
          : `Slide ${si + 1}: display`,
        ...(slideCue ? {
          narrationCues: [{ cueIndex: cues.indexOf(slideCue) + 1, offsetMs: 0 }],
        } : {}),
      });
    }

    // Track ordinal of notable events on this slide (fragment reveals and
    // action result events), matching the same ordinal scheme used by
    // segmentBuilder so that voice[N] cues time both correctly.
    let notableOrdinal = 0;

    if (slide.fragmentCount > 0) {
      // Slide has fragments — advance through them one at a time.
      // Use the rendered HTML to determine each interactive element's exact
      // data-fragment index so that trigger-action steps fire only after the
      // element's containing fragment is revealed, not based on array position.
      const allElements = [...slide.interactiveElements].sort(
        (a, b) => a.position.line - b.position.line,
      );

      // Map action.id → data-fragment index as assigned by processFragments.
      // Elements with data-no-fragment (fragment: false) are absent from the map
      // and will be triggered at slide-entry level (already visible on load).
      const fragMap = layout
        ? new Map(Object.entries(layout.actionFragments))
        : extractElementFragmentMap(slide.html);

      // Elements not enclosed in any fragment → fire after slide-level wait
      const entryElements = allElements.filter(el => !fragMap.has(el.action.id));
      for (const el of entryElements) {
        notableOrdinal++;
        const actionCue = sequenceCuesAfterReveals
          ? undefined
          : findCue(cues, si, notableOrdinal);
        addActionSteps(
          steps,
          el,
          si,
          undefined,
          cfg,
          actionCue?.text,
          actionCue ? measuredDurations.get(actionCue) : undefined,
          actionCue ? cues.indexOf(actionCue) + 1 : undefined,
        );
      }

      for (let fi = 1; fi <= slide.fragmentCount; fi++) {
        // Advance (reveals next fragment) — counts as a notable event
        notableOrdinal++;
        steps.push({
          type: 'advance',
          durationMs: 0,
          slideIndex: si,
          fragmentIndex: fi,
          label: `Reveal fragment ${fi} on slide ${si + 1}`,
        });

        // Fragment cue wait — looked up by ordinal, not by fi
        const fragCue = sequenceCuesAfterReveals
          ? slideCues.length > 1 ? slideCues[fi - 1] : undefined
          : findCue(cues, si, notableOrdinal);
        const fragWait = calculateDisplayTime(
          fragCue?.text,
          cfg,
          fragCue ? measuredDurations.get(fragCue) : undefined,
        );
        if (fragCue || !sequenceCuesAfterReveals) {
          steps.push({
            type: 'wait',
            durationMs: fragWait,
            slideIndex: si,
            fragmentIndex: fi,
            label: fragCue
              ? `Fragment ${fi}: "${truncate(fragCue.text, 40)}"`
              : `Fragment ${fi}: display`,
            ...(fragCue ? {
              narrationCues: [{ cueIndex: cues.indexOf(fragCue) + 1, offsetMs: 0 }],
            } : {}),
          });
        }

        // Fire all elements whose button is inside this specific fragment
        const fragElements = allElements.filter(el => fragMap.get(el.action.id) === fi);
        for (const el of fragElements) {
          notableOrdinal++;
          const actionCue = sequenceCuesAfterReveals
            ? undefined
            : findCue(cues, si, notableOrdinal);
          addActionSteps(
            steps,
            el,
            si,
            fi,
            cfg,
            actionCue?.text,
            actionCue ? measuredDurations.get(actionCue) : undefined,
            actionCue ? cues.indexOf(actionCue) + 1 : undefined,
          );
        }
      }

      if (sequenceCuesAfterReveals) {
        const trailingCues = slideCues.length === 1
          ? slideCues
          : slideCues.slice(slide.fragmentCount);
        for (const cue of trailingCues) {
          steps.push({
            type: 'wait',
            durationMs: calculateDisplayTime(cue.text, cfg, measuredDurations.get(cue)),
            slideIndex: si,
            fragmentIndex: slide.fragmentCount,
            label: `Slide ${si + 1}: "${truncate(cue.text, 40)}"`,
            narrationCues: [{ cueIndex: cues.indexOf(cue) + 1, offsetMs: 0 }],
          });
        }
      }
    } else {
      // No fragments — trigger all interactive elements on slide load
      for (const el of slide.interactiveElements) {
        notableOrdinal++;
        const actionCue = sequenceStaticCues ? undefined : findCue(cues, si, notableOrdinal);
        addActionSteps(
          steps,
          el,
          si,
          undefined,
          cfg,
          actionCue?.text,
          actionCue ? measuredDurations.get(actionCue) : undefined,
          actionCue ? cues.indexOf(actionCue) + 1 : undefined,
        );
      }
    }
  }

  // Final wait
  steps.push({
    type: 'wait',
    durationMs: cfg.finalDelayMs,
    slideIndex: slides.length - 1,
    label: 'Final delay',
  });

  let timelineStartMs = 0;
  for (const step of steps) {
    step.timelineStartMs = timelineStartMs;
    timelineStartMs += step.durationMs;
  }
  return steps;
}

/**
 * Extract a map of Action.id → data-fragment index from the slide's
 * rendered HTML.  The HTML produced by the parser has each interactive
 * button's wrapping <p> annotated with data-fragment="N" by processFragments.
 * We scan for data-action-id occurrences and look backwards to find the
 * nearest data-fragment attribute — that attribute belongs to the element's
 * enclosing fragment container.
 *
 * Keys are Action.id values (from data-action-id attribute), not
 * InteractiveElement.id values — callers must use el.action.id for lookups.
 *
 * Elements that are not inside any fragment (data-no-fragment or not wrapped
 * by a fragment element) will be absent from the returned map.
 */
function extractElementFragmentMap(html: string): Map<string, number> {
  const map = new Map<string, number>();
  const actionIdRegex = /data-action-id="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = actionIdRegex.exec(html)) !== null) {
    const actionId = match[1];
    const before = html.slice(0, match.index);
    // Find the last data-fragment="N" that appears before this data-action-id
    const lastFragPos = before.lastIndexOf('data-fragment="');
    if (lastFragPos !== -1) {
      const fragStr = before.slice(lastFragPos + 'data-fragment="'.length);
      const fragNumEnd = fragStr.indexOf('"');
      if (fragNumEnd !== -1) {
        const fragNum = parseInt(fragStr.slice(0, fragNumEnd), 10);
        if (!isNaN(fragNum)) {
          map.set(actionId, fragNum);
        }
      }
    }
  }
  return map;
}

/**
 * Add action trigger + follow-up steps (refocus / close-panel) for one element.
 */
function addActionSteps(
  steps: AutoPilotStep[],
  el: { action: { id: string; type: string; params?: Record<string, unknown> }; label: string },
  slideIndex: number,
  fragmentIndex: number | undefined,
  cfg: AutoPilotConfig,
  cueText?: string,
  measuredDurationMs?: number,
  cueIndex?: number,
): void {
  const editorDemo = el.action.params?.autoRecord as { viewMs?: number; returnToDeck?: boolean } | undefined;
  const restoreEditors = editorDemo?.returnToDeck === true;
  steps.push({
    type: 'trigger-action',
    durationMs: 0,
    slideIndex,
    fragmentIndex,
    actionId: el.action.id,
    ...(restoreEditors ? { restoreEditors: true } : {}),
    label: `Execute action: ${el.label}`,
  });

  // Wait at least as long as it takes to read the voice cue.
  // For actions that open a panel or file, also respect fileViewMs.
  const cueMs = calculateDisplayTime(cueText, cfg, measuredDurationMs);
  const viewMs = Math.max(cfg.fileViewMs, cueMs);
  const narrationCues = cueIndex !== undefined
    ? [{ cueIndex, offsetMs: 0 }]
    : undefined;

  if (restoreEditors) {
    const requestedMs = typeof editorDemo?.viewMs === 'number' && Number.isFinite(editorDemo.viewMs) && editorDemo.viewMs >= 0
      ? editorDemo.viewMs : cfg.fileViewMs;
    steps.push({
      type: 'restore-editors',
      durationMs: Math.max(requestedMs, cueMs),
      slideIndex,
      label: `View demo (${el.label}) then return to deck`,
      narrationCues,
    });
  } else if (el.action.type === 'terminal.run') {
    // Let the terminal command execute and output be visible
    steps.push({
      type: 'wait',
      durationMs: viewMs,
      slideIndex,
      label: `View terminal output (${el.label})`,
      narrationCues,
    });
    steps.push({
      type: 'close-panel',
      durationMs: 0,
      slideIndex,
      label: 'Close terminal panel',
    });
  } else if (el.action.type === 'file.open' || el.action.type === 'editor.highlight') {
    steps.push({
      type: 'refocus',
      durationMs: viewMs,
      slideIndex,
      label: `View file (${el.label}) then return to deck`,
      narrationCues,
    });
  } else {
    // debug.start, vscode.command, sequence, etc. — no panel to view,
    // but still wait for the voice cue to finish before advancing.
    steps.push({
      type: 'wait',
      durationMs: cueMs,
      slideIndex,
      label: `Post-action pause (${el.label})`,
      narrationCues,
    });
  }
}

/**
 * Calculate display time for a text based on word count and WPM.
 */
export function calculateDisplayTime(
  text: string | undefined,
  config: AutoPilotConfig = DEFAULT_CONFIG,
  measuredDurationMs?: number,
): number {
  if (measuredDurationMs !== undefined) {
    return measuredDurationMs + Math.max(0, config.narrationGapMs);
  }
  if (!text || text.trim().length === 0) {
    return config.minDisplayMs;
  }
  const words = text.trim().split(/\s+/).length;
  const readingMs = (words / config.wordsPerMinute) * 60 * 1000;
  return Math.max(readingMs, config.minDisplayMs);
}

function buildMeasuredDurationMap(
  cues: VoiceOverCue[],
  narrationTimings: readonly NarrationTiming[],
): Map<VoiceOverCue, number> {
  const measuredDurations = new Map<VoiceOverCue, number>();
  for (const timing of narrationTimings) {
    const cue = cues[timing.cueIndex - 1];
    if (!cue || normalizeCueText(cue.text) !== normalizeCueText(timing.text)) {
      continue;
    }
    if (!Number.isFinite(timing.durationMs) || timing.durationMs <= 0) {
      continue;
    }
    measuredDurations.set(cue, Math.round(timing.durationMs));
  }
  return measuredDurations;
}

function normalizeCueText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

function buildVideoNarrationSchedule(
  cues: VoiceOverCue[],
  measuredDurations: ReadonlyMap<VoiceOverCue, number>,
  narrationGapMs: number,
): Array<{ cue: VoiceOverCue; offsetMs: number; durationMs: number }> {
  const schedule: Array<{ cue: VoiceOverCue; offsetMs: number; durationMs: number }> = [];
  let latestEndMs = 0;
  for (const cue of cues) {
    const durationMs = measuredDurations.get(cue);
    if (durationMs === undefined) {
      continue;
    }
    const startMs = cue.offsetMs ?? latestEndMs;
    schedule.push({ cue, offsetMs: startMs, durationMs });
    latestEndMs = Math.max(
      latestEndMs,
      startMs + durationMs + Math.max(0, narrationGapMs),
    );
  }
  return schedule;
}

/**
 * Find a cue for a specific slide and optional fragment.
 */
function findCue(
  cues: VoiceOverCue[],
  slideIndex: number,
  fragmentIndex: number | undefined,
): VoiceOverCue | undefined {
  if (fragmentIndex !== undefined) {
    return cues.find(c => c.slideIndex === slideIndex && c.fragmentIndex === fragmentIndex);
  }
  return cues.find(c => c.slideIndex === slideIndex && c.fragmentIndex === undefined);
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
}
