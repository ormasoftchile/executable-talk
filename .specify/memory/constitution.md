<!--
SYNC IMPACT REPORT
==================
Version Change: 0.0.0 → 1.0.0 (MAJOR - initial constitution ratification)

Modified Principles: N/A (initial version)

Added Sections:
- Core Principles (5 principles)
- Technology & Architecture Constraints
- Development Workflow
- Governance

Removed Sections: N/A (initial version)

Templates Status:
- plan-template.md: ✅ No updates needed (generic Constitution Check section exists)
- spec-template.md: ✅ No updates needed (uses generic requirement/scenario structure)
- tasks-template.md: ✅ No updates needed (uses generic phase structure)

Follow-up TODOs: None
-->

# Executable Talk Constitution

## Core Principles

### I. Three-Layer Architecture (NON-NEGOTIABLE)
All features MUST adhere to the three-layer architecture:
1. **Presentation Webview**: Renders slides, captures user interactions, sends commands via `postMessage`
2. **The Conductor**: Parses messages, validates permissions, manages State Stack, sequences actions
3. **VS Code API Layer**: Interfaces with editor, terminal, and workspace APIs

**Rationale**: Clean separation ensures testability, maintainability, and prevents tight coupling between UI and IDE manipulation. Each layer MUST be independently testable.

### II. Stateful Demo Management
Every action that modifies IDE state MUST:
- Create an auto-snapshot before execution (open files, active line, terminal status)
- Support smart undo that reverts IDE to previous slide's state
- Register with the global reset command for clean slate restoration

**Rationale**: The State Stack is our core differentiator—presenters MUST be able to recover from the "Demo Effect" at any moment. This principle eliminates presentation anxiety and enables fearless live coding.

### III. Action Registry Compliance
All IDE manipulation MUST go through the Action Registry:
- Actions MUST be declarative (YAML frontmatter or inline executable links)
- New actions MUST be registered with clear type, description, and parameter schema
- Actions MUST NOT directly call VS Code APIs outside the executor layer

**Rationale**: Centralized action handling ensures consistent behavior, permission validation, state tracking, and enables the hybrid authoring syntax (YAML + inline links).

### IV. Test-First Development
TDD is mandatory for all features:
1. Write tests for the new capability
2. Verify tests fail (Red)
3. Implement minimum code to pass (Green)
4. Refactor while keeping tests green

**Focus Areas**:
- Unit tests for Conductor logic and state management
- Integration tests for Webview ↔ Extension Host communication
- E2E tests for complete slide transitions and action sequences

**Rationale**: The extension orchestrates complex IDE state; untested code risks corrupting user workspaces. Red-Green-Refactor ensures correctness before optimization.

### V. Presentation-First UX
All UX decisions MUST prioritize the presentation experience:
- Zen Mode integration MUST be seamless and reversible
- Visual feedback MUST indicate action status (loading, success, error)
- Speaker Notes and Presenter View MUST work independently of slide display
- Actions MUST NOT block the presentation UI or create jarring transitions

**Rationale**: We are building a "performance cockpit," not just a slide deck. The presenter's confidence depends on smooth, predictable behavior during live talks.

## Technology & Architecture Constraints

**Language**: TypeScript (strict mode enabled)
**Platform**: VS Code Extension API
**Webview**: HTML/CSS/JavaScript with `postMessage` communication
**Testing**: VS Code Extension Test Suite + Mocha/Jest for unit tests
**Presentation Format**: `.deck.md` files with YAML frontmatter + Markdown content

**Performance Goals**:
- Slide transitions MUST complete in < 100ms
- Action execution feedback MUST appear in < 200ms
- State snapshot creation MUST NOT block UI thread

**Security Constraints**:
- Webview MUST use Content Security Policy
- File access MUST be limited to workspace scope
- Terminal commands MUST be explicitly defined in deck files (no arbitrary execution)

## Development Workflow

**Branch Strategy**: Feature branches named `###-feature-name` linked to specs
**Code Review**: All PRs MUST include constitution compliance verification
**Documentation**: Features MUST update relevant `.deck.md` examples

**Quality Gates**:
1. All tests passing (unit, integration, E2E where applicable)
2. No TypeScript strict mode violations
3. Constitution Check passed (see plan-template.md)
4. Webview accessibility verified (keyboard navigation, screen reader support)

## Governance

This constitution supersedes all other development practices for the Executable Talk extension.

**Amendment Process**:
1. Propose amendment with rationale in a dedicated PR
2. Document impact on existing code and migration requirements
3. Update constitution version following semantic versioning:
   - MAJOR: Breaking changes to principles or removal of non-negotiables
   - MINOR: New principles or expanded guidance
   - PATCH: Clarifications and wording refinements
4. All active contributors MUST acknowledge the change

**Compliance**:
- All PRs MUST verify compliance with Core Principles
- Complexity deviations MUST be justified in PR description
- Violations discovered post-merge MUST be addressed in next sprint

**Version**: 1.0.0 | **Ratified**: 2026-01-19 | **Last Amended**: 2026-01-19
