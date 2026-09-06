# Adaptive Appearance for Deckpilot and Triton

Status: implemented and approved for coordinated publication. Core adaptive modes, shared host
resolution, renderer integration, live updates, and recording/export snapshots
are implemented. See [usage and compatibility notes](../../docs/adaptive-appearance.md).

## Recommendation

Separate visual style from color mode. Ship one redesigned `default` family with
matched light and dark variants, using the same typography and geometry. Make
`auto` the default mode in interactive hosts. Resolve the effective appearance
once per deck and window, and pass it to presentation, side preview, diagrams,
and recording/export. Renderers must not independently inspect the editor theme.

Auto should follow the editor's light/dark and high-contrast classification, not
copy every color from the installed VS Code theme. The deck keeps its teal/coral
identity while fitting the surrounding environment. Editor chrome remains under
VS Code's control.

## Problem and Current State

The current system has separate decisions that can disagree:

- Deck metadata has both `theme` and `options.theme`.
- Presentation initialization reads `options.theme`; deck-loaded messages also
  carry top-level `theme`.
- DiagramService resolves a diagram theme separately, including its own read of
  the active VS Code theme.
- The Triton adapter interprets another set of aliases and strips the SVG's
  background rectangle regardless of whether its palette matches the slide.
- The recent side-preview change honors explicit deck colors but does not
  coordinate an adaptive appearance with diagrams.

This explains both white slides in a dark editor and potentially unreadable
diagrams when a light palette loses its background on a dark slide.

Relevant existing integration points:

- [Deck metadata and diagram defaults](../../packages/core/src/models/deck.ts)
- [Diagram render options/results](../../packages/core/src/models/diagram.ts)
- [DiagramService](../../packages/extension/src/services/diagramService.ts)
- [Triton adapter](../../apps/deckpilot-triton/src/tritonAdapter.ts)
- [Presentation host](../../packages/extension/src/webview/webviewProvider.ts)
- [Side-preview provider](../../packages/extension/src/preview/previewProvider.ts)

## Goals and Boundaries

1. An unconfigured deck follows the host's color mode without a restart.
2. Slides and inherited diagrams always agree on mode, canvas, and contrast.
3. A mode change changes colors, not typography, geometry, reveals, or actions.
4. Explicit author choices and legacy presets remain usable.
5. Fonts work offline, and captured/exported output has reproducible appearance.
6. Presentation and side preview work independently as well as together.

This is not a CSS-inversion feature, a new diagram layout engine, or an automatic
recoloring of images. Screenshots, videos, brand icons, and explicit author colors
retain their meaning. No changes to the user's global VS Code theme are required.

## Authoring Contract

The normal case should require only a title. Its effective defaults are:

```yaml
title: My Talk
appearance:
  style: default
  mode: auto
  contrast: auto
```

- `style` chooses the visual family: typography, spacing, shapes, and palette roles.
- `mode` accepts `auto`, `light`, or `dark`.
- `contrast` accepts `auto`, `normal`, or `high`; Auto honors system accessibility.
- Sidecars use the same object under `deck.appearance`.
- Workspace defaults use `deckPilot.appearance.style`, `.mode`, and `.contrast`.
- Omitted fields inherit individually; a partial object does not erase other fields.

For a fixed presentation or recording, change only `appearance.mode` to `dark`
or `light`. Auto must never override an explicit fixed mode.

Diagrams inherit the resolved deck appearance by default. Optional deck-wide
diagram settings are:

```yaml
diagrams:
  style: inherit
  mode: inherit
  surface: auto
```

Diagram modes accept `inherit`, `light`, or `dark`, not an independently resolved
`auto`. A per-fence override such as `{style: executive, mode: dark, surface: opaque}`
is an intentional local exception. Most decks should need none of these fields.
Existing `diagram:mermaid` fences do not need to be renamed.

### Resolution and Precedence

First apply the existing frontmatter/sidecar merge rules. Then resolve each field:

