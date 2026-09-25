#!/usr/bin/env bash
# postCreateCommand: the steps that need the Codespaces secrets, so they run
# after creation and never in a prebuild. Writes the rclone `r2:` remote and
# the Nexus key file from the secrets, clones the asset-pipeline vault from
# its git bundle when it is absent, then restores the base, claude and vault
# tiers (the toolchain tier, vanilla Skyrim, is pulled before the first kit
# build, not here). Safe to re-run: vault-pull.sh
# skips parts it already holds. Never prints a secret.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEVROOT="${ES_DEVROOT:-$(dirname "$REPO")}"
MANIFEST="${ES_SNAPSHOT_MANIFEST:-$REPO/tooling/bootstrap/snapshot-manifest.json}"
PULL="$REPO/tooling/bootstrap/vault-pull.sh"
VAULT_GIT_ID="vault-git"
VAULT_WORKTREE_ID="vault-worktree"

die() { echo "[post-create] ERROR: $*" >&2; exit 1; }
say() { echo "[post-create] $*"; }

# The vault lives at one place: the manifest's vault-git root under the dev
# root. The codespace sets no vault variable (ES_ASSET_PIPELINE_ROOT,
# ELDER_SOULS_ASSET_ROOT, ES_VAULT_ROOT): each has two meanings in the code
# (ES_ASSET_PIPELINE_ROOT: the vault in worldgen/vault.py, the repo base
# holding the kits in blueprint_footprints.py; set to the vault it hides
# every footprint). Every resolver finds the vault as the repo's sibling.
[[ -f "$MANIFEST" ]] || die "snapshot manifest not found: $MANIFEST"
VAULT_REL="$(python3 -c 'import json,sys; print(next(p["root"] for p in json.load(open(sys.argv[1]))["parts"] if p["id"]=="vault-git"))' "$MANIFEST")" \
  || die "manifest has no 'vault-git' part: $MANIFEST"
VAULT="$DEVROOT/$VAULT_REL"
for v in ES_ASSET_PIPELINE_ROOT ELDER_SOULS_ASSET_ROOT ES_VAULT_ROOT; do
  [[ -z "${!v:-}" ]] || die "$v=${!v} is set; no vault variable may be set in a codespace (each has two meanings in the code). Remove it and re-run"
done

missing=()
# The five Codespaces secrets. The four restore secrets are fatal; without the
# Claude token the restore still works, so it only warns.
SECRETS=(ES_SNAPSHOT_ACCESS_KEY_ID ES_SNAPSHOT_SECRET_ACCESS_KEY ES_SNAPSHOT_ENDPOINT NEXUS_API_KEY CLAUDE_CODE_OAUTH_TOKEN)
for name in "${SECRETS[@]}"; do
  [[ -n "${!name:-}" ]] && continue
  if [[ "$name" == CLAUDE_CODE_OAUTH_TOKEN ]]; then
    echo "[post-create] WARNING: Codespaces secret CLAUDE_CODE_OAUTH_TOKEN is missing: Claude Code will ask you to log in. Add it under the repo's Settings > Secrets and variables > Codespaces." >&2
  else
    missing+=("$name")
  fi
