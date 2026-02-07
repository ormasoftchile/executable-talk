/**
 * Sequence Executor - executes multiple actions in order
 * Per contracts/action-executor.md
 */

import { Action, SequenceParams, ActionType, createAction } from '../models/action';
import { ActionExecutor, ExecutionContext, ExecutionResult, BaseActionExecutor } from './types';
import { ValidationError, StepResult, SequenceErrorDetail } from './errors';
import { getActionRegistry } from './registry';

/**
 * Extended params that can include URL-encoded actions string
 */
interface SequenceParamsExtended extends Partial<SequenceParams> {
  actions?: string;
}

/**
 * Parse URL-encoded actions string into steps array
 * Format: "type1?param=value,type2?param=value"
 */
function parseActionsString(actionsStr: string): Array<{ type: ActionType; params: Record<string, unknown> }> {
  const actionParts = actionsStr.split(',');
  const steps: Array<{ type: ActionType; params: Record<string, unknown> }> = [];

  for (const actionPart of actionParts) {
    // Format: type?param=value&param2=value2
    const decoded = decodeURIComponent(actionPart);
    const [typeWithQuery] = decoded.split('?');
    const queryIndex = decoded.indexOf('?');
    const type = typeWithQuery as ActionType;
    const queryString = queryIndex >= 0 ? decoded.substring(queryIndex + 1) : '';

    const params: Record<string, unknown> = {};
    if (queryString) {
      const pairs = queryString.split('&');
      for (const pair of pairs) {
        const eqIndex = pair.indexOf('=');
        if (eqIndex >= 0) {
          const key = decodeURIComponent(pair.substring(0, eqIndex));
          const value = decodeURIComponent(pair.substring(eqIndex + 1));
          // Try to parse as number or boolean
          if (value === 'true') {
            params[key] = true;
          } else if (value === 'false') {
            params[key] = false;
          } else if (!isNaN(Number(value)) && value !== '') {
            params[key] = Number(value);
          } else {
            params[key] = value;
          }
        }
      }
    }

    steps.push({ type, params });
  }

  return steps;
}

/**
 * Step definition that supports both nested params and flat YAML-style keys.
 */
type StepDef = { type: ActionType; params?: Record<string, unknown>; [key: string]: unknown };

/**
 * Executor for sequence action type
 */
export class SequenceExecutor extends BaseActionExecutor implements ActionExecutor<SequenceParams> {
  readonly actionType = 'sequence' as const;
  readonly description = 'Executes a sequence of actions in order';
  readonly requiresTrust = false; // Determined by child actions
  override readonly defaultTimeoutMs = 120000; // 2 minutes for sequences

  validate(params: SequenceParamsExtended): void {
    // If using URL-encoded 'actions' string format
    if (params.actions && typeof params.actions === 'string') {
      // Will be parsed in execute
      return;
    }

    if (!params.steps || !Array.isArray(params.steps)) {
      throw new ValidationError('sequence', 'steps', 'steps is required and must be an array (or use actions string)');
    }

    if (params.steps.length === 0) {
      throw new ValidationError('sequence', 'steps', 'steps cannot be empty');
    }

    // Validate each step has required fields
    for (let i = 0; i < params.steps.length; i++) {
      const step = params.steps[i];
      if (!step.type || typeof step.type !== 'string') {
        throw new ValidationError('sequence', `steps[${i}].type`, 'each step must have a type');
      }
    }

    if (params.delay !== undefined && (typeof params.delay !== 'number' || params.delay < 0)) {
      throw new ValidationError('sequence', 'delay', 'delay must be a non-negative number');
    }
  }

