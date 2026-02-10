/**
 * Message handler with type guards and dispatch
 * Per contracts/message-protocol.md, contracts/navigation-protocol.md,
 * and contracts/scene-store.md
 */

import {
  WebviewToHostMessage,
  NavigateMessage,
  ExecuteActionMessage,
  UndoMessage,
  RedoMessage,
  CloseMessage,
  ReadyMessage,
  VscodeCommandMessage,
  GoBackMessage,
  SaveSceneMessage,
  RestoreSceneMessage,
  DeleteSceneMessage,
  EnvSetupRequestMessage,
  RetryStepMessage,
  ResetToCheckpointMessage,
  RetryStepPayload,
  ResetToCheckpointPayload,
} from './messages';

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if message is a navigate message
 */
export function isNavigateMessage(msg: unknown): msg is NavigateMessage {
  return isMessage(msg) && msg.type === 'navigate';
}

/**
 * Check if message is an execute action message
 */
export function isExecuteActionMessage(msg: unknown): msg is ExecuteActionMessage {
  return isMessage(msg) && msg.type === 'executeAction';
}

/**
 * Check if message is an undo message
 */
export function isUndoMessage(msg: unknown): msg is UndoMessage {
  return isMessage(msg) && msg.type === 'undo';
}

/**
 * Check if message is a redo message
 */
export function isRedoMessage(msg: unknown): msg is RedoMessage {
  return isMessage(msg) && msg.type === 'redo';
}

/**
 * Check if message is a close message
 */
export function isCloseMessage(msg: unknown): msg is CloseMessage {
  return isMessage(msg) && msg.type === 'close';
}

/**
 * Check if message is a ready message
 */
export function isReadyMessage(msg: unknown): msg is ReadyMessage {
  return isMessage(msg) && msg.type === 'ready';
}

/**
 * Check if message is a vscode command message
 */
export function isVscodeCommandMessage(msg: unknown): msg is VscodeCommandMessage {
  return isMessage(msg) && msg.type === 'vscodeCommand';
}

/**
 * Check if message is a go back message
 */
export function isGoBackMessage(msg: unknown): msg is GoBackMessage {
  return isMessage(msg) && msg.type === 'goBack';
}

/**
 * Check if message is a save scene message
 */
export function isSaveSceneMessage(msg: unknown): msg is SaveSceneMessage {
  return isMessage(msg) && msg.type === 'saveScene';
}

/**
 * Check if message is a restore scene message
 */
export function isRestoreSceneMessage(msg: unknown): msg is RestoreSceneMessage {
  return isMessage(msg) && msg.type === 'restoreScene';
}

/**
 * Check if message is a delete scene message
 */
export function isDeleteSceneMessage(msg: unknown): msg is DeleteSceneMessage {
  return isMessage(msg) && msg.type === 'deleteScene';
}

/**
 * Check if message is an env setup request message
 */
export function isEnvSetupRequestMessage(msg: unknown): msg is EnvSetupRequestMessage {
  return isMessage(msg) && msg.type === 'envSetupRequest';
}

/**
 * Check if message is a retry step message
 */
export function isRetryStepMessage(msg: unknown): msg is RetryStepMessage {
  return isMessage(msg) && msg.type === 'retryStep';
}

/**
 * Check if message is a reset to checkpoint message
 */
export function isResetToCheckpointMessage(msg: unknown): msg is ResetToCheckpointMessage {
  return isMessage(msg) && msg.type === 'resetToCheckpoint';
}

/**
 * Base message type check
 */
function isMessage(msg: unknown): msg is { type: string } {
  return typeof msg === 'object' && msg !== null && 'type' in msg;
}

/**
 * Check if message is a valid webview message
 */
export function isWebviewMessage(msg: unknown): boolean {
  return isMessage(msg);
}

/**
 * Get the type of a message
 */
export function getMessageType(msg: unknown): string | undefined {
  return isMessage(msg) ? msg.type : undefined;
}

