#!/usr/bin/env bash
# install-toolchain.sh: the machine-level toolchain of a dev machine, as root
# (or through sudo). Idempotent: every piece is skipped when it is already
# there at the pinned version, so a re-run is cheap.
#
#   install-toolchain.sh --image --owner vscode   the codespace image's layer
#       (.devcontainer/Dockerfile RUNs this): apt packages, rclone and rtk into
#       /usr/local/bin, Wine, Blender + PyNifly and gltfpack into /opt/es-tools
#   install-toolchain.sh --host --owner es        the same, plus what the
#       devcontainer features and containerEnv give a codespace
#       (devcontainer.json:12-19,32-36), for a plain Ubuntu 24.04 host (EC2):
#       Node 22 (NodeSource), gh (GitHub's apt repo), Claude Code (npm -g), a
#       Python venv at /opt/es/venv owned by --owner and first on PATH (stock
#       Ubuntu's python3 is externally managed, PEP 668, so on-create.sh's
#       `python3 -m pip install` needs the venv), git/jq/tmux, the VS Code
#       CLI `code` into /opt/es/bin (owned by --owner, linked from
#       /usr/local/bin; sha256 pinned), and
#       /etc/profile.d/es.sh (read by login shells and, through a line added
#       to /etc/bash.bashrc, by every interactive bash).
#
# The pins below are the only copy: .devcontainer/Dockerfile runs this script
# with --image (build context = repo root), so the image and EC2 cannot drift.
set -euo pipefail

WINE_VERSION=11.13
WINE_SHA256=889423273334f12bf2a4e2249f6ade72d7ceb466f72274925fda1e11b8326164
BLENDER_VERSION=4.4.3
BLENDER_SHA256=60a9703b07f2cf42509f699ccdec4f5ede71c1932f6c14329f0e14c023e27d5c
PYNIFLY_TAG=V28.1.0
PYNIFLY_SHA256=e7c3a8412ec763aeb8577369f823411a4e9d97b0f3e60796a2f0d2d7e80e5484
GLTFPACK_VERSION=1.2
GLTFPACK_SHA256=7e0dc08489835df804a83ca111c2cac6f8431f5a7b0e5453d94d6749a988b32f
RCLONE_VERSION=1.75.1
RCLONE_SHA256=982b5aa772841168f8e380f139e9e787b2a105403e32b94da8676a0e1c0a13ab
RTK_VERSION=0.49.0
RTK_SHA256=a051b22361c7cfa36022bc3f06bb41cdc88e58a07263dc340d8bd3468c41befe
NODE_MAJOR=22
# The VS Code CLI (`code`, host only): the initial install; the tunnel service
# updates itself afterwards.
VSCODE_CLI_VERSION=1.139.1
VSCODE_CLI_SHA256=4bb8c6d1721a1bdf4ac57046ccc966d5487f2804270b3054270110b83e13d58a

TOOLS=/opt/es-tools
VENV=/opt/es/venv
PROFILE=/etc/profile.d/es.sh

say() { echo "[install-toolchain] $*"; }
die() { echo "[install-toolchain] ERROR: $*" >&2; exit 1; }

mode="" owner=""
while (( $# )); do
  case "$1" in
    --image) mode=image ;;
    --host) mode=host ;;
    --owner) owner="${2:?--owner needs a user}"; shift ;;
    *) die "unknown argument: $1 (usage: install-toolchain.sh --image|--host --owner <user>)" ;;
  esac
  shift
done
[[ -n "$mode" && -n "$owner" ]] || die "usage: install-toolchain.sh --image|--host --owner <user>"
if (( EUID != 0 )); then exec sudo -E bash "$(readlink -f "${BASH_SOURCE[0]}")" "--$mode" --owner "$owner"; fi
id "$owner" >/dev/null 2>&1 || die "no such user: $owner"
export DEBIAN_FRONTEND=noninteractive

# The Dockerfile's package set (bsdtar for the mod RARs, ffmpeg for the audio
# pipeline, libspatialindex for rtree, the libs the wow64 Wine and a headless
# Blender load); the host adds what the base image and features carried.
APT_IMAGE=(ca-certificates curl unzip xz-utils libarchive-tools ffmpeg libspatialindex-dev
  libx11-6 libx11-xcb1 libxext6 libxrender1 libxcursor1 libxi6 libxrandr2
  libxcomposite1 libxinerama1 libxfixes3 libxxf86vm1 libxkbcommon0 libxkbregistry0
  libwayland-client0 libwayland-egl1 libgl1 libegl1 libvulkan1 ocl-icd-libopencl1
  libfreetype6 libfontconfig1 fonts-dejavu-core
  libgnutls30t64 libkrb5-3 libgssapi-krb5-2 libdbus-1-3 libudev1 libusb-1.0-0
  libasound2t64 libpulse0 libcups2t64
  libgstreamer1.0-0 libgstreamer-plugins-base1.0-0)