  async execute(action: Action, context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now();
    const params = action.params as unknown as SequenceParamsExtended;

    try {
      this.validate(params);

      // Normalize steps — they may come from URL-encoded string, from the
      // model's ActionDefinition[] (with nested params), or from raw YAML
      // objects where params are flat siblings of `type`.
      let steps: StepDef[];
      if (params.actions && typeof params.actions === 'string') {
        steps = parseActionsString(params.actions);
      } else if (params.steps) {
        steps = (params.steps as unknown as Array<Record<string, unknown>>).map(raw => {
          // If step already has a params sub-object, pass through
          if (raw.params && typeof raw.params === 'object' && !Array.isArray(raw.params)) {
            return raw as StepDef;
          }
          // Otherwise, extract flat keys into params (YAML style)
          const extracted: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(raw)) {
            if (key !== 'type') {
              extracted[key] = value;
            }
          }
          return { type: raw.type as ActionType, params: extracted };
        });
      } else {
        return this.failure('No steps or actions provided', startTime);
      }

      const registry = getActionRegistry();
      const delay = params.delay ?? 500;
      const stopOnError = params.stopOnError ?? true;

      const completedUndos: Array<() => Promise<void>> = [];
      const stepResults: StepResult[] = [];

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepTarget = extractStepTarget(step);

        // Check for cancellation
        if (context.cancellationToken.isCancellationRequested) {
          // Mark remaining steps as skipped
          for (let j = i; j < steps.length; j++) {
            stepResults.push({
              type: steps[j].type,
              target: extractStepTarget(steps[j]),
              status: 'skipped',
            });
          }
          const failResult = this.failure('Sequence cancelled', startTime);
          failResult.sequenceDetail = buildSequenceDetail(steps, stepResults, i);
          return failResult;
        }

        // Get executor for step
        const executor = registry.get(step.type);
        if (!executor) {
          if (stopOnError) {
            stepResults.push({
              type: step.type,
              target: stepTarget,
              status: 'failed',
              error: `Unknown action type: ${step.type}`,
            });
            // Mark remaining as skipped
            for (let j = i + 1; j < steps.length; j++) {
              stepResults.push({
                type: steps[j].type,
                target: extractStepTarget(steps[j]),
                status: 'skipped',
              });
            }
            const failResult = this.failure(`Unknown action type in sequence: ${step.type}`, startTime);
            failResult.sequenceDetail = buildSequenceDetail(steps, stepResults, i);
            return failResult;
          }
          stepResults.push({
            type: step.type,
            target: stepTarget,
            status: 'skipped',
          });
          context.outputChannel.appendLine(`[sequence] Skipping unknown action type: ${step.type}`);
          continue;
        }

        // Create action for step (params already normalized above)
        const stepAction = createAction(step.type, step.params ?? {}, action.slideIndex);

        // Execute step
        context.outputChannel.appendLine(`[sequence] Executing step ${i + 1}/${steps.length}: ${step.type}`);
        const result = await executor.execute(stepAction, context);

        if (!result.success) {
          stepResults.push({
            type: step.type,
            target: stepTarget,
            status: 'failed',
            error: result.error,
          });

          if (stopOnError) {
            // Mark remaining as skipped
            for (let j = i + 1; j < steps.length; j++) {
              stepResults.push({
                type: steps[j].type,
                target: extractStepTarget(steps[j]),
                status: 'skipped',
              });
            }
            // Try to undo completed steps
            for (const undo of completedUndos.reverse()) {
              try {
                await undo();
              } catch (e) {
                context.outputChannel.appendLine(`[sequence] Undo failed: ${e}`);
              }
            }
            const failResult = this.failure(`Step ${i + 1} (${step.type}) failed: ${result.error}`, startTime);
            failResult.sequenceDetail = buildSequenceDetail(steps, stepResults, i);
            return failResult;
          }
          context.outputChannel.appendLine(`[sequence] Step ${i + 1} failed: ${result.error}`);
        } else {
          stepResults.push({
            type: step.type,
            target: stepTarget,
            status: 'success',
          });
          if (result.undo) {
            completedUndos.push(result.undo);
          }
        }

        // Delay between steps (except after last step)
        if (i < steps.length - 1 && delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      context.outputChannel.appendLine(`[sequence] Completed ${steps.length} steps`);

      return this.success(startTime, true, async () => {
        // Undo all steps in reverse order
        for (const undo of completedUndos.reverse()) {
          try {
            await undo();
          } catch (e) {
            context.outputChannel.appendLine(`[sequence] Undo failed: ${e}`);
          }
        }
      });
    } catch (error) {
      return this.failure(
        error instanceof Error ? error.message : 'Unknown error',
        startTime
      );
    }
  }
}

/**
 * Extract the primary target from a step's params (for toast display).
 */
function extractStepTarget(step: StepDef): string | undefined {
  const p = step.params ?? {};
  switch (step.type) {
    case 'file.open':
    case 'editor.highlight':
      return typeof p.path === 'string' ? p.path : undefined;
    case 'terminal.run':
      return typeof p.command === 'string' ? p.command : undefined;
    case 'debug.start':
      return typeof p.configName === 'string' ? p.configName : undefined;
    case 'vscode.command':
      return typeof p.id === 'string' ? p.id : undefined;
    default:
      return undefined;
  }
}

/**
 * Build SequenceErrorDetail from the collected step results.
 */
function buildSequenceDetail(
  steps: StepDef[],
  stepResults: StepResult[],
  failedIndex: number
): SequenceErrorDetail {
  return {
    totalSteps: steps.length,
    failedStepIndex: failedIndex,
    failedStepType: steps[failedIndex].type,
    stepResults,
  };
}
