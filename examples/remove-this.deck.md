---
title: "Executable Talk — Styling & Theming Showcase"
author: Executable Talk
description: A showcase deck demonstrating every new styling and theming feature — themes, layout directives, action link icons, transitions, and presentation polish.
scenes:
  - name: intro
    slide: 1
  - name: themes
    slide: 3
  - name: layouts
    slide: 8
  - name: actions
    slide: 11
  - name: polish
    slide: 13
options:
  toolbar: true
  zenMode: false
  showSlideNumbers: true
  showProgress: true
  fontSize: medium
  theme: light
  transition: fade
---

# Styling & Theming Showcase

## What's New in Executable Talk

:::center

*This deck demonstrates every new feature — themes, layouts, action icons, transitions, and presentation polish.*

Press **→** to begin the tour.

:::

---

# What We'll Cover

1. **Theme System** — 5 built-in themes (default, dark, light, minimal, contrast) <!-- .fragment -->
2. **Layout Directives** — `:::center`, `:::columns` for slide structure <!-- .fragment -->
3. **Action Link Icons** — type-specific icons for every action type <!-- .fragment -->
4. **Presentation Polish** — transitions, progress bar, slide numbers <!-- .fragment -->
5. **Default Enhancements** — presentation-grade typography out of the box <!-- .fragment -->

> All features are **optional, zero-config by default**, and **Markdown-compatible**.

---

# Theme: Default (Dark)

This is the **default** theme — optimized for screen sharing and projectors.

:::columns

:::left

**Characteristics:**

- Large, centered titles
- High-contrast dark background
- Generous spacing
- Readable code blocks

:::

:::right

**Set via frontmatter:**

```yaml
options:
  theme: default
```

Or simply omit `theme` — dark is the default.

:::

---

# Theme: Light

Switch to a clean, bright look for well-lit rooms.

To preview this theme, change the frontmatter to:

```yaml
options:
  theme: light
```

:::center

Light theme uses **white backgrounds**, dark text, and subtle shadows on render blocks.

:::

---

# Theme: Minimal

A **stripped-down, distraction-free** aesthetic.

:::columns

:::left

- Muted, low-saturation colors
- No bold accent colors
- Transparent action buttons with subtle borders
- Focus on content, not chrome

:::

:::right

```yaml
options:
  theme: minimal
```

*Ideal for code-heavy presentations where you want the code to be the star.*

:::

---

# Theme: Contrast

**High-contrast** theme for maximum accessibility (WCAG AAA).

:::columns

:::left

- Pure black background
- Pure white text
- Yellow accent color
- Bold headings, thick borders
- Action buttons with strong outlines

:::

:::right

```yaml
options:
  theme: contrast
```

*Use this for audiences with visual impairments or bright projection environments.*

:::

---

# Theme Comparison

All 5 themes at a glance:

