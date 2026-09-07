import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { Slide } from '@deckpilot/core/models/slide';
import { parseCues } from './cueParser';
import { buildAutoPilotPlan, calculateDisplayTime, resolveAutoPilotConfig, type AutoPilotConfig, type AutoPilotSlideLayout, type NarrationTiming } from './autoPilot';

export interface TimingSummary {
  plannedMs: number;
  measuredNarrationMs: number;
  estimatedNarrationMs: number;
  overheadMs: number;
  measuredCues: number;
  estimatedCues: number;
  unknownRuntime: boolean;
  maxDurationMs?: number;
  overByMs: number;
  finalVerified: false;
}

export function parseMaxDuration(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  let milliseconds: number;
  if (typeof value === 'number') {
    milliseconds = value * 1000;
  } else {
    const match = typeof value === 'string' ? /^(\d+(?:\.\d+)?)(ms|s|m)$/.exec(value.trim()) : null;
    milliseconds = match ? Number(match[1]) * (match[2] === 'm' ? 60000 : match[2] === 's' ? 1000 : 1) : NaN;
  }
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    throw new Error('recording.maxDuration must be a positive duration, such as 120s or 2m.');
  }
  return milliseconds;
}

export function buildTimingSummary(
  slides: Slide[], config: Partial<AutoPilotConfig> = {}, timings: readonly NarrationTiming[] = [],
  maxDurationMs?: number, videoDurations: ReadonlyMap<number, number> = new Map(),
  layouts: readonly AutoPilotSlideLayout[] = [],
): TimingSummary {
  const settings = resolveAutoPilotConfig(config);
  const cues = parseCues(slides);
  const normalize = (text: string): string => text.trim().replace(/\s+/g, ' ').toLowerCase();
  const validTimings = timings.filter(timing => {
    const cue = cues[timing.cueIndex - 1];
    return cue && normalize(cue.text) === normalize(timing.text) && Number.isFinite(timing.durationMs) && timing.durationMs > 0;
  });
  let measuredNarrationMs = 0;
  let estimatedNarrationMs = 0;
  let measuredCues = 0;
  cues.forEach((cue, index) => {
    const measured = validTimings.find(timing => timing.cueIndex === index + 1);
    if (measured) {
      measuredNarrationMs += measured.durationMs;
      measuredCues++;
    } else {
      estimatedNarrationMs += calculateDisplayTime(cue.text, settings);
    }
  });
  const plan = buildAutoPilotPlan(slides, settings, validTimings, videoDurations, layouts);
  const plannedMs = plan.reduce((total, step) => total + step.durationMs +
    (step.type === 'trigger-action' ? 300 + settings.postActionMs : 0) +
    (step.type === 'refocus' ? 500 : 0) +
    (step.type === 'advance' ? step.fragmentIndex === undefined ? 300 : 400 : 0), 0);
  if (!Number.isFinite(plannedMs) || plannedMs < 0) throw new Error('Cannot estimate duration with invalid pacing settings.');
  return {
    plannedMs, measuredNarrationMs, estimatedNarrationMs,
    overheadMs: Math.max(0, plannedMs - measuredNarrationMs - estimatedNarrationMs),
    measuredCues, estimatedCues: cues.length - measuredCues,
    unknownRuntime: plan.some(step => step.type === 'trigger-action') || slides.some(slide => slide.video && !videoDurations.has(slide.index)),
    maxDurationMs, overByMs: maxDurationMs === undefined ? 0 : Math.max(0, plannedMs - maxDurationMs),
    finalVerified: false,
  };
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function seconds(value: unknown): number {
  return typeof value === 'string' && value.trim() !== '' || typeof value === 'number' ? Number(value) : NaN;
}

export function validateMediaDuration(probe: unknown, maxDurationMs: number): { durationMs: number; withinLimit: boolean } {
  if (!Number.isFinite(maxDurationMs) || maxDurationMs <= 0) throw new Error('Invalid maximum duration.');
  const data = object(probe);
  const container = seconds(object(data.format).duration);
  const streams = Array.isArray(data.streams) ? data.streams.map(object).filter(stream => stream.codec_type === 'video' || stream.codec_type === 'audio') : [];
  if (!Number.isFinite(container) || container <= 0 || !streams.some(stream => stream.codec_type === 'video')) {
    throw new Error('Cannot verify final video duration: missing container duration or video stream.');
  }
  let longest = container;
  for (const stream of streams) {
    const duration = seconds(stream.duration);
    const start = stream.start_time === undefined ? 0 : seconds(stream.start_time);
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(start)) {
      throw new Error('Cannot verify final video duration: an audio or video stream has unknown duration.');
    }
    longest = Math.max(longest, Math.max(0, start) + duration);
  }
  const durationMs = longest * 1000;
  return { durationMs, withinLimit: durationMs <= maxDurationMs };
}

export function formatBudgetTime(milliseconds: number): string {
  const total = Math.ceil(milliseconds / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function requirePlanWithinBudget(summary: TimingSummary): void {
  if (summary.overByMs > 0) {
    throw new Error(`Planned video duration ${formatBudgetTime(summary.plannedMs)} exceeds the ${formatBudgetTime(summary.maxDurationMs!)} limit. Shorten at least ${formatBudgetTime(summary.overByMs)} of narration or pauses, then record only changed takes.`);
  }
}

export async function verifyFinalVideoDuration(filePath: string, maxDurationMs: number): Promise<string> {
  const reportPath = path.join(path.dirname(filePath), 'duration-check.json');
  let result: { durationMs: number; withinLimit: boolean };
  try {
    const output = await new Promise<string>((resolve, reject) => {
      execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,duration,start_time', '-of', 'json', filePath],
        { windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
          if (error) reject(new Error('Cannot verify final video duration: ffprobe failed. Draft retained.'));
          else resolve(stdout);
        });
    });
    result = validateMediaDuration(JSON.parse(output) as unknown, maxDurationMs);
  } catch (error) {
    await fs.promises.writeFile(reportPath, JSON.stringify({ filePath, maxDurationMs, status: 'unverified', checkedAt: new Date().toISOString() }, null, 2) + '\n');
    throw error;
  }
  await fs.promises.writeFile(reportPath, JSON.stringify({ filePath, maxDurationMs, durationMs: result.durationMs,
    status: result.withinLimit ? 'within-limit' : 'over-limit', checkedAt: new Date().toISOString() }, null, 2) + '\n');
  if (!result.withinLimit) {
    throw new Error(`Final video exceeds the duration limit (${result.durationMs / 1000}s > ${maxDurationMs / 1000}s). Not ready to submit. Draft retained at ${filePath}. Shorten the presentation and Auto-Record again.`);
  }
  return reportPath;
}