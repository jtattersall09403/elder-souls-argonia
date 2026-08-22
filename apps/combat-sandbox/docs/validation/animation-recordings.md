# Animation recordings

Two separate tools. Do not confuse them.

| Command | Cost | What it is | When |
| --- | --- | --- | --- |
| `npm run visual:check [group…]` | ~1 min | Automated probes, no video | Freely, whenever you touch animation/movement/physics/camera code |
| `npm run visual:record [group…]` | ~1 min per scene | Recordings for the project owner to watch | Only when the owner is going to watch them |

Neither gates CI, deployment, or merge. There is no attestation and no sign-off
file. If your change is mechanically green and nobody needs to look at it, you
are done.

## When to record

Record when **how it looks** is the deliverable and you need a human eye:

- you added, replaced, retimed, or reblended an animation clip;
- you changed transition/blend behaviour, grounding, or weapon attachment;
- you are handing back work whose success can only be judged by watching it;
- the owner asked for a recording.

Do **not** record for: refactors, tuning numbers with no visual intent, bug
fixes the probes already confirm, unrelated code, or "just to be safe". A
recording nobody watches is wasted owner attention, which is the scarce
resource here. When in doubt, run `visual:check` and ask.

Record only the affected group. The full 28-scene suite is for when the owner
asks for it, not for routine handoff.

## Groups

`src/game/validation/visualScenarioGroups.json` maps a name to its scenarios,
so both commands accept either:

```bash
npm run visual:check -- locomotion
npm run visual:record -- evasion attacks
npm run visual:record -- roll backstep          # individual scenarios also work
VISUAL_RUN_ID=before npm run visual:record -- roll   # named run for before/after
```

Groups: `locomotion`, `evasion`, `airborne`, `attacks`, `defense`, `reactions`,
`criticals`, `utility`. Every scenario belongs to one (unit-tested).

Output lands in `artifacts/visual-validation/latest/` (or
`runs/<VISUAL_RUN_ID>/`), all gitignored.

## Handing a recording to the owner

The agent generates the evidence; the owner is the visual authority. Do not
watch the videos or fill in the form yourself unless explicitly asked — an
agent's opinion of its own output is not review.

Give the owner:

1. the absolute path to `review.html` (everything in one page), and
2. the specific question — which scene, which action, what to look for, what you
   changed and what you were unsure about.

The owner writes a verdict and notes per scene in `review.md` next to it. That
file is free text and nothing validates it; read what they wrote and act on it.

## What each scene produces

```text
<scenario>/
├── recording.webm           # whole scene at production speed
├── normal-speed-review.gif  # same pixels, no video player needed
├── action-closeup.webm      # action intervals, centre-cropped and enlarged
├── motion-strips/           # every rendered run, ≤1 s per strip
├── transition-boundaries/   # both sides of every clip handoff
├── contact-sheet.png, final.png
└── telemetry.json, motion-analysis.json, evidence.json
```

The strips exist for diagnosing a defect the owner spotted at normal speed.
They are not a checklist to work through.

## How the capture stays honest

Non-obvious constraints — read before editing `scripts/capture-visual-scenarios.mjs`:

- Playwright records at 25 Hz while the game clock is 30 Hz. Each fixed-step
  pose is held on screen for longer than two recorder periods so the recorder
  cannot skip one. The hold starts at presentation, not at draw start, so
  variable SwiftShader render time sits outside the budget.
- The browser adds a 12 px recorder-only gutter above the 800×450 viewport
  carrying a binary frame code, updated after combat and pose probes but before
  R3F renders. The runner decodes every raw frame and rebuilds the video from
  the exact frame bearing each code, then **crops** the gutter — so reviewed
  pixels are the production viewport and can never show the marker.
- Alignment authority is those decoded pixels, never an inferred wall-clock
  start. An earlier version inferred the origin and put mid-`ROLL` pixels at
  frame 0 while telemetry did not enter `ROLL` until frame 16.
- Derivatives (GIF, close-up, strips, contact sheet) all reuse the one selected
  lossless frame sequence rather than re-decoding the lossy WebM.

Flags: `--headed`, `--hitboxes`, `--tiny`, `--no-video`, `--new-headless`.
`VISUAL_TIMEOUT_MS` overrides the per-scene timeout. `--tiny`/`--no-video` add
`?fast=1`, which drops expensive presentation effects; recorded runs keep them.

## Automated probes

`visual:check` and `visual:record` both assert the production path: expected
action/animation runs in exact order, mesh-to-floor support and penetration,
actor tilt, bone rotation step and jerk, weapon-to-body contact at damage
frames, riposte/backstab phase order and actor roles, and critical
fall→floor→get-up continuity. They can fail a run; they never decide whether it
looks good.

Probes are for a specific known class of defect, not a subjective idea of
style. Add motion limits only when derived from a known-bad and a known-good
result, and set the limit at the visible defect rather than a convenient number.

## Adding coverage

Scenarios live in `src/game/validation/`. Add a focused registry entry that
reaches the action through production input or enemy intent — never a one-off
React viewer, never by commanding an animation directly. Declare the expected
ordered action and animation runs for both actors, and add the new scenario to a
group. A runtime animation no scenario reaches prints a warning; it does not
block a capture.
