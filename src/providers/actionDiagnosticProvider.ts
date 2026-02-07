/**
 * ActionDiagnosticProvider — provides real-time diagnostics for action blocks in .deck.md files.
 * Per spec US4 and T039.
 *
 * Validates action blocks in real time:
 * - Unknown action type → Error
 * - Missing required parameters → Error
 * - Unknown parameter keys → Warning
 * - Invalid YAML syntax → Error
 *
 * Uses findActionBlocks() for block detection and ACTION_SCHEMAS for validation.
 */

import * as yaml from 'js-yaml';
import {
  findActionBlocks,
  ACTION_SCHEMAS,
  ActionBlockRange,
} from './actionSchema';
import { ActionType } from '../models/action';

/**
 * Diagnostic severity (mirrors vscode.DiagnosticSeverity values).
 */
export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

/**
 * Diagnostic result (compatible with vscode.Diagnostic).
 */
export interface DiagnosticResult {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  message: string;
  severity: DiagnosticSeverity;
  source: string;
}

/**
 * ActionDiagnosticProvider for deck-markdown documents.
 */
export class ActionDiagnosticProvider {
  private readonly _source = 'Executable Talk';
  private _disposed = false;

  /**
   * Compute diagnostics for all action blocks in the document.
   */
  computeDiagnostics(
    document: {
      lineCount: number;
      lineAt(line: number): { text: string };
    },
  ): DiagnosticResult[] {
    if (this._disposed) {
      return [];
    }

    const blocks = findActionBlocks(document);
    const diagnostics: DiagnosticResult[] = [];

    for (const block of blocks) {
      this.validateBlock(block, diagnostics);
    }

    return diagnostics;
  }

  /**
   * Validate a single action block and push diagnostics.
   */
  private validateBlock(block: ActionBlockRange, diagnostics: DiagnosticResult[]): void {
    const content = block.content;

    // Try parsing YAML
    let parsed: Record<string, unknown>;
    try {
      const result = yaml.load(content);
      if (typeof result !== 'object' || result === null) {
        diagnostics.push(this.createDiagnostic(
          block.startLine,
          0,
          block.endLine,
          0,
          'Action block must contain valid YAML object',
          DiagnosticSeverity.Error,
        ));
        return;
      }
      parsed = result as Record<string, unknown>;
    } catch {
      // YAML parse error
      diagnostics.push(this.createDiagnostic(
        block.startLine,
        0,
        block.endLine,
        0,
        'Invalid YAML syntax in action block',
        DiagnosticSeverity.Error,
      ));
      return;
    }

    // Check type field
    const actionType = parsed['type'] as string | undefined;
    if (!actionType) {
      diagnostics.push(this.createDiagnostic(
        block.startLine,
        0,
        block.endLine,
        0,
        'Action block is missing required "type" field',
        DiagnosticSeverity.Error,
      ));
      return;
    }

    // Validate action type exists
    const schema = ACTION_SCHEMAS.get(actionType as ActionType);
    if (!schema) {
      // Find the type line for precise range
      const typeLine = this.findLineInBlock(block, /^\s*type:/);
      const line = typeLine >= 0 ? typeLine : block.startLine;
      diagnostics.push(this.createDiagnostic(
        line,
        0,
        line,
        100,
        `Unknown action type: "${actionType}"`,
        DiagnosticSeverity.Error,
      ));
      return;
    }

    // Check required parameters
    for (const param of schema.parameters) {
      if (param.required && !(param.name in parsed)) {
        diagnostics.push(this.createDiagnostic(
          block.startLine,
          0,
          block.endLine,
          0,
          `Missing required parameter: "${param.name}"`,
          DiagnosticSeverity.Error,
        ));
      }
    }

    // Check unknown parameters
    // 'type' and 'label' are universal meta-fields valid on all action blocks
    const knownKeys = new Set(['type', 'label', ...schema.parameters.map((p) => p.name)]);
    for (const key of Object.keys(parsed)) {
      if (!knownKeys.has(key)) {
        const keyLine = this.findLineInBlock(block, new RegExp(`^\\s*${this.escapeRegex(key)}:`));
        const line = keyLine >= 0 ? keyLine : block.startLine;
        diagnostics.push(this.createDiagnostic(
          line,
          0,
          line,
          100,
          `Unknown parameter: "${key}" is not valid for action type "${actionType}"`,
          DiagnosticSeverity.Warning,
        ));
      }
    }

    // Validate steps for sequence actions
    if (actionType === 'sequence' && Array.isArray(parsed['steps'])) {
      this.validateSteps(block, parsed['steps'] as unknown[], diagnostics);
    }
  }

