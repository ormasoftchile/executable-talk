/**
 * Diff renderer - generates diffs between file versions
 */

import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';
import { DiffRenderParams } from './renderDirectiveParser';

/**
 * Result of rendering a diff
 */
export interface DiffRenderResult {
  success: boolean;
  diff?: string;
  additions?: number;
  deletions?: number;
  error?: string;
}

/**
 * Render a diff based on parameters
 */
export async function renderDiff(params: DiffRenderParams): Promise<DiffRenderResult> {
  try {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      return {
        success: false,
        error: 'No workspace folder found',
      };
    }

    if (params.path) {
      // Git-based diff
      return await renderGitDiff(workspaceRoot, params);
    } else if (params.left && params.right) {
      // File-to-file diff
      return await renderFileDiff(workspaceRoot, params);
    } else {
      return {
        success: false,
        error: 'Either path or left+right parameters required',
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get workspace root
 */
function getWorkspaceRoot(): string | null {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return null;
  }
  return workspaceFolders[0].uri.fsPath;
}

/**
 * Render git diff for a file
 */
async function renderGitDiff(
  workspaceRoot: string,
  params: DiffRenderParams
): Promise<DiffRenderResult> {
  const filePath = params.path!;
  const before = params.before; // undefined means compare working tree to HEAD
  const after = params.after;   // undefined means working tree
  const context = params.context ?? 3;

  // Build git diff command
  const args = ['diff', `--unified=${context}`, '--no-color'];
  
  if (before && after) {
    // Compare two refs
    args.push(`${before}..${after}`, '--', filePath);
  } else if (before) {
    // Compare specific ref to working tree
    args.push(before, '--', filePath);
  } else {
    // No ref specified: show working tree changes (staged + unstaged vs HEAD)
    args.push('HEAD', '--', filePath);
  }

  const result = await runGitCommand(args, workspaceRoot);
  
  if (!result.success) {
    return result;
  }

  const { additions, deletions } = countChanges(result.diff || '');

  return {
    success: true,
    diff: result.diff,
    additions,
    deletions,
  };
}

/**
 * Render diff between two files
 */
async function renderFileDiff(
  workspaceRoot: string,
  params: DiffRenderParams
): Promise<DiffRenderResult> {
  const leftPath = path.resolve(workspaceRoot, params.left!);
  const rightPath = path.resolve(workspaceRoot, params.right!);
  const context = params.context ?? 3;

  // Use git diff for file comparison (works even outside git repos)
  const args = ['diff', '--no-index', `--unified=${context}`, '--no-color', leftPath, rightPath];

  const result = await runGitCommand(args, workspaceRoot);
  
  // git diff --no-index returns exit code 1 when files differ, which is expected
  if (!result.success && !result.diff) {
    return result;
  }

  const { additions, deletions } = countChanges(result.diff || '');

  return {
    success: true,
    diff: result.diff,
    additions,
    deletions,
  };
}

/**
 * Run a git command and capture output
 */
function runGitCommand(args: string[], cwd: string): Promise<DiffRenderResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';

    const child = spawn('git', args, { cwd });

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      // Exit code 1 for diff means files differ (not an error)
      if (code === 0 || code === 1) {
        resolve({
          success: true,
          diff: stdout,
        });
      } else {
        resolve({
          success: false,
          error: stderr || `Git command failed with exit code ${code}`,
        });
      }
    });

    child.on('error', (err) => {
      resolve({
        success: false,
        error: err.message,
      });
    });
  });
}

/**
 * Count additions and deletions in a diff
 */
function countChanges(diff: string): { additions: number; deletions: number } {
  const lines = diff.split('\n');
  let additions = 0;
  let deletions = 0;

  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
    }
  }

  return { additions, deletions };
}

/**
 * Parse a unified diff into structured format for rendering
 */
export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'context' | 'addition' | 'deletion' | 'header';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export function parseDiff(diffText: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const lines = diffText.split('\n');
  
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    // Skip file headers
    if (line.startsWith('diff ') || line.startsWith('index ') || 
        line.startsWith('---') || line.startsWith('+++')) {
      continue;
    }

    // Hunk header
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[2], 10);
      currentHunk = { header: line, lines: [] };
      hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith('+')) {
      currentHunk.lines.push({
        type: 'addition',
        content: line.substring(1),
        newLineNumber: newLine++,
      });
    } else if (line.startsWith('-')) {
      currentHunk.lines.push({
        type: 'deletion',
        content: line.substring(1),
        oldLineNumber: oldLine++,
      });
    } else if (line.startsWith(' ') || line === '') {
      currentHunk.lines.push({
        type: 'context',
        content: line.substring(1) || '',
        oldLineNumber: oldLine++,
        newLineNumber: newLine++,
      });
    }
  }

  return hunks;
}
