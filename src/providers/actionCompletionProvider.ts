/**
 * ActionCompletionProvider — provides autocomplete for action blocks in .deck.md files.
 * Per spec US4 and T037.
 *
 * Context-aware logic:
 * - If no `type:` yet → suggest all 6 action types
 * - If `type:` set → suggest valid params for that type from ActionSchema
 * - Gated to positions inside action blocks via findActionBlocks()
 */

import {
  findActionBlocks,
  ACTION_SCHEMAS,
  ActionBlockRange,
  ENV_DECLARATION_SCHEMA,
  VALIDATION_RULES,
} from './actionSchema';
import { ActionType } from '../models/action';

/**
 * Minimal interfaces so this module can be tested without the full vscode module.
 * At runtime, vscode provides the real implementations.
 */
interface CompletionItem {
  label: string;
  kind: number;
  detail?: string;
  documentation?: string;
  insertText?: string;
  sortText?: string;
  /** Optional replace range: { startLine, startChar, endLine, endChar } */
  range?: { startLine: number; startChar: number; endLine: number; endChar: number };
}

/** Completion item kinds (mirrors vscode.CompletionItemKind subset) */
const CompletionKind = {
  Value: 12,
  Property: 9,
  File: 16,
  Snippet: 14,
} as const;

/**
 * ActionCompletionProvider for deck-markdown documents.
 */
export class ActionCompletionProvider {
  /** Trigger characters for this provider */
  readonly triggerCharacters = [':', '/'];

  /**
   * Provide completion items for the given position in a document.
   */
  provideCompletionItems(
    document: { lineCount: number; lineAt(line: number): { text: string }; getText(): string },
    position: { line: number; character: number },
    _token: unknown,
    _context: unknown,
  ): CompletionItem[] | null {
    // Check if cursor is inside frontmatter scenes block
    const frontmatterItems = this.provideScenesCompletions(document, position);
    if (frontmatterItems) {
      return frontmatterItems;
    }

    // Check if cursor is inside frontmatter env block (Feature 006 — T044)
    const envItems = this.provideEnvCompletions(document, position);
    if (envItems) {
      return envItems;
    }

    // Find action blocks in the document
    const blocks = findActionBlocks(document);

    // Check if cursor is inside an action block
    const enclosingBlock = this.findEnclosingBlock(blocks, position.line);
    if (!enclosingBlock) {
      return null;
    }

    // Check for {{VAR}} completion inside action block (Feature 006 — T044)
    const currentLineText = document.lineAt(position.line).text;
    const textBeforeCursor = currentLineText.substring(0, position.character);
    if (textBeforeCursor.includes('{{')) {
      const lastDoubleBrace = textBeforeCursor.lastIndexOf('{{');
      const afterBrace = textBeforeCursor.substring(lastDoubleBrace + 2);
      // Only suggest if we're between {{ and }} (no closing }} yet)
      if (!afterBrace.includes('}}')) {
        const envVarItems = this.provideEnvVarCompletions(document);
        if (envVarItems && envVarItems.length > 0) {
          return envVarItems;
        }
      }
    }

    // Parse the YAML content to understand context
    const contentLines = enclosingBlock.content.split('\n');
    const cursorLineInBlock = position.line - enclosingBlock.startLine - 1; // -1 for opening fence
    const currentLine = contentLines[cursorLineInBlock] ?? '';

    // Check if cursor is inside a steps: array item (indented context)
    const stepContext = this.getStepContext(contentLines, cursorLineInBlock);
    if (stepContext) {
      return this.provideStepCompletions(currentLine, position, stepContext);
    }

    // Detect what type is set (if any) at top level
    const actionType = this.extractTopLevelType(contentLines);

    // If cursor is on the type: line or no type yet, suggest action types
    if (this.isTypeLine(currentLine) || !actionType) {
      const replaceRange = this.computeValueRange(currentLine, position.line);
      return this.suggestActionTypes(replaceRange);
    }

    // If type is known, suggest parameters for that type
    if (actionType) {
      return this.suggestParameters(actionType, contentLines, /* topLevelOnly */ true);
    }

    return null;
  }

