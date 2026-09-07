# Auto-Record Editor Demos

An action can opt into a timed editor demonstration during Auto-Record:

```yaml
deck:
  basePath: .
items:
  - id: preview
    cues:
      - "Here is the Markdown source beside its live slide preview."
    actions:
      - type: sequence
        label: Open source and live preview
        autoRecord: {viewMs: 8000, returnToDeck: true, cue: 1}
        steps:
          - type: file.open
            path: talk.deck.md
            viewColumn: 1
          - type: vscode.command
            id: deckPilot.openPreview
```

`viewMs` is the minimum viewing time after the action and normal UI settling.
An associated narration cue can extend the hold. If omitted, the normal
Auto-Record `fileViewMs` applies. The option is ignored during manual playback.

`cue` selects a cue by its 1-based position within this slide's non-timed cues,
not by its global take number. The selected cue plays after the action completes,
during the hold, rather than during a preceding reveal. It is scheduled exactly
once. Invalid references or assigning one cue to multiple actions stop preflight.
Omit `cue` to retain the existing narration scheduling.

To record a new explanation without replacing other takes, add a cue and run
**Deckpilot: Record or Update Narration**. Existing takes are matched by cue text;
record only the new pending cue, then run Auto-Record again. Leave existing cue
wording unchanged to preserve those matches.

Use srt-dubber 0.1.2 or newer when inserting cues into an existing narration
project. Earlier versions can reuse indexed filenames and overwrite audio still
referenced by a shifted cue.

The recorder snapshots existing tabs and editor layout before the action.
After the hold, it closes only unmodified tabs created by that action and
reveals the presentation. Pre-existing tabs and tabs opened later are retained.
Dirty demo tabs are also retained without a save prompt; in that case the
recorder avoids restoring a layout that would rearrange retained new tabs.
Cancellation uses the same cleanup path.

The live-preview open command preloads diagram results so its initial page
does not depend on early webview update messages. Auto-Record preflights
rendered fragment counts and action positions in detached DOM elements before
capture. This includes Triton reveal groups and sidecar buttons without
executing actions or navigating the visible deck.