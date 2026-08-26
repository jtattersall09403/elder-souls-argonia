# Mod animation ingestion

Use this document for package/provenance mechanics. For source selection,
runtime integration, quality diagnosis, and the efficient validation order,
also follow
`../../ecctrl-souls-combat/docs/animation-quality-playbook.md` before changing
the production manifest.

This pipeline uses mod archives only as local HKX source material. It does not
install or reproduce OAR, DAR, DMCO, AMR, SKSE, behavior graphs, plugins, or
the source mod's gameplay system. Original archives, extracted files,
audition renders, and pipeline GLBs belong under ignored local storage. The game
may version a copied runtime GLB only when the project owner has explicitly
authorized that deployment artifact; this never extends to archives or extracted
mod contents.

## Nexus API workflow

The personal key is read only when `curl` executes. Never print it, enable
shell tracing, use verbose HTTP logging, put it in a URL, or copy it into a
script/config/source file. Requests from this project identify the client with:

```text
Application-Name: elder-scrolls-asset-pipeline
Application-Version: 0.1.0
```

For a mod ID, query the file listing first:

```bash
curl --fail --silent --show-error \
  -H "apikey: $(cat ~/.config/nexus/api_key)" \
  -H "Application-Name: elder-scrolls-asset-pipeline" \
  -H "Application-Version: 0.1.0" \
  "https://api.nexusmods.com/v1/games/skyrimspecialedition/mods/MOD_ID/files.json"
```

Select a listed file ID by exact filename/version/category, then request that
file ID's download link. Do not invent or scrape a CDN URL. Signed links can
contain literal spaces; percent-encode those spaces without logging the link.
Store archives in `skyrim-source/mod-sources/archives/`, API response metadata
in `skyrim-source/mod-sources/api/`, and separate extraction roots in
`skyrim-source/mod-sources/extracted/`. The entire tree is ignored. Record file
IDs, archive SHA-256 values, and selected HKX paths in the ignored
`skyrim-source/mod-sources/SOURCES.json`; keep releasable provenance in the
animation config and runtime manifest too.

## Package interpretation

- Read FOMOD XML with its declared encoding; Dynamic Dodge's installer XML is
  UTF-16. Follow the chosen installer branch before evaluating OAR folders.
- Treat OAR priority folders and `config.json`/`_conditions.txt` as asset
  labels. Equipment predicates are especially useful for choosing sword,
  shield, two-handed, and unarmed variants.
- Compare plausible HKXs on the canonical actor with
  `python3 -m pipeline.audition`. Never choose solely by filename.
- Validate time-dependent motion with `render_action_preview.py`. Use
  `render_paired_preview.py` for a true paired HKX whose actors share an authored
  clock; for event-dispatched execution reactions, preview the candidates and
  validate the production game transition at the attacker's annotated contact.
- Preserve native HKX timing. The character builder retimes imported curves to
  the parsed HKX duration because some valid Skyrim clips are sampled at 60 fps.

## Ground-support audit for imported clips

Do not infer vertical motion from an axis name or a foot-bone origin. Verify the
HKX COM channel on the canonical rig (Skyrim humanoid native Z is imported as
local axis 2), then use `preserveVerticalRootMotion` only when that authored
rise/fall is part of the action. Declare intentional flight and body contact as
half-open `supportPhases`; collapse, death, and get-up sources often need an
airborne interval followed by a floor-contact interval rather than one global
mode.

The production build samples the final deformed body, not the source skeleton,
and bakes both a root-relative visible-surface curve and distinct lowest
heel/toe candidates in each marker bone's local 3D frame. Runtime transforms
the incoming and outgoing candidates separately through the actual blended
bone and uses the lower point; interpolating their coordinates is invalid when
the identity of the lowest shoe vertex changes. This remains constant work per
actor and avoids gameplay-time mesh skinning. The game controller must also
keep the actor upright (yaw only, no Ecctrl auto-balance pitch/roll), because a
tilted capsule invalidates otherwise correct support metadata. Always finish
with production-path mesh-gap, actor-world-up, normal-speed, and dense-strip
validation.

