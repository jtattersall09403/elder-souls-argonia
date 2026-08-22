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

```bash
cd ../elder-scrolls-asset-pipeline
python3 -m pipeline.build    --character dunmer-combat
python3 -m pipeline.validate --character dunmer-combat

cp output/character-dunmer-combat.glb            ../ecctrl-souls-combat/public/
cp output/character-dunmer-combat.animations.json ../ecctrl-souls-combat/src/game/anim/
```

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
