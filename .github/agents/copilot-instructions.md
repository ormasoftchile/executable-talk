# executable-talk Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-01-19

## Active Technologies
- TypeScript 5.3+ (strict mode) + gray-matter 4.x (YAML frontmatter), markdown-it 14.x (Markdown rendering), VS Code Extension API 1.85+ (003-authoring-reliability)
- N/A (file-based; reads `.deck.md` and workspace files) (003-authoring-reliability)
- TypeScript 5.3+ (strict mode) + VS Code Extension API 1.85+, gray-matter 4.x (YAML frontmatter), markdown-it 14.x (Markdown rendering), js-yaml 4.x (action block parsing) (005-nonlinear-nav-scenes)
- N/A (session-only state; scenes are not persisted across sessions) (005-nonlinear-nav-scenes)
- N/A (file-based; reads `.deck.md`, `.deck.env`, `.deck.env.example`, `.gitignore`) (006-deck-env-variables)

- TypeScript 5.x (strict mode enabled) + VS Code Extension API, marked (Markdown parsing), js-yaml (YAML frontmatter) (001-core-extension-mvp)

## Project Structure

```text
src/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript 5.x (strict mode enabled): Follow standard conventions

## Recent Changes
- 006-deck-env-variables: Added TypeScript 5.3+ (strict mode) + gray-matter 4.x (YAML frontmatter), markdown-it 14.x (Markdown rendering), VS Code Extension API 1.85+
- 005-nonlinear-nav-scenes: Added TypeScript 5.3+ (strict mode) + VS Code Extension API 1.85+, gray-matter 4.x (YAML frontmatter), markdown-it 14.x (Markdown rendering), js-yaml 4.x (action block parsing)
- 003-authoring-reliability: Added TypeScript 5.3+ (strict mode) + gray-matter 4.x (YAML frontmatter), markdown-it 14.x (Markdown rendering), VS Code Extension API 1.85+


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
