# Adaptive Appearance

Adaptive appearance coordinates the deck, preview, and diagrams with the VS Code
window. Keep Deckpilot and its diagram companions on matching release versions.

## Authoring

```yaml
appearance:
  style: default
  mode: auto
  contrast: auto
```

These are the defaults when no appearance is authored. Auto follows this VS Code
window's light/dark and high-contrast classification, not its individual colors.
The default family uses Source Sans 3 with teal/coral accents in both modes.
Use `mode: light` or `mode: dark` for a fixed canvas. Contrast accepts `auto`,
`normal`, or `high`. High Contrast Light remains light.

Sidecars use `deck.appearance`. Fields merge individually; inline fields win over
the corresponding sidecar fields. Workspace defaults are available under
`deckPilot.appearance`. Session choices in the **Appearance** menu override authored
settings without rewriting files and are shared by preview and presentation.

The new appearance fields win over legacy `theme` and `options.theme`. Explicit
legacy light/dark choices remain fixed. Conflicting legacy fields produce a
diagnostic, with top-level `theme` taking precedence. The initial adaptive slide
family is `default`; other diagram presets keep their native styling.

## Diagrams

Diagrams inherit the deck appearance unless overridden:

```yaml
diagrams:
  style: inherit
  mode: inherit
  surface: auto
```

Per-fence `style`, `mode`, and `surface` attributes override these defaults.
Compatible diagrams blend into the slide. A fixed light diagram on a dark slide
keeps its opaque light canvas. Unsafe transparency requests retain an opaque
canvas and report a warning. Legacy adapters keep their existing rendering with
an upgrade diagnostic. Source images, video, and explicit source colors are not
automatically recolored.

Appearance changes preserve slide, fragment, action, and scroll state. The host
rejects stale asynchronous renders. Native connector animation phase can restart
when a diagram is replaced; narration and actions are not restarted.

## Recording and Export

Recording freezes the resolved appearance before screen capture and waits for
the webview's paint acknowledgement. Its session JSON stores the palette,
typography, font revision, manifest hash, and reported renderer build identities.
Retakes within the session retain that appearance. Stopping capture resumes Auto.
Changing the surrounding editor theme during capture produces a warning: Deckpilot
cannot freeze the editor and terminal colors themselves.

Existing recordings without appearance metadata remain valid. DiagramService's
`resolveExportBlocks` accepts an explicit request, a recording snapshot, or a
current appearance, in that order. Without host context it uses deterministic
light/default. Standalone output embeds fonts and uses an opaque canvas unless
transparency is explicitly requested.

Triton exposes `resolveThemeFamily`, `renderWithAppearance`, and
`defaultAppearanceManifest`. `renderWithAppearance` returns an appearance snapshot
that can be passed back for deterministic SVG replay. The existing
`getThemePreset('default')` continues to return a concrete light preset.

## Development

The canonical tokens live in Triton. `scripts/generate-appearance.mjs` generates
Deckpilot's manifest and offline web font CSS from `TRITON_CORE_DIST`; do not edit
those generated files by hand. Point it at the pinned Triton package's `dist`
directory when updating that dependency, then run `npm run compile` to rebuild
the host and companions. Normal builds vendor the installed package without
local overrides. **Run Extension** and **Debug Extension (Inspector)** load the
Triton companion alongside the host.