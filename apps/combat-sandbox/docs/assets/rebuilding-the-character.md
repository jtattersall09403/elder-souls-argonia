# Rebuilding the character

The character GLB is **built locally** from owned Skyrim/mod source by the
sibling repo `elder-scrolls-asset-pipeline`. The installed runtime character and
weapon GLBs in `public/` are intentionally versioned: GitHub Pages builds from a
clean checkout and cannot reconstruct them from ignored owned source data.

The project owner explicitly authorized those required runtime files for this
personal/private-use deployment on 2026-08-20. Keep original archives,
extracted NIF/HKX/DDS files, pipeline build/audition output, and recorded visual
evidence ignored. The exception is limited to runtime install artifacts.

## Build + install

The pipeline lives in this repo at `tooling/asset-pipeline` and reads the asset
vault through `ELDER_SOULS_ASSET_ROOT`. The rig ships as **one GLB per animation
pack** (decision 0040), so there are several files to install, not one.

```bash
cd tooling/asset-pipeline
# Rebuilds the rig, every pack, and the races. `--only <race>` limits the race
# skins; the rig and all packs are rebuilt regardless. About 3 minutes.
python3 -m pipeline.build_races --roster skyrim-playable --only dunmer

cp output/rig-skyrim-humanoid*.glb            ../../packages/character-assets/files/
cp output/rig-skyrim-humanoid.animations.json ../../packages/game-core/src/anim/generated/
```

**The build is byte-for-byte deterministic**, and that is the check to run after
any animation-config change: `md5sum` the pack GLBs before and after, and every
pack whose clips you did not touch must be identical. A pack that changes when
it should not means the config edit reached further than intended.

Adding or reskinning a clip also has to satisfy two gates that will fail loudly:
`visualScenarios.test.ts` requires every semantic animation to be covered by a
review scenario or explicitly excluded, and `animationPacks.test.ts` proves
every weapon can play every clip its profile references.

- The `.glb` lands in `public/` and must remain versioned with the deployment.
- The `.animations.json` manifest is committed (metadata only — no Bethesda
  bytes) and is the game's runtime animation contract.
- The manifest carries the GLB SHA-256; `SkyrimFighter` adds its prefix as a URL
  revision so a rebuilt same-named character cannot be hidden by browser/Pages
  cache.
- `npm run assets` verifies the committed character and weapon files have a
  binary-glTF header, so a clean Pages build fails clearly if either disappears.

## Committing the GLBs

The character GLB is ~11MB and the weapon GLB ~0.3MB. Both are far under
GitHub's limits (soft warning 50MB, hard reject 100MB), so they commit and push
normally.

**Do not move these to Git LFS.** LFS pointers do not resolve in a GitHub Pages
build unless every workflow checks out with `lfs: true`, and LFS bandwidth is
metered — a silent pointer-instead-of-mesh regression would ship a broken game.
Plain versioned binaries are the deliberate choice here.

If a commit is rejected for file size, the cause is a **local** `.git/hooks/pre-commit`
size guard (a machine template hook, not part of this repo — its default cap is
5MB). Raise `FILE_SIZE_LIMIT` in that hook. Do not "fix" it by deleting the GLB,
gitignoring `public/*.glb`, or adding LFS; all three break the Pages deployment.

## Adding a race / swapping a clip

Both are pipeline changes, not game changes:

- **New humanoid race** (Nord, Redguard, …): add a `races/<id>.json` + curated
  texture tree in the pipeline; reuse the same body / rig / animation manifest.
- **Swap an animation** (e.g. a modded roll): change the source in the pipeline's
  `config/animations/*.json` and rebuild. The game keeps using `ROLL`.

Before selecting or conditioning a clip, follow the staged workflow in
[`../animation-quality-playbook.md`](../animation-quality-playbook.md). In
particular, batch-audition candidates before touching the production manifest,
then validate the shortlisted result through the real game path.

See the pipeline's own `README.md` for the full data-driven config layout.
