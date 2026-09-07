/**
 * RecorderOrchestrator — manages an external screen recorder process.
 *
 * Launches a configured shell command when recording starts and stops it
 * when recording ends. Failure to start/stop the recorder does NOT block
 * the recording session — timeline logging continues regardless.
 *
 * The start command supports template variables:
 *   {{outputPath}} — resolved absolute path for the video output file
 *   {{sessionId}}  — unique session identifier
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import * as fs from 'fs';
import { RecorderMetadata } from '@deckpilot/core/models/recording';
import {
  buildWindowsBoundsScript,
  parseWindowsBounds,
  resolveWindowPlaceholders,
  WindowBounds,
} from './windowsCaptureBounds';

export interface RecorderConfig {
  startCommand: string;
  stopCommand: string;
  outputDir: string;
  outputExtension: string;
  /** avfoundation / directshow screen device identifier, e.g. "0:none" or "1" */
  screenDevice: string;
  windowScope: RecordingWindowScope;
}

export type RecordingWindowScope = 'focused' | 'screen';

const WINDOWS_DEFAULT_START_COMMAND = 'ffmpeg -hide_banner -loglevel error -y -f gdigrab -draw_mouse 0 ' +
  '-framerate 30 -i desktop -vf "crop=trunc(iw/2)*2:trunc(ih/2)*2" ' +
  '-c:v libx264 -preset ultrafast -pix_fmt yuv420p "{{outputPath}}"';
const RECORDER_OUTPUT_READY_TIMEOUT_MS = 10_000;
const RECORDER_OUTPUT_POLL_MS = 50;

export interface RecorderWindowTarget {
  windowsHandle?: string;
}

export async function waitForRecorderOutput(
  outputPath: string,
  timeoutMs = RECORDER_OUTPUT_READY_TIMEOUT_MS,
  pollMs = RECORDER_OUTPUT_POLL_MS,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    try {
      const output = await fs.promises.stat(outputPath);
      if (output.isFile() && output.size > 0) {
        return true;
      }
    } catch {
      // The recorder may not have created its output yet.
    }
    await new Promise<void>(resolve => setTimeout(resolve, pollMs));
  }
  return false;
}

export function applyWindowScopeToCommand(
  template: string,
  platform: NodeJS.Platform,
  windowScope: RecordingWindowScope,
): string {
  if (platform !== 'win32' || windowScope !== 'focused') {
    return template;
  }
  if (!/(?:^|\s)-f\s+gdigrab(?:\s|$)/i.test(template)) {
    return template;
  }
  if (/(?:^|\s)-(?:offset_x|offset_y|video_size)(?:\s|$)/i.test(template)) {
    return template;
  }

  return template.replace(
    /-i\s+(?:"desktop"|'desktop'|desktop)/i,
    match => '-offset_x {{windowX}} -offset_y {{windowY}} ' +
      `-video_size {{windowWidth}}x{{windowHeight}} ${match}`,
  );
}

export async function captureActiveRecordingWindow(): Promise<RecorderWindowTarget | undefined> {
  if (process.platform !== 'win32') {
    return undefined;
  }

  const script = [
    'Add-Type @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public class ActiveWindow {',
    '  [DllImport("user32.dll")]',
    '  public static extern IntPtr GetForegroundWindow();',
    '}',
    '"@',
    '$windowHandle = [ActiveWindow]::GetForegroundWindow()',
    'if ($windowHandle -eq [IntPtr]::Zero) { exit 1 }',
    'Write-Output $windowHandle.ToInt64()',
  ].join('\n');
  const encodedScript = Buffer.from(script, 'utf16le').toString('base64');

  return new Promise(resolve => {
    cp.execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedScript],
      { timeout: 5000, windowsHide: true },
      (error, stdout) => {
        const windowHandle = stdout.trim();
        resolve(!error && /^\d+$/.test(windowHandle) && windowHandle !== '0'
          ? { windowsHandle: windowHandle }
          : undefined);
      },
    );
  });
}

/**
 * Read recorder configuration from VS Code settings.
 */
