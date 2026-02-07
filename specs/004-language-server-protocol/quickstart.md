# Quickstart — 004 Language Server Protocol Support

Developer guide for working with the LSP server for Executable Talk.

---

## Prerequisites

- Node.js 18+
- VS Code 1.85+
- The Executable Talk extension codebase (`git clone`)
- Familiarity with the [LSP specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/)

---

## Setup

### 1. Install Dependencies

```bash
npm install
```

This installs the LSP packages declared in `package.json`:

| Package                              | Purpose                              |
|--------------------------------------|--------------------------------------|
| `vscode-languageserver` 9.x         | Server-side LSP protocol library     |
| `vscode-languageclient` 9.x         | Client-side LSP protocol library     |
| `vscode-languageserver-textdocument` | TextDocument implementation for server |
| `vscode-languageserver-types`        | Shared type definitions              |

### 2. Build

```bash
npm run compile
```

Or use the watch task for continuous compilation:

```bash
npm run watch
```

### 3. Run Tests

```bash
npm test
```

Unit tests live in `test/unit/server/`. Integration tests live in `test/integration/lsp/`.

---

## Architecture Overview

```
┌─────────────────────────────────┐
│  VS Code Extension Host         │
│                                 │
│  extension.ts                   │
│  ├── Feature Flag Check         │
│  │   useLsp = true?             │
│  │   ├── YES → LanguageClient   │
│  │   └── NO  → Legacy Providers │
│  │                              │
│  ├── LanguageClient (IPC)       │
│  │   └── connects to ──────────────┐
│  │                              │  │
│  └── Conductor (unchanged)      │  │
│      └── ActionRegistry         │  │
└─────────────────────────────────┘  │
                                     │
┌─────────────────────────────────┐  │
│  LSP Server (in-process IPC)    │◄─┘
│                                 │
│  server.ts                      │
│  ├── Connection setup           │
│  ├── Capability registration    │
│  └── Handler dispatch           │
│                                 │
│  DeckDocumentManager            │
│  ├── DeckDocument (per file)    │
│  │   ├── SlideRange[]           │
│  │   ├── ActionBlockRange[]     │
│  │   └── diagnostics[]          │
│  └── debounce timers            │
│                                 │
│  Capability Handlers            │
│  ├── completionHandler          │
│  ├── diagnosticHandler          │
│  ├── hoverHandler               │
│  ├── documentSymbolHandler      │
│  ├── codeActionHandler          │
│  ├── definitionHandler          │
│  └── foldingRangeHandler        │
│                                 │
│  Utilities                      │
│  ├── WorkspaceFileCache         │
│  ├── yamlParser                 │
│  ├── debounce                   │
│  └── contextDetector            │
└─────────────────────────────────┘
```

---

## Key Files

| File                                  | Purpose                                      |
|---------------------------------------|----------------------------------------------|
| `src/server/server.ts`               | Server entry point — connection and capability registration |
| `src/server/deckDocument.ts`          | `DeckDocument` model with position tracking   |
| `src/server/deckDocumentManager.ts`   | Multi-document cache and lifecycle            |
| `src/server/contextDetector.ts`       | `ActionContext` discriminated union detection  |
| `src/server/capabilities/*.ts`        | One file per LSP capability handler           |
| `src/server/utils/*.ts`              | Workspace file cache, YAML parser, debounce   |
| `src/providers/actionSchema.ts`       | Shared schema (used by both LSP and legacy)   |
| `src/extension.ts`                    | Client initialization and feature flag logic  |

---

## Development Workflow

### Adding a New LSP Capability

1. **Write the test first** in `test/unit/server/{capability}.test.ts`:
   ```typescript
   describe('myCapabilityHandler', () => {
     it('should return expected result for given input', () => {
       const document = DeckDocument.create('file:///test.deck.md', 1, content);
       const result = myCapabilityHandler(document, params);
       expect(result).to.deep.equal(expected);
     });
   });
   ```

2. **Create the handler** in `src/server/capabilities/{capability}Handler.ts`:
   ```typescript
   import { DeckDocument } from '../deckDocument';

   export function onMyCapability(
     document: DeckDocument,
     params: MyCapabilityParams
   ): MyCapabilityResult | null {
     // Implementation
   }
   ```