  /**
   * Provide completions inside a steps: array item.
   */
  private provideStepCompletions(
    currentLine: string,
    position: { line: number; character: number },
    stepContext: { stepType: ActionType | null; stepLines: string[] },
  ): CompletionItem[] | null {
    // If cursor is on a type: line inside the step, suggest action types
    if (this.isTypeLine(currentLine)) {
      const replaceRange = this.computeValueRange(currentLine, position.line);
      // For step types, exclude 'sequence' to prevent infinite nesting
      return this.suggestActionTypes(replaceRange);
    }

    // If no type set yet on this step, suggest type: first
    if (!stepContext.stepType) {
      return this.suggestActionTypes(this.computeValueRange(currentLine, position.line));
    }

    // Suggest parameters for the step's action type
    return this.suggestParameters(stepContext.stepType, stepContext.stepLines, false);
  }

  /**
   * Determine if the cursor is inside a steps: list item.
   * If so, return the step's type and lines.
   */
  private getStepContext(
    contentLines: string[],
    cursorLineIdx: number,
  ): { stepType: ActionType | null; stepLines: string[] } | null {
    // Check if this line or any line above it is inside a steps: array
    // Steps items are indented and start with "  - " or "    " continuation

    // First, find if there's a "steps:" line above the cursor
    let stepsLineIdx = -1;
    for (let i = cursorLineIdx; i >= 0; i--) {
      if (/^\s*steps:\s*$/.test(contentLines[i])) {
        stepsLineIdx = i;
        break;
      }
      // If we hit a non-indented, non-empty line that isn't a step entry, stop
      if (i < cursorLineIdx && /^\S/.test(contentLines[i]) && !/^\s*-\s/.test(contentLines[i])) {
        break;
      }
    }

    if (stepsLineIdx < 0) {
      return null;
    }

    // Check cursor line indentation - must be inside the steps block
    const cursorIndent = (currentIndent(contentLines[cursorLineIdx] ?? ''));
    if (cursorIndent < 2) {
      // Not indented enough to be inside steps
      return null;
    }

    // Find the current step item boundaries (scan back for "  - ")
    let stepStartIdx = cursorLineIdx;
    for (let i = cursorLineIdx; i > stepsLineIdx; i--) {
      if (/^\s{2,}-\s/.test(contentLines[i])) {
        stepStartIdx = i;
        break;
      }
    }

    // Collect lines for this step item (from "  - " until next "  - " or end of steps)
    const stepLines: string[] = [];
    for (let i = stepStartIdx; i < contentLines.length; i++) {
      if (i > stepStartIdx && /^\s{2,}-\s/.test(contentLines[i])) {
        break; // Next step item
      }
      if (i > stepStartIdx && /^\S/.test(contentLines[i])) {
        break; // Back to top level
      }
      stepLines.push(contentLines[i]);
    }

    // Extract the type from the step lines
    let stepType: ActionType | null = null;
    for (const line of stepLines) {
      const match = line.match(/^\s*-?\s*type:\s*(\S+)/);
      if (match) {
        const candidate = match[1] as ActionType;
        if (ACTION_SCHEMAS.has(candidate)) {
          stepType = candidate;
        }
      }
    }

    return { stepType, stepLines };
  }

  /**
   * Compute a replace range for the value portion after "key: " on a given line.
   */
  private computeValueRange(
    currentLine: string,
    line: number,
  ): CompletionItem['range'] | undefined {
    const colonIdx = currentLine.indexOf(':');
    if (colonIdx < 0) {
      return undefined;
    }
    const valueStart = colonIdx + 2; // skip ": "
    const valueEnd = currentLine.length;
    return {
      startLine: line,
      startChar: Math.min(valueStart, currentLine.length),
      endLine: line,
      endChar: valueEnd,
    };
  }

