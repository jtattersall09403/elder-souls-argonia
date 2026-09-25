# Codespaces migration plan (research, 2026-09-24)

**Headline (updated 2026-09-24).** The move runs on the 4-core/16 GB/32 GB
machine the account already offers, using the tiered restore (Part 3 (g)).
Each codespace restores about 11 GiB and pulls mod folders only when a job
needs them. The full working set (about 57 GiB) never has to fit at once. A
Support ticket for 8- and 16-core machines is filed; they would be a speed
upgrade, not a precondition. The whole vault, including the frozen
heightfield ladder that existed only on the VM, is now snapshotted to R2.

## Reconciliation

- No live doc describes the development machine. `grep -il "analytical platform|codespace"`
  over `docs/`, `README.md` and `tooling/*/README.md` returns nothing. Machine
  facts live in two places: the planner's memory file `analytical-platform-environment.md`
  (Nexus key path, tunnel, Wine+Blender) and CLAUDE.md § GOLDEN RULES
  "Test locally" (the port and tunnel env vars).
- This file is the single live doc for the migration. The writer should add
  one row to `docs/research/README.md` for `infrastructure/`. After migration day,
  add one clause to the CLAUDE.md "Test locally" rule saying that in a codespace
  `on-start.sh` sets `ES_TUNNEL_URL` (the rule names env vars, not a host, so
  nothing else changes), and retire the memory file. Machine facts then live
  here, not in memory.
- `docs/research/agent-ops/` would also be a reasonable home. The brief named
  `infrastructure/`, so it stays there.

## Part 1: how Codespaces works (September 2026)

