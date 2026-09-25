#!/usr/bin/env bash
# ec2-stage3.sh, installed as /opt/es/stage3.sh by ec2-user-data.sh: run by
# the owner once, as es, in the browser VS Code terminal
# (vscode.dev/tunnel/es-argonia):
#
#   bash /opt/es/stage3.sh
#
# It does on EC2 what the codespace lifecycle did: GitHub sign-in (device
# code), the clone at /workspaces/elder-souls-argonia on dev, the secrets from
# /workspaces/.es-secrets.env, on-create.sh, post-create.sh, first-run.sh,
# then the whole mod pool and the chain tier (about 42 GiB; with the tiers
# before it the whole 53 GiB snapshot is on the one 250 GB volume, so nothing
# is pulled on demand later), then on-start.sh.
# Every step is idempotent, so a re-run after a failure resumes.
set -euo pipefail

REPO_URL="${ES_REPO_URL:-https://github.com/jtattersall09403/elder-souls-argonia}"
REPO=/workspaces/elder-souls-argonia
SECRETS=/workspaces/.es-secrets.env
MACHINE=/workspaces/.es-machine.env
say() { echo "[stage3] $*"; }
die() { echo "[stage3] ERROR: $*" >&2; exit 1; }

[[ "$(id -un)" == es ]] || die "run this as es (the VS Code terminal is es)"
# shellcheck source=/dev/null
[[ -r /etc/profile.d/es.sh ]] && . /etc/profile.d/es.sh

# 1. GitHub sign-in, for push and gh (the clone itself needs none).
if gh auth status >/dev/null 2>&1; then
  say "gh is signed in"
else
  say "GitHub sign-in: open the address below, enter the code, approve."
  gh auth login --web --git-protocol https --hostname github.com
fi
gh auth setup-git
# Commit identity: ES_GIT_NAME / ES_GIT_EMAIL from the machine file when set,
# else the GitHub account's login and its noreply address.
# shellcheck source=/dev/null
[[ -r /workspaces/.es-machine.env ]] && { set -a; . /workspaces/.es-machine.env; set +a; }
if ! git config --global user.name >/dev/null; then
  git config --global user.name "${ES_GIT_NAME:-$(gh api user --jq .login)}"
fi
if ! git config --global user.email >/dev/null; then
  git config --global user.email "${ES_GIT_EMAIL:-$(gh api user --jq '"\(.id)+\(.login)@users.noreply.github.com"')}"
fi

# 2. The repo.
if [[ -d "$REPO/.git" ]]; then
  say "repo present: $REPO ($(git -C "$REPO" rev-parse --abbrev-ref HEAD))"
else
  say "cloning $REPO_URL (dev) into $REPO"
  git clone --branch dev "$REPO_URL" "$REPO"
fi

# 3. Secrets: a file only es can read, never in the repo or user-data.
REQUIRED=(ES_SNAPSHOT_ACCESS_KEY_ID ES_SNAPSHOT_SECRET_ACCESS_KEY ES_SNAPSHOT_ENDPOINT NEXUS_API_KEY)
need_secrets() {
  echo "[stage3] $SECRETS $1. Create it in the editor with these lines, fill the values, save, then run 'chmod 600 $SECRETS':" >&2
  printf '  %s=\n' "${REQUIRED[@]}" CLAUDE_CODE_OAUTH_TOKEN >&2
  echo "  (the last one is optional: without it Claude Code asks you to log in)" >&2
  exit 1
}
[[ -f "$SECRETS" ]] || need_secrets "is missing"
[[ "$(stat -c %a "$SECRETS")" == 600 ]] || need_secrets "must have mode 600 (it has $(stat -c %a "$SECRETS"))"
set -a
# shellcheck source=/dev/null
. "$SECRETS"
set +a
missing=()
for n in "${REQUIRED[@]}"; do [[ -n "${!n:-}" ]] || missing+=("$n"); done
(( ${#missing[@]} == 0 )) || need_secrets "has no value for ${missing[*]}"

# 4. Machine settings on-start.sh and every shell read. One volume: /tmp
# shares it, so the /tmp cache links would gain nothing (and /tmp is wiped
# at boot): keep the pool in place.
touch "$MACHINE"
grep -q '^ES_CACHE_LINKS=' "$MACHINE" || echo "ES_CACHE_LINKS=0" >> "$MACHINE"
set -a
# shellcheck source=/dev/null
. "$MACHINE"
set +a

# 5. The codespace lifecycle, in its order.
cd "$REPO"
bash tooling/bootstrap/on-create.sh
bash tooling/bootstrap/post-create.sh
bash tooling/bootstrap/first-run.sh
say "pulling the whole mod pool and the chain tier (about 42 GiB; skips what is here)"
bash tooling/bootstrap/vault-pull.sh --tier mod --tier chain
bash tooling/bootstrap/on-start.sh

cat <<EOF

[stage3] done. The machine is ready.
Studio, first time:
  1. Open the Ports panel (bottom of the window), click "Forward a Port",
     type 8081, press Enter, and copy the forwarded address it shows
     (https://....devtunnels.ms). Leave its visibility Private.
  2. In this terminal: echo 'ES_TUNNEL_URL=<that address>' >> $MACHINE
     then: bash tooling/bootstrap/on-start.sh
  3. Open a new terminal and run: npm run studio
  4. Open the forwarded address in the browser: the studio loads.
EOF
