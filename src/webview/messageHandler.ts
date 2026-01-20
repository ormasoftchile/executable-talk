/**
 * Message handler with type guards and dispatch
 * Per contracts/message-protocol.md
 */

import {
  WebviewToHostMessage,
  NavigateMessage,
  ExecuteActionMessage,
  UndoMessage,
  RedoMessage,
  CloseMessage,
  ReadyMessage,
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

  const validTypes = ['navigate', 'executeAction', 'undo', 'redo', 'close', 'ready'];
  if (!validTypes.includes(data.type)) {
    return null;
  }

  return data as WebviewToHostMessage;
}
