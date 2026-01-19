/**
 * Sequence Executor - executes multiple actions in order
 * Per contracts/action-executor.md
 */

import { Action, SequenceParams, ActionType, createAction } from '../models/action';
import { ActionExecutor, ExecutionContext, ExecutionResult, BaseActionExecutor } from './types';
import { ValidationError } from './errors';
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

      // Parse steps from either format
      let steps: Array<{ type: ActionType; params: Record<string, unknown> }>;
      if (params.actions && typeof params.actions === 'string') {
        steps = parseActionsString(params.actions);
      } else if (params.steps) {
        steps = params.steps;
      } else {
        return this.failure('No steps or actions provided', startTime);
      }

      const registry = getActionRegistry();
      const delay = params.delay ?? 500;
      const stopOnError = params.stopOnError ?? true;

      const completedUndos: Array<() => Promise<void>> = [];

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];

        // Check for cancellation
        if (context.cancellationToken.isCancellationRequested) {
          return this.failure('Sequence cancelled', startTime);
        }

        // Get executor for step
        const executor = registry.get(step.type);
        if (!executor) {
          if (stopOnError) {
            return this.failure(`Unknown action type in sequence: ${step.type}`, startTime);
          }
          context.outputChannel.appendLine(`[sequence] Skipping unknown action type: ${step.type}`);
          continue;
        }

        // Create action for step
        const stepAction = createAction(step.type, step.params, action.slideIndex);

        // Execute step
        context.outputChannel.appendLine(`[sequence] Executing step ${i + 1}/${steps.length}: ${step.type}`);
        const result = await executor.execute(stepAction, context);

        if (!result.success) {
          if (stopOnError) {
            // Try to undo completed steps
            for (const undo of completedUndos.reverse()) {
              try {
                await undo();
              } catch (e) {
                context.outputChannel.appendLine(`[sequence] Undo failed: ${e}`);
              }
            }
            return this.failure(`Step ${i + 1} (${step.type}) failed: ${result.error}`, startTime);
          }
          context.outputChannel.appendLine(`[sequence] Step ${i + 1} failed: ${result.error}`);
        } else if (result.undo) {
          completedUndos.push(result.undo);
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
