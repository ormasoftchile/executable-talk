# Feature Specification: Executable Talk Core Extension MVP

**Feature Branch**: `001-core-extension-mvp`  
**Created**: 2026-01-19  
**Status**: Draft  
**Input**: Design Specification for VS Code extension that transforms technical presentations into executable narratives

## Clarifications

### Session 2026-01-19

- Q: What security model should govern terminal command execution? → A: Workspace trust required + confirmation for first use (Option B)
- Q: What should happen to the state history (limits/persistence)? → A: Session-only with limit, capped at 50 snapshots (Option A)
- Q: What delimiter should mark slide boundaries in `.deck.md` files? → A: Horizontal rule (`---`) separates slides (Option B)
- Q: Should keyboard navigation be global or Webview-scoped? → A: Webview-focused only (Option B)
- Q: How long should `editor.highlight` decorations persist? → A: Until slide exit (Option B)

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open and Navigate a Presentation Deck (Priority: P1)

As a technical presenter, I want to open a `.deck.md` file and navigate through slides in a fullscreen Webview so that I can deliver a polished presentation without leaving VS Code.

**Why this priority**: This is the foundational capability without slide rendering and navigation, no other features matter. It delivers immediate value by enabling presenters to view their content.

**Independent Test**: Can be fully tested by creating a simple `.deck.md` file, opening it in VS Code, and navigating between slides using keyboard/mouse. Delivers a basic presentation experience.

**Acceptance Scenarios**:

1. **Given** a valid `.deck.md` file in the workspace, **When** I run the "Open Presentation" command, **Then** a Webview panel opens displaying the first slide in fullscreen mode
2. **Given** an open presentation Webview, **When** I press the right arrow key or click "Next", **Then** the next slide is displayed with a smooth transition
3. **Given** I am on slide 5 of a 10-slide deck, **When** I press the left arrow key, **Then** I navigate back to slide 4
4. **Given** an open presentation, **When** I press Escape, **Then** the presentation closes and VS Code returns to normal editing mode

---

### User Story 2 - Execute Actions from Slides (Priority: P1)

As a technical presenter, I want slides to automatically execute IDE actions (open files, run terminal commands) when I navigate to them so that my live demos are choreographed and repeatable.

**Why this priority**: This is the core differentiator of Executable Talk turning passive slides into active IDE controllers. Without this, the extension is just another slide viewer.

**Independent Test**: Can be tested by creating a deck with `onEnter` actions in YAML frontmatter and verifying that navigating to the slide triggers the specified IDE operations.

**Acceptance Scenarios**:

1. **Given** a slide with `onEnter: [action: file.open, params: {path: "src/main.ts"}]`, **When** I navigate to that slide, **Then** the file `src/main.ts` opens in the editor
2. **Given** a slide with `onEnter: [action: terminal.run, params: {command: "npm start"}]`, **When** I navigate to that slide, **Then** a terminal opens and executes the command
3. **Given** a slide with `onEnter: [action: editor.highlight, params: {lines: "10-20"}]`, **When** I navigate to that slide, **Then** lines 10-20 in the active file are highlighted with a visible decoration
4. **Given** a slide with multiple `onEnter` actions, **When** I navigate to that slide, **Then** actions execute in the defined sequence

---

### User Story 3 - Click Interactive Elements in Slides (Priority: P2)

As a technical presenter, I want to click on buttons or links within slides to trigger specific actions so that I can control the timing of demos interactively during my talk.

**Why this priority**: While `onEnter` actions provide automation, presenters often need to trigger actions at specific moments based on audience questions or pacing. This adds flexibility.

**Independent Test**: Can be tested by adding inline executable links to a slide and verifying that clicking them triggers the specified action.

**Acceptance Scenarios**:

1. **Given** a slide containing `[Run Tests](action:terminal.run?command=npm%20test)`, **When** I click the link, **Then** a terminal executes `npm test`
2. **Given** a slide with an action button, **When** the action is running, **Then** the button displays a loading indicator
3. **Given** a slide with an action button, **When** the action completes successfully, **Then** the button shows a success indicator (green checkmark)
4. **Given** a slide with an action button, **When** the action fails, **Then** the button shows an error indicator and the error is logged

