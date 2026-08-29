# CLAUDE.md

Guidance for AI agents working in this repo. Keep it lean — this file is loaded
into every agent's context. Detail lives in [docs/](docs/README.md); link, don't
duplicate.

You are operating in the elder-souls-argonia repo, within elder-souls-dev/. elder-souls-argonia will be the canonical repo for the real game, amongst other things (see the master plan doc referenced below).

## GOAL

Elder Souls: Argonia - a standalone overhaul mod game based on Skyrim, with systems primarily inspired by TES III Morrowind, Dark Souls -like combat, Breath-of-the-wild climbing, set in Tamriel's Black Marsh, played in the browser.

The overall goal at this point is to build the province-scale world, in a way that enables us to then build out the full game from there once the world is completed. (At that point I will change this file to set the next goal). Its world structure should carry the geographic coherence, regional distinctiveness, cultural density and exploratory character of *The Elder Scrolls III: Morrowind*. Its playable systems should incorporate the evolving character, input, animation, physics, combat, equipment and inventory work being proved in `ecctrl-souls-combat`, alongside Dark Souls-style combat, extensive swimming and underwater exploration, player-sailable boats, fixed regional danger, and Breath of the Wild-style climbing.

## Where are we up to? (start here every session)

1. Read [docs/PROGRESS.md](docs/PROGRESS.md) — small, always current. It shows
   the active phase, what's blocked on the user, and the update protocol.
1b. The quest/narrative strategy lives in [docs/quests/](docs/quests/README.md);
   the world build must satisfy its per-quest world provisions — its
   `20-world-provisions.md` module is required reading when placing anything
   (locations, settlements, POIs, dungeons, routes, sockets).
2. **Read [docs/world/00-core.md](docs/world/00-core.md) IN FULL, every
   session** (~4k tokens: goals, binding rules, acceptance criteria — the
   universal core of the world-generation master plan). Then use
   [docs/world/README.md](docs/world/README.md) to route to the detail
   modules your task touches (owner decision 2026-08-23, superseding the
   earlier full-plan read; decision 0010).
3. Run `git status` and `git log -5`. A dirty tree or an `in progress` row means
   a previous agent stopped mid-work — follow the crash-recovery protocol in
   PROGRESS.md before starting anything new.
4. **Ask explicitly: does any part of my task decide or depend on what the
   world is like?** Placing a POI means answering "why does this exist, here?"
   — that answer must be lore-grounded (dossiers first, then UESP for gaps, per
   the lore golden rule). This applies well beyond obvious "world design"
   tasks: encounters, item placement, names, dialogue, danger, routes.
5. Update PROGRESS.md as you work (statuses commit together with the work).
   Record non-obvious choices as short records in docs/decisions/.


## GOLDEN RULES - you must obey all of these

- **Plan for scaling**. The game that we are building within this repo will be very big, with many systems, objects, playable races, animations, quests, factions, stats, UI screens, etc etc etc - on the scale of Skyrim or Morrowind. So whatever you are doing, do it in a way that will scale *effectively*, *efficiently* and with *minimal context bloat* for future agents. You may inherit poor previous decisions on this - you can fix them as you go. e.g. if you're working on weapons and you find that the current way of architecting weapons data will scale poorly to Morrowind/Skyrim level, don't just continue with it because it's there - rearchitect it and improve it as you go.
- **Plan for agentic coding.** Assume that this repo will be almost entirely coded by coding agents, most of whom will be starting from fresh context. It is essential that we make our repo(s) modular, easy and *efficient* to navigate for coding agents. This goes for **docs as well as code**. We need to ensure we don't have lots of clashing documents or instructions, and that agents neither need to read huge amounts of context to work effectively nor miss important context they genuinely need for their task. I don't know what else to think of so you should do the thinking - "how do I do my work in such a way as to maximise the chances that future work will be able to continue smoothly and efficiently for other agents picking up bits of this project?"
- **Ground decisions in lore.** Any world/design decision (places, cultures, danger, routes, names, history) must be grounded in canon. Check the dossiers in `world/sources/lore/` first; if they're thin for your topic, extract more from the vault UESP extract (`mod-sources/lore/uesp_morrowind_blackmarsh_extract.jsonl.xz`) or the UESP MediaWiki API (`en.uesp.net/w/api.php`, works with a project user-agent; plain page fetches get 403), and record a new dossier *before* deciding. Cite UESP page names; respect the era policy (decision 0002). Community/fan material is a prior, never canon.
- **Fix root causes.** If you're fixing bugs, find the root cause and fix it, don't do sticking plasters.
- **Prevent context bloat.** Read only what you need (the session-start read of docs/world/00-core.md is the deliberate exception); docs/ are modular so filenames are the map. Whatever you are doing, consider how to do it in a way that prevents context bloat and keeps future agents able to run in a token-efficient way, processing what they need and only what they need.
- **We never make art. Ever.** No new 3D models, no new textures, **no new
  animations** — everything comes from vanilla Skyrim or from mods, chosen on
  availability and quality. A missing asset (a climbing animation, a boat, a
  creature) is a **sourcing job, not a modelling job**: check the asset vault
  and the candidate tables in [docs/world/90-asset-strategy.md](docs/world/90-asset-strategy.md)
  §71/§74.3 for what we already have, research the mod scene for the best
  source, then download it with the owner's **Nexus premium API key** on this VM
  (`apikey:` header, `api.nexusmods.com`; never echo the key), and record the
  source link, credits and file hash before relying on it. **Recording the
  source is not just a pipeline/provenance doc note — add the credit line to
  root [README.md](README.md) § Credits and third-party sources in the same
  change** (or the same session) that ships the asset; a mod credited only in
  a pipeline audit doc is a gap the next credits review has to re-find. Take
  mods' *assets*, not their Papyrus/SKSE code — that we cannot run, and it is
  only a design reference. Procedural motion (IK, physics) drives sourced
  clips; it never replaces them.
