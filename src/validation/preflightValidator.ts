/**
 * Preflight Validator Orchestrator
 * Orchestrates all validation checks and produces a ValidationReport.
 * Per contracts/preflight-validation.md and T020.
 */

import { ValidationContext, ValidationReport, ValidationIssue } from './types';
import { FilePathValidator } from './filePathValidator';
import { LineRangeValidator } from './lineRangeValidator';
import { DebugConfigValidator } from './debugConfigValidator';
import { CommandAvailabilityValidator } from './commandValidator';
import { PlatformResolver, isPlatformCommandMap } from '../actions/platformResolver';
import { EnvFileLoader } from '../env/envFileLoader';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

/**
 * Action types that require workspace trust
 */
const TRUSTED_ACTION_TYPES = new Set(['terminal.run', 'debug.start']);

/**
 * Orchestrates preflight validation checks across the entire deck.
 */
export class PreflightValidator {
  /**
   * Run all validation checks and produce a report.
   */
  async validate(context: ValidationContext): Promise<ValidationReport> {
    const startTime = Date.now();
    const { deck } = context;

    // Count actions and render directives
    let actionCount = 0;
    let renderDirectiveCount = 0;
    for (const slide of deck.slides) {
      actionCount += slide.interactiveElements.length + slide.onEnterActions.length;
      renderDirectiveCount += slide.renderDirectives.length;
    }

    // If cancelled before starting, return empty report
    if (context.cancellationToken.isCancellationRequested) {
      return this.buildReport(deck.filePath, startTime, [], 0, deck.slides.length, actionCount, renderDirectiveCount);
    }

    // Collect all issues
    const allIssues: ValidationIssue[] = [];
    let checksPerformed = 0;

    // Phase 1: File path checks (parallel)
    const fileValidator = new FilePathValidator();
    const fileIssues = await fileValidator.run(context);
    allIssues.push(...fileIssues);
    checksPerformed++;

    if (context.cancellationToken.isCancellationRequested) {
      return this.buildReport(deck.filePath, startTime, allIssues, checksPerformed, deck.slides.length, actionCount, renderDirectiveCount);
    }

    // Phase 2: Line range checks (parallel, after file paths)
    const lineValidator = new LineRangeValidator();
    const lineIssues = await lineValidator.run(context);
    allIssues.push(...lineIssues);
    checksPerformed++;

    if (context.cancellationToken.isCancellationRequested) {
      return this.buildReport(deck.filePath, startTime, allIssues, checksPerformed, deck.slides.length, actionCount, renderDirectiveCount);
    }

    // Phase 3: Command PATH checks (parallel)
    const cmdValidator = new CommandAvailabilityValidator();
    const cmdIssues = await cmdValidator.run(context);
    allIssues.push(...cmdIssues);
    checksPerformed++;

    if (context.cancellationToken.isCancellationRequested) {
      return this.buildReport(deck.filePath, startTime, allIssues, checksPerformed, deck.slides.length, actionCount, renderDirectiveCount);
    }

    // Phase 4: Debug config + trust checks (sync)
    const debugValidator = new DebugConfigValidator();
    const debugIssues = await debugValidator.run(context);
    allIssues.push(...debugIssues);
    checksPerformed++;

    // Trust check for trust-requiring actions in untrusted workspace
    if (!context.isTrusted) {
      const trustIssues = this.checkTrust(context);
      allIssues.push(...trustIssues);
    }
    checksPerformed++;

    // Phase 5: Cross-platform command coverage check
    const platformIssues = this.checkPlatformCoverage(context);
    allIssues.push(...platformIssues);
    checksPerformed++;

    // Phase 6: Environment variable validation (Feature 006 — T025)
    if (context.envDeclarations && context.envDeclarations.length > 0) {
      const envIssues = await this.validateEnvironment(context);
      allIssues.push(...envIssues);
      checksPerformed++;
    }

    return this.buildReport(deck.filePath, startTime, allIssues, checksPerformed, deck.slides.length, actionCount, renderDirectiveCount);
  }

