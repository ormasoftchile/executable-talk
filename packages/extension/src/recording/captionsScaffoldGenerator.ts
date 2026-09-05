/**
 * CaptionsScaffoldGenerator — produces a draft SRT caption file
 * from a recorded session's segments.
 *
 * The output is a scaffold: timing comes from the real session,
 * text comes from draft narration. The presenter can refine later
 * without recomputing timing.
 */

import * as fs from 'fs';
import * as path from 'path';
import { RecordingSession } from '@deckpilot/core/models/recording';
import type { NarrationTiming } from './autoPilot';
import { buildNarrationSegments } from './narrationSegments';

export class CaptionsScaffoldGenerator {
  generateNarrationSrt(session: RecordingSession, timings: readonly NarrationTiming[]): string {
    const lines: string[] = [];
    for (const [index, segment] of buildNarrationSegments(session, timings).entries()) {
      lines.push(String(timings[index].cueIndex));
      lines.push(`${formatSrtTimestamp(segment.startTimeMs)} --> ${formatSrtTimestamp(segment.endTimeMs)}`);
      lines.push(wrapText(segment.draftNarration, 42));
      lines.push('');
    }
    return lines.join('\n');
  }

  /**
   * Generate an SRT-formatted caption string from session segments.
   */
  generateSrt(session: RecordingSession): string {
    const lines: string[] = [];
    const segments = session.segments;
    let captionIndex = 0;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const text = seg.draftNarration || seg.cueText || '';
      const start = formatSrtTimestamp(seg.startTimeMs);
      const end = formatSrtTimestamp(seg.endTimeMs);

      if (text.length === 0) {
        continue;
      }

      captionIndex++;
      lines.push(String(captionIndex));
      lines.push(`${start} --> ${end}`);
      lines.push(wrapText(text, 42));
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Export a draft SRT file to disk.
   * If the session has a recorder output path, the SRT is named to match
   * the video file so VLC and other players auto-load it.
   * Returns the written file path.
   */
  async exportSrt(session: RecordingSession, outputDir: string): Promise<string> {
    await fs.promises.mkdir(outputDir, { recursive: true });

    let srtFilename = 'captions-draft.srt';
    const videoPath = session.composition?.outputPath ?? session.recorder?.outputPath;
    if (videoPath) {
      const videoBasename = path.basename(videoPath, path.extname(videoPath));
      srtFilename = `${videoBasename}.srt`;
    }

    const srtPath = path.join(outputDir, srtFilename);
    const content = this.generateSrt(session);
    await fs.promises.writeFile(srtPath, content, 'utf-8');
    return srtPath;
  }
}

/**
 * Format milliseconds as SRT timestamp: HH:MM:SS,mmm
 */
function formatSrtTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  return (
    String(hours).padStart(2, '0') + ':' +
    String(minutes).padStart(2, '0') + ':' +
    String(seconds).padStart(2, '0') + ',' +
    String(millis).padStart(3, '0')
  );
}

/**
 * Wrap text to a maximum line width for caption readability.
 */
function wrapText(text: string, maxWidth: number): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = currentLine.length > 0 ? currentLine + ' ' + word : word;
    }
  }
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines.join('\n');
}
