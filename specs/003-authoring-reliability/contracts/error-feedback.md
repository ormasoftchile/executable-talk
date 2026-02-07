# Error Feedback Contract

**Feature**: 003-authoring-reliability  
**Date**: 2026-02-07  
**Version**: 1.0.0

## Overview

This document defines the contract for non-blocking error feedback during presentation. When an action fails at runtime, the webview displays a dismissible toast notification with structured error details. This extends the existing `ActionStatusChangedMessage` in the postMessage protocol.

---

## Extended Message Payload

### ActionStatusChangedMessage (extended)

```typescript
interface ActionStatusChangedMessage {
  type: 'actionStatusChanged';
  payload: {
    /** Existing fields */
    actionId: string;
    status: ActionStatus;      // 'pending' | 'running' | 'success' | 'failed' | 'timeout'
    error?: string;            // Human-readable error message

    /** NEW optional fields for rich error display */
    actionType?: ActionType;   // e.g., 'file.open', 'terminal.run'
    actionTarget?: string;     // e.g., 'src/main.ts', 'npm test'
    sequenceDetail?: SequenceErrorDetail;
  };
  messageId?: string;
}
```

### SequenceErrorDetail

```typescript
interface SequenceErrorDetail {
  /** Total number of steps in the sequence */
  totalSteps: number;
  /** Zero-based index of the step that failed */
  failedStepIndex: number;
  /** Action type of the failed step */
  failedStepType: ActionType;
  /** Ordered results for each step */
  stepResults: StepResult[];
}

interface StepResult {
  /** Step's action type */
  type: ActionType;
  /** Step's target (path, command, etc.) */
  target?: string;
  /** Outcome */
  status: 'success' | 'failed' | 'skipped';
  /** Error message if status is 'failed' */
  error?: string;
}
```

---

## Toast Notification Specification

### Layout

```
┌─────────────────────────────────────────────────┐
│                                                 │
│              SLIDE CONTENT                      │
│                                                 │
│                                                 │
│                          ┌────────────────────┐ │
│                          │ ❌ file.open failed │ │
│                          │ src/old-main.ts    │ │
│                          │ File not found     │ │
│                          │              [✕]   │ │
│                          ├────────────────────┤ │
│                          │ ⚠️ terminal.run     │ │
│                          │ npm test           │ │
│                          │ Exit code 1        │ │
│                          │              [✕]   │ │
│                          └────────────────────┘ │
│  ┌─────────────────────────┐                    │
│  │  ◀  3/10  ▶   toolbar  │                    │
│  └─────────────────────────┘                    │
└─────────────────────────────────────────────────┘
```

### Positioning

| Property | Value | Rationale |
|----------|-------|-----------|
| Container position | `fixed`, `bottom: 5rem`, `right: 1rem` | Clears navigation bar and toolbar |
| Stack direction | `column-reverse` | Newest toast at bottom, older push upward |
| Max visible | 5 | Prevents toast pile-up during rapid failures |
| z-index | 80 | Above slide content, below action overlay (100) |
| Width | `min(350px, 40vw)` | Readable without covering slide text |

### Animation

| Transition | Duration | Effect |
|------------|----------|--------|
| Entry | 300ms | Slide in from right (`translateX(100%) → 0`) |
| Exit (dismiss) | 200ms | Fade out + slide right (`opacity 1→0`, `translateX(0→50px)`) |
| Exit (auto) | 200ms | Same as manual dismiss |

### Auto-Dismiss Behavior

| Error Type | Behavior | Timeout |
|------------|----------|---------|
| Simple action failure | Auto-dismiss | 8 seconds |
| Trust-blocked action | Auto-dismiss | 8 seconds |
| Sequence partial failure | Persist | Until manually dismissed |
| Timeout error | Persist | Until manually dismissed |

**Hover pause**: Hovering over a toast pauses its auto-dismiss timer. Timer resumes on mouse-leave.

**Max count overflow**: When a 6th toast would appear, the oldest auto-dismissible toast is removed. Persistent toasts are never auto-removed by overflow.

---

## Toast Content Structure

### Simple Action Error

```
┌──────────────────────────────┐
│ 📄 file.open failed      [✕] │
│ src/old-main.ts              │
│ File not found in workspace  │
└──────────────────────────────┘
```

| Part | Source |
|------|--------|
| Icon | Derived from `actionType` (📄 file, 🔍 highlight, ▶ terminal, 🐛 debug) |
| Title | `"{actionType} failed"` |
| Target | `actionTarget` |
| Reason | `error` |

### Sequence Error

```
┌──────────────────────────────┐
│ 🔗 sequence failed       [✕] │
│ Step 3 of 5 failed           │
│                              │
│ ✅ 1. file.open              │
│ ✅ 2. editor.highlight       │
│ ❌ 3. terminal.run           │
│    └─ npm test: exit code 1  │
│ ⏭ 4. editor.highlight       │
│ ⏭ 5. file.open              │
└──────────────────────────────┘
```

| Part | Source |
|------|--------|
| Title | `"sequence failed"` |
| Summary | `"Step {failedStepIndex+1} of {totalSteps} failed"` |
| Step list | `stepResults[]` with status icons (✅ success, ❌ failed, ⏭ skipped) |
| Failed step detail | `stepResults[failedStepIndex].error` |

---

## Extension Host → Webview Data Flow

```
Action execution fails (in executionPipeline.ts)
  │
  ├── ExecutionResult { success: false, error: "..." }
  │
  ▼
Conductor handles failure (in conductor.ts)
  │
  ├── Extracts actionType and target from Action model
  ├── For sequences: builds SequenceErrorDetail from step results
  │
  ▼
postMessage to webview
  │
  ├── ActionStatusChangedMessage {
  │     actionId, status: 'failed', error,
  │     actionType, actionTarget, sequenceDetail?
  │   }
  │
  ▼
Webview message handler (in presentation.js)
  │
  ├── Detects status === 'failed' with actionType present
  ├── Creates toast DOM element from structured payload
  ├── Appends to toast container
  └── Sets auto-dismiss timer (if applicable)
```

---

## Backward Compatibility

- All new payload fields are **optional**
- If `actionType` is absent, webview falls back to existing behavior (CSS class toggle on action link)
- The existing `ErrorMessage` type continues to handle system-level errors (parse failures, unknown actions)
- `ActionStatusChangedMessage` handles action-lifecycle errors (execution failures)

---

## Webview CSS Classes

| Class | Purpose |
|-------|---------|
| `.toast-container` | Fixed-position container for all toasts |
| `.toast` | Individual toast notification |
| `.toast--error` | Error severity styling (red accent) |
| `.toast--warning` | Warning severity styling (yellow accent) |
| `.toast--entering` | Entry animation state |
| `.toast--exiting` | Exit animation state |
| `.toast__header` | Icon + title + dismiss button row |
| `.toast__target` | Action target text |
| `.toast__message` | Error message text |
| `.toast__steps` | Sequence step list |
| `.toast__step--success` | ✅ styling |
| `.toast__step--failed` | ❌ styling |
| `.toast__step--skipped` | ⏭ styling |
| `.toast__dismiss` | Dismiss button (✕) |
