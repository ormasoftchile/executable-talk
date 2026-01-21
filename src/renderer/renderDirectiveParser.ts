/**
 * Parser for render directives in Markdown
 * Handles [label](render:type?params) syntax
 */

/**
 * Render directive types
 */
export type RenderType = 'file' | 'command' | 'diff';

/**
 * Base parameters for all render directives
 */
export interface RenderDirectiveBase {
  id: string;
  type: RenderType;
  label: string;
  rawDirective: string;
  position: { start: number; end: number };
}

/**
 * Parameters for render:file directive
 */
export interface FileRenderParams {
  path: string;
  lines?: { start: number; end: number };
  startPattern?: string;
  endPattern?: string;
  format?: 'code' | 'quote' | 'raw';
  lang?: string;
  watch?: boolean;
}

/**
 * Parameters for render:command directive
 */
export interface CommandRenderParams {
  cmd: string;
  timeout?: number;
  format?: 'code' | 'json' | 'raw';
  cwd?: string;
  shell?: string;
  cached?: boolean;
  /** Behavior on error: 'show' displays error, 'hide' hides block, 'fallback' shows fallback content */
  onError?: 'show' | 'hide' | 'fallback' | 'retry';
  /** Fallback content to display on error (when onError='fallback') */
  fallback?: string;
  /** Maximum number of retry attempts (when onError='retry') */
  retries?: number;
  /** Show streaming output while command runs */
  stream?: boolean;
}

/**
 * Parameters for render:diff directive
 */
export interface DiffRenderParams {
  path?: string;
  before?: string;
  after?: string;
  left?: string;
  right?: string;
  mode?: 'unified' | 'split';
  context?: number;
}

export interface FileRenderDirective extends RenderDirectiveBase {
  type: 'file';
  params: FileRenderParams;
}

export interface CommandRenderDirective extends RenderDirectiveBase {
  type: 'command';
  params: CommandRenderParams;
}

export interface DiffRenderDirective extends RenderDirectiveBase {
  type: 'diff';
  params: DiffRenderParams;
}

export type RenderDirective = FileRenderDirective | CommandRenderDirective | DiffRenderDirective;

/**
 * Pattern for render directives: [label](render:type?param=value)
 * Label can be empty for invisible directives
 */
const RENDER_DIRECTIVE_PATTERN = /\[([^\]]*)\]\(render:(file|command|diff)(?:\?([^)]*))?\)/g;

/**
 * Parse render directives from Markdown content
 */
export function parseRenderDirectives(content: string, slideIndex: number): RenderDirective[] {
  const directives: RenderDirective[] = [];
  
  let match: RegExpExecArray | null;
  RENDER_DIRECTIVE_PATTERN.lastIndex = 0;
  
  while ((match = RENDER_DIRECTIVE_PATTERN.exec(content)) !== null) {
    const [fullMatch, label, type, queryString] = match;
    
    const directive = createDirective(
      slideIndex,
      directives.length,
      type as RenderType,
      label,
      queryString || '',
      fullMatch,
      match.index,
      match.index + fullMatch.length
    );
    
    if (directive) {
      directives.push(directive);
    }
  }
  
  return directives;
}

/**
 * Create a typed render directive from parsed components
 */
function createDirective(
  slideIndex: number,
  directiveIndex: number,
  type: RenderType,
  label: string,
  queryString: string,
  rawDirective: string,
  start: number,
  end: number
): RenderDirective | null {
  const id = `render-${slideIndex}-${directiveIndex}`;
  const base = {
    id,
    label,
    rawDirective,
    position: { start, end },
  };
  
  const params = parseQueryString(queryString);
  
  switch (type) {
    case 'file':
      return createFileDirective(base, params);
    case 'command':
      return createCommandDirective(base, params);
    case 'diff':
      return createDiffDirective(base, params);
    default:
      return null;
  }
}

function createFileDirective(
  base: Omit<RenderDirectiveBase, 'type'>,
  params: Record<string, string>
): FileRenderDirective | null {
  if (!params.path) {
    console.warn('render:file requires path parameter');
    return null;
  }
  
  const fileParams: FileRenderParams = {
    path: params.path,
    format: (params.format as FileRenderParams['format']) || 'code',
  };
  
  // Parse lines parameter (e.g., "10-20" or "5")
  if (params.lines) {
    const lineRange = parseLineRange(params.lines);
    if (lineRange) {
      fileParams.lines = lineRange;
    }
  }
  
  if (params.start) {
    fileParams.startPattern = decodeURIComponent(params.start);
  }
  
  if (params.end) {
    fileParams.endPattern = decodeURIComponent(params.end);
  }
  
  if (params.lang) {
    fileParams.lang = params.lang;
  }
  
  if (params.watch === 'true') {
    fileParams.watch = true;
  }
  
  return { ...base, type: 'file', params: fileParams };
}

function createCommandDirective(
  base: Omit<RenderDirectiveBase, 'type'>,
  params: Record<string, string>
): CommandRenderDirective | null {
  if (!params.cmd) {
    console.warn('render:command requires cmd parameter');
    return null;
  }
  
  const cmdParams: CommandRenderParams = {
    cmd: decodeURIComponent(params.cmd),
    format: (params.format as CommandRenderParams['format']) || 'code',
    cached: params.cached !== 'false', // default true
  };
  
  if (params.timeout) {
    cmdParams.timeout = parseInt(params.timeout, 10);
  }
  
  if (params.cwd) {
    cmdParams.cwd = params.cwd;
  }
  
  if (params.shell) {
    cmdParams.shell = params.shell;
  }

  // Error handling options
  if (params.onError) {
    cmdParams.onError = params.onError as CommandRenderParams['onError'];
  }
  
  if (params.fallback) {
    cmdParams.fallback = decodeURIComponent(params.fallback);
  }
  
  if (params.retries) {
    cmdParams.retries = parseInt(params.retries, 10);
  }
  
  // Streaming option
  if (params.stream === 'true') {
    cmdParams.stream = true;
  }
  
  return { ...base, type: 'command', params: cmdParams };
}

function createDiffDirective(
  base: Omit<RenderDirectiveBase, 'type'>,
  params: Record<string, string>
): DiffRenderDirective | null {
  // Either path or (left + right) required
  if (!params.path && !(params.left && params.right)) {
    console.warn('render:diff requires either path or left+right parameters');
    return null;
  }
  
  const diffParams: DiffRenderParams = {
    mode: (params.mode as DiffRenderParams['mode']) || 'unified',
    context: params.context ? parseInt(params.context, 10) : 3,
  };
  
  if (params.path) {
    diffParams.path = params.path;
    diffParams.before = params.before || 'HEAD~1';
    diffParams.after = params.after; // undefined = working tree
  } else {
    diffParams.left = params.left;
    diffParams.right = params.right;
  }
  
  return { ...base, type: 'diff', params: diffParams };
}

/**
 * Parse query string into key-value pairs
 */
function parseQueryString(queryString: string): Record<string, string> {
  const params: Record<string, string> = {};
  
  if (!queryString) {
    return params;
  }
  
  const pairs = queryString.split('&');
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key) {
      params[key] = value || '';
    }
  }
  
  return params;
}

/**
 * Parse line range string (e.g., "10-20" or "5")
 */
function parseLineRange(rangeStr: string): { start: number; end: number } | null {
  const match = rangeStr.match(/^(\d+)(?:-(\d+))?$/);
  if (!match) {
    return null;
  }
  
  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : start;
  
  if (start < 1 || end < start) {
    return null;
  }
  
  return { start, end };
}