  /**
   * Check trust requirements for actions in untrusted workspaces.
   */
  private checkTrust(context: ValidationContext): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const slide of context.deck.slides) {
      for (const el of slide.interactiveElements) {
        if (TRUSTED_ACTION_TYPES.has(el.action.type)) {
          issues.push({
            severity: 'warning',
            slideIndex: slide.index,
            source: el.action.type,
            message: `Action '${el.action.type}' requires Workspace Trust (workspace is untrusted)`,
          });
        }
      }
      for (const action of slide.onEnterActions) {
        if (TRUSTED_ACTION_TYPES.has(action.type)) {
          issues.push({
            severity: 'warning',
            slideIndex: slide.index,
            source: action.type,
            message: `Action '${action.type}' requires Workspace Trust (workspace is untrusted)`,
          });
        }
      }
    }

    return issues;
  }

  /**
   * Check cross-platform command coverage for terminal.run actions
   * with PlatformCommandMap commands.
   */
  private checkPlatformCoverage(context: ValidationContext): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const resolver = new PlatformResolver();

    for (const slide of context.deck.slides) {
      // Check interactive elements
      for (const el of slide.interactiveElements) {
        if (el.action.type === 'terminal.run') {
          const command = el.action.params.command;
          if (isPlatformCommandMap(command)) {
            const result = resolver.validate(command);
            if (!result.isValid && result.warning) {
              issues.push({
                severity: 'warning',
                slideIndex: slide.index,
                source: 'terminal.run',
                message: `Slide ${slide.index + 1}: ${result.warning}`,
              });
            }
          }
        }
      }

      // Check onEnter actions
      for (const action of slide.onEnterActions) {
        if (action.type === 'terminal.run') {
          const command = action.params.command;
          if (isPlatformCommandMap(command)) {
            const result = resolver.validate(command);
            if (!result.isValid && result.warning) {
              issues.push({
                severity: 'warning',
                slideIndex: slide.index,
                source: 'terminal.run',
                message: `Slide ${slide.index + 1}: ${result.warning}`,
              });
            }
          }
        }
      }
    }

    return issues;
  }

  /**
   * Phase 6: Environment variable validation (Feature 006 — T025)
   */
  private async validateEnvironment(context: ValidationContext): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    const envFileLoader = new EnvFileLoader();
    const deckFilePath = context.deck.filePath;
    const envFile = await envFileLoader.loadEnvFile(deckFilePath);

    // 6a: Check .deck.env existence
    if (!envFile.exists && context.envDeclarations!.length > 0) {
      issues.push({
        severity: 'warning',
        message: 'No .deck.env file found. Environment variables will use defaults or be unresolved.',
        source: 'env',
        slideIndex: -1,
      });
    }

    // 6b: Check .deck.env parse errors
    for (const error of envFile.errors) {
      issues.push({
        severity: 'warning',
        message: `Malformed line ${error.line} in .deck.env: ${error.rawText}`,
        source: 'env',
        slideIndex: -1,
      });
    }

    // 6c: Use pre-resolved env from context
    if (context.resolvedEnv) {
      for (const [name, variable] of context.resolvedEnv.variables) {
        if (variable.status === 'missing-required') {
          issues.push({
            severity: 'error',
            message: `Required environment variable '${name}' is not set in .deck.env`,
            source: 'env',
            slideIndex: -1,
          });
        }

        if (variable.status === 'resolved-invalid' && variable.validationResult) {
          issues.push({
            severity: 'warning',
            message: `Environment variable '${name}' failed validation: ${variable.validationResult.message}`,
            source: 'env',
            slideIndex: -1,
          });
        }
      }
    }

    // 6d: Check .gitignore coverage
    if (envFile.exists) {
      const gitignored = await this.checkGitignore(deckFilePath);
      if (!gitignored) {
        issues.push({
          severity: 'warning',
          message: '.deck.env file is not covered by .gitignore. Secrets may be committed.',
          source: 'env',
          slideIndex: -1,
        });
      }
    }

    // 6e: Warn about unused variables in .deck.env
    const declaredNames = new Set(context.envDeclarations!.map(d => d.name));
    for (const key of envFile.values.keys()) {
      if (!declaredNames.has(key)) {
        issues.push({
          severity: 'info',
          message: `Variable '${key}' in .deck.env is not declared in deck frontmatter`,
          source: 'env',
          slideIndex: -1,
        });
      }
    }

    return issues;
  }

  /**
   * Check if .deck.env is covered by .gitignore.
   */
  private async checkGitignore(deckFilePath: string): Promise<boolean> {
    const envFilePath = deckFilePath.replace(/\.deck\.md$/, '.deck.env');

    // Primary: use git check-ignore
    try {
      return await new Promise<boolean>((resolve) => {
        exec(
          `git check-ignore -q "${envFilePath}"`,
          { cwd: path.dirname(deckFilePath) },
          (error) => {
            // exit code 0 = ignored, 1 = not ignored
            resolve(!error);
          },
        );
      });
    } catch {
      // Fallback: string search in .gitignore
      return this.checkGitignoreFallback(deckFilePath);
    }
  }

  /**
   * Fallback .gitignore check — scan for *.deck.env pattern.
   */
  private checkGitignoreFallback(deckFilePath: string): boolean {
    const patterns = ['*.deck.env', '.deck.env', '*.env'];
    const gitignorePath = path.join(path.dirname(deckFilePath), '.gitignore');
    try {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      return patterns.some(p => content.includes(p));
    } catch {
      return false;
    }
  }

  private buildReport(
    deckFilePath: string,
    startTime: number,
    issues: ValidationIssue[],
    checksPerformed: number,
    slideCount: number,
    actionCount: number,
    renderDirectiveCount: number
  ): ValidationReport {
    const hasErrors = issues.some((i) => i.severity === 'error');
    return {
      deckFilePath,
      timestamp: Date.now(),
      durationMs: Date.now() - startTime,
      issues,
      checksPerformed,
      slideCount,
      actionCount,
      renderDirectiveCount,
      passed: !hasErrors,
    };
  }
}
