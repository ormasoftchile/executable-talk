/**
 * Actions module exports
 */

export type { ActionExecutor, ExecutionContext, ExecutionResult } from './types';
export { BaseActionExecutor } from './types';
export { ActionRegistry, getActionRegistry } from './registry';
export { ValidationError, UnknownActionError, TimeoutError, TrustError } from './errors';

// Executors
export { FileOpenExecutor } from './fileOpenExecutor';
export { EditorHighlightExecutor, clearAllDecorations } from './editorHighlightExecutor';
export { TerminalRunExecutor, disposeAllTerminals } from './terminalRunExecutor';
export { DebugStartExecutor } from './debugStartExecutor';
export { SequenceExecutor } from './sequenceExecutor';

// Pipeline
export { executeWithPipeline, actionRequiresTrust, createExecutionContext } from './executionPipeline';

// Import executors and registry for registration
import { getActionRegistry } from './registry';
import { FileOpenExecutor } from './fileOpenExecutor';
import { EditorHighlightExecutor } from './editorHighlightExecutor';
import { TerminalRunExecutor } from './terminalRunExecutor';
import { DebugStartExecutor } from './debugStartExecutor';
import { SequenceExecutor } from './sequenceExecutor';

/**
 * Register all action executors
 */
export function registerAllExecutors(): void {
  const registry = getActionRegistry();

  registry.register(new FileOpenExecutor());
  registry.register(new EditorHighlightExecutor());
  registry.register(new TerminalRunExecutor());
  registry.register(new DebugStartExecutor());
  registry.register(new SequenceExecutor());
}
