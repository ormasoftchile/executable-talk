/**
 * Action Block Parser
 * Parses fenced ```action code blocks containing YAML action definitions.
 * Per contracts/action-block-syntax.md and T006.
 */

import * as yaml from 'js-yaml';
import { InteractiveElement, ContentPosition } from '../models/slide';
import { ActionType, createAction } from '../models/action';
import { isKnownActionType, getRequiredParams } from '../providers/actionSchema';

/**
 * Regex pattern that matches fenced action blocks.
 * Uses multiline mode to anchor ^/$ to line boundaries.
 * Captures the YAML content between ```action and ```.
 */
const ACTION_BLOCK_PATTERN = /^```action\s*\n([\s\S]*?)^```\s*$/gm;

/**
 * Result of parsing action blocks from slide content
 */
export interface ActionBlockParseResult {
  /** Interactive elements created from action blocks */
  elements: InteractiveElement[];
  /** Content with action blocks stripped (for Markdown rendering) */
  cleanedContent: string;
  /** Parse errors encountered */
  errors: ActionBlockParseError[];
}

/**
 * Error from parsing an action block
 */
export interface ActionBlockParseError {
  /** Slide index (0-based) */
  slideIndex: number;
  /** Line number within the slide content (1-based) */
  line: number;
  /** Human-readable error message */
  message: string;
  /** The raw YAML that failed to parse */
  rawYaml: string;
}

/**
 * Parse all fenced action blocks from slide content.
 * Returns interactive elements and cleaned content (blocks stripped).
 *
 * @param content  Raw slide content (markdown)
 * @param slideIndex  Zero-based slide index
 */
export function parseActionBlocks(
  content: string,
  slideIndex: number
): ActionBlockParseResult {
  const elements: InteractiveElement[] = [];
  const errors: ActionBlockParseError[] = [];

  // Track which ranges to strip from content (replaced with placeholders)
  const stripRanges: Array<{ start: number; end: number; placeholderId: string }> = [];

  // Reset regex state for each call
  ACTION_BLOCK_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  let blockIndex = 0;

  while ((match = ACTION_BLOCK_PATTERN.exec(content)) !== null) {
    const fullMatch = match[0];
    const rawYaml = match[1];
    const matchStart = match.index;
    const matchEnd = matchStart + fullMatch.length;

    // Calculate 1-based line number of the opening fence
    const lineNumber = content.substring(0, matchStart).split('\n').length;

    // Placeholder ID matches the element ID that will be created
    const currentBlockIndex = blockIndex;
    blockIndex++;
    const placeholderId = `block-${slideIndex}-${currentBlockIndex}`;

    // Record range for stripping (replaced with placeholder in cleaned content)
    stripRanges.push({ start: matchStart, end: matchEnd, placeholderId });

    // Handle empty YAML
    if (!rawYaml.trim()) {
      errors.push({
        slideIndex,
        line: lineNumber,
        message: "Action block missing required 'type' field",
        rawYaml: rawYaml,
      });
      continue;
    }

    // Parse YAML
    let parsed: unknown;
    try {
      parsed = yaml.load(rawYaml);
    } catch (yamlError) {
      const mark = (yamlError as yaml.YAMLException).mark;
      const errorLine = mark ? lineNumber + 1 + mark.line : lineNumber;
      errors.push({
        slideIndex,
        line: errorLine,
        message: (yamlError as Error).message,
        rawYaml,
      });
      continue;
    }

    // Ensure parsed value is an object (not scalar, array, null)
    if (parsed === null || parsed === undefined || typeof parsed !== 'object' || Array.isArray(parsed)) {
      errors.push({
        slideIndex,
        line: lineNumber,
        message: 'Action block must be a YAML mapping',
        rawYaml,
      });
      continue;
    }

    const yamlObj = parsed as Record<string, unknown>;

    // Check for required 'type' field
    if (!yamlObj.type || typeof yamlObj.type !== 'string') {
      errors.push({
        slideIndex,
        line: lineNumber,
        message: "Action block missing required 'type' field",
        rawYaml,
      });
      continue;
    }

    const actionType = yamlObj.type;

    // Validate action type
    if (!isKnownActionType(actionType)) {
      errors.push({
        slideIndex,
        line: lineNumber,
        message: `Unknown action type '${actionType}'`,
        rawYaml,
      });
      continue;
    }

    // Validate required parameters
    const requiredParams = getRequiredParams(actionType as ActionType);
    const missingParams = requiredParams.filter((p) => yamlObj[p] === undefined || yamlObj[p] === null);

    if (missingParams.length > 0) {
      errors.push({
        slideIndex,
        line: lineNumber,
        message: `Action '${actionType}' requires parameter '${missingParams[0]}'`,
        rawYaml,
      });
      continue;
    }

    // Extract fragment animation property (not passed as an action param)
    const fragment = yamlObj.fragment;

    // Build params object (all keys except 'type', 'label', and 'fragment')
    const params: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(yamlObj)) {
      if (key !== 'type' && key !== 'label' && key !== 'fragment') {
        params[key] = value;
      }
    }

    // Create the Action model
    const action = createAction(actionType as ActionType, params, slideIndex);

    // Determine label
    const label = typeof yamlObj.label === 'string'
      ? yamlObj.label
      : actionType;

    // Determine position (1-based)
    const position: ContentPosition = {
      line: lineNumber,
      column: 1,
    };

    // Create InteractiveElement
    const element: InteractiveElement = {
      id: `block-${slideIndex}-${currentBlockIndex}`,
      label,
      action,
      position,
      rawLink: fullMatch,
      source: 'block',
      fragment: fragment === true || typeof fragment === 'string' ? fragment : undefined,
    };

    elements.push(element);
  }

  // Build cleaned content by removing action blocks
  const cleanedContent = buildCleanedContent(content, stripRanges);

  return { elements, cleanedContent, errors };
}

/**
 * Remove the matched action block ranges from content, inserting HTML comment
 * placeholders so the action buttons can later be rendered in-position.
 * Preserves surrounding content and collapses excess blank lines.
 */
function buildCleanedContent(
  content: string,
  stripRanges: Array<{ start: number; end: number; placeholderId: string }>
): string {
  if (stripRanges.length === 0) {
    return content;
  }

  // Build content by concatenating non-stripped segments with placeholders
  let result = '';
  let cursor = 0;

  for (const range of stripRanges) {
    result += content.substring(cursor, range.start);
    // Insert a placeholder that markdown-it will pass through as raw HTML
    result += `<!--ACTION:${range.placeholderId}-->`;
    cursor = range.end;
  }

  // Append remainder
  result += content.substring(cursor);

  // Collapse 3+ consecutive newlines to 2 (preserves paragraph spacing)
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim() ? result : result;
}
