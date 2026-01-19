/**
 * Sequence Executor - executes multiple actions in order
 * Per contracts/action-executor.md
 */

import { Action, SequenceParams, createAction } from '../models/action';
import { ActionExecutor, ExecutionContext, ExecutionResult, BaseActionExecutor } from './types';
import { ValidationError } from './errors';
import { getActionRegistry } from './registry';

/**
 * Executor for sequence action type
 */
export class SequenceExecutor extends BaseActionExecutor implements ActionExecutor<SequenceParams> {
  readonly actionType = 'sequence' as const;
  readonly description = 'Executes a sequence of actions in order';
  readonly requiresTrust = false; // Determined by child actions
  override readonly defaultTimeoutMs = 120000; // 2 minutes for sequences

  validate(params: SequenceParams): void {
    if (!params.steps || !Array.isArray(params.steps)) {
      throw new ValidationError('sequence', 'steps', 'steps is required and must be an array');
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
    const params = action.params as unknown as SequenceParams;

    try {
      this.validate(params);

      const registry = getActionRegistry();
      const delay = params.delay ?? 500;
      const stopOnError = params.stopOnError ?? true;

      const completedUndos: Array<() => Promise<void>> = [];

      for (let i = 0; i < params.steps.length; i++) {
        const step = params.steps[i];

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
        context.outputChannel.appendLine(`[sequence] Executing step ${i + 1}/${params.steps.length}: ${step.type}`);
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
        if (i < params.steps.length - 1 && delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      context.outputChannel.appendLine(`[sequence] Completed ${params.steps.length} steps`);

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