## Paired Skyrim HKX

A paired killmove can contain one `PairedRoot` animation rather than separate A
and B files. The #74453 backstab has 201 transform tracks: `PairedRoot`, a `2_`
group and 99 `2_`-prefixed humanoid tracks, then an `NPC` group and 99 ordinary
humanoid tracks. For this specific archive, production playtesting and the
known-good pre-swap build establish `pairedTrackPrefix: ""` as the attacker and
`pairedTrackPrefix: "2_"` as the victim. The build filters each full
99-track set, removes the prefix, and binds both to the same canonical rig.

The `2_` group begins at `[1.979, 56.062, 0]` Skyrim units relative to the
ordinary actor. With the pipeline's `0.1` import scale and the generated
Dunmer rig's `0.15356` runtime scale, its forward separation is `0.861 m`
(lateral offset `0.031 m`). Recompute both values from the generated manifest
after any rebuild that changes `recommendedScale`.
Use the physical controller to reproduce that stable alignment; do not retain
horizontal visual root motion that can drift away from collision bodies.

## Current exact selections

The Nexus file-list response was resolved before download; these are the exact
approved files, not inferred CDN names. Archive hashes and extracted absolute
paths remain in ignored `skyrim-source/mod-sources/SOURCES.json` beside the
local sources.

| Mod ID | Title | Author | Version | Nexus file ID | Original archive filename |
| --- | --- | --- | --- | --- | --- |
| `79598` | Dynamic Dodge Animation | lSmoothl | 1.5 | `429066` | `Dynamic Dodge-79598-1-5-1695708046.zip` |
| `114366` | Rim Parry and Execution | SHADOWPQ | v1.1 | `499427` | `00 Rim Parry Stand Alone - v1.1 Update-114366-v1-1-1715262891.zip` |
| `74453` | Backstab animation for sneak killmove SE | Ichaflash (original); rhonjhonson (uploader) | 1 | `312246` | `Backstab animation for sneak killmove SE-74453-1-1662026614.zip` |
| `94840` | NPC Parry Style Stagger animations (OAR) | SHADOWPQ | v1.0 | `406235` | `Largest Stagger for NPC separate stagger version-94840-v1-0-1689101918.zip` |