1. Explicit session selection in Deckpilot's appearance control.
2. New authored `appearance` field.
3. Recognized legacy author settings.
4. Workspace preference.
5. Built-in default: style `default`, mode `auto`, contrast `auto`.

At an authored level, explicit `auto` means follow the environment, not fall back
to a lower-priority fixed preference. A diagram's precedence is fence override,
diagram-body metadata, deck-wide diagram default, then inherited deck appearance.
Use the existing structured metadata parser, not another regex-based theme parser.

Resolve mode and contrast separately:

| Host Kind | Auto Mode | Auto Contrast |
| --- | --- | --- |
| Light | light | normal |
| Dark | dark | normal |
| High Contrast Light | light | high |
| High Contrast Dark | dark | high |

For example, authored `mode: light` in a high-contrast dark editor resolves to
light/high unless contrast was also explicitly selected. Do not collapse both
high-contrast host kinds into a dark theme.

## Visual System

The default family uses Source Sans 3, neutral surfaces, teal for the primary
accent, and coral for secondary emphasis. Dark mode is a separately designed
palette, not an inversion or a brightness adjustment of the light palette.

Initial palette proposal:

| Role | Light | Dark |
| --- | --- | --- |
| Canvas | `#FFFFFF` | `#171B1D` |
| Node surface | `#F3F6F5` | `#22292C` |
| Text | `#20282B` | `#EFF4F3` |
| Muted text | `#576567` | `#B4C0BE` |
| Essential border | `#7B8C88` | `#788B87` |
| Connector | `#576567` | `#B4C0BE` |
| Primary | `#087F78` | `#55C6BA` |
| Text on primary | `#FFFFFF` | `#14201F` |
| Secondary | `#B9503F` | `#EF9A86` |
| Text on secondary | `#FFFFFF` | `#14201F` |

Define text-on-fill roles explicitly instead of assuming white labels work on
every accent. Success, warning, and error retain separate semantic roles with
mode-specific accessible colors. They must also have labels or other non-color cues.

Ordinary sequence steps should not alternate primary/secondary merely because
their indexes are odd or even. Use a consistent treatment for ordinary steps;
reserve secondary emphasis for a meaningful group, alternate route, or authored
emphasis. Scope this behavior to the new default family; preserve legacy styling.

Keep fonts, weights, spacing, corner radii, line heights, and stroke dimensions
identical between paired modes. Start with the current redesign's 15px body,
20px diagram title, 12px small labels, 2px connectors, and 4px standard corners.
Slide headings remain a separate size scale, using the same family.

Normal-mode acceptance targets: body text at least 7:1; small/muted text and
text-on-accent at least 4.5:1; essential connectors/boundaries at least 3:1.
High-contrast variants prioritize accessibility over the brand palette and target
7:1 text contrast. Test actual painted backgrounds, including inherited canvases.

### Font Delivery

- Bundle regular and bold Source Sans 3 with its license; no network font dependency.
- Register the font once in each webview shell, before fitting the first slide.
- Standalone SVGs embed their fonts by default. Inline SVGs may omit duplicates
  only when the host confirms it has loaded the matching font-asset revision.
- Native exports use the bundled TTF faces, not whichever system font is found first.
- Keep code typography separate from prose typography.
- Document script coverage and preserve appropriate fallbacks. Do not claim
  deterministic glyph metrics for an unbundled fallback font.
- Retain the narrow local/data-only font CSP policy.

## Architecture and Ownership

### Canonical Theme Families

Triton owns a versioned, portable token manifest for its theme families. A family
contains shared typography/geometry and palette variants keyed by mode/contrast.
Publish that small manifest and font-asset metadata separately from the compiler
entry point. Deckpilot consumes the default-family manifest at build time for
its slide CSS tokens; it does not need to load the compiler to paint a slide.

Do not maintain handwritten copies of the same hex values in CSS, adapters, and
the compiler. Record the manifest hash in generated artifacts so a mismatched
host/companion pair is detectable. Other diagram engines consume the neutral
appearance contract, not Triton-specific layout types.

