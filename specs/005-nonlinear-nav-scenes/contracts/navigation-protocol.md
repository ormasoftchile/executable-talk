# Contract: Navigation Protocol

**Feature**: 005-nonlinear-nav-scenes  
**Date**: 2026-02-07  
**Version**: 1.1.0 (extends message-protocol v1.0.0 from 001-core-extension-mvp)

## Overview

Extensions to the Webview ↔ Extension Host postMessage protocol for non-linear navigation, slide picker, and navigation history breadcrumb.

---

## New & Modified Messages: Webview → Extension Host

### `navigate` (MODIFIED — implement existing `goto` direction)

The `goto` direction and `slideIndex` payload are already defined in the protocol but unhandled. This feature implements them.

```typescript
// Existing definition — no schema change needed
interface NavigateMessage {
  type: 'navigate';
  payload: {
    direction: 'next' | 'prev' | 'first' | 'last' | 'goto';
    slideIndex?: number;  // Required when direction is 'goto'
  };
}
```

**New usage example** (slide picker selection):
```json
{ "type": "navigate", "payload": { "direction": "goto", "slideIndex": 14 } }
```

**Conductor behavior for `goto`**:
1. Validate `slideIndex` is in range `[0, deck.slides.length - 1]`
2. Push current slide to NavigationHistory
3. Capture state snapshot → push to StateStack
4. Navigate to `slideIndex`
5. Execute `onEnter` actions for target slide
6. Send `slideChanged` to Webview (with history payload extension)

---

### `goBack` (NEW)

Request to return to the previously viewed slide (not sequentially previous).

```typescript
interface GoBackMessage {
  type: 'goBack';
  payload: {};
}
```

**Conductor behavior**:
1. Query `NavigationHistory.goBack()` for `previousSlideIndex`
2. If `null`, ignore (already at start of history)
3. Otherwise, navigate to `previousSlideIndex` using the same `goto` flow

---

### `openSlidePicker` (NEW)

Request from extension host command (triggered by keybinding) to instruct the Webview to open the slide picker overlay.

> Note: This message flows **Extension Host → Webview** because the keybinding is handled by the extension, not the Webview.

```typescript
interface OpenSlidePickerMessage {
  type: 'openSlidePicker';
  payload: {};
}
```

---

## New & Modified Messages: Extension Host → Webview

### `slideChanged` (MODIFIED — extended payload)

Add navigation history breadcrumb data to the existing `slideChanged` message.

```typescript
interface SlideChangedMessage {
  type: 'slideChanged';
  payload: {
    // Existing fields
    slideIndex: number;
    totalSlides: number;
    slide: SlidePayload;
    canGoNext: boolean;
    canGoPrev: boolean;
    // NEW fields
    navigationHistory: NavigationHistoryBreadcrumb[];
    canGoBack: boolean;
  };
}

interface NavigationHistoryBreadcrumb {
  slideIndex: number;
  slideTitle: string;
  method: 'sequential' | 'jump' | 'scene-restore' | 'history-click' | 'go-back';
}
```

---

## Keyboard Shortcut → Command Flow

### Slide Picker (`Ctrl+G` / `Cmd+G`)

```
User presses Ctrl+G
    → VS Code keybinding: executableTalk.goToSlide
        (when: "activeWebviewPanelId == 'executableTalkPresentation'")
    → Command handler sends postMessage { type: 'openSlidePicker' } to Webview
    → Webview opens slide picker overlay
    → User selects slide 15
    → Webview sends { type: 'navigate', payload: { direction: 'goto', slideIndex: 14 } }
    → Conductor processes goto navigation
```

### Go Back (`Alt+Left` / `Alt+Left`)

```
User presses Alt+Left
    → Webview keydown handler sends { type: 'goBack' }
    → Conductor checks NavigationHistory.goBack()
    → Conductor navigates to previous slide
```

### Jump by Number (digit keys + Enter)

```
User types "15" then presses Enter
    → Webview accumulates digit input (with visual indicator)
    → On Enter, Webview sends { type: 'navigate', payload: { direction: 'goto', slideIndex: 14 } }
    → Conductor processes goto navigation
```
