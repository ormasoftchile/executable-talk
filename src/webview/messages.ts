/**
 * Message protocol types for Webview ↔ Extension Host communication
 * Per contracts/message-protocol.md
 */

import { ActionStatus } from '../models/action';

// ============================================================================
// Webview → Extension Host Messages
// ============================================================================

/**
 * Navigate to a specific slide
 */
export interface NavigateMessage {
  type: 'navigate';
  payload: {
    direction: 'next' | 'prev' | 'first' | 'last' | 'goto';
    slideIndex?: number;
  };
}

/**
 * Execute an interactive action
 */
export interface ExecuteActionMessage {
  type: 'executeAction';
  payload: {
    actionId: string;
  };
  messageId: string;
}

/**
 * Undo the last action
 */
export interface UndoMessage {
  type: 'undo';
  payload: Record<string, never>;
}

/**
 * Redo a previously undone action
 */
export interface RedoMessage {
  type: 'redo';
  payload: Record<string, never>;
}

/**
 * Close the presentation
 */
export interface CloseMessage {
  type: 'close';
  payload: Record<string, never>;
}

/**
 * Webview is ready to receive state
 */
export interface ReadyMessage {
  type: 'ready';
  payload: Record<string, never>;
}

/**
 * Execute a VS Code command from toolbar
 */
export interface VscodeCommandMessage {
  type: 'vscodeCommand';
  payload: {
    commandId: string;
    args?: unknown[];
  };
}

/**
 * Union of all Webview → Host messages
 */
export type WebviewToHostMessage =
  | NavigateMessage
  | ExecuteActionMessage
  | UndoMessage
  | RedoMessage
  | CloseMessage
  | ReadyMessage
  | VscodeCommandMessage;

// ============================================================================
// Extension Host → Webview Messages
// ============================================================================

/**
 * Current slide has changed
 */
export interface SlideChangedMessage {
  type: 'slideChanged';
  payload: {
    slideIndex: number;
    slideHtml: string;
    speakerNotes?: string;
    totalSlides: number;
    canUndo: boolean;
    canRedo: boolean;
  };
}

/**
 * Action execution status update
 */
export interface ActionStatusChangedMessage {
  type: 'actionStatusChanged';
  payload: {
    actionId: string;
    status: ActionStatus;
    error?: string;
  };
  messageId?: string;
}

/**
 * Initial deck state after parsing
 */
export interface DeckLoadedMessage {
  type: 'deckLoaded';
  payload: {
    title?: string;
    author?: string;
    totalSlides: number;
    currentSlideIndex: number;
    slideHtml: string;
    speakerNotes?: string;
    interactiveElements: Array<{
      id: string;
      label: string;
      actionType: string;
    }>;
  };
}

/**
 * Error notification
 */
export interface ErrorMessage {
  type: 'error';
  payload: {
    code: string;
    message: string;
    recoverable: boolean;
  };
}

/**
 * Workspace trust status changed
 */
export interface TrustStatusChangedMessage {
  type: 'trustStatusChanged';
  payload: {
    isTrusted: boolean;
  };
}

/**
 * Union of all Host → Webview messages
 */
export type HostToWebviewMessage =
  | SlideChangedMessage
  | ActionStatusChangedMessage
  | DeckLoadedMessage
  | ErrorMessage
  | TrustStatusChangedMessage;

// ============================================================================
// Payload types for convenience
// ============================================================================

export type SlideChangedPayload = SlideChangedMessage['payload'];
export type ActionStatusChangedPayload = ActionStatusChangedMessage['payload'];
export type DeckLoadedPayload = DeckLoadedMessage['payload'];
export type ErrorPayload = ErrorMessage['payload'];
export type TrustStatusChangedPayload = TrustStatusChangedMessage['payload'];

// ============================================================================
// Error Codes
// ============================================================================

export const ErrorCodes = {
  PARSE_ERROR: 'PARSE_ERROR',
  ACTION_FAILED: 'ACTION_FAILED',
  UNTRUSTED_WORKSPACE: 'UNTRUSTED_WORKSPACE',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  TIMEOUT: 'TIMEOUT',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
