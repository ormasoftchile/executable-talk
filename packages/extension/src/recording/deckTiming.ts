import * as path from 'path';
import type { Deck } from '@deckpilot/core/models/deck';
import { loadAvailableNarrationTimings } from '../dubbing/narrationProject';
import { parseCues } from './cueParser';
import { resolveRecordingOutputLayout } from './outputLayout';
import { buildTimingSummary, parseMaxDuration, type TimingSummary } from './durationBudget';

export async function loadDeckTiming(deck: Deck, recorderOutputDir = ''): Promise<{ timing: TimingSummary; watchPaths: string[] }> {
  const { narrationDirectory } = resolveRecordingOutputLayout({ deckPath: deck.filePath, sessionId: 'timing', startedAt: 0,
    exportOutputDir: deck.metadata.export?.outputDir, recorderOutputDir });
  const projectPath = path.join(narrationDirectory, 'narration-project.json');
  const maxDurationMs = parseMaxDuration(deck.metadata.recording?.maxDuration);
  const timings = await loadAvailableNarrationTimings(projectPath, parseCues(deck.slides));
  return {
    timing: buildTimingSummary(deck.slides, deck.metadata.autoRecord, timings, maxDurationMs),
    watchPaths: [projectPath, path.join(narrationDirectory, 'takes', '*.wav'), path.join(narrationDirectory, 'processed', '*.wav')],
  };
}