import * as fs from 'fs';
import * as path from 'path';
import { VoiceOverCue } from '@deckpilot/core/models/recording';
import { parseDeck } from '@deckpilot/core/parser';
import type { NarrationTiming } from '../recording/autoPilot';
import { parseCues } from '../recording/cueParser';
import { resolveRecordingOutputLayout } from '../recording/outputLayout';

export interface NarrationProjectArtifacts {
  srtPath: string;
  projectPath: string;
  hadExistingProject: boolean;
}

export interface DeckNarrationSetup {
  deckPath: string;
  cues: VoiceOverCue[];
  narrationDirectory: string;
}

interface NarrationProjectEntry {
  index: number;
  text: string;
  raw_take_path?: string;
  processed_take_path?: string;
  processed_duration_ms?: number;
}

export async function loadDeckNarrationSetup(
  deckPath: string,
  content: string,
  recorderOutputDir = '',
): Promise<DeckNarrationSetup> {
  const result = await parseDeck(content, deckPath);
  if (result.error || !result.deck) {
    throw new Error(result.error || 'Failed to parse presentation.');
  }

  const cues = parseCues(result.deck.slides);
  if (cues.length === 0) {
    throw new Error('This deck has no narration cues to record.');
  }
  const layout = resolveRecordingOutputLayout({
    deckPath: result.deck.filePath,
    sessionId: 'narration',
    startedAt: 0,
    exportOutputDir: result.deck.metadata.export?.outputDir,
    recorderOutputDir,
  });
  return {
    deckPath: result.deck.filePath,
    cues,
    narrationDirectory: layout.narrationDirectory,
  };
}

export async function createNarrationProject(
  cues: readonly VoiceOverCue[],
  outputDirectory: string,
): Promise<NarrationProjectArtifacts> {
  if (cues.length === 0) {
    throw new Error('This deck has no narration cues to record.');
  }

  await fs.promises.mkdir(outputDirectory, { recursive: true });
  const srtPath = path.join(outputDirectory, 'narration.srt');
  const projectPath = path.join(outputDirectory, 'narration-project.json');
  const hadExistingProject = await fs.promises.access(projectPath)
    .then(() => true)
    .catch(() => false);
  await fs.promises.writeFile(srtPath, createCueScaffold(cues), 'utf8');
  return { srtPath, projectPath, hadExistingProject };
}

export async function seedNarrationProject(
  narrationDirectory: string,
  sourceSrtPath: string,
): Promise<boolean> {
  const targetProjectPath = path.join(narrationDirectory, 'narration-project.json');
  const sourceProjectPath = path.join(
    path.dirname(sourceSrtPath),
    `${path.basename(sourceSrtPath, path.extname(sourceSrtPath))}-project.json`,
  );
  const targetExists = await fs.promises.access(targetProjectPath)
    .then(() => true)
    .catch(() => false);
  if (targetExists) return false;

  try {
    await fs.promises.access(sourceProjectPath);
  } catch {
    return false;
  }
  await fs.promises.mkdir(narrationDirectory, { recursive: true });
  await fs.promises.copyFile(sourceProjectPath, targetProjectPath);
  return true;
}

export async function stageNarrationProjectForSession(
  project: NarrationProjectArtifacts,
  sessionDirectory: string,
  srtContent: string,
  projectName = 'narration',
): Promise<NarrationProjectArtifacts> {
  await fs.promises.mkdir(sessionDirectory, { recursive: true });
  const srtPath = path.join(sessionDirectory, `${projectName}.srt`);
  const projectPath = path.join(sessionDirectory, `${projectName}-project.json`);
  await Promise.all([
    fs.promises.writeFile(srtPath, srtContent, 'utf8'),
    fs.promises.copyFile(project.projectPath, projectPath),
  ]);
  return { srtPath, projectPath, hadExistingProject: true };
}