---

### User Story 4 - Undo/Redo IDE State (Priority: P2)

As a technical presenter, I want to undo the IDE changes made by a slide so that I can recover from mistakes during live demos without manually closing files or killing terminals.

**Why this priority**: This is the Demo Effect killer the ability to recover gracefully from failed demos. It is a major differentiator but depends on basic slide navigation and action execution working first.

**Independent Test**: Can be tested by navigating to a slide that opens files, then pressing Cmd+Z to verify the files close and IDE returns to previous state.

**Acceptance Scenarios**:

1. **Given** I navigated to a slide that opened 3 files, **When** I press Cmd+Z in the presentation context, **Then** those 3 files are closed and the IDE returns to the previous slide state
2. **Given** I have undone a slide actions, **When** I press Cmd+Shift+Z, **Then** the actions are re-applied (redo)
3. **Given** I am on slide 1 with no previous state, **When** I press Cmd+Z, **Then** nothing happens (no error, graceful handling)
4. **Given** a terminal was started by a slide, **When** I undo that slide, **Then** the terminal is terminated

---

### User Story 5 - Enter Zen Mode for Presentations (Priority: P3)

As a technical presenter, I want VS Code to automatically enter Zen Mode when I start a presentation so that the audience sees a clean, distraction-free interface.

**Why this priority**: Important for polish and professionalism, but the core functionality works without it. This enhances the experience rather than enabling it.

**Independent Test**: Can be tested by starting a presentation and verifying the Side Bar and Activity Bar are hidden automatically.

**Acceptance Scenarios**:

1. **Given** I start a presentation, **When** the Webview opens, **Then** VS Code enters Zen Mode (Side Bar and Activity Bar hidden)
2. **Given** I am in presentation Zen Mode, **When** I exit the presentation, **Then** VS Code returns to my previous layout configuration
3. **Given** I was already in Zen Mode before starting, **When** I exit the presentation, **Then** Zen Mode remains active (preserving user preference)

---

### User Story 6 - Use Presenter View with Speaker Notes (Priority: P3)

As a technical presenter with a second monitor, I want to see Speaker Notes and upcoming slide previews on my screen while the audience sees only the slides so that I can deliver a smoother presentation.

**Why this priority**: Enhances professional presentation delivery but requires multi-monitor detection and more complex UI. The core experience works on a single monitor.

**Independent Test**: Can be tested by connecting a second monitor, starting a presentation, and verifying notes appear on the primary screen while slides display on the secondary.

**Acceptance Scenarios**:

1. **Given** a second monitor is connected, **When** I start a presentation, **Then** slides display on the secondary monitor and Speaker Notes on the primary
2. **Given** Presenter View is active, **When** I navigate to the next slide, **Then** both views update synchronously
3. **Given** a slide has speaker notes in YAML frontmatter, **When** that slide is displayed, **Then** the notes appear in the Presenter View panel
4. **Given** no second monitor is connected, **When** I start a presentation, **Then** the standard single-screen mode is used (graceful fallback)

---

### Edge Cases

- What happens when a `.deck.md` file has invalid YAML frontmatter? Display an error message indicating the parse error with line number, but still render slides without actions
- What happens when an action references a file that does not exist? Show an error toast notification, log the error, and continue to the next action in the sequence
- What happens when a terminal command hangs indefinitely? Provide a timeout (configurable, default 30 seconds) after which the action is marked as timed out and the presenter can manually intervene
- What happens when the user modifies a file opened by a slide action? The snapshot captures the file opened state, not its content; undo closes the file but does not revert content changes
- What happens when multiple presentations are opened simultaneously? Only one presentation can be active at a time; opening a second closes the first

## Requirements *(mandatory)*

### Functional Requirements