  /**
   * Check if the cursor line is a `type:` line.
   */
  private isTypeLine(line: string): boolean {
    return /^\s*type:\s*/.test(line);
  }

  /**
   * Extract the top-level action type from the YAML content lines.
   * Only considers non-indented type: lines (not nested in steps).
   */
  private extractTopLevelType(lines: string[]): ActionType | null {
    for (const line of lines) {
      // Only match type: at the start of the line (no indentation = top level)
      const match = line.match(/^type:\s*(\S+)/);
      if (match) {
        const candidate = match[1] as ActionType;
        if (ACTION_SCHEMAS.has(candidate)) {
          return candidate;
        }
      }
    }
    return null;
  }

  /**
   * Suggest all 6 action types.
   */
  private suggestActionTypes(replaceRange?: CompletionItem['range']): CompletionItem[] {
    const items: CompletionItem[] = [];

    for (const [type, schema] of ACTION_SCHEMAS) {
      items.push({
        label: type,
        kind: CompletionKind.Value,
        detail: schema.description,
        documentation: schema.requiresTrust
          ? `⚠️ Requires Workspace Trust\n\n${schema.description}`
          : schema.description,
        insertText: type,
        sortText: `0_${type}`,
        range: replaceRange,
      });
    }

    return items;
  }

  /**
   * Suggest parameters valid for the given action type.
   */
  private suggestParameters(type: ActionType, existingLines: string[], topLevelOnly: boolean): CompletionItem[] {
    const schema = ACTION_SCHEMAS.get(type);
    if (!schema) {
      return [];
    }

    // Find which params are already set in the relevant context
    const existingKeys = new Set<string>();
    for (const line of existingLines) {
      // For step context, match indented keys (with optional "- " prefix)
      const keyMatch = topLevelOnly
        ? line.match(/^(\w+):/)
        : line.match(/^\s*-?\s*(\w+):/);
      if (keyMatch && keyMatch[1] !== 'type') {
        existingKeys.add(keyMatch[1]);
      }
    }

    const items: CompletionItem[] = [];

    for (const param of schema.parameters) {
      // Skip already-set params
      if (existingKeys.has(param.name)) {
        continue;
      }

      const requiredLabel = param.required ? ' (required)' : '';

      let insertText = `${param.name}: `;
      // Special snippets
      if (param.name === 'steps' && param.type === 'array') {
        insertText = 'steps:\n  - type: ';
      }

      items.push({
        label: param.name,
        kind: param.completionKind === 'file'
          ? CompletionKind.File
          : CompletionKind.Property,
        detail: `${param.type}${requiredLabel}`,
        documentation: param.description,
        insertText,
        sortText: param.required ? `0_${param.name}` : `1_${param.name}`,
      });
    }

    // Add universal meta-fields (label, fragment) if not already set
    if (!existingKeys.has('label')) {
      items.push({
        label: 'label',
        kind: CompletionKind.Property,
        detail: 'string',
        documentation: 'Custom display label for the action button.',
        insertText: 'label: ',
        sortText: '1_label',
      });
    }
    if (!existingKeys.has('fragment')) {
      items.push({
        label: 'fragment',
        kind: CompletionKind.Property,
        detail: 'boolean | string',
        documentation: 'Animate the action button as a fragment. Use `true` for default fade, or a specific animation type (e.g., `slide-up`, `zoom`).',
        insertText: 'fragment: true',
        sortText: '1_fragment',
      });
    }

    return items;
  }

  /**
   * Find the action block that encloses the given line.
   */
  private findEnclosingBlock(blocks: ActionBlockRange[], line: number): ActionBlockRange | null {
    for (const block of blocks) {
      if (line > block.startLine && line < block.endLine) {
        return block;
      }
    }
    return null;
  }