// ============================================================================
// Message Dispatcher
// ============================================================================

/**
 * Handler callbacks for each message type
 */
export interface MessageHandlers {
  onNavigate?: (message: NavigateMessage) => void | Promise<void>;
  onExecuteAction?: (message: ExecuteActionMessage) => void | Promise<void>;
  onUndo?: (message: UndoMessage) => void | Promise<void>;
  onRedo?: (message: RedoMessage) => void | Promise<void>;
  onClose?: (message: CloseMessage) => void | Promise<void>;
  onReady?: (message: ReadyMessage) => void | Promise<void>;
  onVscodeCommand?: (message: VscodeCommandMessage) => void | Promise<void>;
  onGoBack?: (message: GoBackMessage) => void | Promise<void>;
  onSaveScene?: (message: SaveSceneMessage) => void | Promise<void>;
  onRestoreScene?: (message: RestoreSceneMessage) => void | Promise<void>;
  onDeleteScene?: (message: DeleteSceneMessage) => void | Promise<void>;
  onEnvSetupRequest?: (message: EnvSetupRequestMessage) => void | Promise<void>;
  onRetryStep?: (payload: RetryStepPayload) => Promise<void>;
  onResetToCheckpoint?: (payload: ResetToCheckpointPayload) => Promise<void>;
}

/**
 * Create a message dispatcher for Webview messages
 */
export function createMessageDispatcher(handlers: MessageHandlers) {
  return async (message: unknown): Promise<void> => {
    if (!isMessage(message)) {
      console.warn('Invalid message received:', message);
      return;
    }

    try {
      if (isNavigateMessage(message) && handlers.onNavigate) {
        await handlers.onNavigate(message);
      } else if (isExecuteActionMessage(message) && handlers.onExecuteAction) {
        await handlers.onExecuteAction(message);
      } else if (isUndoMessage(message) && handlers.onUndo) {
        await handlers.onUndo(message);
      } else if (isRedoMessage(message) && handlers.onRedo) {
        await handlers.onRedo(message);
      } else if (isCloseMessage(message) && handlers.onClose) {
        await handlers.onClose(message);
      } else if (isReadyMessage(message) && handlers.onReady) {
        await handlers.onReady(message);
      } else if (isVscodeCommandMessage(message) && handlers.onVscodeCommand) {
        await handlers.onVscodeCommand(message);
      } else if (isGoBackMessage(message) && handlers.onGoBack) {
        await handlers.onGoBack(message);
      } else if (isSaveSceneMessage(message) && handlers.onSaveScene) {
        await handlers.onSaveScene(message);
      } else if (isRestoreSceneMessage(message) && handlers.onRestoreScene) {
        await handlers.onRestoreScene(message);
      } else if (isDeleteSceneMessage(message) && handlers.onDeleteScene) {
        await handlers.onDeleteScene(message);
      } else if (isEnvSetupRequestMessage(message) && handlers.onEnvSetupRequest) {
        await handlers.onEnvSetupRequest(message);
      } else if (isRetryStepMessage(message) && handlers.onRetryStep) {
        await handlers.onRetryStep(message.payload);
      } else if (isResetToCheckpointMessage(message) && handlers.onResetToCheckpoint) {
        await handlers.onResetToCheckpoint(message.payload);
      } else {
        console.warn('Unhandled message type:', (message as WebviewToHostMessage).type);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  };
}

/**
 * Parse a raw message from postMessage
 */
export function parseMessage(data: unknown): WebviewToHostMessage | null {
  if (!isMessage(data)) {
    return null;
  }

  const validTypes = [
    'navigate', 'executeAction', 'undo', 'redo', 'close', 'ready', 'vscodeCommand',
    'goBack', 'saveScene', 'restoreScene', 'deleteScene', 'envSetupRequest',
    'retryStep', 'resetToCheckpoint',
  ];
  if (!validTypes.includes(data.type)) {
    return null;
  }

  return data as WebviewToHostMessage;
}
