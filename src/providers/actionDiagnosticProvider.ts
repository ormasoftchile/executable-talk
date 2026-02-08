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
import { EnvRuleValidator } from '../validation/envRuleValidator';

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

    // Collect declared env variable names from frontmatter
    const declaredEnvNames = this.extractDeclaredEnvNames(document);

    for (const block of blocks) {
      this.validateBlock(block, diagnostics);
      this.validateEnvReferences(block, declaredEnvNames, diagnostics);
    }

    // Validate env: frontmatter block
    this.validateEnvFrontmatter(document, diagnostics);

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
   * Extract declared env variable names from YAML frontmatter env: block.
   */
  private extractDeclaredEnvNames(
    document: { lineCount: number; lineAt(line: number): { text: string } },
  ): Set<string> {
    const names = new Set<string>();
    const text = this.getDocumentText(document);

    // Quick check: does it have frontmatter?
    const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) {
      return names;
    }

    try {
      const fm = yaml.load(fmMatch[1]) as Record<string, unknown>;
      if (fm && Array.isArray(fm['env'])) {
        for (const entry of fm['env']) {
          if (typeof entry === 'object' && entry !== null && typeof (entry as Record<string, unknown>)['name'] === 'string') {
            names.add((entry as Record<string, unknown>)['name'] as string);
          }
        }
      }
    } catch {
      // Ignore frontmatter parse errors — not our responsibility here
    }

    return names;
  }

  /**
   * Check {{VAR}} references in action block params for undeclared env variables.
   * Diagnostic code: env-undeclared-ref (Warning)
   */
  private validateEnvReferences(
    block: ActionBlockRange,
    declaredNames: Set<string>,
    diagnostics: DiagnosticResult[],
  ): void {
    // If no env declarations at all, skip (no env: block means {{VAR}} is just literal text)
    if (declaredNames.size === 0) {
      return;
    }

    const lines = block.content.split('\n');
    const varRefPattern = /\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g;

    for (let i = 0; i < lines.length; i++) {
      let match: RegExpExecArray | null;
      varRefPattern.lastIndex = 0;
      while ((match = varRefPattern.exec(lines[i])) !== null) {
        const varName = match[1];
        if (!declaredNames.has(varName)) {
          const docLine = block.startLine + 1 + i;
          diagnostics.push(this.createDiagnostic(
            docLine,
            match.index,
            docLine,
            match.index + match[0].length,
            `Environment variable '${varName}' referenced but not declared in frontmatter`,
            DiagnosticSeverity.Warning,
          ));
        }
      }
    }
  }

  /**
   * Validate the env: block in YAML frontmatter for structural issues.
   * Diagnostic codes: env-duplicate-name, env-invalid-name, env-invalid-rule
   */
  private validateEnvFrontmatter(
    document: { lineCount: number; lineAt(line: number): { text: string } },
    diagnostics: DiagnosticResult[],
  ): void {
    const text = this.getDocumentText(document);
    const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) {
      return;
    }

    let fm: Record<string, unknown>;
    try {
      const parsed = yaml.load(fmMatch[1]);
      if (typeof parsed !== 'object' || parsed === null) {
        return;
      }
      fm = parsed as Record<string, unknown>;
    } catch {
      return;
    }

    if (!Array.isArray(fm['env'])) {
      return;
    }

    // Find the line where env: starts in the document (for diagnostic ranges)
    let envBlockStartLine = -1;
    for (let i = 0; i < document.lineCount; i++) {
      if (/^\s*env:\s*$/.test(document.lineAt(i).text)) {
        envBlockStartLine = i;
        break;
      }
    }

    const envRuleValidator = new EnvRuleValidator();
    const namePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
    const seenNames = new Set<string>();

    for (let idx = 0; idx < (fm['env'] as unknown[]).length; idx++) {
      const entry = (fm['env'] as unknown[])[idx];
      if (typeof entry !== 'object' || entry === null) {
        continue;
      }
      const obj = entry as Record<string, unknown>;
      const name = obj['name'] as string | undefined;
      const validate = obj['validate'] as string | undefined;

      // Find the line for this entry's "- name:" in the document
      const entryLine = this.findEnvEntryLine(document, envBlockStartLine, idx);

      // env-invalid-name
      if (typeof name === 'string' && !namePattern.test(name)) {
        const line = entryLine >= 0 ? entryLine : (envBlockStartLine >= 0 ? envBlockStartLine : 0);
        diagnostics.push(this.createDiagnostic(
          line, 0, line, 100,
          `Invalid variable name: '${name}' (must match [A-Za-z_][A-Za-z0-9_]*)`,
          DiagnosticSeverity.Error,
        ));
      }

      // env-duplicate-name
      if (typeof name === 'string' && seenNames.has(name)) {
        const line = entryLine >= 0 ? entryLine : (envBlockStartLine >= 0 ? envBlockStartLine : 0);
        diagnostics.push(this.createDiagnostic(
          line, 0, line, 100,
          `Duplicate environment variable name: '${name}'`,
          DiagnosticSeverity.Error,
        ));
      }
      if (typeof name === 'string') {
        seenNames.add(name);
      }

      // env-invalid-rule
      if (typeof validate === 'string' && !envRuleValidator.isValidRule(validate)) {
        const ruleLine = this.findEnvPropertyLine(document, envBlockStartLine, idx, 'validate');
        const line = ruleLine >= 0 ? ruleLine : (entryLine >= 0 ? entryLine : 0);
        diagnostics.push(this.createDiagnostic(
          line, 0, line, 100,
          `Unknown validation rule: '${validate}'`,
          DiagnosticSeverity.Error,
        ));
      }
    }
  }

  /**
   * Find the document line for the nth env entry's "- name:" line.
   */
  private findEnvEntryLine(
    document: { lineCount: number; lineAt(line: number): { text: string } },
    envBlockStart: number,
    entryIndex: number,
  ): number {
    if (envBlockStart < 0) {
      return -1;
    }
    let count = -1;
    for (let i = envBlockStart + 1; i < document.lineCount; i++) {
      const text = document.lineAt(i).text;
      // End of frontmatter
      if (/^---/.test(text)) {
        break;
      }
      // Entry start: "  - name:" pattern
      if (/^\s+-\s/.test(text)) {
        count++;
        if (count === entryIndex) {
          return i;
        }
      }
    }
    return -1;
  }

  /**
   * Find the document line for a specific property within the nth env entry.
   */
  private findEnvPropertyLine(
    document: { lineCount: number; lineAt(line: number): { text: string } },
    envBlockStart: number,
    entryIndex: number,
    property: string,
  ): number {
    if (envBlockStart < 0) {
      return -1;
    }
    let count = -1;
    let inTargetEntry = false;
    for (let i = envBlockStart + 1; i < document.lineCount; i++) {
      const text = document.lineAt(i).text;
      if (/^---/.test(text)) {
        break;
      }
      if (/^\s+-\s/.test(text)) {
        count++;
        inTargetEntry = count === entryIndex;
      }
      if (inTargetEntry && count > entryIndex) {
        break;
      }
      if (inTargetEntry) {
        const propPattern = new RegExp(`^\\s*${this.escapeRegex(property)}:`);
        if (propPattern.test(text)) {
          return i;
        }
      }
    }
    return -1;
  }

  /**
   * Get full text from document.
   */
  private getDocumentText(
    document: { lineCount: number; lineAt(line: number): { text: string } },
  ): string {
    const lines: string[] = [];
    for (let i = 0; i < document.lineCount; i++) {
      lines.push(document.lineAt(i).text);
    }
    return lines.join('\n');
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
