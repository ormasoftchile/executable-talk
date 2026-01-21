/**
 * Command renderer - executes commands and captures output
 */

import * as vscode from 'vscode';
import { spawn, SpawnOptions } from 'child_process';
import * as path from 'path';
import { CommandRenderParams } from './renderDirectiveParser';
import { isTrusted } from '../utils/workspaceTrust';

/**
 * Result of rendering a command
 */
export interface CommandRenderResult {
  success: boolean;
  output?: string;
  exitCode?: number;
  error?: string;
  timedOut?: boolean;
  fromCache?: boolean;
}

/**
 * Callback for streaming output
 */
export type StreamCallback = (chunk: string, isError: boolean) => void;

/**
 * Cache entry for command results
 */
interface CacheEntry {
  result: CommandRenderResult;
  timestamp: number;
  cwd: string;
}

/**
 * Command result cache
 * Key: command string, Value: cached result with metadata
 */
const commandCache = new Map<string, CacheEntry>();

/**
 * Cache TTL in milliseconds (5 minutes by default)
 */
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Generate cache key from command and working directory
 */
function getCacheKey(cmd: string, cwd: string): string {
  return `${cwd}:${cmd}`;
}

/**
 * Get cached result if valid
 */
function getCachedResult(cmd: string, cwd: string): CommandRenderResult | undefined {
  const key = getCacheKey(cmd, cwd);
  const entry = commandCache.get(key);
  
  if (!entry) {
    return undefined;
  }
  
  // Check if cache is still valid
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    commandCache.delete(key);
    return undefined;
  }
  
  return { ...entry.result, fromCache: true };
}

/**
 * Store result in cache
 */
function cacheResult(cmd: string, cwd: string, result: CommandRenderResult): void {
  const key = getCacheKey(cmd, cwd);
  commandCache.set(key, {
    result,
    timestamp: Date.now(),
    cwd,
  });
}

/**
 * Clear command cache (useful for refresh actions)
 */
export function clearCommandCache(): void {
  commandCache.clear();
}

/**
 * Invalidate a specific command in cache
 */
export function invalidateCommand(cmd: string, cwd?: string): void {
  if (cwd) {
    const key = getCacheKey(cmd, cwd);
    commandCache.delete(key);
  } else {
    // Delete all entries matching this command
    for (const [key] of commandCache) {
      if (key.endsWith(`:${cmd}`)) {
        commandCache.delete(key);
      }
    }
  }
}

/**
 * Execute a command and return the output
 */
export async function renderCommand(
  params: CommandRenderParams,
  onStream?: StreamCallback
): Promise<CommandRenderResult> {
  // Check workspace trust
  if (!isTrusted()) {
    return {
      success: false,
      error: 'Command execution requires workspace trust',
    };
  }

  try {
    // Resolve working directory
    const cwd = resolveCwd(params.cwd);
    if (!cwd) {
      return {
        success: false,
        error: 'Could not resolve working directory',
      };
    }

    // Check cache first (only if caching is enabled and not streaming)
    if (params.cached !== false && !onStream) {
      const cached = getCachedResult(params.cmd, cwd);
      if (cached) {
        return cached;
      }
    }

    const timeout = params.timeout || 30000;
    const shell = params.shell || true;

    const result = await executeCommand(params.cmd, {
      cwd,
      shell,
      timeout,
      onStream,
    });

    // Cache successful results (only if caching is enabled)
    if (params.cached !== false && result.success) {
      cacheResult(params.cmd, cwd, result);
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Resolve working directory
 */
function resolveCwd(relativeCwd?: string): string | null {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return null;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  
  if (relativeCwd) {
    return path.resolve(workspaceRoot, relativeCwd);
  }
  
  return workspaceRoot;
}

interface ExecuteOptions {
  cwd: string;
  shell: boolean | string;
  timeout: number;
  onStream?: StreamCallback;
}

/**
 * Execute a command with streaming support
 */
function executeCommand(
  command: string,
  options: ExecuteOptions
): Promise<CommandRenderResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const spawnOptions: SpawnOptions = {
      cwd: options.cwd,
      shell: options.shell,
      env: { ...process.env },
    };

    // Parse command and args for spawn
    const child = spawn(command, [], spawnOptions);

    // Set timeout
    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, options.timeout);

    child.stdout?.on('data', (data: Buffer) => {
      const chunk = stripAnsi(data.toString());
      stdout += chunk;
      options.onStream?.(chunk, false);
    });

    child.stderr?.on('data', (data: Buffer) => {
      const chunk = stripAnsi(data.toString());
      stderr += chunk;
      options.onStream?.(chunk, true);
    });

    child.on('close', (code) => {
      clearTimeout(timeoutId);

      if (timedOut) {
        resolve({
          success: false,
          output: stdout + stderr,
          error: `Command timed out after ${options.timeout}ms`,
          timedOut: true,
        });
        return;
      }

      const success = code === 0;
      resolve({
        success,
        output: stdout || stderr,
        exitCode: code ?? undefined,
        error: success ? undefined : stderr || `Exit code: ${code}`,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timeoutId);
      resolve({
        success: false,
        error: err.message,
      });
    });
  });
}

/**
 * Strip ANSI escape codes from output
 */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}
