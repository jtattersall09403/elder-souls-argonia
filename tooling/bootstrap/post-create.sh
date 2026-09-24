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
# root. ES_ASSET_PIPELINE_ROOT (read by the pipeline) must agree with it.
[[ -f "$MANIFEST" ]] || die "snapshot manifest not found: $MANIFEST"
VAULT_REL="$(python3 -c 'import json,sys; print(next(p["root"] for p in json.load(open(sys.argv[1]))["parts"] if p["id"]=="vault-git"))' "$MANIFEST")" \
  || die "manifest has no 'vault-git' part: $MANIFEST"
VAULT="$DEVROOT/$VAULT_REL"
if [[ -n "${ES_ASSET_PIPELINE_ROOT:-}" && "$(realpath -m "$ES_ASSET_PIPELINE_ROOT")" != "$(realpath -m "$VAULT")" ]]; then
  die "ES_ASSET_PIPELINE_ROOT=$ES_ASSET_PIPELINE_ROOT is not the manifest's vault root $VAULT; make them agree"
fi

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
say "done. Pull a mod folder with: bash tooling/bootstrap/vault-pull.sh mod-sources/<folder>"
