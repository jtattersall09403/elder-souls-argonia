# CLAUDE.md

Guidance for AI agents working in this repo. Keep it lean — this file is loaded
into every agent's context. Detail lives in [docs/](docs/README.md); link, don't
duplicate.

## What this is

A **combat + character sandbox**, private/personal. It exists to prove that
Souls-like melee combat and the character/animation systems can be made **fun**
and **good-looking** before the proven core is lifted into a full game in a new
repo.

The eventual game: a new Elder Scrolls title set in Argonia/Black Marsh —
TES3 Morrowind as primary inspiration, **Dark Souls combat**, **Skyrim visuals**
(and Skyrim/Morrowind hybrid magic), plus climbing/traversal. None of that world
is built here; this is only the combat/character proving ground.

## Golden rules

- **Plan for portability.** Remember our goals above: we are using this repo as a sandbox to develop systems that will then be lifted into the 'real' game. This repo is not the real game. So whatever you are doing, separate out in your mind things that are intended to be taken forward into the real game and things that will be discarded. Architect your work accordingly. This can include restructuring aspects of the repo/folder structure: don't **assume** that an existing structure or way of working is correct just because it's there, you may be inheriting a previous agent's poor architecture decisions. If something should be changed to improve portability, do it.
- **Plan for scaling**. The final game will eventually be very big, with many systems, objects, playable races, animations, quests, factions, stats, UI screens, etc etc etc - on the scale of Skyrim or Morrowind. So whatever you are doing, do it in a way that will scale *effectively*, *efficiently* and with *minimal context bloat* for future agents. As above, you may inherit poor previous decisions on this - you can fix them as you go. e.g. if you're working on weapons and you find that the current way of architecting weapons data will scale poorly to Morrowind/Skyrim level, don't just continue with it because it's there - rearchitect it and improve it as you go.
- **Plan for agentic coding.** Assume that this repo and the broader game we are aiming to build will be almost entirely coded by coding agents, most of whom will be starting from fresh context. It is essential that we make our repo(s) modular, easy and *efficient* to navigate for coding agents. We need to ensure we don't have lots of clashing documents or instructions, and that agents neither need to read huge amounts of context to work effectively nor miss important context they genuinely need for their task. I don't know what else to think of so you should do the thinking - "how do I do my work in such a way as to maximise the chances that future work will be able to continue smoothly and efficiently for other agents picking up bits of this project?"
- **Fix root causes.** If you're fixing bugs, find the root cause and fix it, don't do sticking plasters.
- **Prevent context bloat.** Read only what you need; docs are modular so filenames are the map. Whatever you are doing, consider how to do it in a way that prevents context bloat and keeps future agents able to run in a token-efficient way, processing what they need and only what they need.
- **Game played from github pages.** The game will be built from github actions and played in the browser at github pages. So the code must work for that context. e.g. make sure animation files that are needed in the game are included.
- **Semantic animations only.** Game code references states (`IDLE`, `ROLL`,
  `LIGHT_1`, …), never Bethesda filenames. Reskinning a clip is a pipeline rebuild.
- **If you are going to work on animations, read the animation playbook first.** Before adding, replacing, retiming, or
  debugging animation output, follow
  [docs/animation-quality-playbook.md](docs/animation-quality-playbook.md). It
  records the fast pipeline-first workflow and the source/timing/ownership/
  grounding/transition failure modes already solved here. No need to read it if you aren't going to work on animations though.
- **Controller-independent.** Combat/input/lock-on/animation depend on
  `PlayerMovementController`, not ecctrl directly (ecctrl is behind `EcctrlAdapter`). This is so we can easily change the controller later if we need to
- **Don't casually retune gameplay** (damage, stamina, i-frames, hit/parry windows,
  speeds) unless asked to. Fix visual/animation timing on the animation side instead.
- **Don't over-validate.** `npm test` and `npm run typecheck` are the routine
  gates. If you touched animation/movement/physics/camera code, also run
  `npm run visual:check -- <group>` (fast, no video). Nothing else is required
  and nothing visual gates CI or deploy.
- **Recordings are for the owner's eyes, on purpose.** Run
  `npm run visual:record -- <group>` only when *how it looks* is the deliverable
  and the owner is going to watch it — new/replaced/retimed clips, changed
  blending or grounding, or when asked. Record the affected group, not all 28
  scenes. Then hand over the absolute path to `review.html` plus the specific
  question you want answered, and stop. Do not watch the videos or fill in
  `review.md` yourself unless asked; the owner is the visual authority and their
  attention is the scarce resource. Details:
  [docs/validation/animation-recordings.md](docs/validation/animation-recordings.md).
- **Research known solutions.** We aren't working on something particularly unique or unusual. For any task, decide if it would be worth researching online to find if there are already known-good or proven solutions, or whether the thing you're doing is simple enough that you can just get straight to it. If it would be worth researching, first check the filenames in docs/ and it's sub-folders to see if any other agent has done the research already. If yes, read it, then think about whether further research is necessary or if you now have what you need. If you do need to do further online research, do it, and record key findings in docs/ . Use and create sub-directories as appropriate, and remember that future agents will go off filenames when deciding whether to read a doc you've written.
**Keep the docs up to date**. When you work, always think about whether something you have changed means the docs should be changed or updated, (including the animation playbook if you've been working on animations). If you're editing a doc, don't think you have to just append - this will lead to context bloat. You can edit, delete and overwrite as well.

## Assets

Game assets are built from owned Skyrim data by the
sibling repo `../elder-scrolls-asset-pipeline` and copied into `public/`
(the runtime character and weapon GLBs are intentionally versioned so a clean
GitHub Pages checkout works). Source archives, extracted assets, pipeline
outputs, and validation recordings stay gitignored. To rebuild/replace, see
[docs/assets/rebuilding-the-character.md](docs/assets/rebuilding-the-character.md).

## Commands

```bash
npm run dev         # playtest
npm run typecheck   # tsc -b
npm test            # vitest
npm run build       # tsc -b && vite build

# Animation only. Both take scenario ids or group names (blank = all 28 scenes).
npm run visual:check  -- locomotion  # fast probes, no video — run freely
npm run visual:record -- locomotion  # recordings for the owner to watch
```

## Map

Start at [docs/README.md](docs/README.md). Explore filenames and directory names from there.