done
if (( ${#missing[@]} )); then
  die "missing Codespaces secret(s): ${missing[*]}. Add them under the repo's Settings > Secrets and variables > Codespaces, then rebuild or re-run: bash tooling/bootstrap/post-create.sh"
fi
[[ -f "$MANIFEST" ]] || die "snapshot manifest not found: $MANIFEST"

# rclone remote `r2:` (the token is scoped to the one bucket, so rclone must
# not try to create or list buckets).
umask 077
mkdir -p "$HOME/.config/rclone" "$HOME/.config/nexus"
cat > "$HOME/.config/rclone/rclone.conf" <<EOF
[r2]
type = s3
provider = Cloudflare
access_key_id = ${ES_SNAPSHOT_ACCESS_KEY_ID}
secret_access_key = ${ES_SNAPSHOT_SECRET_ACCESS_KEY}
endpoint = ${ES_SNAPSHOT_ENDPOINT}
no_check_bucket = true
EOF
chmod 600 "$HOME/.config/rclone/rclone.conf"
printf '%s' "$NEXUS_API_KEY" > "$HOME/.config/nexus/api_key"
chmod 600 "$HOME/.config/nexus/api_key"
umask 022
say "wrote ~/.config/rclone/rclone.conf and ~/.config/nexus/api_key (mode 600)"

has_part() {
  python3 -c 'import json,sys; sys.exit(0 if any(p["id"]==sys.argv[2] for p in json.load(open(sys.argv[1]))["parts"]) else 1)' "$MANIFEST" "$1"
}

if [[ ! -d "$VAULT/.git" ]]; then
  [[ -e "$VAULT" && -n "$(ls -A "$VAULT" 2>/dev/null)" ]] \
    && die "$VAULT exists without a .git; move it aside and re-run"
  has_part "$VAULT_GIT_ID" || die "manifest has no '$VAULT_GIT_ID' part to clone the vault from"
  ES_DEVROOT="$DEVROOT" bash "$PULL" "$VAULT_GIT_ID"
  git clone "$DEVROOT/.vault-pull/$VAULT_GIT_ID.bundle" "$VAULT"
  # The vault tier (vault-worktree) is extracted only into a checkout this
  # bootstrap cloned: vault-pull.sh requires this marker.
  : > "$DEVROOT/.vault-pull/vault-clone.done"
  # A local branch for every bundled branch, so a later snapshot bundle
  # (HEAD --branches --tags) carries them all.
  git -C "$VAULT" for-each-ref --format='%(refname:strip=3)' refs/remotes/origin \
    | while IFS= read -r b; do
        [[ "$b" == HEAD ]] && continue
        git -C "$VAULT" show-ref --verify --quiet "refs/heads/$b" || git -C "$VAULT" branch --quiet --track "$b" "origin/$b"
      done
  say "cloned the vault into $VAULT"
else
  say "vault present: $VAULT"
fi

ES_DEVROOT="$DEVROOT" bash "$PULL" --tier base --tier claude
has_part "$VAULT_WORKTREE_ID" || die "manifest has no '$VAULT_WORKTREE_ID' part (the vault's uncommitted files)"
# The vault tier: the bundle (skipped, the checkout exists) and the worktree
# part. No --force: the pull's guard lets the part overlay the clone's tracked
# files that still equal HEAD, and refuses real local changes.
ES_DEVROOT="$DEVROOT" bash "$PULL" --tier vault

# The repo's gitignored .claude/settings.local.json travels in claude-home
# (filtered: no ES_TUNNEL_URL / ES_STUDIO_PORT); it is put back only where
# the repo has none. on-start.sh then merges this codespace's env into it.
if [[ ! -e "$REPO/.claude/settings.local.json" && -f "$DEVROOT/.claude-home/repo-settings.local.json" ]]; then
  mkdir -p "$REPO/.claude"
  install -m 600 "$DEVROOT/.claude-home/repo-settings.local.json" "$REPO/.claude/settings.local.json"
  say "restored .claude/settings.local.json from the claude-home part"
fi

# The asset pipeline reads the vault's Skyrim sources through relative links
# in tooling/asset-pipeline/skyrim-source/ (untracked; the same links as on
# the VM). Made idempotently; a link whose tier is not pulled yet dangles.
AP_SRC="$REPO/tooling/asset-pipeline/skyrim-source"
mkdir -p "$AP_SRC"
for d in Data extracted mod-sources; do
  link="../../../../$VAULT_REL/skyrim-source/$d"
  if [[ -L "$AP_SRC/$d" && "$(readlink "$AP_SRC/$d")" == "$link" ]]; then continue; fi
  [[ -e "$AP_SRC/$d" && ! -L "$AP_SRC/$d" ]] && die "$AP_SRC/$d exists and is not a link; move it aside and re-run"
  ln -sfn "$link" "$AP_SRC/$d"
done

# Every vault resolver must answer the manifest's vault root ($VAULT; on a
# codespace /workspaces/elder-scrolls-asset-pipeline): worldgen.vault through
# its sibling fallback, the asset pipeline through vault_path. And the kit
# footprints the settlement compile reads must be found.
want="$(realpath -m "$VAULT")"
wg="$(cd "$REPO/tooling/world-generation" && python3 -c 'from worldgen.vault import VAULT_ROOT; print(VAULT_ROOT)')"
ap="$(python3 "$REPO/tooling/asset-pipeline/pipeline/vault_path.py")"
say "vault: worldgen.vault.VAULT_ROOT=$wg; asset-pipeline vault_path=$ap"
[[ "$(realpath -m "$wg")" == "$want" ]] || die "worldgen.vault.VAULT_ROOT is $wg, not the vault $want"
[[ "$(realpath -m "$ap")" == "$want" ]] || die "the asset pipeline's vault_path is $ap, not the vault $want"
fp="$(cd "$REPO/tooling/world-generation" && python3 -c 'from worldgen.blueprint_footprints import FootprintLibrary; print(len(FootprintLibrary().by_asset))')" \
  || die "could not count the kit footprints (worldgen.blueprint_footprints failed to import)"
say "kit footprints found: $fp"
(( fp > 0 )) || die "blueprint_footprints finds 0 kit footprints under tooling/asset-pipeline/output/kits"
for d in Data extracted mod-sources; do
  t="$(realpath -m "$AP_SRC/$d")"
  [[ "$t" == "$want/"* ]] || die "$AP_SRC/$d points at $t, outside the vault $want"
  if [[ -e "$AP_SRC/$d" ]]; then say "link skyrim-source/$d -> $t"
  else say "link skyrim-source/$d -> $t (dangling until its tier is pulled)"; fi
done
say "done. Pull a mod folder with: bash tooling/bootstrap/vault-pull.sh mod-sources/<folder>"