Triton keeps its existing concrete `ResolvedTheme` layout contract. Add a family
resolver in front of it: family + concrete mode + contrast + explicit overrides
produces a complete ResolvedTheme. Keep `getThemePreset('default')` returning its
legacy concrete light variant for callers that do not opt into the new API.

### Shared Host Resolution

Add a pure resolver to Deckpilot core and an extension-layer AppearanceService:

```text
Authored preferences + workspace defaults + host appearance
                         |
                 AppearanceService
               (keyed by deck URI)
                         |
                 ResolvedAppearance
                 /        |        \
         Presentation  Side preview  DiagramService
                                      |
                                Renderer adapters
```

The pure resolver accepts environment information as input; it never imports
VS Code. The service reads VS Code once and owns subscriptions and session state.
Inject the same service into Conductor and PreviewProvider, rather than making
the side preview depend on an active presentation.

The resolved context contains a concrete mode and contrast, effective style,
semantic palette/canvas tokens, typography/font-asset identity, manifest hash,
and a revision. It contains no `auto` values and no process environment data.
Each renderer resolves its own diagram family deterministically against that
context. No adapter or client-side fallback re-reads the editor theme.

### Renderer Protocol

Extend DiagramRenderOptions additively with an appearance context and surface
policy. Keep the existing `theme` hint for legacy adapters. Add an optional
renderer capability declaration for appearance-protocol support.

New renderer results report effective style/mode, intended canvas color, whether
the background was painted, and the appearance revision. This lets the host
validate composition instead of guessing by inspecting arbitrary SVG markup.

The Triton adapter passes mode/contrast to the family resolver. The Mermaid
adapter maps the same context to its theme variables. Compatibility diagnostics
must distinguish an old renderer from unsupported diagram syntax; never silently
send Triton-only syntax to plain Mermaid as a theme fallback.

## Background Composition

`surface: auto` should be the default:

- Inherited, compatible diagram: paint transparently into the slide canvas.
- Explicit diagram variant with a different canvas: retain its opaque background.
- A legacy renderer with unknown background semantics: preserve its output and
  report that full appearance parity requires an updated adapter.
- Unknown or unsupported mode variant: retain the style's native variant on an
  opaque canvas and issue a diagnostic, rather than selecting an unrelated style.

`opaque` always paints the diagram's resolved canvas. Explicit `transparent`
requires compatible contrast against the parent canvas. Report unsafe requests;
presentation should use a readable opaque fallback, while strict validation may
reject the configuration before a recording or export.

Remove unconditional background-rectangle stripping. Give Triton's SVG renderer
an explicit background-paint option. Keep the real palette background available
for contrast calculations even when the canvas is not painted. No CSS inversion,
blank background tokens, or regex recoloring of SVG.

## Live Behavior and Controls

Expose a small appearance menu in presentation and preview: style, Auto/Light/Dark,
and System/Normal/High contrast. Show the effective state, such as `Auto (Dark)`.
Choices apply to that deck session in the current window and synchronize its
preview and presentation. Writing the choice into the deck requires an explicit
save action; do not silently rewrite Markdown or workspace settings.

On a host theme change:

1. Re-resolve only decks whose relevant fields are Auto.
2. Issue a new appearance revision and prepare matching visible diagram renders.
3. Apply the new slide tokens and diagrams together to avoid a contrast flash.
4. Discard asynchronous results for older deck/appearance revisions.
5. Preserve slide, scroll position, reveal step, focus, and action status.

Do not navigate, re-execute actions, restart narration, or rebuild the sidecar.
Mode switching must preserve diagram group IDs and geometry. Exact SMIL animation
phase continuity is not a phase-one guarantee; logical presentation state is.

Cache rendered output using source/layout inputs, renderer version, effective
token/manifest hash, font revision, mode/contrast, and surface policy. A dark
render must never satisfy a light request. Preview document refresh versions and
appearance revisions must both participate in stale-result rejection.

## Recording and Export