| Theme | Background | Accent | Best For |
|-------|-----------|--------|----------|
| **default** | Dark (#1e1e1e) | Blue | General use, screen sharing |
| **dark** | Dark (#1e1e1e) | Blue | Alias for default |
| **light** | White (#fff) | Blue | Well-lit rooms |
| **minimal** | Deep navy | Gray | Code-focused decks |
| **contrast** | Pure black | Yellow | Accessibility, bright projectors |

Themes are **CSS-only** — they never affect Markdown rendering outside Executable Talk. <!-- .fragment -->

---

# Layout: :::center

The `:::center` directive centers all content within the block:

:::center

**This text is centered.**

Use it for title slides, big ideas, or callouts.

:::

**Markdown source:**
```
:::center
**This text is centered.**
Use it for title slides, big ideas, or callouts.
:::
```

---

# Layout: :::columns

The `:::columns` directive splits content into a **two-column grid**:

:::columns

:::left

### Left Column

- Great for text explanations
- Bullet points
- Context and narrative

:::

:::right

### Right Column

```typescript
// Perfect for code samples
function greet(name: string) {
  console.log(`Hello, ${name}!`);
}
```

:::

---

# Layout: Graceful Degradation

Layout directives degrade gracefully:

- In Executable Talk → rendered as styled `<div>` containers <!-- .fragment -->
- In plain Markdown viewers → `:::` lines appear as harmless text <!-- .fragment -->
- No breaking changes to existing decks <!-- .fragment -->

:::center

**Directives are optional.** Your Markdown stays clean and portable.

:::

---

# Action Icons: Every Type

Each action type now has its own icon. Compare:

:::columns

:::left

**Action Types:**

[Open a File](action:file.open?path=package.json)

[Highlight Code](action:editor.highlight?path=src/extension.ts&lines=1-10)

[Run Command](action:terminal.run?command=echo%20hello)

:::

:::right

**More Types:**

[Start Debugger](action:debug.start?config=Launch)

[Run Sequence](action:sequence)

[VS Code Command](action:vscode.command?id=workbench.action.toggleZenMode)

:::

---

# Action Icons: How It Works

Icons are assigned automatically via **CSS attribute selectors** — no config needed.

| Action Type | Icon | Selector |
|-------------|------|----------|
| `file.open` | 📄 | `a[href^="action:file.open"]` |
| `editor.highlight` | ✏️ | `a[href^="action:editor.highlight"]` |
| `terminal.run` | ⌨️ | `a[href^="action:terminal.run"]` |
| `debug.start` | 🐛 | `a[href^="action:debug.start"]` |
| `sequence` | ⏩ | `a[href^="action:sequence"]` |
| `vscode.command` | ⚙️ | `a[href^="action:vscode.command"]` |

Status icons (⏳ running, ✓ success, ✗ failed) still override these during execution. <!-- .fragment -->

---

# Progress Bar & Slide Numbers

Look at the **top of the screen** — there's a thin accent-colored progress bar.

Look at the **bottom** — slide numbers show your position in the deck.

Both are controlled via frontmatter:

```yaml
options:
  showProgress: true      # thin bar at top (off by default)
  showSlideNumbers: true   # position indicator (on by default)
```

:::center

*This deck has both enabled so you can see them in action.*

:::

---

# Slide Transitions

This deck uses `transition: fade` — a smooth opacity crossfade.

The alternative is `transition: slide` (the default), which slides content horizontally.

```yaml
options:
  transition: fade    # smooth opacity crossfade
  # transition: slide # horizontal slide (default)
```

:::center

Navigate forward and back to see the fade effect. <!-- .fragment -->

:::

---

# Typography Enhancements

The default theme now includes **presentation-grade typography**:

:::columns

:::left

- **Centered h1** headings
- **Larger heading scale** (3rem / 2.25rem / 1.5rem)
- **80ch max-width** for body text readability
- **Generous spacing** between paragraphs and list items

:::

:::right

- **Larger code blocks** (1.1rem — bigger than body text)
- **Letter-spacing** on titles for a modern feel
- **More padding** around slides for breathing room
- **Dark mode** optimized as the default

:::

---

# Putting It All Together

:::center

Every feature works together. This single slide uses:

:::

- ✅ **Default theme** — dark, high-contrast, centered titles <!-- .fragment -->
- ✅ **Layout directives** — `:::center` above, columns on other slides <!-- .fragment -->
- ✅ **Progress bar** — visible at the top <!-- .fragment -->
- ✅ **Slide numbers** — visible at the bottom <!-- .fragment -->
- ✅ **Fade transition** — smooth crossfade between slides <!-- .fragment -->
- ✅ **Presentation typography** — large, spaced, readable <!-- .fragment -->

---

# Try It Yourself

:::center

Change the `theme` in the frontmatter and re-open the presentation:

:::

```yaml
options:
  theme: minimal      # try: default, dark, light, minimal, contrast
  transition: slide   # try: slide, fade
  showProgress: true
  fontSize: large     # try: small, medium, large
```

:::center

**All styling is optional, theme-based, and reversible.**

No existing decks are affected — zero-config by default. 🎉

:::
