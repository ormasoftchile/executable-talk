/**
 * Message protocol types for Webview ↔ Extension Host communication
 * Per contracts/message-protocol.md, contracts/navigation-protocol.md,
 * and contracts/scene-store.md
 */

import { ActionStatus, ActionType } from '../models/action';
import { NavigationHistoryBreadcrumb } from '../models/deck';
import { EnvStatus } from '../models/env';
import { SequenceErrorDetail } from '../actions/errors';

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
    /** When navigating backwards, show all fragments on the target slide */
    showAllFragments?: boolean;
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
 * Go back to the previously viewed slide (not sequentially previous).
 * Per contracts/navigation-protocol.md.
 */
export interface GoBackMessage {
  type: 'goBack';
  payload: Record<string, never>;
}

/**
 * Save the current IDE state as a named scene.
 * Per contracts/scene-store.md.
 */
export interface SaveSceneMessage {
  type: 'saveScene';
  payload: {
    sceneName: string;
  };
}

/**
 * Restore a previously saved scene.
 * Per contracts/scene-store.md.
 */
export interface RestoreSceneMessage {
  type: 'restoreScene';
  payload: {
    sceneName: string;
  };
}

/**
 * Delete a runtime-saved scene.
 * Per contracts/scene-store.md.
 */
export interface DeleteSceneMessage {
  type: 'deleteScene';
  payload: {
    sceneName: string;
  };
}

/**
 * Retry the current onboarding step (re-navigate and reset status).
 */
export interface RetryStepMessage {
  type: 'retryStep';
  payload: {
    stepIndex: number;
  };
}

/**
 * Reset to the checkpoint saved for a given step.
 */
export interface ResetToCheckpointMessage {
  type: 'resetToCheckpoint';
  payload: {
    stepIndex: number;
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
  | VscodeCommandMessage
  | GoBackMessage
  | SaveSceneMessage
  | RestoreSceneMessage
  | DeleteSceneMessage
  | EnvSetupRequestMessage
  | RetryStepMessage
  | ResetToCheckpointMessage;

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
    /** Show all fragments (when navigating backwards) */
    showAllFragments?: boolean;
    /** Total number of fragments in this slide */
    fragmentCount?: number;
    /** Recent navigation history trail. Per contracts/navigation-protocol.md. */
    navigationHistory?: NavigationHistoryBreadcrumb[];
    /** Whether the user can navigate back (history has entries). */
    canGoBack?: boolean;
    /** Total number of entries in the navigation history (may exceed the breadcrumb slice). */
    totalHistoryEntries?: number;
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
    /** NEW: Action type for rich error display (per error-feedback contract, T026) */
    actionType?: ActionType;
    /** NEW: Primary target of the action (file path, command, config name) */
    actionTarget?: string;
    /** NEW: Structured sequence failure detail */
    sequenceDetail?: SequenceErrorDetail;
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
    /** Environment variable status (Feature 006) */
    envStatus?: EnvStatus;
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
 * Render block update (for async content loading)
 */
export interface RenderBlockUpdateMessage {
  type: 'renderBlockUpdate';
  payload: {
    blockId: string;
    html: string;
    status: 'loading' | 'success' | 'error' | 'streaming';
    streamChunk?: string;
    isError?: boolean;
  };
}

/**
 * Request the Webview to open the slide picker dialog.
 * Per contracts/navigation-protocol.md.
 */
export interface OpenSlidePickerMessage {
  type: 'openSlidePicker';
  payload: {
    slides: Array<{ index: number; title: string }>;
    currentIndex: number;
  };
}

/**
 * Request the Webview to open the scene picker dialog.
 * Per contracts/scene-store.md.
 */
export interface OpenScenePickerMessage {
  type: 'openScenePicker';
  payload: {
    scenes: SceneListItem[];
  };
}

/**
 * A scene item in the scene picker.
 */
export interface SceneListItem {
  name: string;
  slideIndex: number;
  isAuthored: boolean;
  timestamp?: number;
}

/**
 * Request the Webview to open the scene name input dialog.
 * Per contracts/scene-store.md.
 */
export interface OpenSceneNameInputMessage {
  type: 'openSceneNameInput';
  payload: Record<string, never>;
}

/**
 * Notify the Webview of scene list changes.
 * Per contracts/scene-store.md.
 */
export interface SceneChangedMessage {
  type: 'sceneChanged';
  payload: {
    scenes: SceneListItem[];
    activeSceneName?: string;
  };
}

/**
 * Non-blocking warning notification.
 * Per contracts/navigation-protocol.md (e.g., "end of deck" bounce).
 */
export interface WarningMessage {
  type: 'warning';
  payload: {
    code: string;
    message: string;
  };
}

/**
 * Environment variable status changed notification (Feature 006).
 */
export interface EnvStatusChangedMessage {
  type: 'envStatusChanged';
  payload: {
    envStatus: EnvStatus;
  };
}

/**
 * Webview requests env setup assistance (Feature 006).
 */
export interface EnvSetupRequestMessage {
  type: 'envSetupRequest';
  payload: Record<string, never>;
}

/**
 * A single onboarding step's status has changed.
 */
export interface StepStatusChangedMessage {
  type: 'stepStatusChanged';
  payload: {
    stepIndex: number;
    status: import('../models/onboarding').StepStatus;
    validationResult?: import('../models/onboarding').ValidationResult;
  };
}

/**
 * Full onboarding state sent on deck load.
 */
export interface OnboardingStateLoadedMessage {
  type: 'onboardingStateLoaded';
  payload: {
    steps: Array<{
      slideIndex: number;
      checkpoint?: string;
      status: import('../models/onboarding').StepStatus;
    }>;
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
  | TrustStatusChangedMessage
  | RenderBlockUpdateMessage
  | OpenSlidePickerMessage
  | OpenScenePickerMessage
  | OpenSceneNameInputMessage
  | SceneChangedMessage
  | WarningMessage
  | EnvStatusChangedMessage
  | StepStatusChangedMessage
  | OnboardingStateLoadedMessage;

// ============================================================================
// Payload types for convenience
// ============================================================================

export type SlideChangedPayload = SlideChangedMessage['payload'];
export type ActionStatusChangedPayload = ActionStatusChangedMessage['payload'];
export type DeckLoadedPayload = DeckLoadedMessage['payload'];
export type ErrorPayload = ErrorMessage['payload'];
export type TrustStatusChangedPayload = TrustStatusChangedMessage['payload'];
export type RenderBlockUpdatePayload = RenderBlockUpdateMessage['payload'];
export type OpenSlidePickerPayload = OpenSlidePickerMessage['payload'];
export type OpenScenePickerPayload = OpenScenePickerMessage['payload'];
export type OpenSceneNameInputPayload = OpenSceneNameInputMessage['payload'];
export type SceneChangedPayload = SceneChangedMessage['payload'];
export type WarningPayload = WarningMessage['payload'];
export type EnvStatusChangedPayload = EnvStatusChangedMessage['payload'];
export type SaveScenePayload = SaveSceneMessage['payload'];
export type RestoreScenePayload = RestoreSceneMessage['payload'];
export type DeleteScenePayload = DeleteSceneMessage['payload'];
export type StepStatusChangedPayload = StepStatusChangedMessage['payload'];
export type OnboardingStateLoadedPayload = OnboardingStateLoadedMessage['payload'];
export type RetryStepPayload = RetryStepMessage['payload'];
export type ResetToCheckpointPayload = ResetToCheckpointMessage['payload'];

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