3. **Register in server.ts**:
   ```typescript
   connection.onMyCapability((params) => {
     const document = documentManager.get(params.textDocument.uri);
     if (!document) return null;
     return onMyCapability(document, params);
   });
   ```

4. **Run tests**: `npm test`

### Modifying the Document Model

1. Update the interface in `src/server/deckDocument.ts`.
2. Update the parser methods (e.g., `parseActionBlocks`, `extractParameters`).
3. Update `data-model.md` in the specs.
4. Run all server tests to verify no regressions.

### Debugging the LSP Server

Since the server runs in-process via IPC, you can debug it using the standard VS Code extension debugging workflow:

1. Open the extension in VS Code.
2. Press `F5` to launch the Extension Development Host.
3. Set breakpoints in `src/server/*.ts` files.
4. Open a `.deck.md` file in the Extension Development Host.
5. Trigger a capability (e.g., type in an action block for completions).
6. Breakpoints will hit in the LSP server code.

For logging, use `connection.console.log()` in server code — output appears in the "Executable Talk Language Server" output channel.

---

## Configuration

### Feature Flag

The `executableTalk.useLsp` setting controls whether the LSP server or legacy providers are used:

```json
{
  "executableTalk.useLsp": true
}
```

- `true` (default): LSP server handles completions, diagnostics, hover, symbols, code actions, definitions, folding.
- `false`: Legacy providers from 003-authoring-reliability are used.

The setting can be changed at runtime — no restart required. The extension hot-swaps between LSP client and legacy providers.

---

## Shared Schema

The `ACTION_SCHEMAS` map in `src/providers/actionSchema.ts` is the **single source of truth** for action validation. Both the LSP server and legacy providers import from this module.

When adding or modifying action types:

1. Update `ACTION_SCHEMAS` in `actionSchema.ts`.
2. Update `ActionType` union in `src/models/action.ts`.
3. LSP server automatically picks up the changes (no separate schema).
4. Run both provider and server test suites.

---

## Testing Strategy

| Layer          | Tool           | Location                              | What's Tested                    |
|----------------|----------------|---------------------------------------|----------------------------------|
| Unit           | Mocha + Chai   | `test/unit/server/*.test.ts`          | Document model, context detection, each handler in isolation |
| Integration    | Mocha + vscode-languageserver-protocol | `test/integration/lsp/*.test.ts` | Server lifecycle, end-to-end capability flow |
| Parity         | Mocha + Chai   | `test/integration/lsp/providerParity.test.ts` | LSP output matches legacy provider output |
| Performance    | Mocha          | `test/unit/server/performance.test.ts` | Response times for large documents |

### Running Specific Test Suites

```bash
# All tests
npm test

# Server unit tests only
npx mocha test/unit/server/**/*.test.ts

# Integration tests only
npx mocha test/integration/lsp/**/*.test.ts
```

---

## Common Patterns

### Position Conversion

All positions in the `DeckDocument` model use 0-based LSP coordinates. If you need to convert from 1-based positions (e.g., from `actionLinkParser`):

```typescript
const lspPosition: Position = {
  line: oneBasedLine - 1,
  character: oneBasedColumn - 1,
};
```

### Range Containment Check

```typescript
function containsPosition(range: Range, position: Position): boolean {
  if (position.line < range.start.line || position.line > range.end.line) {
    return false;
  }
  if (position.line === range.start.line && position.character < range.start.character) {
    return false;
  }
  if (position.line === range.end.line && position.character >= range.end.character) {
    return false;
  }
  return true;
}
```

### Debounced Diagnostics Pattern

```typescript
const timers = new Map<string, NodeJS.Timeout>();

function scheduleDiagnostics(uri: string, document: DeckDocument): void {
  const existing = timers.get(uri);
  if (existing) clearTimeout(existing);

  timers.set(uri, setTimeout(() => {
    const diagnostics = computeDiagnostics(document);
    connection.sendDiagnostics({ uri, diagnostics });
    timers.delete(uri);
  }, 300));
}
```