  /**
   * Find the frontmatter region (between first and second ---).
   * Returns [startLine, endLine] (both 0-based, inclusive of --- lines) or null.
   */
  private findFrontmatter(document: { lineCount: number; lineAt(line: number): { text: string } }): [number, number] | null {
    if (document.lineCount < 3) {
      return null;
    }
    // First line must be ---
    if (document.lineAt(0).text.trim() !== '---') {
      return null;
    }
    for (let i = 1; i < document.lineCount; i++) {
      if (document.lineAt(i).text.trim() === '---') {
        return [0, i];
      }
    }
    return null;
  }

  // ─────────────────────────────────────────────────
  // Env completions (Feature 006 — T044)
  // ─────────────────────────────────────────────────

  /**
   * Provide completion items when cursor is inside an env: block in frontmatter.
   * Suggests env declaration properties and validation rule values.
   */
  private provideEnvCompletions(
    document: { lineCount: number; lineAt(line: number): { text: string }; getText(): string },
    position: { line: number; character: number },
  ): CompletionItem[] | null {
    const fm = this.findFrontmatter(document);
    if (!fm) {
      return null;
    }
    const [fmStart, fmEnd] = fm;
    if (position.line <= fmStart || position.line >= fmEnd) {
      return null;
    }

    // Find if there's an env: line above the cursor
    let envLineIdx = -1;
    for (let i = position.line; i > fmStart; i--) {
      if (/^env:\s*$/.test(document.lineAt(i).text)) {
        envLineIdx = i;
        break;
      }
      // If we hit a non-indented key (not a list item continuation), stop
      if (i < position.line && /^\S/.test(document.lineAt(i).text) && !/^\s*-\s/.test(document.lineAt(i).text)) {
        break;
      }
    }

    if (envLineIdx < 0) {
      return null;
    }

    const currentLine = document.lineAt(position.line).text;

    // Check if cursor is on a validate: line — suggest validation rules
    if (/^\s+validate:\s*/.test(currentLine)) {
      return VALIDATION_RULES.map((rule) => ({
        label: rule.name,
        kind: CompletionKind.Value,
        detail: rule.description,
        documentation: rule.description,
        insertText: rule.name,
        sortText: `0_${rule.name}`,
      }));
    }

    // If cursor is on a list item start, continuation line, or indented empty line, suggest env properties
    if (/^\s+-\s*/.test(currentLine) || /^\s+\w/.test(currentLine) || /^\s+$/.test(currentLine)) {
      // Detect which properties are already set in this item
      const existingKeys = new Set<string>();
      for (let i = position.line; i > envLineIdx; i--) {
        const lineText = document.lineAt(i).text;
        const keyMatch = lineText.match(/^\s+-?\s*(\w+):/);
        if (keyMatch) {
          existingKeys.add(keyMatch[1]);
        }
        if (/^\s+-\s/.test(lineText) && i < position.line) {
          break; // Previous item boundary
        }
      }

      const items: CompletionItem[] = [];
      for (const prop of ENV_DECLARATION_SCHEMA) {
        if (!existingKeys.has(prop.name)) {
          items.push({
            label: prop.name,
            kind: CompletionKind.Property,
            detail: `${prop.type}${prop.required ? ' (required)' : ''}`,
            documentation: prop.description,
            insertText: `${prop.name}: `,
            sortText: prop.required ? `0_${prop.name}` : `1_${prop.name}`,
          });
        }
      }

      return items.length > 0 ? items : null;
    }

    return null;
  }