| Item | Fact | Source |
|---|---|---|
| Compute | $0.09 per core-hour: 2c $0.18/h, 4c $0.36/h, 8c $0.72/h, 16c $1.44/h, 32c $2.88/h | [GitHub billing docs](https://docs.github.com/billing/managing-billing-for-github-codespaces/about-billing-for-github-codespaces) |
| RAM / disk | 2c 8 GB/32 GB, 4c 16 GB/32 GB, 8c 32 GB/64 GB, 16c 64 GB/128 GB, 32c 128 GB/128 GB | [What are Codespaces](https://docs.github.com/codespaces/overview), [qmacro 2024](https://qmacro.org/blog/posts/2024/01/26/exploring-codespaces-as-temporary-dev-containers/) |
| Larger disks | Not enabled by default, even on Pro. Users get 64/128 GB machines through a Support ticket (manual approval). Switching between 32 GB and 64 GB machines means a new codespace | [Discussion #184667](https://github.com/orgs/community/discussions/184667), [#7087](https://github.com/orgs/community/discussions/7087) |
| This repo today | Only `basicLinux32gb` (2c/8 GB/32 GB) and `standardLinux32gb` (4c/16 GB/32 GB) are offered | `gh api …/codespaces/machines`, 2026-09-24 |
| Storage | $0.07/GB-month. Billed while the codespace is stopped, until it is deleted. Prebuilds are billed the same way | billing docs |
| Included usage | Free: 120 core-hours and 15 GB-month. Pro: 180 core-hours and 20 GB-month. Organisations get nothing included | billing docs |
| Spending budget | A personal account's Codespaces budget is **$0 by default**: once the included usage is spent, codespaces stop and cannot start until the owner adds a payment method and sets a budget. On 8 cores, Pro's 180 core-hours last **22.5 hours** | billing docs (budgets) |
| Idle timeout | Default 30 min, configurable from 5 to 240 min. Terminal input or output resets it. Users report the timeout fires after the browser or VS Code closes, even while a job is printing | [Timeout docs](https://docs.github.com/en/codespaces/setting-your-user-preferences/setting-your-timeout-period-for-github-codespaces), [Discussion #60407](https://github.com/orgs/community/discussions/60407) |
| Retention | A stopped codespace is deleted after 30 days by default, and 30 days is also the maximum. It is deleted "irrespective of whether a codespace contains unpushed changes" | [Auto-deletion docs](https://docs.github.com/en/codespaces/setting-your-user-preferences/configuring-automatic-deletion-of-your-codespaces) |
| Persistence | `/workspaces` survives stop and rebuild. The rest of the container (including `~`) survives a stop but not a rebuild. `/tmp` is a separate disk (32–44 GB in user reports; 118 GB measured on our 4-core codespace, 2026-09-25) that survives a rebuild and is **emptied at every stop** | [Deep dive](https://docs.github.com/en/codespaces/about-codespaces/deep-dive), [Persisting temp files](https://docs.github.com/en/codespaces/developing-in-a-codespace/persisting-environment-variables-and-temporary-files) |
| Dev containers | `.devcontainer/devcontainer.json`. Features add tools. Lifecycle runs `onCreateCommand` → `updateContentCommand` → `postCreateCommand` → `postStartCommand` → `postAttachCommand`. `hostRequirements` takes `{cpus, memory, storage}` | [Dev containers intro](https://docs.github.com/en/codespaces/setting-up-your-project-for-codespaces/adding-a-dev-container-configuration/introduction-to-dev-containers), [hostRequirements](https://docs.github.com/en/codespaces/setting-up-your-project-for-codespaces/configuring-dev-containers/setting-a-minimum-specification-for-codespace-machines) |
| Prebuilds | Run as Actions (Actions minutes plus storage). Only `onCreateCommand` and `updateContentCommand` run, never `postCreateCommand`. A prebuild has **no access to Codespaces secrets**. Unavailable on 32 GB machines when the repo is over 32 GB. No documented prebuild time limit was found: the brief's "4-hour" figure is the idle-timeout maximum, and Actions jobs cap at 6 h | [Prebuild docs](https://docs.github.com/en/codespaces/prebuilding-your-codespaces/about-github-codespaces-prebuilds), [Troubleshooting prebuilds](https://docs.github.com/en/codespaces/troubleshooting/troubleshooting-prebuilds) |
| Secrets | User secrets (100 maximum, 48 KB each) are scoped to chosen repos and "exported as an environment variable into the user's terminal session". Names must not start with `GITHUB_`. A secret added later needs a stop and start. Not available at build time or inside features | [Secrets docs](https://docs.github.com/en/codespaces/managing-your-codespaces/managing-your-account-specific-secrets-for-github-codespaces) |
| Ports | `https://$CODESPACE_NAME-$PORT.app.github.dev`, private by default (the signed-in browser passes; scripts send `X-Github-Token`), or public. `forwardPorts` and `portsAttributes` go in devcontainer.json | [Port forwarding](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace) |
| GPU | Retired on 29 August 2025 and not brought back. Same as this VM (no GPU) | [Changelog 2025-08-01](https://github.blog/changelog/2025-08-01-upcoming-deprecation-of-gpu-machine-type-in-codespaces/) |
| Claude Code | Feature `ghcr.io/anthropics/devcontainer-features/claude-code:1.0`. `~/.claude` survives a stop but not a rebuild. For persistent auth, add a `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) or `ANTHROPIC_API_KEY` as a Codespaces secret, or put `CLAUDE_CONFIG_DIR` on persistent storage. `--dangerously-skip-permissions` is refused when running as root | [Claude Code dev containers](https://code.claude.com/docs/en/devcontainer) |
| Blender, Chromium | Ordinary x86_64 Linux processes, so no blocker. Our Blender is the **Windows 4.4.3 build under Wine 11.13** (`tooling/asset-pipeline/pipeline/config/toolchain.json`). Wine and the prefix are plain directories we can carry over. Playwright needs `npx playwright install --with-deps chromium` (apt dependencies) | measured here |
| Egress | No documented egress block. Steam CDN, Nexus CDN, PyPI, npm and R2 are ordinary HTTPS | none found (unverified) |
| Repo size | 2.87 GB on GitHub (`diskUsage` 2865172 KB), `.git` 3.2 GiB locally, public repo | `gh repo view` |

## Part 2: what exists only on this VM

Measured with `du -sb` on 2026-09-24. The vault is at
`~/workspace/elder-souls-dev/elder-scrolls-asset-pipeline`. Note that
`~/skyrim-source` and `~/character-source` are dangling symlinks to
`~/workspace/elder-scrolls-asset-pipeline`, which no longer exists.

| Item | Size | Replaceable how | Notes |
|---|---|---|---|
| Vanilla `skyrim-source/Data` (Skyrim LE: `Skyrim - Meshes/Textures/Animations.bsa`, `Skyrim.esm`, `Update.esm`) | 2.98 GiB | DepotDownloader app 72850 depot 72851 (`manifest_72851_…txt` present) with the owner's Steam login | gitignored |
| **Argonia heightfield ladder** `mod-sources/tamriel-worldspaces-118678/extracted/Argonia Worldspace/argonia-heightfield/` | 1.53 GiB | **Nowhere.** Authored and frozen (sculpt, shaped, hydrology, approved bodies) | read through `ES_VAULT_ROOT` / `worldgen/vault.py`. **Not backed up anywhere** |
| Other `mod-sources/` (about 50 folders) | 30.42 GiB total: 8.43 GiB archives (.zip/.7z/.rar/.bin), about 22 GiB extracted | Nexus API for most. Only 8 archives carry modId, fileId and sha256 in `mod-sources/SOURCES.json`. The rest are recorded in prose (sourcing log, README § Credits) | largest: drjacopo grass library 10.61 GiB, Cipactli 4.6 GiB, Tropical Skyrim 2.3 GiB, tamriel-worldspaces 1.6 GiB |
| BM&V `tooling/asset-pipeline/black-marsh-mod-source/` (`Data1.rar`, `Data2.rar`, plugins) | 8.99 GiB | ModDB manual download (README.md:168). No API | gitignored in this repo |
| Vault `build/` + `output/` | 2.02 GiB | Rebuildable (Blender) | `output/*.json` partly tracked. The vault git has **no remote**, 5 modified and 3 untracked files. Its `.git` is only 2.7 MiB (largest blob 2.2 MB), so a private GitHub repo or a `git bundle` in the snapshot both work |
| Sibling `ecctrl-souls-combat` checkout | 3.1 GiB | Its own git remote (confirm before retiring the VM) | combat reference repo, not read by the build |
| Repo `tooling/asset-pipeline/build` + `output` | 5.65 GiB | Rebuildable (kit builds, about 70 s per kit) | |
| Repo `tooling/world-generation/output` (survey-cache 1.5 GiB, mesh caches 1.0 GiB) | 2.55 GiB | Rebuildable caches | |
| Repo ignored studio/app output (`apps/world-studio/public` 0.12 GiB ignored of 0.67 GiB, dist, artifacts) | about 0.9 GiB | `npm run` publish and build | |
| `.codex-worktrees/` | 3.6 GiB | Not needed | drop |
| `~/tools` used by the pipeline: Wine 11.13, `wine-pynifly-prefix`, Blender 4.4.3 Windows, PyNifly, gltfpack 1.2, DepotDownloader, BSA tools | 3.82 GiB unpacked (installer zips 0.7 GiB alongside) | Mostly downloadable, but the Wine prefix with the nifly add-on is hand-built, so snapshot it | `toolchain.json` paths use `~/tools/…`. Blender 3.2.2 Linux (0.77 GiB) is not referenced by the pipeline |
| Playwright browsers (`@playwright/test` 1.62.1: chromium-1234 + headless shell + ffmpeg) | 0.64 GiB (2.2 GiB with old versions) | `npx playwright install` | |
| Node v22.15.0 via nvm, npm 11.4.1; `node_modules` 0.33 GiB | small | `npm ci` | |
| Python 3.12.14 (`/opt/conda`), user-level pip. Only `tooling/world-generation/requirements-test.txt` exists (Pillow, matplotlib, numpy, pytest, scikit-image, scipy, shapely, pytest-xdist, trimesh, rtree). py7zr is installed but not listed. The asset pipeline has **no requirements file**. `bsdtar` from conda reads the RARs; there is no unrar or 7z | small | pip | |
| Secrets: Nexus key in `~/.config/nexus/api_key` (not in settings.local.json). Env names in `.claude/settings.local.json`: `ES_STUDIO_PORT`, `ES_TUNNEL_URL`. Env names in `~/.claude/settings.json`: `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `ES_STUDIO_PORT`, `ES_TUNNEL_URL`, `CLAUDE_CODE_SUBAGENT_MODEL` | none | Codespaces secrets | no code reads the Nexus key; agents curl with it |
| Claude config: repo `.claude/settings.json` hooks (SessionStart `session_tokens.py`, UserPromptSubmit `session_switch.py`, PostToolUse `prose_hook.py`, PreToolUse `shell_guard.py` + `review_gate.py`), 5 agents, 7 skills (all tracked, relative paths). Global `~/.claude/settings.json` PreToolUse `rtk hook claude` needs `~/.local/bin/rtk`; global `~/.claude/CLAUDE.md` imports `~/.claude/RTK.md`. Memory (292 KiB) at `~/.claude/projects/-home-analyticalplatform-workspace-elder-souls-dev-elder-souls-argonia/memory/` | ~/.claude 1.3 GiB (mostly history) | copy memory, the global settings, `CLAUDE.md` and `RTK.md` | the project key is derived from the path, so it changes in `/workspaces` |

**Total to restore**

- Full copy: about 61 GiB. That is the vault 36 GiB less its rebuildable 2 GiB,
  plus BM&V 9.0, the repo's rebuildable output 8.2, tools 3.8, Playwright 0.6,
  a fresh clone 3.2 and node 0.3.
- Minimum working set: about 48 GiB. That is vanilla 3.0, the heightfield 1.5,
  extracted mods about 22, BM&V 9.0, tools 3.8, clone plus worktree about 8
  and Playwright plus node 1. It drops the mod archives, all rebuildable
  output and the Codex worktrees.
- About 57 GiB once the caches have rebuilt.

**VM assumptions that change.** Two env vars, two meanings
(`worldgen/vault.py:40-63`): `ES_ASSET_PIPELINE_ROOT` is the vault checkout,
falling back to the repo's sibling; `ES_VAULT_ROOT` is the **heightfield
directory** inside it, falling back to `<vault>/…/argonia-heightfield`. Two
shell scripts hard-code `$HOME/workspace/elder-souls-dev/…` as the heightfield
fallback: `tooling/world-generation/scripts/terrain-chain.sh:126` and
`tooling/world-generation/scripts/chain-manifest.sh:18`. Python goes through
`vault.py`, and the sibling `/workspaces/elder-scrolls-asset-pipeline`
satisfies it with neither variable set. `tooling/repo-standards/memwatch.sh:31` reads
`/sys/fs/cgroup/memory.stat` with a fixed 9 GiB default ceiling. `preflight.mjs:86`
already derives its budget from `memory.max`, falling back to `MemAvailable`,
so it adapts. `apps/world-studio/vite.config.ts:103-107,130` requires
`ES_TUNNEL_URL` and `ES_STUDIO_PORT` and sets HMR to `wss` on port 443 of the
tunnel host. That arrangement also works on `app.github.dev`.

**Owner setup done 2026-09-24:** Support ticket filed (8- and 16-core);
Pro plan, payment method, $40/month Codespaces budget (stop at limit); idle
timeout 240 min, retention 30 days, region Europe West; R2 bucket
`elder-souls-vault` and token; Codespaces secrets scoped to this repo:
`ES_SNAPSHOT_ACCESS_KEY_ID`, `ES_SNAPSHOT_SECRET_ACCESS_KEY`,
`ES_SNAPSHOT_ENDPOINT` (no bucket suffix), `NEXUS_API_KEY`,
`CLAUDE_CODE_OAUTH_TOKEN`. The bootstrap writes the `r2:` rclone remote from
the three `ES_SNAPSHOT_*` values (type s3, provider Cloudflare,
`no_check_bucket = true`; the token is scoped to the one bucket).

**Delivered 2026-09-24** (lanes A–C; reports were in `/tmp/codespaces-lane-2026-09-24/`):

- **Snapshot.** `tooling/bootstrap/snapshot-vault.sh` wrote the full snapshot:
  76 parts, 44.9 GiB, uploaded in 402 s at about 110 MB/s. The contract is
  `tooling/bootstrap/snapshot-manifest.json`. Largest parts: bmv 9.0 GiB,
  drjacopo grass 8.6, cipactli 4.5, vanilla 3.9. `Skyrim - Sounds.bsa`
  (954 MB) was added to vanilla `Data/` by another process during the run and
  is included. After any change to the vault, re-run with
  `--only <id>`; unchanged parts are skipped by `sourceBytes`.
- **Codespace setup.** The files are `.devcontainer/{devcontainer.json,Dockerfile}`,
  `tooling/bootstrap/{on-create,post-create,on-start,vault-pull}.sh` and
  `tooling/bootstrap/README.md`, the operating doc. Every toolchain download
  is pinned by sha256: Wine 11.13 wow64, Blender 4.4.3 Windows, PyNifly
  V28.1.0, gltfpack 1.2, rclone 1.75.1, rtk 0.49.0. The Wine prefix is a plain
  `wineboot -i`, and `on-create` builds it. `~/tools` links to `/opt/es-tools`.
  `vault-pull.sh` passed its tests against the real bucket: hash mismatch,
  LRU eviction and tier restore.
- **Requirements.** `tooling/asset-pipeline/requirements.txt` exists.
- **Mod register.** `tooling/asset-pipeline/mod-register.json` has 56 entries
  and 69 archives, all Nexus archives matched by md5. It supersedes the vault's
  `SOURCES.json`. `tooling/bootstrap/restore-mods.sh` passed a restore test.

**Vault sync (owner ruling 2026-09-24).** The vault is edited on one machine
at a time. There is no second git remote: the auto-mode classifier refused to
create one, and the owner chose not to add it. Every snapshot uploads a
`git bundle` of the vault's history, so the history is off-machine. On
switch day, run `snapshot-vault.sh` on the VM (it skips unchanged parts),
commit the manifest, then create the codespace. After that the codespace is
the only machine that edits the vault.

**Claude transcripts (owner ruling 2026-09-25).** This project's whole Claude
project dir (transcripts, subagent dirs) is the `claude-transcripts` part
(tier `claude`). It is restored in full in every codespace and never goes into
git. Claude Code's default `cleanupPeriodDays` (30) stays, so the backup holds
about the last month of sessions. There is no recent/archive split, because
parts defined by file age would drop old sessions from the backup.

**Agent work remaining**:

1. Prove the image on the first codespace: `on-create` end to end, then one
   kit build whose GLB hash must match the VM's. Kit build hash comparison
   skipped by the owner 2026-09-25.
2. Verified 2026-09-25 on the first codespace: all three resolve through
   `worldgen/vault.py` or the cgroup limit; no fix needed. Moved to the 16h
   briefs 2026-09-25.
3. The miners' batch mode, after 16h part 1, because the miners are in its
   set. Moved to the 16h briefs 2026-09-25.
4. The prebuild configuration. This is owner UI: repo Settings → Codespaces
   → Set up prebuild.

Parts (a)–(b) below are the design record. Where they differ from the
delivered files, the files and `tooling/bootstrap/README.md` win.

## Part 3: the plan

### (a) devcontainer.json and bootstrap

`.devcontainer/devcontainer.json`, in outline:

- `image`: `mcr.microsoft.com/devcontainers/base:ubuntu-24.04` (this VM runs Ubuntu 24.04.4).
- `features`: `node:1` (22), `python:1` (3.12), `ghcr.io/anthropics/devcontainer-features/claude-code:1.0`, `github-cli:1`.
- `hostRequirements`: `{ "cpus": 4, "memory": "16gb", "storage": "32gb" }`. This is a minimum, so one config serves the 4-core machine now and the 8- or 16-core machines (picked at create time) once Support enables them. With the tiered restore (g) there is no separate rehearsal config.
- `forwardPorts`: `[8081]`, with `portsAttributes` label "world studio" and `onAutoForward: silent`.
- `containerEnv`: `ES_STUDIO_PORT=8081`, `ES_ASSET_PIPELINE_ROOT=/workspaces/elder-scrolls-asset-pipeline`, `CLAUDE_CONFIG_DIR=/workspaces/.claude-home`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`. `ES_VAULT_ROOT` is left unset (it names the heightfield directory, and the fallback finds it).
- `onCreateCommand`: `tooling/bootstrap/on-create.sh`. It runs apt, pip, `npm ci` and `npx playwright install --with-deps chromium`, and it is prebuildable.
- `postCreateCommand`: `tooling/bootstrap/restore-vault.sh`. It needs secrets, so it cannot run in a prebuild.
- `postStartCommand`: `tooling/bootstrap/on-start.sh`. It sets the tunnel URL and relinks `~`.

`tooling/bootstrap/`, one script per step. Each script is idempotent and skips work whose marker already exists.

| Script | Restores | From |
|---|---|---|
| `on-create.sh` | Only fast, non-interactive installs, each under a timeout, logged to `/workspaces/.es-bootstrap/on-create.log`: pip, `npm ci`, Playwright chromium. apt packages (bsdtar, Wine libraries, libspatialindex, ffmpeg) are in the Dockerfile. **No xvfb** (2026-09-25): a display made `wineboot` open the Mono/Gecko dialogs and hang provisioning for 60 min. Nothing in the pipeline needs a display. The Wine prefix build and the toolchain/cache pulls run in `first-run.sh`, which the owner or an agent runs from a terminal | apt, PyPI, npm |
| `restore-vault.sh` | Everything in Part 2 not in git: vault, BM&V, `~/tools` bundle, heightfield | Snapshot bucket (b) via `rclone`, credentials from the `ES_SNAPSHOT_*` secrets. **Streams** each part (`rclone cat … \| tee >(sha256sum) \| tar -x`) and checks the hash against a `SHA256SUMS` manifest committed in the repo; downloading the parts and then unpacking would need the set twice over and cannot fit the disk. Checks free space first and stops with a clear message |
| ~~`restore-vanilla.sh`~~ dropped 2026-09-24 | Vanilla BSAs and ESMs come from the `vanilla` snapshot part | Should the bucket ever be lost: `DepotDownloader -app 72850 -depot 72851 -username <steam user> -os windows`, run by hand (it needs Steam Guard) |
| `restore-mods.sh` (fallback only) | Nexus mods listed in a new machine-readable register (modId, fileId, sha256) | Nexus API, header `apikey: $NEXUS_API_KEY` (a secret). BM&V has no fallback (ModDB, manual) |
| `on-start.sh` | `ES_TUNNEL_URL=https://$CODESPACE_NAME-8081.$GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN` written to `~/.bashrc`. Symlinks `~/tools` → `/workspaces/tools`, `~/.config/nexus/api_key` from `$NEXUS_API_KEY`, `~/.local/bin/rtk` | env |
| `snapshot-vault.sh` (run on the VM, then on demand) | tars the Part 2 set in parts under 2 GB with `SHA256SUMS`, plus a `git bundle --all` of the vault repo, then uploads. Streams tar straight to `rclone rcat` so the VM needs no staging space | rclone |

Everything persistent lives under `/workspaces`: the repo, the vault sibling,
`tools/` and `.claude-home/`. The re-pullable bulk goes to `/tmp` (owner
2026-09-25, after `first-run.sh` left 8 GB free): the mod pool (every
all-`mod`-tier root, bmv included), the miners' mesh cache and the kit
`build/` live under `/tmp/es-cache`, linked from their usual paths by
`tooling/bootstrap/cache-links.sh`, which `on-start.sh` runs on every start;
emptied targets lose their vault-pull markers and are pulled again on demand.
Measured 2026-09-25 on the 4-core codespace: `/workspaces` 32 GB (5.8 GB free
before, 10.1 GB after moving `build/` and the mesh cache), `/tmp` a separate
118 GB volume with 109 GB free. How and why: tooling/bootstrap/README.md
§ Disk.

### (b) Snapshot or re-download

| Option | Size | Monthly cost | Restore time in a codespace | Verdict |
|---|---|---|---|---|
| **Cloudflare R2 private bucket** | about 50 GiB (full set, compressed about 5–10 % smaller: BSAs, DDS and archives are already compressed) | (50−10 free) × $0.015 = **about $0.60**, no egress charge | about 5–10 min at 100–200 MB/s (estimate, measure on day 1) | **recommended** ([R2 pricing summary](https://mecanik.dev/en/posts/cloudflare-r2-pricing-explained-real-costs-vs-s3-and-backblaze/)) |
| S3 | same | about $1.15 storage plus $0.09/GB egress, so about $4.50 per full restore | same | worse than R2 |
| GitHub Release asset | same, split into 2 GB parts (about 30 parts, 1000-asset cap) | $0 | same | **Not in this repo**: it is public, and the files are Bethesda and mod assets. A separate *private* repo's release is acceptable ([About releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)) |
| Git LFS | same | about $2.80 storage beyond the free 10 GB, plus about $3.50 bandwidth per restore | slower | no ([LFS billing](https://docs.github.com/en/enterprise-cloud@latest/billing/concepts/product-billing/git-lfs)) |
| Re-download only | vanilla 3 GiB from Steam, most mods from Nexus | $0 | hours of agent time, plus owner minutes for Steam Guard, plus a manual ModDB step | **Cannot rebuild the heightfield**, and 42 of the 50 mod folders lack a machine-readable fileId |

The upload from this VM is the unknown. It is about 50 GiB: 1.5 h at
10 MB/s, 10 min at 100 MB/s. This is a government-managed platform and
`.git/hooks/pre-push` already limits push targets, so test outbound reach to
`*.r2.cloudflarestorage.com` with a 1 GiB part first.

### (c) Machine type and monthly cost

- 4-core/16 GB: the memory fits (preflight peak about 10 GiB, miner about
  6–7 GiB). Preflight's parallel gates take roughly twice as long as on the
  8 cores here. **Its 32 GB disk cannot hold the 48 GiB minimum.**
- **8-core/32 GB/64 GB** fits memory. The disk is marginal: 64 GB is
  59.6 GiB, the working set is about 57 GiB once caches rebuild, and the
  container image, apt, pip, node and Playwright may share the same disk. The
  earlier "7 GiB spare" mixed GB and GiB. Measure `df -h /workspaces /` on the
  rehearsal codespace, and plan to move the rebuildable caches
  (`tooling/world-generation/output` survey and mesh caches, kit `build/`,
  about 8 GiB) onto `/tmp` (a separate 32–44 GB disk, emptied at stop, so
  they rebuild after each start) if the margin is under 5 GiB.
- **16-core/64 GB/128 GB** removes the disk problem at twice the hourly price
  (60 h a month is about $75 net on Pro). Ask Support to enable both machine
  types in one ticket, then choose on the measured margin.

Monthly cost for the 8-core machine. Included usage is valued at 180 core-hours
× $0.09 = $16.20 on Pro, or $10.80 on Free. Storage is about 57 GB billed at
$0.07/GB-month, less the 20 GB included on Pro, which gives about $2.60. The
owner's account is **Pro** (owner, 2026-09-24). The Support ticket for 8- and
16-core machines was filed and a $40/month Codespaces budget set (stop at the
limit) the same day.

| Use per month | 8-core compute | Net after Pro allowance plus storage | 4-core (if disk were solved) |
|---|---|---|---|
| 60 h (about 3 h per weekday) | $43 | **about $30** | about $8 |
| 120 h (about 6 h per weekday) | $86 | **about $73** | about $30 |
| 240 h (heavy, near-daily long sessions) | $173 | **about $159** | about $73 |

A Claude subscription is separate and unchanged.

### (d) What breaks or changes

- **Tunnel.** `ES_TUNNEL_URL` becomes `https://<codespace>-8081.app.github.dev`,
  which changes with each new codespace. It is set in `on-start.sh`, not stored.
  The port is private, so the owner's signed-in browser works and nobody else
  can reach it. Studio links in hand-offs change shape. The CLAUDE.md
  "Test locally" rule stays true as written, because it names the env vars and
  not the host.
- **12 GiB guard.** The codespace container has no 12 GiB session cgroup: the
  whole machine's RAM is the limit, 32 GB on 8-core. `preflight.mjs` adapts by
  itself. `memwatch.sh`'s 9 GiB default should become a fraction of
  `memory.max`/`MemTotal`, otherwise it kills jobs that would fit. The
  "preflight and the 12 GiB cgroup" memory becomes stale.
- **Paths (not yet done; waits for the 16h part 1 commit).** The heightfield
  defaults in `terrain-chain.sh:126` and `chain-manifest.sh:18` are to be
  rewritten to ask `worldgen/vault.py` (`heightfield_dir()`) instead of
  hard-coding `$HOME/workspace/…`, so both machines resolve it one way.
  `toolchain.json` `~/tools/…` works through the `~/tools` symlink.
  `~/skyrim-source` is dropped (it is already dangling).
- **Claude Code.** Project hooks and agents come with the clone. The global
  `rtk` hook needs the binary; a missing binary fails every Bash call, so
  install it in `on-start.sh` or remove the hook. Memory files move to the new
  project key `-workspaces-elder-souls-argonia` under `CLAUDE_CONFIG_DIR`. Auth
  comes from a `CLAUDE_CODE_OAUTH_TOKEN` secret. `settings.local.json` (the two
  env keys and the permission allows) is recreated by `on-start.sh`.
- **The platform git hook** (the 5 MB pre-commit limit and the pre-push org
  allow-list) does not exist there. Nothing enforces the 100 MB push limit
  before GitHub does.
- **Long unattended runs** stop at the idle timeout (240 min maximum) when no
  client is connected. Today they run as long as the VM is up. Owner ruling
  2026-09-24: the owner keeps the codespace tab open during long runs, so the
  timeout is managed by hand. Set the timeout to 240 min in GitHub settings,
  and keep the computer from sleeping (a sleeping laptop drops the connection
  just as a closed tab does).
- **Rehearsal needs `dev` pushed.** A codespace is created from a branch on
  GitHub, so the devcontainer must be pushed to `dev` first. Pushing `dev`
  does not deploy (only `main` does), but it is outward-facing: ask the owner
  before each push.

### (e) Reasons not to migrate yet

1. **Disk.** No 64 GB machine exists on this account today. Restoring the
   whole set does not fit 32 GB; the tiered restore (g) does, for every job
   except whole-pool mining.
2. **Cost.** This VM costs the owner nothing. Codespaces at the owner's likely
   usage costs about $30–160 a month.
3. **Idle timeout and 30-day deletion.** Chain and miner runs longer than 4 h
   need a connected tab. A stopped codespace, and any uncommitted work in it,
   is deleted after 30 days. The vault snapshot in the bucket is the only
   durable copy.
4. **No GPU either way.** Visual probes stay as slow as they are here.
5. **Steam Guard** cannot run from a secret. The vanilla fallback needs the
   owner at the keyboard once per codespace, which the snapshot avoids.
6. **Prebuilds** cannot fetch the vault, because secrets are unavailable to
   them. A prebuild saves only the apt, pip and npm step, about 5–10 min, and
   costs storage on top.
7. ~~Egress from this VM to R2 is untested~~ Tested 2026-09-24: bucket
   `elder-souls-vault`, remote `r2:` in `~/.config/rclone/rclone.conf` (mode
   600, owner-typed), rclone 1.75.1 in `~/.local/bin`. A 1 GiB upload took
   12.4 s (about 86 MB/s), so the full snapshot is about 10 min.

### (f) Migration day

| # | Step | Agent-hours | Owner minutes |
|---|---|---|---|
| 0 | Before the day: file a Support ticket for the 8-core/64 GB and 16-core/128 GB machines and wait for approval. Check the account plan (Free or Pro), add a payment method and set a Codespaces budget | 0 | 15 |
| 1 | Create the R2 bucket and token, save the R2 keys on the VM beside the Nexus key, and test a 1 GiB upload. Later add Codespaces secrets: `ES_SNAPSHOT_*`, `NEXUS_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN` | 0 | 15 |
| 2 | Commit the vault's 5 modified and 3 untracked files; bundle the vault git into the snapshot (and optionally a private GitHub remote) | 0.2 | 2 |
| 3 | Write `snapshot-vault.sh`, run it on the VM (heightfield first), verify `SHA256SUMS` | 0.5, plus 0.2–1.5 upload | 0 |
| 4 | Write the devcontainer (full and rehearsal configs) and `tooling/bootstrap/*`, add `tooling/asset-pipeline/requirements.txt`, fix `terrain-chain.sh:126` and the memwatch ceiling (reviewed and preflighted on the VM) | 1.5 | 0 |
| 5a | Owner approves pushing `dev`, then opens a 4-core codespace with the rehearsal config; the agent measures disk and runs a 1-stage terrain chain; delete it afterwards | 0.5 | 10 |
| 5 | Owner creates the full codespace on `dev` | 0 | 5 |
| 6 | Bootstrap runs (apt, pip, npm about 10 min; vault restore 5–15 min) | 0.5 | 0 |
| 7 | Checks: `npm run preflight`; one kit build through Wine and Blender; a 1-stage terrain chain; `npm run studio`, with the owner opening the `app.github.dev` URL | 1 | 10 |
| 8 | Move the Claude memory files and edit the CLAUDE.md, README, this doc and the memory index | 0.5 | 2 |
| 9 | Keep the VM for 2 weeks as a fallback, then retire it | 0 | 5 |
| | **Total** | **about 6** | **about 65** |

### (g) Tiered restore: working on the 4-core/32 GB machine now

**CPU on 4 cores** (owner rulings 2026-09-25, after two crashes at
97-100 % CPU with four lanes running). Heavy jobs run through `job_guard.sh`
on cores 2-3 at low priority, preflight gates and workspace test runs are
capped at `ES_JOBS` (half the cores) and pinned to the same cores, path-scoped preflight runs only the gates its
files touch, no agent polls with `sleep`, and `cpu_watchdog.sh`, started by
`on-start.sh`, pauses the heaviest processes above 85 % machine CPU and kills
stale ones with no agent involved. The planner runs at most two heavy lanes.
Details: tooling/bootstrap/README.md § Resource guard.

Owner question, 2026-09-24: does every session need all 57 GiB? No. The
deploy gates are built to run without the vault (`preflight.mjs:61` points
`ES_ASSET_PIPELINE_ROOT` at an empty temp dir, and CI has no vault), so the
set splits by job:

| Tier | Contents | Size | When |
|---|---|---|---|
| Base (every codespace) | clone and checkout, `node_modules`, Playwright, the heightfield ladder | about 11 GiB | `postCreateCommand` |
| Toolchain | `~/tools` bundle (Wine prefix, Blender, gltfpack), vanilla BSAs/ESMs | about 7 GiB | the first kit build or miner run |
| Per-mod | one snapshot part per `mod-sources/<folder>` and per BM&V archive | 0.1–10.6 GiB each | pulled when a job names it: `tooling/bootstrap/vault-pull.sh <folder…>`, about 1 min per 5 GiB at the measured rate |

Code, UI, combat, stats, text, docs, the terrain chain and preflight need
only the base tier. A kit build pulls the toolchain and its own sources
(most kits need under 15 GiB in all). On 32 GB that leaves about 15–18 GiB for
pulled parts. `vault-pull.sh` reports free space and evicts the
least-recently pulled mod folders when a pull would not fit. Only jobs that
read the whole mod pool at once (a full kit-mining run over every plugin)
need the big machine or the VM. So the snapshot is packed **one part set per
top-level folder**, never one tarball, and the rehearsal config (a) becomes
the everyday 4-core config. Rejected: an `rclone mount` (FUSE) for lazy reads
per file. Codespaces needs extra container privileges for FUSE, and the
pipeline seeks through multi-GB BSAs and RARs, which is slow over a network
mount. The Support ticket upgrades the machine; it no longer blocks the move.

**Whole-pool mining in batches** (owner question, 2026-09-24). A full miner
run can also pull, mine and evict one batch at a time. A batch is one plugin
plus the mod folders of every master and asset source it references (read
from the plugin's master list and `exterior-interior-links.json`, never
from folder names), with vanilla always present. This needs a batch mode and
a merge step in the three miners. Owner ruling 2026-09-24: no separate VM
proof run. It is written and run directly in the codespace. The first batched
run diffs its merged output against the committed mined records (the last
full run), and any difference is explained before the output is used.

**Toolchain in the image, not the bucket** (owner question, 2026-09-24).
Blender 4.4.3 (Windows build), Wine 11.13, PyNifly, gltfpack and
DepotDownloader are all public, redistributable downloads. So
`.devcontainer/Dockerfile` installs them by script, including building the
`wine-pynifly-prefix` that was hand-built on the VM, alongside apt, Python,
Node, Playwright and the Claude Code feature. A **prebuild** (Actions)
bakes the image, so a new codespace opens with everything installed in
about a minute, and only the secret-gated tiers (heightfield, vanilla, mods)
restore after creation. Prove the scripted prefix by building one kit in
the codespace and matching the VM's output hash. This supersedes the
`~/tools` snapshot bundle and reason (e) 6 (prebuild storage is about
$1/month at the image size).

## Recommendations

1. **Back up the heightfield ladder today.** DONE 2026-09-24:
   `r2:elder-souls-vault/heightfield/2026-09-24/` (1181 files, 1.545 GB,
   `rclone check` 0 differences), the vault `git bundle --all` at
   `vault-git/vault-git-2026-09-24.bundle`, and the vault's 10 uncommitted
   files at `vault-git/worktree-2026-09-24/`. These are kept as a second copy.
   After any `--refreeze`, run
   `tooling/bootstrap/snapshot-vault.sh --only mod-sources/tamriel-worldspaces-118678`.
2. **Open the Support ticket for the larger machines.** Done 2026-09-24.
   Since the tiered restore (g) it is a speed upgrade, not a gate.
3. **Snapshot to R2 rather than re-download.** It costs about $0.60 a month,
   restores in minutes and covers the heightfield and BM&V, which no API
   provides. Keep the DepotDownloader and Nexus scripts only as a documented
   fallback.
4. **Before migrating, turn prose provenance into a machine-readable register.**
   Only 8 of the 50 mod folders are in `SOURCES.json` with fileId and sha256.
   A `modId/fileId/sha256` row per archive turns the re-download fallback
   into a script, and it is what standard 6 (source+hash+credit) already asks for.
5. **Drop what is not needed** from the snapshot: `.codex-worktrees` 3.6 GiB,
   the unused Blender 3.2.2, and old Playwright browsers.
6. **Make the portability fixes on the VM first** (`terrain-chain.sh:126`
   through `vault.py`, the memwatch ceiling from `memory.max`/`MemTotal`, and a
   requirements file for the asset pipeline). They are correct on both
   machines and they shrink migration day.
7. If the ticket is refused, use the tiered restore (g) on the 4-core
   machine, and keep the VM only for whole-pool mining runs.
