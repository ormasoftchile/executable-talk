# Contract — Document Model

Defines the behavioral contracts for the `DeckDocument` model, `DeckDocumentManager`, and incremental update logic.

---

## DeckDocument Contract

### Construction

```typescript
DeckDocument.create(uri: string, version: number, content: string): DeckDocument
```

**Preconditions:**
- `uri` is a valid file URI or untitled URI.
- `version` ≥ 0.
- `content` is a string (may be empty).

**Postconditions:**
- `slides.length ≥ 1` (even an empty document produces one slide).
- All `Range` values are within document bounds.
- `slides` are ordered by `range.start.line` ascending.
- `slides` are non-overlapping.
- `diagnostics` are computed for the initial content.

---

### Incremental Update

```typescript
DeckDocument.applyChange(change: TextDocumentContentChangeEvent): void
```

**Preconditions:**
- `change.range` is within current document bounds (for incremental changes).
- `change.text` is a string (may be empty for deletions).

**Postconditions:**
- `content` is updated to reflect the change.
- `version` is incremented.
- Only slides whose `range` overlaps with `change.range` are re-parsed.
- Slide indices are renumbered if slides were added or removed.
- All `Range` values in unaffected slides are shifted by the line delta of the change.
- `diagnostics` are NOT recomputed (deferred to debounced diagnostic handler).

**Invariants:**
- After any update, `slides` remain ordered and non-overlapping.
- The concatenation of all slide content regions (plus delimiters) equals `content`.

---

### Slide Boundary Detection

```typescript
DeckDocument.findSlideBoundaries(content: string): number[]
```

**Returns:** Array of 0-based line numbers where `---` delimiters occur.

**Rules:**
- A delimiter is a line matching `/^---+\s*$/`.
- Delimiters inside fenced code blocks (`` ``` `` to `` ``` ``) are ignored.
- The first delimiter (if at line 0 with a closing `---`) is treated as frontmatter boundaries, not a slide delimiter.
- Returns `[]` for a document with no delimiters (single slide).

---

### Action Block Parsing

```typescript
DeckDocument.parseActionBlocks(slideContent: string, slideStartLine: number): ActionBlockRange[]
```

**Preconditions:**
- `slideContent` is the text of a single slide.
- `slideStartLine` is the 0-based document line where this slide begins.

**Postconditions:**
- Returns action blocks in document order.
- Each block's `range.start.line` is the `` ```action `` fence line (absolute document line).
- Each block's `range.end.line` is the closing `` ``` `` fence line (absolute document line).
- `contentRange` excludes the fence lines.
- `yamlContent` is the text between fences (joined with newlines).
- `parsedYaml` is the result of `js-yaml.load()`, or `undefined` if parse fails.
- `parseError` is populated if YAML parsing fails, with a `range` pointing to the exact error location (using js-yaml's mark).
- Unclosed blocks (no closing fence) are included with `range.end` at the slide's last line and a diagnostic for the missing fence.

---

### YAML Parameter Extraction

```typescript
DeckDocument.extractParameters(yamlContent: string, contentStartLine: number): ParameterRange[]
```

**Preconditions:**
- `yamlContent` is valid YAML that parsed to an object.
- `contentStartLine` is the 0-based document line of the first content line.

**Postconditions:**
- Returns one `ParameterRange` per top-level key-value pair.
- `keyRange` spans from the first character of the key to the last character of the key.
- `valueRange` spans from the first character of the value to the last character of the value.
- Multiline values (e.g., YAML block scalars) have `valueRange` spanning all lines.
- Array values (e.g., `steps:`) have `valueRange` spanning from `[` or first `- ` to closing `]` or last array entry.

---

## DeckDocumentManager Contract

### Open

```typescript
DeckDocumentManager.open(uri: string, version: number, content: string): DeckDocument
```

**Preconditions:**
- Document with `uri` is not already open (or is re-opened after close).

**Postconditions:**
- A new `DeckDocument` is created and cached.
- Returns the created document.

---

### Update

```typescript
DeckDocumentManager.update(uri: string, version: number, changes: TextDocumentContentChangeEvent[]): DeckDocument
```

**Preconditions:**
- Document with `uri` is open.
- `version` > current document version.

**Postconditions:**
- Changes are applied in order.
- Returns the updated document.
- Diagnostics recomputation is scheduled (debounced, not immediate).

---

### Close

```typescript
DeckDocumentManager.close(uri: string): void
```

**Preconditions:**
- Document with `uri` is open.

**Postconditions:**
- Document is removed from cache.
- Any pending diagnostic timer for this URI is cancelled.
- Published diagnostics for this URI are cleared (empty array).

---

### Get

```typescript
DeckDocumentManager.get(uri: string): DeckDocument | undefined
```

Returns the cached document, or `undefined` if not open.

---

## Context Detection Contract

### detectContext

```typescript
detectContext(document: DeckDocument, position: Position): ActionContext
```

**Preconditions:**
- `position` is within document bounds.

**Postconditions:**
- Returns exactly one `ActionContext` variant.
- If `position` is not inside any `ActionBlockRange.contentRange`, returns `{ kind: 'unknown' }`.
- If `position` is on a `type:` line and in the value region, returns `{ kind: 'type-value', ... }`.
- If `position` is on a known parameter line and in the value region, returns `{ kind: 'param-value', ... }`.
- If `position` is on an empty or new line within a block, returns `{ kind: 'param-name', ... }`.
- If `position` is within a `steps:` array entry, returns `{ kind: 'step-context', ... }` with recursed `innerContext`.

**Invariant:** The `replaceRange` or `insertRange` in any returned context is always within the enclosing `ActionBlockRange.contentRange`.
