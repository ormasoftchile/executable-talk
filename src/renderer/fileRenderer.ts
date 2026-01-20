/**
 * File renderer - reads file content and extracts specified ranges
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { FileRenderParams } from './renderDirectiveParser';

/**
 * Result of rendering a file
 */
export interface FileRenderResult {
  success: boolean;
  content?: string;
  language?: string;
  filePath?: string;
  lineRange?: { start: number; end: number };
  error?: string;
}

/**
 * Render file content based on parameters
 */
export async function renderFile(params: FileRenderParams): Promise<FileRenderResult> {
  try {
    // Resolve file path relative to workspace
    const filePath = resolveFilePath(params.path);
    if (!filePath) {
      return {
        success: false,
        error: `Could not resolve file path: ${params.path}`,
      };
    }
    
    // Read file content
    const fileUri = vscode.Uri.file(filePath);
    let content: string;
    
    try {
      const fileData = await vscode.workspace.fs.readFile(fileUri);
      content = Buffer.from(fileData).toString('utf8');
    } catch {
      return {
        success: false,
        error: `File not found: ${params.path}`,
      };
    }
    
    // Extract range
    let extractedContent: string;
    let lineRange: { start: number; end: number } | undefined;
    
    if (params.lines) {
      const result = extractByLines(content, params.lines);
      extractedContent = result.content;
      lineRange = result.lineRange;
    } else if (params.startPattern || params.endPattern) {
      const result = extractByPattern(content, params.startPattern, params.endPattern);
      extractedContent = result.content;
      lineRange = result.lineRange;
    } else {
      // No range specified, use entire file
      extractedContent = content;
      const lineCount = content.split('\n').length;
      lineRange = { start: 1, end: lineCount };
    }
    
    // Detect language from file extension if not specified
    const language = params.lang || detectLanguage(params.path);
    
    return {
      success: true,
      content: extractedContent,
      language,
      filePath: params.path,
      lineRange,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Resolve file path relative to workspace
 */
function resolveFilePath(relativePath: string): string | null {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return null;
  }
  
  // Try to resolve relative to first workspace folder
  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  const fullPath = path.resolve(workspaceRoot, relativePath);
  
  return fullPath;
}

/**
 * Extract content by line numbers
 */
function extractByLines(
  content: string,
  range: { start: number; end: number }
): { content: string; lineRange: { start: number; end: number } } {
  const lines = content.split('\n');
  const maxLine = lines.length;
  
  // Clamp range to valid values
  const start = Math.max(1, Math.min(range.start, maxLine));
  const end = Math.max(start, Math.min(range.end, maxLine));
  
  // Extract lines (1-indexed to 0-indexed)
  const extracted = lines.slice(start - 1, end).join('\n');
  
  return {
    content: extracted,
    lineRange: { start, end },
  };
}

/**
 * Extract content by pattern matching
 */
function extractByPattern(
  content: string,
  startPattern?: string,
  endPattern?: string
): { content: string; lineRange: { start: number; end: number } } {
  const lines = content.split('\n');
  
  let startLine = 1;
  let endLine = lines.length;
  
  // Find start pattern
  if (startPattern) {
    const regex = new RegExp(startPattern);
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        startLine = i + 1;
        break;
      }
    }
  }
  
  // Find end pattern (searching from startLine)
  if (endPattern) {
    const regex = new RegExp(endPattern);
    for (let i = startLine; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        endLine = i + 1;
        break;
      }
    }
  }
  
  const extracted = lines.slice(startLine - 1, endLine).join('\n');
  
  return {
    content: extracted,
    lineRange: { start: startLine, end: endLine },
  };
}

/**
 * Detect language from file extension
 */
function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  
  const languageMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.json': 'json',
    '.md': 'markdown',
    '.py': 'python',
    '.rb': 'ruby',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.cs': 'csharp',
    '.css': 'css',
    '.scss': 'scss',
    '.html': 'html',
    '.xml': 'xml',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.sh': 'bash',
    '.bash': 'bash',
    '.zsh': 'bash',
    '.sql': 'sql',
    '.graphql': 'graphql',
    '.vue': 'vue',
    '.svelte': 'svelte',
  };
  
  return languageMap[ext] || 'plaintext';
}