| Semantic | Source/archive record | Selected provenance |
| --- | --- | --- |
| `JUMP_START` / `JUMP_IDLE` | base-game `Skyrim - Animations.bsa` | `mt_jump` source 0–0.5667 s hands to `mt_jumpfast` source 0.5667–0.8333 s. Exhaustive production-rig pose comparison bounded the seam at 1.01°; the 0.03 s outgoing handoff replaces the visibly jittering `mt_jumpfall` transition. `JUMP_IDLE` plays at 1.3333× to cover the observed 0.20 s airborne interval and clamps before any authored landing. |
| `ROLL` | Dynamic Dodge 1.5, #79598 file `429066` | DMCO 0.9.6 base OAR `6000/MCO_DodgeForward2.hkx`, retained after a 15-candidate weapon-mounted FOMOD/OAR review. It supplies the correct one-handed full tuck and clean upright recovery; attack-cancel base `6006/MCO_DodgeForward1.hkx` rendered pixel-identically, weapon branches used the wrong grips, and vanilla/TK/TUD alternatives had weaker roll or recovery semantics. The 0.8667 s authored motion runs at 1.35422× for 0.64 s; after the exported leading held frame, the endpoint is reached at about 0.665 s and remains visible for at least 0.055 s of the unchanged 0.72 s gameplay lock. Its support envelope is sampled at 120 Hz. |
| `BACKSTEP` | base-game `Skyrim - Animations.bsa`; Dynamic Dodge #79598 file `429066` retained as rejected audition provenance | Selected `meshes/actors/character/animations/1hm_walkbackward.hkx`: full 1.7667 s guarded two-step cycle at 3.3975×, exactly matching the 0.52 s gameplay lock, with preserved native COM Z and 0.08 s entry/exit blends. Weapon-mounted all-frame review rejected DMCO `6000/MCO_DodgeBackward1.hkx` and TK `70110/TKDodge/StepDodgeBack.hkx` as the same floaty anticipation-hop-deep-land motion; `6000/MCO_DodgeBackward2.hkx` and `70110/DodgeBack.hkx` are somersaults. |
| `RIPOSTE` | 00 Rim Parry Stand Alone v1.1, #114366 file `499427` | `(2130000018)1hmzl/1.hkx`; OAR calls it the one-handed sword execution and excludes left-hand weapon/shield families. The complete source is a three-hit sequence, so runtime selects source 0.1667–1.3 s for its opening CQC02 lunge with a 0.18 s entry and 0.24 s exit blend. Source contact is 0.5667 s (runtime 0.40 s) and withdrawal is 0.70 s (runtime 0.5333 s); exhaustive paired review rejected the source's initial stray blade pass and later generic `HitFrame`. |
| `RIPOSTED_HIT1` | same Rim archive | `(6141037)sword hit1/modernstaggerlock/1.hkx`; selected from source 0.1333 s through the untrimmed 2.0 s endpoint at 1× after 26 direct paired candidates and eight staged lethal-handoff comparisons at normal speed and in dense frames. It begins exactly at nonlethal riposte contact, remains continuous through withdrawal, and supplies the coherent full standing recovery; entry/exit blends are 0.08/0.20 s. |
| `CRITICAL_KNOCKDOWN` | same Rim archive | `(6254014)Knockdown/modernstaggerlock/1.HKX`; retained as rejected legacy audition material but explicitly excluded from runtime semantic coverage. Its unrelated opening and stand-up did not form coherent paired critical choreography. |
| `CRITICAL_DEATH` | same Rim archive | Same Knockdown source, ending at the full-frame-audited 1.9 s stable prone pose before recovery begins near 2.0 s. Lethal riposte enters at source 0.5667 s on attacker contact with a 0.10 s blend; lethal backstab enters at source zero at the separate 2.90 s outcome point with a 0.35 s blend. Both paths retain the coherent fall and remain down. |
| `DEATH` | same Rim archive | Same Knockdown source from time zero through the audited 1.9 s prone out-point. This replaces vanilla `deathanimationa`, whose production render only bent/staggered and never read as a complete death. |
| `BACKSTAB` / `BACKSTABBED` | Backstab v1, #74453 file `312246` | One `paired_1hmsneakkillbacka.hkx`, split into ordinary attacker and `2_` victim tracks. Production-path validation must verify the attacker sword trajectory and both actor poses; semantic names alone cannot detect a swap. Both roles start at source zero through the 0.24 s paired-action entry blend. Contact is 1.50 s and physical alignment releases at 2.20 s. A nonlethal victim keeps the same `BACKSTABBED` command through its full wounded recovery; at the separate 2.90 s outcome point only a lethal victim changes to `CRITICAL_DEATH` at source zero through a 0.35 s blend. The attacker independently retains its full 3.1667 s action. |
| `GUARD_BREAK` candidate (rejected) | Largest Stagger separate v1.0, #94840 file `406235` | `(2399)1hm sword/1hm_staggerbacklargest.hkx`; OAR condition is right-hand type 1 and no shield. Audition showed a prolonged kneel, so production instead uses vanilla `1hm_staggerbacklarge` as a standing guard-open recoil. |

The Rim execution includes package annotations/config names associated with its
execution triggers (including Elden-style effect names); provenance should name
the exact packaged HKX and SHADOWPQ archive without inventing an undeclared
upstream animator credit.

Any mod that reaches the *production* runtime manifest (not just an audition
candidate) needs a line in root [README.md](../../../README.md) § Credits and
third-party sources — this table alone doesn't satisfy that (world module 90
§73).