At recording start, resolve Auto and capture an AppearanceSnapshot containing
the effective tokens, style/mode/contrast, font-asset identity, and renderer/theme
versions. Freeze the deck appearance for the entire recording, including retakes.
Resume Auto-follow after recording stops.

The snapshot does not freeze VS Code's editor or terminal colors. Detect and warn
if those change during whole-window capture; do not modify global settings or
claim the entire IDE can be frozen by Deckpilot.

Exports use an explicit requested appearance, otherwise the recording snapshot,
otherwise the current interactive appearance. Headless calls without a snapshot
or host context use a documented deterministic light/default baseline and accept
explicit mode/contrast overrides. Exported files never contain unresolved Auto.
PNG and standalone SVG default to an opaque canvas; transparent export is explicit.
Existing recordings without appearance metadata retain their current behavior;
do not invent a snapshot for an already-recorded video.

## Compatibility and Migration

- Explicit legacy `theme: light` / `theme: dark` remain fixed choices.
- Normalize top-level legacy `theme` ahead of `options.theme` if both exist;
  emit a conflict diagnostic. New `appearance` fields win individually.
- Keep legacy deck-style names separate from renderer preset names: Deckpilot
  `minimal` and Triton `minimal` currently do not imply the same canvas.
- Legacy diagram preset strings retain their intrinsic appearance. A single-mode
  preset is not automatically recolored into a new dark/light counterpart.
- Legacy diagram `theme: auto` normalizes to inheritance in the new protocol.
- Unconfigured decks adopt Auto; explicitly styled decks do not silently switch.
- Old adapters keep working through the legacy options path, with an upgrade
  diagnostic where they cannot guarantee the new appearance contract.

For this presentation, the eventual migration is to remove `theme: light` and
`diagrams: {theme: default}`, replacing them with:

```yaml
appearance:
  style: default
  mode: auto
```

The slide content, actions, narration cues, and timings remain unchanged. This
proposal does not apply that migration yet.

## Verification and Rollout

Required tests:

- Pure resolution matrix: all four host kinds, Auto/fixed modes, contrast choices,
  workspace/session overrides, partial sidecars, and conflicting legacy fields.
- Palette contrast for every semantic role and background combination; no
  undefined color tokens, mode-dependent font metrics, or missing font assets.
- Real adapter tests for flowcharts, every list shape, nested posters, and
  diagrams with explicit fixed-mode overrides.
- Browser checks for presentation and side preview in light/dark/high contrast,
  multiple viewport sizes, offline font loading, and background composition.
- Live switches during a partially revealed slide: stable groups, preserved
  fragment/action state, no mixed-mode flash, and stale-render rejection.
- Recording freeze and reproducible SVG/PNG output from a saved snapshot;
  explicit coverage for changes to the surrounding editor during capture.
- Installed-extension and development-host smoke tests with matching artifact
  hashes, not only compiler-unit tests or an isolated browser harness.

Implementation sequence:

1. **Triton foundation:** paired default family, high-contrast variants, portable
   token/font manifest, family resolver, explicit canvas painting, and tests.
2. **Deckpilot integration:** authoring normalization, shared AppearanceService,
   renderer protocol, token-driven slide CSS, and preview parity.
3. **Runtime and capture:** synchronized controls, live updates, cache revisions,
   appearance snapshots, and headless export rules.
4. **Adoption:** review light/dark screenshots, migrate this deck, then publish
   coordinated host/companion releases and retire the temporary preview profile.

Start with the default family. Keep other named presets compatible and migrate
them to paired families only when each pair has been designed and verified.
The existing offline-font work is reusable. The current hardcoded preview
palette rules should be replaced by shared resolved tokens, not expanded further.

## Expected Outcome

With Auto in a dark VS Code window, this deck, its diagrams, and its side-preview
slide canvases all use the same dark default family with Source Sans 3. In a light
window, the same source uses the matching light family. A fixed author choice
stays fixed, and recording/export captures a stable, explicit appearance.