/**
 * Action Registry - central registry for action executors
 * Per contracts/action-executor.md
 */

import { ActionType } from '../models/action';
import { ActionExecutor } from './types';
import { UnknownActionError } from './errors';

/**
 * Central registry for action executors
 */
export class ActionRegistry {
  private readonly executors: Map<ActionType, ActionExecutor> = new Map();

  /**
   * Register an executor for an action type
   */
  register<T>(executor: ActionExecutor<T>): void {
    if (this.executors.has(executor.actionType)) {
      console.warn(`Overwriting existing executor for action type: ${executor.actionType}`);
    }
    this.executors.set(executor.actionType, executor as ActionExecutor);
  }

  /**
   * Get executor for action type
   * @throws UnknownActionError if not registered
   */
  get(actionType: ActionType): ActionExecutor {
    const executor = this.executors.get(actionType);
    if (!executor) {
      throw new UnknownActionError(actionType);
    }
    return executor;
  }

  /**
   * Check if action type is registered
   */
  has(actionType: ActionType): boolean {
    return this.executors.has(actionType);
  }

  /**
   * List all registered action types
   */
  listActionTypes(): ActionType[] {
    return Array.from(this.executors.keys());
  }

  /**
   * Get number of registered executors
   */
  get size(): number {
    return this.executors.size;
  }

  /**
   * Clear all registered executors
   */
  clear(): void {
    this.executors.clear();
  }
}

/**
 * Global action registry instance
 */
let globalRegistry: ActionRegistry | undefined;

/**
 * Get the global action registry
 */
export function getActionRegistry(): ActionRegistry {
  if (!globalRegistry) {
    globalRegistry = new ActionRegistry();
  }
  return globalRegistry;
}

/**
 * Reset the global action registry (for testing)
 */
export function resetActionRegistry(): void {
  globalRegistry = undefined;
}