**Presentation Core**
- **FR-001**: System MUST parse `.deck.md` files with Markdown content, YAML frontmatter, and `---` horizontal rules as slide delimiters
- **FR-002**: System MUST render slides in a VS Code Webview panel with fullscreen support
- **FR-003**: System MUST support keyboard navigation (arrow keys, Enter, Escape) between slides when the Webview panel has focus
- **FR-004**: System MUST support mouse/click navigation for next/previous slide controls

**Action System**
- **FR-005**: System MUST execute `file.open` actions to open files at specific lines/ranges
- **FR-006**: System MUST execute `editor.highlight` actions to apply temporary decorations to lines; decorations MUST persist until navigating away from the slide
- **FR-007**: System MUST execute `terminal.run` actions to run commands in named terminals
- **FR-008**: System MUST execute `debug.start` actions to launch debug configurations
- **FR-009**: System MUST execute `sequence` actions to run multiple actions with configurable delays
- **FR-010**: System MUST support YAML frontmatter `onEnter` blocks for slide-load actions
- **FR-011**: System MUST support inline executable links with `action:type?params` URI scheme

**Security**
- **FR-022**: System MUST respect VS Code Workspace Trust; terminal commands MUST NOT execute in untrusted workspaces
- **FR-023**: System MUST display a confirmation prompt on first presentation open in a workspace, informing the user that the deck contains executable actions

**State Management**
- **FR-012**: System MUST create a state snapshot before executing any action
- **FR-013**: System MUST support undo (Cmd+Z) to revert IDE state to previous snapshot
- **FR-014**: System MUST support redo (Cmd+Shift+Z) to re-apply reverted actions
- **FR-015**: System MUST provide a "Reset Presentation" command to close all presentation-opened resources

**User Experience**
- **FR-016**: System MUST integrate with VS Code Zen Mode when presentation starts
- **FR-017**: System MUST display visual feedback (loading/success/error) for action execution
- **FR-018**: System MUST restore previous VS Code layout when presentation ends

**Presenter View (when second monitor available)**
- **FR-019**: System SHOULD detect secondary monitors and offer Presenter View mode
- **FR-020**: System SHOULD display Speaker Notes from YAML frontmatter in Presenter View
- **FR-021**: System SHOULD show a preview of the next slide actions in Presenter View

### Key Entities

- **Deck**: A `.deck.md` file containing the complete presentation. Key attributes: file path, slides collection, metadata (title, author)
- **Slide**: A single slide within a deck. Key attributes: content (Markdown), frontmatter (YAML), speaker notes, onEnter actions, interactive elements
- **Action**: An executable instruction that manipulates the IDE. Key attributes: action type, parameters, execution status, associated slide
- **Snapshot**: A captured state of the IDE at a point in time. Key attributes: open editors, active file/line, terminal states, timestamp, associated slide
- **State Stack**: An ordered collection of snapshots enabling undo/redo. Key attributes: current position, snapshot history, maximum depth (50 snapshots). Stack is session-only (cleared when presentation ends); oldest snapshots are dropped when limit is exceeded

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Presenters can navigate through a 20-slide deck in under 30 seconds (slide transitions complete in < 100ms each)
- **SC-002**: Actions provide visual feedback within 200ms of initiation
- **SC-003**: State undo/redo operations complete in under 500ms for typical state (10 open files, 2 terminals)
- **SC-004**: 95% of presenters successfully recover from a simulated demo failure using undo within 5 seconds
- **SC-005**: Presentation startup (command to first slide visible) completes in under 2 seconds
- **SC-006**: Zero audience-visible errors during a 30-minute presentation with 15 action-containing slides

## Assumptions

- Presenters have basic familiarity with Markdown and YAML syntax
- `.deck.md` files are stored within the current VS Code workspace
- Terminal commands are valid for the presenter local environment
- Debug configurations referenced in actions exist in `.vscode/launch.json`
- Presenters use standard VS Code keybindings (Cmd on macOS, Ctrl on Windows/Linux)
