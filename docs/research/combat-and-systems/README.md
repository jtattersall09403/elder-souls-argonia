# Research — combat, character and game systems

What the final game's systems need, and how the reference games do it. Designs live in the world modules; this folder is the evidence.

| File | What it answers | Status |
| --- | --- | --- |
| [game-buildout-systems-audit.md](game-buildout-systems-audit.md) | Everything the final game needs that the world build will not deliver — app/package architecture, quest runtime demands, stats, combat stack, unowned systems. Drives [../../game-buildout-register.md](../../game-buildout-register.md). | live design input |
| [dark-souls-poise-mechanics.md](dark-souls-poise-mechanics.md) | The DS1 poise model at implementation level (pool, poise damage, regen) with DS3/ER deltas. Read by `packages/game-core/src/combat/poise.ts`. | live design input |
| [skyrim-facegen-runtime-pipeline.md](skyrim-facegen-runtime-pipeline.md) | What a real Skyrim head/face pipeline is, and why the previous playable-race build produced near-identical grey heads. Read by `pipeline/npc_records.py`. | live design input |
| [stats-progression-reference-games.md](stats-progression-reference-games.md) | Morrowind's actual formula constants and the mod-sourcing permission facts — the only record of them. Fed module 76. | live design input |
| [swim-climb-boat-implementation.md](swim-climb-boat-implementation.md) | Known-good patterns for surface/underwater swimming, BotW climbing and boats, and what the water query already gives us. | live design input |
| [third-person-bow-aim-camera.md](third-person-bow-aim-camera.md) | How an over-the-shoulder bow-aim camera works (Tears of the Kingdom), for the sandbox's `aimView: "shoulder"`. Read by `apps/combat-sandbox/src/components/CombatScene.tsx`. | live design input |
| [navmesh-ambient-ai-threejs.md](navmesh-ambient-ai-threejs.md) | What the world build must bake so creatures and NPCs can move: nav data formats plus compile-time navigability checks. | live design input |
| [source-game-systems-crosscheck.md](source-game-systems-crosscheck.md) | A UESP sweep of Morrowind and Skyrim systems diffed against our audit and register, triaged per decision 0039. | evidence |
| [skyrim-oblivion-diceless-systems.md](skyrim-oblivion-diceless-systems.md) | How Bethesda's diceless ports run Morrowind-ish systems, and where they went wrong. Report-only; module 76 stays the spec. | research reference |