APT_HOST=(git jq tmux gnupg build-essential python3-venv python3-dev iproute2 util-linux)

apt_install() {
  local missing=() p
  for p in "$@"; do dpkg-query -W -f='${Status}' "$p" 2>/dev/null | grep -q "install ok installed" || missing+=("$p"); done
  (( ${#missing[@]} )) || return 0
  say "apt: ${missing[*]}"
  apt-get update -q
  apt-get install -y -q --no-install-recommends "${missing[@]}"
}

sha_ok() { echo "$2  $1" | sha256sum -c --status -; }  # sha_ok <file> <sha256>

DL="$(mktemp -d /tmp/es-dl.XXXXXX)"
trap 'rm -rf "$DL"' EXIT

install_bins() {
  if [[ "$(/usr/local/bin/rclone version 2>/dev/null | head -1)" != "rclone v${RCLONE_VERSION}" ]]; then
    say "rclone ${RCLONE_VERSION}"
    curl -fsSL -o "$DL/rclone.zip" "https://downloads.rclone.org/v${RCLONE_VERSION}/rclone-v${RCLONE_VERSION}-linux-amd64.zip"
    sha_ok "$DL/rclone.zip" "$RCLONE_SHA256" || die "rclone.zip sha256 mismatch"
    unzip -q -o "$DL/rclone.zip" -d "$DL"
    install -m 755 "$DL/rclone-v${RCLONE_VERSION}-linux-amd64/rclone" /usr/local/bin/rclone
  fi
  if ! sha_ok /usr/local/bin/rtk "$RTK_SHA256" 2>/dev/null; then
    say "rtk ${RTK_VERSION}"
    curl -fsSL -o "$DL/rtk.tgz" "https://github.com/rtk-ai/rtk/releases/download/v${RTK_VERSION}/rtk-x86_64-unknown-linux-musl.tar.gz"
    tar -C "$DL" -xzf "$DL/rtk.tgz" rtk
    sha_ok "$DL/rtk" "$RTK_SHA256" || die "rtk sha256 mismatch"
    install -m 755 "$DL/rtk" /usr/local/bin/rtk
  fi
}

install_tools() {
  local wine="$TOOLS/wine-${WINE_VERSION}-amd64-wow64" blender="$TOOLS/blender-${BLENDER_VERSION}-windows-x64"
  local addons="$blender/${BLENDER_VERSION%.*}/scripts/addons_core"
  mkdir -p "$TOOLS"
  if [[ ! -x "$wine/bin/wine" ]]; then
    say "Wine ${WINE_VERSION}"
    curl -fsSL -o "$DL/wine.tar.xz" "https://github.com/Kron4ek/Wine-Builds/releases/download/${WINE_VERSION}/wine-${WINE_VERSION}-amd64-wow64.tar.xz"
    sha_ok "$DL/wine.tar.xz" "$WINE_SHA256" || die "wine.tar.xz sha256 mismatch"
    tar -C "$TOOLS" -xJf "$DL/wine.tar.xz"
    [[ -x "$wine/bin/wine" ]] || die "Wine not at $wine/bin/wine after unpacking"
    rm -f "$DL/wine.tar.xz"
  fi
  if [[ ! -f "$blender/blender.exe" ]]; then
    say "Blender ${BLENDER_VERSION}"
    curl -fsSL -o "$DL/blender.zip" "https://download.blender.org/release/Blender${BLENDER_VERSION%.*}/blender-${BLENDER_VERSION}-windows-x64.zip"
    sha_ok "$DL/blender.zip" "$BLENDER_SHA256" || die "blender.zip sha256 mismatch"
    unzip -q "$DL/blender.zip" -d "$TOOLS"
    [[ -f "$blender/blender.exe" ]] || die "Blender not at $blender/blender.exe after unpacking"
    rm -f "$DL/blender.zip"
  fi
  if [[ ! -f "$addons/io_scene_nifly/NiflyDLL.dll" ]]; then
    say "PyNifly ${PYNIFLY_TAG}"
    curl -fsSL -o "$DL/pynifly.zip" "https://github.com/BadDogSkyrim/PyNifly/releases/download/${PYNIFLY_TAG}/io_scene_nifly.zip"
    sha_ok "$DL/pynifly.zip" "$PYNIFLY_SHA256" || die "pynifly.zip sha256 mismatch"
    unzip -q -o "$DL/pynifly.zip" -d "$addons"
    [[ -f "$addons/io_scene_nifly/NiflyDLL.dll" ]] || die "PyNifly not at $addons/io_scene_nifly after unpacking"
  fi
  if ! sha_ok "$TOOLS/gltfpack-${GLTFPACK_VERSION}/gltfpack" "$GLTFPACK_SHA256" 2>/dev/null; then
    say "gltfpack ${GLTFPACK_VERSION}"
    curl -fsSL -o "$DL/gltfpack.zip" "https://github.com/zeux/meshoptimizer/releases/download/v${GLTFPACK_VERSION}/gltfpack-ubuntu.zip"
    unzip -q -o "$DL/gltfpack.zip" gltfpack -d "$DL"
    sha_ok "$DL/gltfpack" "$GLTFPACK_SHA256" || die "gltfpack sha256 mismatch"
    install -D -m 755 "$DL/gltfpack" "$TOOLS/gltfpack-${GLTFPACK_VERSION}/gltfpack"
  fi
  # Wine refuses a prefix owned by someone else; the prefix (first-run.sh)
  # is built by the owner, so the tree is the owner's too.
  chown -R "$owner:$(id -gn "$owner")" "$TOOLS"
}

install_node() {
  if [[ "$(node --version 2>/dev/null)" != v${NODE_MAJOR}.* ]]; then
    say "Node ${NODE_MAJOR} (NodeSource)"
    install -d -m 755 /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
    apt-get update -q
    apt-get install -y -q nodejs
  fi
}

install_gh() {
  command -v gh >/dev/null && return 0
  say "gh (GitHub's apt repo)"
  install -d -m 755 /etc/apt/keyrings
  curl -fsSL -o /etc/apt/keyrings/githubcli-archive-keyring.gpg https://cli.github.com/packages/githubcli-archive-keyring.gpg
  chmod 644 /etc/apt/keyrings/githubcli-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list
  apt-get update -q
  apt-get install -y -q gh
}

install_claude() {
  command -v claude >/dev/null && return 0
  say "Claude Code (npm -g @anthropic-ai/claude-code)"
  npm install -g --no-audit --no-fund @anthropic-ai/claude-code
}

install_vscode_cli() {
  # In a folder the owner writes: the CLI updates itself by renaming its own
  # file, which it could not do in root's /usr/local/bin.
  local dir=/opt/es/bin
  if [[ ! -x "$dir/code" ]]; then  # once installed (and maybe self-updated since), keep it
    say "VS Code CLI ${VSCODE_CLI_VERSION}"
    curl -fsSL -o "$DL/vscode-cli.tgz" "https://update.code.visualstudio.com/${VSCODE_CLI_VERSION}/cli-alpine-x64/stable"
    sha_ok "$DL/vscode-cli.tgz" "$VSCODE_CLI_SHA256" || die "vscode-cli.tgz sha256 mismatch"
    tar -C "$DL" -xzf "$DL/vscode-cli.tgz" code
    install -D -m 755 "$DL/code" "$dir/code"
  fi
  chown -R "$owner:$(id -gn "$owner")" "$dir"
  ln -sfn "$dir/code" /usr/local/bin/code
}

install_venv() {
  if [[ ! -x "$VENV/bin/python3" ]]; then
    say "python venv at $VENV"
    mkdir -p "$(dirname "$VENV")"
    python3 -m venv "$VENV"
    "$VENV/bin/python3" -m pip install --quiet --upgrade pip
  fi
  chown -R "$owner:$(id -gn "$owner")" "$VENV"
}

# The three containerEnv variables, the venv first on PATH, and the two
# machine files under /workspaces (both outside the repo, both optional):
# .es-machine.env (ES_TUNNEL_URL, ES_CACHE_LINKS; on-start.sh reads it too)
# and .es-secrets.env (mode 600, readable by its owner only; the five
# secrets). `set -a` exports whatever the files assign.
write_profile() {
  cat > "$PROFILE" <<'EOF'
# Elder Souls dev machine (tooling/bootstrap/install-toolchain.sh --host). Do not edit here.
case ":$PATH:" in *":/opt/es/venv/bin:"*) ;; *) PATH="/opt/es/venv/bin:$PATH" ;; esac
export PATH
export ES_STUDIO_PORT="${ES_STUDIO_PORT:-8081}"
export CLAUDE_CONFIG_DIR=/workspaces/.claude-home
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
for _es_env in /workspaces/.es-machine.env /workspaces/.es-secrets.env; do
  if [ -r "$_es_env" ]; then set -a; . "$_es_env"; set +a; fi
done
unset _es_env
EOF
  chmod 644 "$PROFILE"
  local hook='[ -r /etc/profile.d/es.sh ] && . /etc/profile.d/es.sh  # elder-souls'
  grep -qxF "$hook" /etc/bash.bashrc || echo "$hook" >> /etc/bash.bashrc
}

apt_install "${APT_IMAGE[@]}"
install_bins
install_tools
if [[ "$mode" == host ]]; then
  apt_install "${APT_HOST[@]}"
  install_node
  install_gh
  install_claude
  install_vscode_cli
  install_venv
  write_profile
fi
say "done ($mode, owner $owner)"
