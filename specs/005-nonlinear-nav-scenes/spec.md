# Feature Specification: Non-Linear Navigation, Scenes & Cross-Platform Commands

**Feature Branch**: `005-nonlinear-nav-scenes`  
**Created**: 2026-02-07  
**Status**: Draft  
**Input**: User description: "non-linear navigation (jump to any slide during Q&A), state checkpoint/scenes for instant recovery, Cross-platform command abstraction"

## Overview

Extend Executable Talk with three complementary capabilities that make presentations more resilient and portable: (1) the ability to jump to any slide instantly during Q&A or ad-hoc discussion, (2) named scene checkpoints that capture full IDE state for instant recovery, and (3) a cross-platform command abstraction layer so that the same `.deck.md` file runs correctly on macOS, Windows, and Linux without modification.

## Clarifications

### Session 2026-02-07

- Q: Where should cross-platform command variants be specified in the `.deck.md` file? → A: YAML frontmatter `onEnter` only — platform map is a property of `terminal.run` params (e.g., `command: {windows: "dir", macos: "ls", default: "ls"}`)
- Q: How should terminals be handled when restoring a scene? → A: Reopen named terminals at the saved working directory, but do NOT replay commands
- Q: What keyboard shortcut should invoke the slide picker overlay? → A: `Ctrl+G` / `Cmd+G` (mirrors "Go to Line" idiom, repurposed as "Go to Slide" when Webview has focus)
- Q: When a scene references files that no longer exist on disk, what should happen during restore? → A: Restore what's possible (open existing files, skip missing ones), show a non-blocking warning summary of skipped items
- Q: How should the presenter invoke Save Scene and Restore Scene? → A: Keyboard shortcuts only — `Ctrl+S` / `Cmd+S` to save scene, `Ctrl+R` / `Cmd+R` to restore, scoped to Webview focus

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Jump to Any Slide During Q&A (Priority: P1)

As a technical presenter fielding audience questions, I want to jump directly to any slide by number, title, or through a visual slide picker so that I can instantly show relevant content without sequentially clicking through the entire deck.

**Why this priority**: During Q&A, presenters constantly need to revisit earlier material. Sequential-only navigation forces awkward "let me find that slide" moments that break presentation flow. This is the single most impactful improvement for live presentations.

**Independent Test**: Can be fully tested by opening a 20-slide deck, invoking the jump-to-slide picker, selecting slide 15, and verifying it appears instantly. Delivers immediate value for any Q&A session.

**Acceptance Scenarios**:

1. **Given** a presentation is active on slide 3 of 20, **When** I open the slide picker overlay, **Then** I see a searchable list of all slides showing their number and title
2. **Given** the slide picker is open, **When** I type a search term, **Then** slides are filtered by title and content keywords in real time
3. **Given** the slide picker is open, **When** I select slide 15, **Then** the presentation jumps directly to slide 15 within 200ms
4. **Given** a presentation is active, **When** I use a keyboard shortcut to jump by number (e.g., type "15" then Enter), **Then** slide 15 is displayed immediately
5. **Given** I jump from slide 3 to slide 15, **When** I use the "go back" shortcut, **Then** I return to slide 3 (not slide 14)
6. **Given** I jump to a slide with `onEnter` actions, **When** the slide loads, **Then** the `onEnter` actions execute as they would during normal navigation

---

### User Story 2 - Save and Restore Named Scenes (Priority: P1)

As a technical presenter, I want to save the current IDE state as a named "scene" at any point during my presentation so that I can instantly restore a known-good configuration when a demo goes wrong or when I need to reset for a different audience section.

**Why this priority**: The existing undo/redo stack provides linear recovery, but presenters need the ability to bookmark specific "golden states" and jump back to them from anywhere. This is the difference between recovering from a failure in seconds versus minutes.

**Independent Test**: Can be fully tested by navigating to slide 5 with several files open, saving a scene called "demo-start", continuing the presentation, then restoring "demo-start" and verifying all files and terminals return to the saved state.

**Acceptance Scenarios**:

1. **Given** a presentation is active with several files and terminals open, **When** I invoke the "Save Scene" command and provide the name "demo-start", **Then** the complete IDE state is captured and associated with that name
2. **Given** a scene named "demo-start" exists, **When** I invoke "Restore Scene" and select "demo-start", **Then** the IDE returns to the exact state when the scene was saved (open files, cursor positions, terminal states, active slide)
3. **Given** a scene named "demo-start" exists, **When** I save a new scene with the same name, **Then** the previous scene is overwritten with the current state
4. **Given** multiple scenes exist ("intro", "demo-start", "demo-end"), **When** I open the scene picker, **Then** I see all saved scenes with their names, associated slide number, and timestamp
5. **Given** I restore a scene, **When** the restoration completes, **Then** the presentation is on the same slide that was active when the scene was saved
6. **Given** a `.deck.md` file with predefined scenes in frontmatter, **When** I open the presentation, **Then** those scenes are pre-loaded and available for restoration without manual saving

---

### User Story 3 - Define Cross-Platform Commands (Priority: P2)

As a deck author, I want to write terminal commands in my `.deck.md` that automatically adapt to the presenter's operating system so that a single deck works correctly on macOS, Windows, and Linux without per-platform editing.

**Why this priority**: Many conference talks and workshops are authored on one OS but presented on another. Command incompatibilities (e.g., `ls` vs `dir`, path separators, package managers) cause live demo failures. This depends on the existing action system but delivers significant portability value.

**Independent Test**: Can be tested by authoring a deck with cross-platform command blocks and running it on two different operating systems, verifying the correct platform-specific command executes on each.

**Acceptance Scenarios**:

1. **Given** a slide with a cross-platform command block specifying `macos: "open ."`, `windows: "explorer ."`, `linux: "xdg-open ."`, **When** the action executes on Windows, **Then** `explorer .` is run
2. **Given** a slide with a cross-platform command using path placeholders (e.g., `${pathSep}`), **When** executed, **Then** the placeholder resolves to `\` on Windows and `/` on macOS/Linux
3. **Given** a slide with a command defined only for `macos` and `linux`, **When** executed on Windows, **Then** a clear message is shown: "This command is not available on your platform"
4. **Given** a cross-platform command block with a `default` entry, **When** executed on an OS without a specific entry, **Then** the `default` command is used as a fallback
5. **Given** a deck with cross-platform commands, **When** preflight validation runs, **Then** it warns about commands that lack support for the current platform

---

### User Story 4 - Navigation History Trail (Priority: P2)

As a technical presenter, I want a breadcrumb trail of recently visited slides so that I can quickly retrace my non-linear path through the deck without remembering exact slide numbers.

**Why this priority**: Non-linear navigation (Story 1) creates complex paths through the deck. Without a history trail, presenters can get disoriented. This enhances the non-linear navigation experience.

**Independent Test**: Can be tested by jumping between 5 different slides and verifying the history trail shows the correct sequence in order, with the ability to click any entry to return there.

**Acceptance Scenarios**:

1. **Given** I have visited slides 1 → 5 → 12 → 3 → 8, **When** I view the navigation history, **Then** I see this sequence displayed as a breadcrumb trail
2. **Given** the history trail is visible, **When** I click on slide 12 in the trail, **Then** the presentation jumps to slide 12
3. **Given** I jump to a slide via the history trail, **When** I check the trail, **Then** the jump is appended to the end of the trail (not inserted or replacing)
4. **Given** a long navigation history (20+ entries), **When** I view the trail, **Then** only the most recent 10 entries are shown with a "show more" option

---

### User Story 5 - Pre-Authored Scene Anchors in Deck Frontmatter (Priority: P3)

As a deck author, I want to define scene checkpoints declaratively in my `.deck.md` file frontmatter so that presenters get pre-configured recovery points without needing to manually save scenes during the talk.

**Why this priority**: Manually saving scenes works but adds cognitive load during a presentation. Pre-authored scenes in the deck file enable a "design-time safety net" that works out of the box for any presenter using the deck.

**Independent Test**: Can be tested by defining scenes in deck frontmatter and verifying they appear in the scene picker immediately upon opening the presentation.

**Acceptance Scenarios**:

1. **Given** a `.deck.md` with `scenes: [{name: "intro", slide: 1}, {name: "live-demo", slide: 8}]` in frontmatter, **When** I open the presentation, **Then** "intro" and "live-demo" appear in the scene picker
2. **Given** a pre-authored scene anchored to slide 8, **When** I restore that scene, **Then** the presentation navigates to slide 8 and executes its `onEnter` actions
3. **Given** both pre-authored and manually saved scenes exist, **When** I open the scene picker, **Then** both types are shown, clearly labeled (e.g., "authored" vs "saved")

---

### Edge Cases

- What happens when the presenter jumps to a slide whose `onEnter` actions depend on state from a previous slide (e.g., a file that should be open)? The system executes the `onEnter` actions as defined; if a dependency is missing (e.g., file not open for `editor.highlight`), the action reports an error gracefully and continues
- What happens when a scene is restored but the workspace files have changed since the scene was saved? The scene restores IDE layout (open editors, terminals, cursor positions) but does not revert file contents; a warning is shown if referenced files have been modified. If files have been deleted, they are skipped and listed in a non-blocking warning summary
- What happens when the presenter saves more scenes than the system limit? Sessions support up to 20 named scenes; attempting to save a new scene beyond this limit shows a non-blocking error: "Scene limit reached. Delete an existing scene to save a new one." Overwriting an existing scene by saving with the same name does not count against the limit
- What happens when a cross-platform command block has no entry matching the current OS and no default? A clear, non-blocking error message is displayed: "Command not available on [OS]. Consider adding a default entry."
- What happens when the slide picker is opened during an action execution? The picker opens normally; running actions continue in the background and their status is tracked
- What happens when navigation history exceeds the maximum? The oldest entries are dropped when the history exceeds 50 entries

## Requirements *(mandatory)*

### Functional Requirements

**Non-Linear Navigation**
- **FR-001**: System MUST provide a slide picker overlay that displays all slides with their number and title
- **FR-002**: System MUST support searching/filtering slides by title and content keywords within the picker
- **FR-003**: System MUST support direct jump-by-number input (type number + confirm) from the keyboard
- **FR-003a**: System MUST bind the slide picker to `Ctrl+G` / `Cmd+G` when the presentation Webview has focus; this binding does not affect VS Code's native "Go to Line" outside the Webview
- **FR-004**: System MUST maintain a navigation history stack separate from the undo/redo state stack
- **FR-005**: System MUST support "go back" navigation that returns to the previously viewed slide (not the sequentially previous slide)
- **FR-006**: System MUST execute `onEnter` actions when a slide is reached via non-linear navigation, identical to sequential navigation behavior
- **FR-007**: System MUST create a state snapshot before performing a non-linear jump, enabling undo of the jump

**Scene Checkpoints**
- **FR-008**: System MUST allow the presenter to save the current IDE state as a named scene at any time during a presentation
- **FR-008a**: System MUST bind scene save to `Ctrl+S` / `Cmd+S` and scene restore to `Ctrl+R` / `Cmd+R` when the presentation Webview has focus; these bindings do not affect VS Code's native shortcuts outside the Webview
- **FR-009**: System MUST capture the following in a scene: open editors (file paths, cursor positions, scroll positions), active terminals (names, working directories), active slide number, and Webview state. On restore, terminals are reopened at the saved working directory but previous commands are NOT replayed
- **FR-010**: System MUST allow the presenter to restore any saved scene, returning the IDE to the captured state
- **FR-010a**: System MUST perform partial restore when referenced resources are missing (e.g., deleted files): restore all available resources and display a non-blocking warning summary listing skipped items
- **FR-011**: System MUST support overwriting an existing scene by saving with the same name
- **FR-012**: System MUST provide a scene picker that lists all available scenes (authored and saved) with name, slide number, and timestamp
- **FR-013**: System MUST support pre-authored scenes defined in deck YAML frontmatter
- **FR-014**: System MUST distinguish between pre-authored scenes (read-only, from deck file) and runtime scenes (user-saved, session-only)
- **FR-015**: System MUST limit the number of runtime-saved scenes to 20 per session
- **FR-015a**: System MUST allow the presenter to delete a runtime-saved scene; authored scenes MUST NOT be deletable

**Cross-Platform Command Abstraction**
- **FR-016**: System MUST support per-platform command variants as a property of `terminal.run` params within YAML `onEnter` blocks (at minimum: `macos`, `windows`, `linux`, and `default`); inline action links are not extended for cross-platform syntax
- **FR-017**: System MUST automatically select and execute the command variant matching the presenter's current operating system
- **FR-018**: System MUST support platform-aware path placeholders (`${pathSep}`, `${home}`, `${shell}`, `${pathDelimiter}`) that resolve to OS-appropriate values
- **FR-019**: System MUST fall back to the `default` command variant when no OS-specific variant is defined
- **FR-020**: System MUST display a clear, non-blocking error when a command has no variant for the current OS and no default
- **FR-021**: System MUST validate cross-platform command blocks during preflight, warning about missing platform coverage for the current OS

**Navigation History**
- **FR-022**: System MUST record every slide visit (sequential and non-linear) in a navigation history trail
- **FR-023**: System MUST display the navigation history as a breadcrumb trail accessible from the Webview
- **FR-024**: System MUST support clicking a history entry to jump to that slide
- **FR-025**: System MUST cap navigation history at 50 entries, dropping the oldest when exceeded

### Key Entities

- **Scene**: A named checkpoint of the full IDE state at a specific moment. Key attributes: name, associated slide number, timestamp, captured state (open editors, terminals, cursor positions, Webview state), origin (authored from deck frontmatter or saved at runtime). Terminal restore reopens named terminals at saved working directory without replaying commands
- **Navigation History Entry**: A record of a visited slide. Key attributes: slide number, slide title, timestamp, navigation method (sequential, jump, scene-restore, history-click)
- **Cross-Platform Command Block**: A command definition with per-OS variants, specified as a map within `terminal.run` params in YAML `onEnter` blocks. Key attributes: platform-specific commands (macos, windows, linux), default fallback, path placeholders
- **Slide Picker**: A searchable overlay for non-linear slide selection. Key attributes: slide list (number, title, preview), search/filter state, currently selected item

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Presenters can jump to any slide in a 30-slide deck within 3 seconds (including picker open, search, and selection)
- **SC-002**: Scene restoration returns the IDE to the saved state within 2 seconds for a typical scene (5 open files, 2 terminals)
- **SC-003**: 90% of presenters successfully recover from a simulated demo failure using scene restore on their first attempt
- **SC-004**: Cross-platform decks authored on one OS run without modification on at least 2 other supported operating systems
- **SC-005**: Preflight validation detects 100% of cross-platform command gaps for the current OS before the presentation starts
- **SC-006**: Navigation history trail is accessible within 1 second during a live presentation
- **SC-007**: Presenters can answer an audience question by jumping to a relevant slide and returning to their previous position in under 5 seconds

## Assumptions

- The existing undo/redo state stack (from 001-core-extension-mvp) provides the foundation for scene capture; scenes extend this with named persistence
- Terminal state capture is limited to name and working directory; terminal scrollback content is not captured. On scene restore, terminals are reopened at the saved cwd but commands are not replayed (avoids side effects)
- Pre-authored scenes in deck frontmatter define anchor points (slide number + name); full IDE state is captured only when the scene is first visited or manually saved
- Cross-platform command abstraction applies only to `terminal.run` actions; other action types (`file.open`, `editor.highlight`) already use platform-agnostic paths
- The slide picker UI is rendered within the existing Webview panel, not as a separate VS Code Quick Pick dialog, to maintain presentation immersion
- Navigation history is session-only and is cleared when the presentation ends
