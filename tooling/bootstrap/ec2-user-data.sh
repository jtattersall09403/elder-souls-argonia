#!/bin/bash
# ec2-user-data.sh: paste this whole file into "User data" when launching the
# EC2 dev machine (Ubuntu Server 24.04 LTS x86, m7i.2xlarge, eu-west-2). It
# runs once, as root, at first boot (about 15-25 min). NO SECRET goes here:
# user data is stored in plain text. It:
#   - creates the user es (uid 1000 when free; stock Ubuntu AMIs give 1000 to
#     `ubuntu`, then es takes the next free uid), passwordless sudo, bash;
#   - makes /workspaces (owned by es) and a sparse copy of the repo's
#     tooling/bootstrap in /opt/es/src (public repo, no token);
#   - runs install-toolchain.sh --host --owner es (the codespace image's
#     toolchain plus Node 22, gh, Claude Code, tmux, the VS Code CLI `code`
#     and the /opt/es/venv Python);
#   - installs /opt/es/stage2.sh, /opt/es/stage3.sh and /opt/es/idle-stop.sh;
#   - enables lingering for es (so the tunnel's user service runs at boot),
#     es-on-start.service (on-start.sh at every boot, once the repo exists)
#     and es-idle-stop.timer (idle-stop.sh every 10 min);
#   - writes /opt/es/USER-DATA-DONE with the time.
# Log: /var/log/es-user-data.log (and the console: EC2 > Actions > Monitor
# and troubleshoot > Get system log). Safe to re-run by hand:
#   sudo bash /var/lib/cloud/instance/user-data.txt
set -euo pipefail
exec > >(tee -a /var/log/es-user-data.log /dev/console) 2>&1
echo "[user-data] start $(date -u +%FT%TZ)"

REPO_URL=https://github.com/jtattersall09403/elder-souls-argonia
BRANCH=dev
U=es
export DEBIAN_FRONTEND=noninteractive

# 1. The user.
if ! id "$U" >/dev/null 2>&1; then
  if getent passwd 1000 >/dev/null; then useradd -m -s /bin/bash "$U"
  else useradd -m -s /bin/bash -u 1000 "$U"; fi
fi
usermod -aG sudo "$U"
echo "$U ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/90-es
chmod 440 /etc/sudoers.d/90-es
visudo -cf /etc/sudoers.d/90-es
install -d -o "$U" -g "$U" /workspaces
install -d /opt/es /etc/es /var/lib/es

# 2. The bootstrap scripts (sparse: tooling/bootstrap only).
apt-get update -q
apt-get install -y -q git tmux curl ca-certificates
SRC=/opt/es/src
if [[ -d "$SRC/.git" ]]; then
  git -C "$SRC" fetch -q --depth 1 origin "$BRANCH"
  git -C "$SRC" reset -q --hard FETCH_HEAD
else
  git clone -q --depth 1 --filter=blob:none --sparse --branch "$BRANCH" "$REPO_URL" "$SRC"
fi
git -C "$SRC" sparse-checkout set tooling/bootstrap
B="$SRC/tooling/bootstrap"

# 3. The toolchain.
bash "$B/install-toolchain.sh" --host --owner "$U"

# 4. The VS Code CLI (installed above, pinned in install-toolchain.sh).
/usr/local/bin/code --version

# 5. The stage scripts and the idle stop.
install -m 755 "$B/ec2-stage2.sh" /opt/es/stage2.sh
install -m 755 "$B/ec2-stage3.sh" /opt/es/stage3.sh
install -m 755 "$B/idle-stop.sh" /opt/es/idle-stop.sh
[[ -f /etc/es/idle.env ]] || cat > /etc/es/idle.env <<'EOF'
# idle-stop.sh settings (see its header). Edit, no restart needed.
ES_IDLE_MINUTES=90
ES_IDLE_LOAD=0.5
ES_IDLE_TUNNEL_BASELINE=1
EOF

# 6. systemd: lingering (the tunnel's user service), on-start at boot, the idle timer.
loginctl enable-linger "$U"
cat > /etc/systemd/system/es-on-start.service <<EOF
[Unit]
Description=Elder Souls on-start.sh (watchdog, cache links, tunnel env)
After=network-online.target
Wants=network-online.target
ConditionPathExists=/workspaces/elder-souls-argonia/tooling/bootstrap/on-start.sh

[Service]
Type=oneshot
User=$U
RemainAfterExit=yes
KillMode=process
ExecStart=/bin/bash -lc 'bash /workspaces/elder-souls-argonia/tooling/bootstrap/on-start.sh'

[Install]
WantedBy=multi-user.target
EOF
cat > /etc/systemd/system/es-idle-stop.service <<'EOF'
[Unit]
Description=Elder Souls idle stop check

[Service]
Type=oneshot
ExecStart=/opt/es/idle-stop.sh
EOF
cat > /etc/systemd/system/es-idle-stop.timer <<'EOF'
[Unit]
Description=Elder Souls idle stop check every 10 minutes

[Timer]
OnBootSec=10min
OnUnitActiveSec=10min

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable es-on-start.service
systemctl enable --now es-idle-stop.timer

date -u +%FT%TZ > /opt/es/USER-DATA-DONE
echo "[user-data] ES USER-DATA DONE $(cat /opt/es/USER-DATA-DONE). Next: EC2 Instance Connect, then: sudo -iu es bash /opt/es/stage2.sh"
