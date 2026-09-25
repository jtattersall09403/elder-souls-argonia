# Elder Souls: Argonia codespace image.
#
# Holds the system packages and the asset-pipeline toolchain, laid out under
# /opt/es-tools exactly as tooling/asset-pipeline/pipeline/config/toolchain.json
# expects under ~/tools (on-create.sh links ~/tools -> /opt/es-tools). The
# packages, versions and sha256 pins live in ONE file,
# tooling/bootstrap/install-toolchain.sh, which the EC2 host runs with --host;
# the build context is the repo root (devcontainer.json "context": ".."). Node, Python, gh and Claude
# Code come from the devcontainer features in devcontainer.json. No secrets
# here: this layer is baked by the Codespaces prebuild. The Wine prefix
# (wine-pynifly-prefix) is built by tooling/bootstrap/first-run.sh (run by
# hand) as the vscode user, since Wine refuses a prefix owned by someone else;
# the script chowns /opt/es-tools to --owner for that reason.
FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

COPY tooling/bootstrap/install-toolchain.sh /tmp/install-toolchain.sh
RUN bash /tmp/install-toolchain.sh --image --owner vscode \
 && rm -rf /var/lib/apt/lists/* /tmp/install-toolchain.sh
