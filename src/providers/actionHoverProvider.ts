/**
 * ActionHoverProvider — provides hover documentation for action blocks in .deck.md files.
 * Per spec US4 and T038.
 *
 * - Hover on action type keyword → shows description and parameter table
 * - Hover on parameter name → shows type and description
 * - Only activates inside ```action fences
 */

import {
  findActionBlocks,
  ACTION_SCHEMAS,
  ActionBlockRange,
} from './actionSchema';
import { ActionType } from '../models/action';

/**
 * Minimal hover result interface (compatible with vscode.Hover).
 */
interface HoverResult {
  contents: string[];
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

/**
 * ActionHoverProvider for deck-markdown documents.
 */
export class ActionHoverProvider {
  /**
   * Provide hover information for the given position.
   */
  provideHover(
    document: {
      lineCount: number;
      lineAt(line: number): { text: string };
      getWordRangeAtPosition?(position: unknown, regex?: RegExp): unknown;
    },
    position: { line: number; character: number },
    _token: unknown,
  ): HoverResult | null {
    // Find action blocks
    const blocks = findActionBlocks(document);

    // Check cursor is inside an action block
    const enclosingBlock = this.findEnclosingBlock(blocks, position.line);
    if (!enclosingBlock) {
      return null;
    }

    // Get the line text
    const lineText = document.lineAt(position.line).text;

    // Try to identify what the cursor is on
    // Check for `type: <actionType>` — hover on the type value
    const typeMatch = lineText.match(/^\s*type:\s*(\S+)/);
    if (typeMatch) {
      const typeValue = typeMatch[1] as ActionType;
      const typeStart = lineText.indexOf(typeValue);
      const typeEnd = typeStart + typeValue.length;

      // Is cursor on the type value?
      if (position.character >= typeStart && position.character < typeEnd) {
        return this.hoverActionType(typeValue, position.line, typeStart, typeEnd);
      }
    }

    // Check for parameter key: `paramName: value` — hover on param name
    const paramMatch = lineText.match(/^\s*(\w+):/);
    if (paramMatch && paramMatch[1] !== 'type') {
      const paramName = paramMatch[1];
      const paramStart = lineText.indexOf(paramName);
      const paramEnd = paramStart + paramName.length;

      if (position.character >= paramStart && position.character < paramEnd) {
        // Find the action type from the block
        const actionType = this.extractActionType(enclosingBlock);
        if (actionType) {
          return this.hoverParameter(actionType, paramName, position.line, paramStart, paramEnd);
        }
      }
    }

    return null;
  }

  /**
   * Build hover for an action type keyword.
   */
  private hoverActionType(
    type: ActionType,
    line: number,
    charStart: number,
    charEnd: number,
  ): HoverResult | null {
    const schema = ACTION_SCHEMAS.get(type);
    if (!schema) {
      return null;
    }

    const lines: string[] = [];
    lines.push(`**${type}**`);
    lines.push('');
    lines.push(schema.description);

    if (schema.requiresTrust) {
      lines.push('');
      lines.push('⚠️ *Requires Workspace Trust*');
    }

    // Parameter table
    if (schema.parameters.length > 0) {
      lines.push('');
      lines.push('| Parameter | Type | Required | Description |');
      lines.push('|-----------|------|----------|-------------|');
      for (const param of schema.parameters) {
        const req = param.required ? '✅' : '';
        lines.push(`| \`${param.name}\` | ${param.type} | ${req} | ${param.description} |`);
      }
    }

    return {
      contents: [lines.join('\n')],
      range: {
        start: { line, character: charStart },
        end: { line, character: charEnd },
      },
    };
  }

  /**
   * Build hover for a parameter name.
   */
  private hoverParameter(
    actionType: ActionType,
    paramName: string,
    line: number,
    charStart: number,
    charEnd: number,
  ): HoverResult | null {
    const schema = ACTION_SCHEMAS.get(actionType);
    if (!schema) {
      return null;
    }

    const param = schema.parameters.find((p) => p.name === paramName);
    if (!param) {
      return null;
    }

    const lines: string[] = [];
    lines.push(`**${paramName}**: \`${param.type}\`${param.required ? ' *(required)*' : ''}`);
    lines.push('');
    lines.push(param.description);

    if (param.enum) {
      lines.push('');
      lines.push('Allowed values: ' + param.enum.map((v) => `\`${v}\``).join(', '));
    }

    return {
      contents: [lines.join('\n')],
      range: {
        start: { line, character: charStart },
        end: { line, character: charEnd },
      },
    };
  }

  /**
   * Extract the action type from a block's content.
   */
  private extractActionType(block: ActionBlockRange): ActionType | null {
    for (const line of block.content.split('\n')) {
      const match = line.match(/^\s*type:\s*(\S+)/);
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
   * Find the action block enclosing the given line.
   */
  private findEnclosingBlock(blocks: ActionBlockRange[], line: number): ActionBlockRange | null {
    for (const block of blocks) {
      if (line > block.startLine && line < block.endLine) {
        return block;
      }
    }
    return null;
  }
}