  /**
   * Validate individual step entries inside a sequence's steps: array.
   */
  private validateSteps(
    block: ActionBlockRange,
    steps: unknown[],
    diagnostics: DiagnosticResult[],
  ): void {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (typeof step !== 'object' || step === null) {
        continue;
      }

      const stepObj = step as Record<string, unknown>;
      const stepType = stepObj['type'] as string | undefined;

      // Each step must have a type
      if (!stepType) {
        const stepLine = this.findNthStepLine(block, i);
        const line = stepLine >= 0 ? stepLine : block.startLine;
        diagnostics.push(this.createDiagnostic(
          line, 0, line, 100,
          `Step ${i + 1}: missing required "type" field`,
          DiagnosticSeverity.Error,
        ));
        continue;
      }

      // Validate step type
      const stepSchema = ACTION_SCHEMAS.get(stepType as ActionType);
      if (!stepSchema) {
        const stepLine = this.findStepTypeLine(block, i, stepType);
        const line = stepLine >= 0 ? stepLine : block.startLine;
        diagnostics.push(this.createDiagnostic(
          line, 0, line, 100,
          `Step ${i + 1}: unknown action type "${stepType}"`,
          DiagnosticSeverity.Error,
        ));
        continue;
      }

      // Check required params for this step
      for (const param of stepSchema.parameters) {
        if (param.required && !(param.name in stepObj)) {
          const stepLine = this.findNthStepLine(block, i);
          const line = stepLine >= 0 ? stepLine : block.startLine;
          diagnostics.push(this.createDiagnostic(
            line, 0, line, 100,
            `Step ${i + 1} (${stepType}): missing required parameter "${param.name}"`,
            DiagnosticSeverity.Error,
          ));
        }
      }

      // Check unknown params in this step
      const stepKnownKeys = new Set(['type', 'label', ...stepSchema.parameters.map(p => p.name)]);
      for (const key of Object.keys(stepObj)) {
        if (!stepKnownKeys.has(key)) {
          // Find the line with this key inside the step
          const keyLine = this.findStepKeyLine(block, i, key);
          const line = keyLine >= 0 ? keyLine : block.startLine;
          diagnostics.push(this.createDiagnostic(
            line, 0, line, 100,
            `Step ${i + 1} (${stepType}): unknown parameter "${key}"`,
            DiagnosticSeverity.Warning,
          ));
        }
      }
    }
  }

  /**
   * Find the document line of the nth step's "- type:" entry.
   */
  private findNthStepLine(block: ActionBlockRange, stepIndex: number): number {
    const lines = block.content.split('\n');
    let count = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s+-\s/.test(lines[i])) {
        count++;
        if (count === stepIndex) {
          return block.startLine + 1 + i;
        }
      }
    }
    return -1;
  }

  /**
   * Find the document line of a step's "type: value" within the nth step.
   */
  private findStepTypeLine(block: ActionBlockRange, stepIndex: number, typeValue: string): number {
    const lines = block.content.split('\n');
    let count = -1;
    let inTargetStep = false;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s+-\s/.test(lines[i])) {
        count++;
        inTargetStep = count === stepIndex;
      }
      if (inTargetStep) {
        // Match "type: value" or "- type: value" 
        if (new RegExp(`^\\s*-?\\s*type:\\s*${this.escapeRegex(typeValue)}`).test(lines[i])) {
          return block.startLine + 1 + i;
        }
      }
      if (count > stepIndex) {
        break;
      }
    }
    return -1;
  }

  /**
   * Find the document line of a specific key inside the nth step.
   */
  private findStepKeyLine(block: ActionBlockRange, stepIndex: number, key: string): number {
    const lines = block.content.split('\n');
    let count = -1;
    let inTargetStep = false;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s+-\s/.test(lines[i])) {
        count++;
        inTargetStep = count === stepIndex;
      }
      if (inTargetStep) {
        if (new RegExp(`^\\s*-?\\s*${this.escapeRegex(key)}:`).test(lines[i])) {
          return block.startLine + 1 + i;
        }
      }
      if (count > stepIndex) {
        break;
      }
    }
    return -1;
  }

  /**
   * Find the line number of a pattern within a block's content range.
   */
  private findLineInBlock(block: ActionBlockRange, pattern: RegExp): number {
    const lines = block.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        // startLine is the ```action line, content starts at startLine + 1
        return block.startLine + 1 + i;
      }
    }
    return -1;
  }

  /**
   * Create a diagnostic result.
   */
  private createDiagnostic(
    startLine: number,
    startChar: number,
    endLine: number,
    endChar: number,
    message: string,
    severity: DiagnosticSeverity,
  ): DiagnosticResult {
    return {
      range: {
        start: { line: startLine, character: startChar },
        end: { line: endLine, character: endChar },
      },
      message,
      severity,
      source: this._source,
    };
  }

  /**
   * Escape special regex characters.
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Dispose the provider.
   */
  dispose(): void {
    this._disposed = true;
  }
}
