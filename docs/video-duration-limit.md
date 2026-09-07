# Video Duration Limit

Set one value in the deck's YAML sidecar:

```yaml
recording:
  maxDuration: 120s
```

The same `recording` block works in Markdown frontmatter or a YAML-primary
deck. `2m` is equivalent; a numeric value is interpreted as seconds. The limit
must be positive. Leave it out for the existing unlimited recording workflow.
No sections or per-slide budgets are required.

## Estimated and Measured

Open **Deckpilot: Open Live Preview** to see the planned total, measured and
estimated narration, measured take count, pauses/overhead, and remaining budget.
Over-budget plans show how much needs shortening.

Before recording, cue lengths are estimated using Auto-Record pacing defaults
or the deck's existing `autoRecord` frontmatter overrides. After srt-dubber
processes a take, the preview uses its measured duration. Unchanged recorded
text remains measured after reordering; missing audio, changed text, or a raw
retake newer than its processed audio returns to estimated. The preview watches
the narration project and take folders, so completing narration refreshes the
summary without modifying your recordings.

The total remains a plan, even with every take measured. It includes scheduled
pauses and estimated UI transition/settle time. Unbounded action runtime and
video durations not yet probed are identified as unknown; the preview does not
certify them. Auto-Record resolves the final reveal layout and video durations
before checking its plan. Narration over an action hold is counted once.

Shorten only the explanations that need changes, then use **Deckpilot: Record
or Update Narration** to record those takes. Use srt-dubber 0.1.2 or newer to
preserve existing takes safely when inserting or reordering cues.

## Strict Final Check

Auto-Record refuses to start a plan already over the limit. A plan below the
limit is not a guarantee: real action execution and final assembly can add time.

After narration is assembled, Deckpilot probes the final MP4 with FFprobe. It
checks the container duration and every audio/video stream's end time without
rounding down. Exactly 120 seconds is allowed for a `120s` limit; any excess
fails. Missing or unreadable duration also fails closed.

The completion message confirms the duration only after this check passes.
Otherwise the video is retained as a draft, and Auto-Record reports that it is
not ready to submit. Deckpilot never silently trims speech, changes the limit,
or accelerates the whole video to make it fit.

A `duration-check.json` beside the final video records `within-limit`,
`over-limit`, or `unverified`, with the configured limit and checked file path.
The result applies to that file at check time; recheck any externally edited
or re-encoded submission. Leave a few seconds of working margin when possible.