export function getRecorderConfig(): RecorderConfig {
  const config = vscode.workspace.getConfiguration('deckPilot.recording');
  // Legacy fallback: read executableTalk.recording.* if deckPilot.recording.* are not set
  const legacy = vscode.workspace.getConfiguration('executableTalk.recording');
  function get<T>(key: string, def: T): T {
    const v = config.get<T>(key);
    if (v !== undefined && v !== '') { return v; }
    const lv = legacy.get<T>(key);
    if (lv !== undefined && lv !== '') { return lv; }
    return def;
  }
  return {
    startCommand: get('startCommand', process.platform === 'win32' ? WINDOWS_DEFAULT_START_COMMAND : ''),
    stopCommand: get('stopCommand', ''),
    outputDir: get('outputDir', ''),
    outputExtension: get('outputExtension', 'mp4'),
    screenDevice: get('screenDevice', process.platform === 'darwin' ? '1:none' : '0:none'),
    windowScope: get<RecordingWindowScope>('windowScope', 'focused'),
  };
}

/**
 * Orchestrates the lifecycle of an external screen recorder process.
 */
export class RecorderOrchestrator {
  private process: cp.ChildProcess | undefined;
  private outputPath: string | undefined;
  private resolvedStartCmd: string | undefined;
  private resolvedStopCmd: string | undefined;
  private started = false;
  private stopped = false;
  private outputReady = false;
  private error: string | undefined;

  constructor(
    private config: RecorderConfig,
    private outputChannel: vscode.OutputChannel,
  ) {}

  /**
   * Whether a recorder is configured (start command is non-empty).
   */
  isConfigured(): boolean {
    return this.config.startCommand.trim().length > 0;
  }

  /**
   * Launch the external recorder.
   * Returns true if the process spawned successfully, false otherwise.
   * Never throws — failures are captured in metadata.
   */
  async start(
    sessionId: string,
    deckPath: string,
    windowTarget?: RecorderWindowTarget,
  ): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      // Resolve output path — always absolute
      const rawDir = this.config.outputDir.trim() || path.dirname(deckPath);
      const dir = path.isAbsolute(rawDir) ? rawDir : path.resolve(path.dirname(deckPath), rawDir);
      const filename = `session-${sessionId}.${this.config.outputExtension}`;
      this.outputPath = path.join(dir, filename);

      // Ensure output directory exists
      await fs.promises.mkdir(dir, { recursive: true });

      // Interpolate template variables (may resolve window bounds)
      const scopedStartCommand = applyWindowScopeToCommand(
        this.config.startCommand,
        process.platform,
        this.config.windowScope,
      );
      const expectsOutputFile = scopedStartCommand.includes('{{outputPath}}');
      if (scopedStartCommand !== this.config.startCommand) {
        this.outputChannel.appendLine('[Recorder] Applied focused-window capture to gdigrab command');
      }
      this.resolvedStartCmd = await this.interpolate(
        scopedStartCommand,
        sessionId,
        this.outputPath,
        windowTarget,
      );

      this.outputChannel.appendLine(
        `[Recorder] Starting: ${this.resolvedStartCmd}`,
      );
      this.outputChannel.appendLine(
        `[Recorder] Output path: ${this.outputPath}`,
      );

      this.outputChannel.appendLine(
        `[Recorder] Spawning: ${this.resolvedStartCmd}`,
      );

      // Spawn via shell so the process runs in the user's shell context.
      // On macOS this ensures TCC screen-recording permission is evaluated
      // against the shell (which inherits the user session) rather than
      // Code Helper (Plugin) directly.  The shell execs into ffmpeg, so
      // stdin still reaches the recorder process for graceful quit.
      this.process = cp.spawn(this.resolvedStartCmd, [], {
        shell: true,
        detached: false,
        stdio: ['pipe', 'ignore', 'pipe'],
      });

      // Log stderr to output channel for diagnostics and capture last message
      let lastStderr = '';
      if (this.process.stderr) {
        this.process.stderr.on('data', (data: Buffer) => {
          const msg = data.toString().trim();
          if (msg.length > 0) {
            lastStderr = msg;
            this.outputChannel.appendLine(`[Recorder] ${msg}`);
          }
        });
      }

      this.process.on('close', (code: number | null) => {
        if (code !== 0 && code !== null && !this.stopped) {
          this.error = `Recorder process exited prematurely with code ${code}${lastStderr ? `: ${lastStderr}` : ''}`;
        }
      });