export async function loadAvailableNarrationTimings(
  projectPath: string, cues: readonly VoiceOverCue[],
): Promise<NarrationTiming[]> {
  let entries: NarrationProjectEntry[];
  try {
    const parsed: unknown = JSON.parse(await fs.promises.readFile(projectPath, 'utf8'));
    if (!Array.isArray(parsed)) return [];
    entries = parsed.filter((entry: unknown): entry is NarrationProjectEntry => {
      if (!entry || typeof entry !== 'object') return false;
      const item = entry as NarrationProjectEntry;
      return typeof item.text === 'string' && typeof item.processed_take_path === 'string' &&
        typeof item.processed_duration_ms === 'number' && Number.isFinite(item.processed_duration_ms) && item.processed_duration_ms > 0;
    });
  } catch {
    return [];
  }
  const consumed = new Set<NarrationProjectEntry>();
  const timings: NarrationTiming[] = [];
  for (const [index, cue] of cues.entries()) {
    const entry = entries.find(item => !consumed.has(item) && normalizeText(item.text) === normalizeText(cue.text));
    if (!entry) continue;
    consumed.add(entry);
    const takePath = path.resolve(path.dirname(projectPath), entry.processed_take_path!);
    if (entries.some(item => item !== entry && path.resolve(path.dirname(projectPath), item.processed_take_path!).toLowerCase() === takePath.toLowerCase())) continue;
    try {
      const take = await fs.promises.stat(takePath);
      if (!take.isFile() || take.size === 0) continue;
      if (typeof entry.raw_take_path === 'string' && entry.raw_take_path) {
        const raw = await fs.promises.stat(path.resolve(path.dirname(projectPath), entry.raw_take_path)).catch(() => undefined);
        if (raw && raw.mtimeMs > take.mtimeMs) continue;
      }
      timings.push({ cueIndex: index + 1, text: cue.text, durationMs: entry.processed_duration_ms! });
    } catch {
      continue;
    }
  }
  return timings;
}

export async function loadNarrationTimings(
  project: NarrationProjectArtifacts,
  cues: readonly VoiceOverCue[],
): Promise<NarrationTiming[]> {
  let entries: NarrationProjectEntry[];
  try {
    const content = await fs.promises.readFile(project.projectPath, 'utf8');
    const parsed: unknown = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      throw new Error('project metadata is not an array');
    }
    entries = parsed as NarrationProjectEntry[];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read the narration project: ${message}`);
  }

  const entriesByIndex = new Map(entries.map(entry => [entry.index, entry]));
  const timings: NarrationTiming[] = [];
  for (let cueOffset = 0; cueOffset < cues.length; cueOffset++) {
    const cueIndex = cueOffset + 1;
    const cue = cues[cueOffset];
    const entry = entriesByIndex.get(cueIndex);
    if (!entry || normalizeText(entry.text) !== normalizeText(cue.text)) {
      throw new Error(`Narration cue ${cueIndex} does not match the current deck.`);
    }
    if (!Number.isFinite(entry.processed_duration_ms) || entry.processed_duration_ms! <= 0) {
      throw new Error(`Narration cue ${cueIndex} has not been processed.`);
    }
    if (!entry.processed_take_path) {
      throw new Error(`Narration cue ${cueIndex} has no processed take.`);
    }

    const takePath = path.isAbsolute(entry.processed_take_path)
      ? entry.processed_take_path
      : path.resolve(path.dirname(project.projectPath), entry.processed_take_path);
    try {
      const take = await fs.promises.stat(takePath);
      if (!take.isFile() || take.size === 0) {
        throw new Error('empty take');
      }
    } catch {
      throw new Error(`Narration cue ${cueIndex} processed take is missing.`);
    }

    timings.push({
      cueIndex,
      text: cue.text,
      durationMs: Math.round(entry.processed_duration_ms!),
    });
  }
  return timings;
}

function createCueScaffold(cues: readonly VoiceOverCue[]): string {
  const lines: string[] = [];
  let startMs = 0;
  for (let cueOffset = 0; cueOffset < cues.length; cueOffset++) {
    const cue = cues[cueOffset];
    const durationMs = estimateCueDuration(cue.text);
    const endMs = startMs + durationMs;
    lines.push(String(cueOffset + 1));
    lines.push(`${formatSrtTimestamp(startMs)} --> ${formatSrtTimestamp(endMs)}`);
    lines.push(formatCueText(cue.text));
    lines.push('');
    startMs = endMs;
  }
  return lines.join('\n');
}

function estimateCueDuration(text: string): number {
  const words = formatCueText(text).split(' ').filter(Boolean).length;
  return Math.max(2500, Math.round((words / 150) * 60 * 1000));
}

function formatSrtTimestamp(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const millis = milliseconds % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:` +
    `${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

function normalizeText(text: string): string {
  return formatCueText(text).toLowerCase();
}

function formatCueText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}