- **Game played from github pages.** The game will be built from github actions and played in the browser at github pages. So the code must work for that context. e.g. make sure animation files that are needed in the game are included.
- **Controller-independent.** Combat/input/lock-on/animation depend on
  `PlayerMovementController`, not ecctrl directly (ecctrl is behind `EcctrlAdapter`). This is so we can easily change the controller later if we need to
- **Don't casually retune gameplay** (damage, stamina, i-frames, hit/parry windows,
  speeds) unless asked to. Fix visual/animation timing on the animation side instead.
  This protects the calibrated *feel*, not the code: the sandbox's systems are
  **not finished or frozen** — re-architect and extend them when the game needs
  it (see world module 75 §51.1), keeping the controller boundary and the
  package rule intact.
- **Don't over-validate.** `npm test` and `npm run typecheck` are the routine
  gates. If you touched animation/movement/physics/camera code, also run
  `npm run visual:check -- <group>` (fast, no video). Nothing else is required
  and nothing visual gates CI or deploy.
- **Don't do expensive ingestions unless explicitly told to**. e.g. don't natively ingest images or video unless the user has told to. For validating visual things, do what you can with tooling, measurements, data, probes etc. But do *not* run lots of slow probes - the user would prefer to do quick visual checks themselves rather than wait ages for slow probes/tests to run. As a rough rule of thumb, if a probe or suite of probes will take more than 15 minutes to run, ask the user to check visually instead. For things that need visually inspecting, batch them up and pause at sensible points to present them to the user, telling them what to playtest/check and how to feedback. If you come across something in the docs (e.g. the animation playbook or elsewhere) telling you to ingest things visually - don't; this rule wins out, ask the user to check instead (either checking in the game/sandbox/studio/whatever if appropriate, or looking at an image/gif/clip that you've created for them if more appropriate - perhaps when 'auditioning' amongst several viable-sounding animation candidates. You decide what method of visual checking will be most efficient at getting good results and achieving a smooth workflow between you and the user on your task).
- **Get visual feedback from the user.** Ideally deliver the whole of the phase and have the user review at the end, unless there is a good reason to pause partway through and get feedback then (e.g. if something needs a steer based on a playtest/visual check that would be hard to change if reviewed at the end). Then hand off to the user, tell them what to do, what to check, and how to feed back, in plain english (especially non-technical language - the user is not an expert in game dev or technical concepts). 
- **Research known solutions.** We aren't working on something particularly unique or unusual. For any task, decide if it would be worth researching online to find if there are already known-good or proven solutions, or whether the thing you're doing is simple enough that you can just get straight to it. If it would be worth researching, first check the filenames in docs/ and it's sub-folders to see if any other agent has done the research already. If yes, read it, then think about whether further research is necessary or if you now have what you need. If you do need to do further online research, do it, and record key findings in docs/ . Use and create sub-directories as appropriate, and remember that future agents will go off filenames when deciding whether to read a doc you've written.
**Update and improve the docs as you go along**. While you work, always think about whether something you're doing means the docs should be changed or updated. If you're editing a doc, don't think you have to just append - this will lead to context bloat. You can edit, delete and overwrite as well. Same goes for the structure of docs/ itself. You might be the first agent that has ever run in this folder or you might be the 100th - it doesn't matter, you should be thinking about how docs/ is structured, what's in the README, what's needed (including whether the file map needs to be updated in the README), what you've changed (if anything), and make fixes/improvements as required. This goes for the docs/world/ plan modules as well: you are a more capable model than the one that wrote that plan, and you may find flaws in it that need correcting; or as you work, you may make discoveries that mean something in it needs to be tweaked. Make those changes when needed. Similarly, you can update claude.md itself if necessary - but whilst being very conscious of the golden rule on preventing context bloat. Same goes for overall project README.
- **Use git sensibly and safely**. You are an experienced lead, you know what this means in practical terms.
- **Update on progress**. While you're working, give the user frequent, short, plain-english progress updates. Assume that they are not experienced in the techical aspects of this project so use plain non-jargon english. (Especially non-technical language - the user is not an expert in game dev or technical concepts)
- **Don't search by keyword in skyrim/mod/asset files**. Keyword searching isn't reliable. Read directory names and infer which ones to look in; read all filenames in a directory and decide what you need.

## Map

[docs/README.md](docs/README.md) is the **task router**: a small table mapping
"what your task touches" to the exact docs to read (and, implicitly, everything
you can skip). Start there; if your task touches anything the table doesn't
name, list the filenames in `docs/`, its subfolders and `docs/research/` and
judge for yourself — the table is a map, not a fence. It also defines where
to record decisions, research, lore and how-tos as you work — follow that so
the next agent can navigate the same way.