      // Handle spawn errors
      const spawned = await new Promise<boolean>((resolve) => {
        const proc = this.process!;

        const onError = (err: Error) => {
          this.error = `Recorder failed to start: ${err.message}`;
          this.outputChannel.appendLine(`[Recorder] Error: ${this.error}`);
          cleanup();
          resolve(false);
        };

        const onSpawn = () => {
          this.started = true;
          this.outputChannel.appendLine('[Recorder] Process started');
          cleanup();
          resolve(true);
        };

        const onClose = (code: number | null) => {
          // If it closed before we resolved, it failed to stay running
          if (!this.started) {
            this.error = `Recorder exited immediately with code ${code}`;
            this.outputChannel.appendLine(`[Recorder] ${this.error}`);
            cleanup();
            resolve(false);
          }
        };

        const cleanup = () => {
          proc.removeListener('error', onError);
          proc.removeListener('spawn', onSpawn);
          proc.removeListener('close', onClose);
        };

        proc.once('error', onError);
        proc.once('spawn', onSpawn);
        proc.once('close', onClose);
      });
      if (!spawned || !expectsOutputFile) {
        return spawned;
      }

      this.outputChannel.appendLine('[Recorder] Waiting for output media');
      const outputReady = await waitForRecorderOutput(this.outputPath);
      if (!outputReady) {
        this.error = `Recorder output was not ready after ${RECORDER_OUTPUT_READY_TIMEOUT_MS}ms`;
        this.outputChannel.appendLine(`[Recorder] Error: ${this.error}`);
        return false;
      }
      this.outputReady = true;
      this.outputChannel.appendLine('[Recorder] Output media ready');
      return true;
    } catch (err) {
      this.error = `Recorder start failed: ${err instanceof Error ? err.message : String(err)}`;
      this.outputChannel.appendLine(`[Recorder] ${this.error}`);
      return false;
    }
  }

  /**
   * Stop the external recorder.
   * First tries writing 'q' to stdin for a graceful shutdown (ffmpeg).
   * Then waits for the process to exit. If it doesn't exit within a
   * timeout, falls back to the configured stop command or kills it.
   */
  async stop(sessionId: string): Promise<void> {
    if (!this.started) {
      return;
    }

    try {
      // Try graceful shutdown via stdin ('q' is ffmpeg's quit key)
      if (this.process && this.process.stdin && !this.process.killed) {
        this.outputChannel.appendLine('[Recorder] Sending quit signal to stdin');
        this.process.stdin.write('q');
        this.process.stdin.end();

        // Wait for process to exit gracefully (up to 5 seconds)
        const exited = await this.waitForExit(5000);
        if (exited) {
          this.stopped = true;
          this.outputChannel.appendLine('[Recorder] Stopped gracefully');
          return;
        }
        this.outputChannel.appendLine('[Recorder] Graceful stop timed out, using fallback');
      }

      // Fallback: run stop command
      if (this.config.stopCommand.trim().length > 0) {
        this.resolvedStopCmd = await this.interpolate(
          this.config.stopCommand,
          sessionId,
          this.outputPath ?? '',
        );

        this.outputChannel.appendLine(
          `[Recorder] Stopping: ${this.resolvedStopCmd}`,
        );

        await new Promise<void>((resolve) => {
          cp.exec(this.resolvedStopCmd!, (err) => {
            if (err) {
              this.error = `Recorder stop command failed: ${err.message}`;
              this.outputChannel.appendLine(`[Recorder] ${this.error}`);
            }
            this.stopped = true;
            resolve();
          });
        });
      } else if (this.process && !this.process.killed) {
        this.outputChannel.appendLine('[Recorder] Killing process');
        this.process.kill();
        this.stopped = true;
      }
    } catch (err) {
      this.error = `Recorder stop failed: ${err instanceof Error ? err.message : String(err)}`;
      this.outputChannel.appendLine(`[Recorder] ${this.error}`);
    }

    this.outputChannel.appendLine('[Recorder] Stopped');
  }

  /**
   * Wait for the spawned process to exit within a timeout.
   * Returns true if the process exited, false if timed out.
   */
  private waitForExit(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.process || this.process.killed) {
        resolve(true);
        return;
      }

      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      }, timeoutMs);

      this.process.once('close', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(true);
        }
      });
    });
  }

  /**
   * Build metadata about the recorder session for inclusion in
   * recording-session.json.
   */
  getMetadata(): RecorderMetadata {
    return {
      configured: this.isConfigured(),
      started: this.started,
      stopped: this.stopped,
      outputPath: this.outputPath,
      startCommand: this.resolvedStartCmd,
      stopCommand: this.resolvedStopCmd,
      error: this.error,
    };
  }

  hasConfirmedOutputReady(): boolean {
    return this.outputReady;
  }

  /**
   * Dispose of the recorder process if still running.
   */
  dispose(): void {
    if (this.process && !this.process.killed) {
      this.process.kill();
    }
  }

  // ---------- private ----------

  private async interpolate(
    template: string,
    sessionId: string,
    outputPath: string,
    windowTarget?: RecorderWindowTarget,
  ): Promise<string> {
    let result = template
      .replace(/\{\{outputPath\}\}/g, outputPath)
      .replace(/\{\{sessionId\}\}/g, sessionId)
      .replace(/\{\{screenDevice\}\}/g, this.config.screenDevice);

    // Resolve window bounds if any window template vars are present
    if (/\{\{window(X|Y|Width|Height)\}\}/.test(result)) {
      const bounds = await this.getWindowBounds(windowTarget);
      if (bounds) {
        result = resolveWindowPlaceholders(result, bounds);
        this.outputChannel.appendLine(
          `[Recorder] Physical window bounds: ${bounds.x},${bounds.y} ${bounds.width}x${bounds.height}`,
        );
      } else {
        result = resolveWindowPlaceholders(result, undefined);
      }
    }

    return result;
  }

  /**
   * Get the VS Code window bounds using platform-specific methods.
   */
  private async getWindowBounds(
    windowTarget?: RecorderWindowTarget,
  ): Promise<WindowBounds | undefined> {
    if (process.platform === 'win32') {
      return this.getWindowBoundsWindows(windowTarget?.windowsHandle);
    }
    if (process.platform === 'darwin') {
      return this.getWindowBoundsMac();
    }
    return undefined;
  }

  /**
   * Get the VS Code window bounds on macOS using osascript.
   */
  private getWindowBoundsMac(): Promise<WindowBounds | undefined> {
    return new Promise((resolve) => {
      const script = [
        'tell application "System Events"',
        '  tell process "Code"',
        '    set {px, py} to position of window 1',
        '    set {pw, ph} to size of window 1',
        '  end tell',
        'end tell',
        'return (px as string) & "," & (py as string) & "," & (pw as string) & "," & (ph as string)',
      ].join('\n');

      cp.exec(
        `osascript -e '${script.replace(/'/g, "'\"'\"'")}'`,
        { timeout: 5000 },
        (err, stdout) => {
          if (err) {
            this.outputChannel.appendLine(`[Recorder] macOS window bounds error: ${err.message}`);
            resolve(undefined);
            return;
          }
          const parts = stdout.trim().split(',').map(Number);
          if (parts.length === 4 && parts.every(n => !isNaN(n)) && parts[2] > 0 && parts[3] > 0) {
            resolve({ x: parts[0], y: parts[1], width: parts[2], height: parts[3] });
          } else {
            this.outputChannel.appendLine(`[Recorder] Unexpected macOS bounds output: ${stdout.trim()}`);
            resolve(undefined);
          }
        },
      );
    });
  }

  /**
   * Get the VS Code window bounds on Windows using a PowerShell script.
   * Uses the HWND captured when recording was invoked, before focus can move.
   */
  private getWindowBoundsWindows(
    windowHandle?: string,
  ): Promise<WindowBounds | undefined> {
    return new Promise((resolve) => {
      const script = buildWindowsBoundsScript(windowHandle);
      const encodedScript = Buffer.from(script, 'utf16le').toString('base64');

      cp.execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedScript],
        { timeout: 5000, windowsHide: true },
        (err, stdout) => {
          if (err) {
            this.outputChannel.appendLine(`[Recorder] Window bounds error: ${err.message}`);
            resolve(undefined);
            return;
          }

          const bounds = parseWindowsBounds(stdout);
          if (bounds) {
            resolve(bounds);
          } else {
            this.outputChannel.appendLine(`[Recorder] Unexpected bounds output: ${stdout.trim()}`);
            resolve(undefined);
          }
        },
      );
    });
  }
}

