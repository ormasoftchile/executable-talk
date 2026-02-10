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
export { VscodeCommandExecutor } from './vscodeCommandExecutor';
export { ValidateCommandExecutor } from './validateCommandExecutor';
export { ValidateFileExistsExecutor } from './validateFileExistsExecutor';
export { ValidatePortExecutor } from './validatePortExecutor';

// Pipeline
export { executeWithPipeline, actionRequiresTrust, createExecutionContext } from './executionPipeline';

// Platform resolution
export { PlatformResolver } from './platformResolver';

// Import executors and registry for registration
import { getActionRegistry } from './registry';
import { FileOpenExecutor } from './fileOpenExecutor';
import { EditorHighlightExecutor } from './editorHighlightExecutor';
import { TerminalRunExecutor } from './terminalRunExecutor';
import { DebugStartExecutor } from './debugStartExecutor';
import { SequenceExecutor } from './sequenceExecutor';
import { VscodeCommandExecutor } from './vscodeCommandExecutor';
import { ValidateCommandExecutor } from './validateCommandExecutor';
import { ValidateFileExistsExecutor } from './validateFileExistsExecutor';
import { ValidatePortExecutor } from './validatePortExecutor';

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
  registry.register(new VscodeCommandExecutor());
  registry.register(new ValidateCommandExecutor());
  registry.register(new ValidateFileExistsExecutor());
  registry.register(new ValidatePortExecutor());
}
