# Webview ↔ Extension Host Message Protocol

**Feature**: 001-core-extension-mvp  
**Date**: 2026-01-19  
**Version**: 1.0.0

## Overview

This document defines the `postMessage` protocol between the Presentation Webview (UI) and the Extension Host (Conductor). All messages follow a typed envelope pattern.

---

## Message Envelope

### Base Structure

```typescript
interface Message<T extends string, P = unknown> {
  type: T;
  payload: P;
  messageId?: string;  // Optional for request/response correlation
}
```

---

## Webview → Extension Host Messages

### `navigate`

Request to navigate to a specific slide.

```typescript
interface NavigateMessage {
  type: 'navigate';
  payload: {
    direction: 'next' | 'prev' | 'first' | 'last' | 'goto';
    slideIndex?: number;  // Required when direction is 'goto'
  };
}
```

**Example**:
```json
{ "type": "navigate", "payload": { "direction": "next" } }
{ "type": "navigate", "payload": { "direction": "goto", "slideIndex": 5 } }
```

---

### `executeAction`

Request to execute an interactive action (clicked link/button).

```typescript
interface ExecuteActionMessage {
  type: 'executeAction';
  payload: {
    actionId: string;
  };
  messageId: string;  // For response correlation
}
```

**Example**:
```json
{ 
  "type": "executeAction", 
  "payload": { "actionId": "action-uuid-123" },
  "messageId": "msg-456"
}
```

---

### `undo`

Request to undo the last action/navigation.

```typescript
interface UndoMessage {
  type: 'undo';
  payload: {};
}
```

---

### `redo`

Request to redo a previously undone action.

```typescript
interface RedoMessage {
  type: 'redo';
  payload: {};
}
```

---

### `close`

Request to close the presentation.

```typescript
interface CloseMessage {
  type: 'close';
  payload: {};
}
```

---

### `ready`

Webview signals it has loaded and is ready to receive state.

```typescript
interface ReadyMessage {
  type: 'ready';
  payload: {};
}
```

---

## Extension Host → Webview Messages

### `slideChanged`

Notify Webview that the current slide has changed.

```typescript
interface SlideChangedMessage {
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
```

---

### `actionStatusChanged`

Notify Webview of action execution status updates.

```typescript
interface ActionStatusChangedMessage {
  type: 'actionStatusChanged';
  payload: {
    actionId: string;
    status: 'pending' | 'running' | 'success' | 'failed' | 'timeout';
    error?: string;
  };
  messageId?: string;  // Correlates to executeAction request
}
```

---

### `deckLoaded`

Send initial deck state after parsing.

```typescript
interface DeckLoadedMessage {
  type: 'deckLoaded';
  payload: {
    title: string;
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
```

---

### `error`

Notify Webview of an error condition.

```typescript
interface ErrorMessage {
  type: 'error';
  payload: {
    code: string;
    message: string;
    recoverable: boolean;
  };
}
```

**Error Codes**:
| Code | Description |
|------|-------------|
| `PARSE_ERROR` | Failed to parse .deck.md file |
| `ACTION_FAILED` | Action execution failed |
| `UNTRUSTED_WORKSPACE` | Action blocked due to workspace trust |
| `FILE_NOT_FOUND` | Referenced file does not exist |
| `TIMEOUT` | Action exceeded time limit |

---

### `trustStatusChanged`

Notify Webview when workspace trust status changes.

```typescript
interface TrustStatusChangedMessage {
  type: 'trustStatusChanged';
  payload: {
    isTrusted: boolean;
  };
}
```

---

## Message Flow Diagrams

### Presentation Startup

```
Webview                          Extension Host
   │                                    │
   │──────── ready ────────────────────▶│
   │                                    │
   │◀─────── deckLoaded ────────────────│
   │                                    │
   │  (onEnter actions execute)         │
   │◀─────── actionStatusChanged ───────│
   │                                    │
```

### Slide Navigation

```
Webview                          Extension Host
   │                                    │
   │──────── navigate(next) ───────────▶│
   │                                    │
   │  (snapshot current state)          │
   │  (execute onEnter actions)         │
   │                                    │
   │◀─────── slideChanged ──────────────│
   │◀─────── actionStatusChanged ───────│
   │                                    │
```

### Interactive Action

```
Webview                          Extension Host
   │                                    │
   │──────── executeAction ────────────▶│
   │         (messageId: "123")         │
   │                                    │
   │◀─────── actionStatusChanged ───────│
   │         (status: running)          │
   │         (messageId: "123")         │
   │                                    │
   │◀─────── actionStatusChanged ───────│
   │         (status: success)          │
   │         (messageId: "123")          │
   │                                    │
```

---

## TypeScript Type Definitions

```typescript
// Union type of all Webview → Host messages
type WebviewToHostMessage =
  | NavigateMessage
  | ExecuteActionMessage
  | UndoMessage
  | RedoMessage
  | CloseMessage
  | ReadyMessage;

// Union type of all Host → Webview messages
type HostToWebviewMessage =
  | SlideChangedMessage
  | ActionStatusChangedMessage
  | DeckLoadedMessage
  | ErrorMessage
  | TrustStatusChangedMessage;

// Type guards
function isNavigateMessage(msg: unknown): msg is NavigateMessage {
  return (msg as Message<string>).type === 'navigate';
}
// ... similar guards for other message types
```
