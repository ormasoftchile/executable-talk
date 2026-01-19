/**
 * Action link parser for extracting interactive elements from Markdown
 * Parses [text](action:type?params) syntax
 */

import { InteractiveElement } from '../models/slide';
import { ActionType, createAction } from '../models/action';

/**
 * Pattern for action links: [label](action:type?param=value&param2=value2)
 * Captures: label, type, params (query string)
 */
const ACTION_LINK_PATTERN = /\[([^\]]+)\]\(action:([a-z.]+)(?:\?([^)]*))?\)/g;

/**
 * Valid action types
 */
const VALID_ACTION_TYPES: ActionType[] = [
  'file.open',
  'editor.highlight',
  'terminal.run',
  'debug.start',
  'sequence',
];

/**
 * Parse action links from Markdown content
 */
export function parseActionLinks(content: string, slideIndex: number): InteractiveElement[] {
  const elements: InteractiveElement[] = [];
  const lines = content.split('\n');
  
  let match: RegExpExecArray | null;
  
  // Reset regex state
  ACTION_LINK_PATTERN.lastIndex = 0;
  
  while ((match = ACTION_LINK_PATTERN.exec(content)) !== null) {
    const [fullMatch, label, type, queryString] = match;
    
    // Validate action type
    if (!isValidActionType(type)) {
      continue;
    }
    
    // Parse query string to params
    const params = parseQueryString(queryString || '');
    
    // Create action
    const action = createAction(type as ActionType, params, slideIndex);
    
    // Find position in content
    const position = findPosition(content, match.index, lines);
    
    // Create interactive element
    const element: InteractiveElement = {
      id: generateElementId(slideIndex, elements.length),
      label,
      action,
      position,
      rawLink: fullMatch,
    };
    
    elements.push(element);
  }
  
  return elements;
}

/**
 * Check if type is a valid action type
 */
function isValidActionType(type: string): boolean {
  return VALID_ACTION_TYPES.includes(type as ActionType);
}

/**
 * Parse URL query string to params object
 */
function parseQueryString(queryString: string): Record<string, unknown> {
  if (!queryString) {
    return {};
  }
  
  const params: Record<string, unknown> = {};
  const pairs = queryString.split('&');
  
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key) {
      // Decode URI component and parse value
      const decodedKey = decodeURIComponent(key);
      const decodedValue = value ? decodeURIComponent(value) : '';
      
      // Try to parse as number or boolean
      params[decodedKey] = parseValue(decodedValue);
    }
  }
  
  return params;
}

/**
 * Parse string value to appropriate type
 */
function parseValue(value: string): unknown {
  // Boolean
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  
  // Number
  const num = Number(value);
  if (!isNaN(num) && value !== '') {
    return num;
  }
  
  // String
  return value;
}

/**
 * Find line and column position of match
 */
function findPosition(
  _content: string,
  matchIndex: number,
  lines: string[]
): { line: number; column: number } {
  let charCount = 0;
  
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const lineLength = lines[lineIndex].length + 1; // +1 for newline
    
    if (charCount + lineLength > matchIndex) {
      return {
        line: lineIndex + 1, // 1-based
        column: matchIndex - charCount + 1, // 1-based
      };
    }
    
    charCount += lineLength;
  }
  
  return { line: 1, column: 1 };
}

/**
 * Generate unique element ID
 */
function generateElementId(slideIndex: number, elementIndex: number): string {
  return `element-${slideIndex}-${elementIndex}-${Math.random().toString(36).substring(2, 7)}`;
}

/**
 * Extract action type and params from an action URI
 * Format: action:type?param=value
 */
export function parseActionUri(uri: string): { type: ActionType; params: Record<string, unknown> } | null {
  const match = uri.match(/^action:([a-z.]+)(?:\?(.*))?$/);
  
  if (!match) {
    return null;
  }
  
  const [, type, queryString] = match;
  
  if (!isValidActionType(type)) {
    return null;
  }
  
  return {
    type: type as ActionType,
    params: parseQueryString(queryString || ''),
  };
}