  /**
   * Suggest declared env variable names when typing {{ inside action blocks.
   * Parses frontmatter env: declarations and returns variable names.
   */
  private provideEnvVarCompletions(
    document: { lineCount: number; lineAt(line: number): { text: string }; getText(): string },
  ): CompletionItem[] | null {
    const fm = this.findFrontmatter(document);
    if (!fm) {
      return null;
    }
    const [fmStart, fmEnd] = fm;

    // Extract declared env variable names from frontmatter
    const varNames: string[] = [];
    let inEnvBlock = false;
    for (let i = fmStart + 1; i < fmEnd; i++) {
      const lineText = document.lineAt(i).text;
      if (/^env:\s*$/.test(lineText)) {
        inEnvBlock = true;
        continue;
      }
      if (inEnvBlock) {
        if (/^\S/.test(lineText) && !/^\s/.test(lineText)) {
          break; // End of env block
        }
        const nameMatch = lineText.match(/^\s+-?\s*name:\s*(\S+)/);
        if (nameMatch) {
          varNames.push(nameMatch[1]);
        }
      }
    }

    if (varNames.length === 0) {
      return null;
    }

    return varNames.map((name) => ({
      label: name,
      kind: CompletionKind.Value,
      detail: 'Env variable',
      documentation: `Insert \`{{${name}}}\` — resolved from .deck.env at runtime.`,
      insertText: `${name}}}`,
      sortText: `0_${name}`,
    }));
  }

  /**
   * Provide completion items when cursor is inside a scenes: block in frontmatter.
   * Suggests scene item properties (name, slide) for scenes array items.
   */
  private provideScenesCompletions(
    document: { lineCount: number; lineAt(line: number): { text: string }; getText(): string },
    position: { line: number; character: number },
  ): CompletionItem[] | null {
    const fm = this.findFrontmatter(document);
    if (!fm) {
      return null;
    }
    const [fmStart, fmEnd] = fm;
    // Cursor must be inside frontmatter
    if (position.line <= fmStart || position.line >= fmEnd) {
      return null;
    }

    // Find if there's a scenes: line above the cursor
    let scenesLineIdx = -1;
    for (let i = position.line; i > fmStart; i--) {
      if (/^scenes:\s*$/.test(document.lineAt(i).text)) {
        scenesLineIdx = i;
        break;
      }
      // If we hit a non-indented key (not a list item continuation), stop
      if (i < position.line && /^\S/.test(document.lineAt(i).text) && !/^\s*-\s/.test(document.lineAt(i).text)) {
        break;
      }
    }

    if (scenesLineIdx < 0) {
      return null;
    }

    const currentLine = document.lineAt(position.line).text;

    // If cursor is on a "  - " line (list item start), suggest name/slide
    // Also if on a continuation line inside a list item
    if (/^\s+-\s*/.test(currentLine) || /^\s+\w/.test(currentLine)) {
      // Detect which properties are already set in this item
      const existingKeys = new Set<string>();
      // Scan backward to the "  - " marker for this item
      for (let i = position.line; i > scenesLineIdx; i--) {
        const lineText = document.lineAt(i).text;
        const keyMatch = lineText.match(/^\s+-?\s*(\w+):/);
        if (keyMatch) {
          existingKeys.add(keyMatch[1]);
        }
        if (/^\s+-\s/.test(lineText) && i < position.line) {
          break; // Previous item boundary
        }
      }

      const items: CompletionItem[] = [];

      if (!existingKeys.has('name')) {
        items.push({
          label: 'name',
          kind: CompletionKind.Property,
          detail: 'string (required)',
          documentation: 'Unique name for the scene anchor. Used as the label in the scene picker.',
          insertText: 'name: ',
          sortText: '0_name',
        });
      }

      if (!existingKeys.has('slide')) {
        items.push({
          label: 'slide',
          kind: CompletionKind.Property,
          detail: 'number (required)',
          documentation: 'The 1-based slide number this scene anchors to. Must be within the deck slide range.',
          insertText: 'slide: ',
          sortText: '0_slide',
        });
      }

      return items.length > 0 ? items : null;
    }

    return null;
  }
}

/**
 * Count leading whitespace characters in a line.
 */
function currentIndent(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}
