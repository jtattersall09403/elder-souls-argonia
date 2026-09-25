# Elder Souls: Argonia codespace image.
#
# Holds the system packages and the asset-pipeline toolchain, laid out under
# /opt/es-tools exactly as tooling/asset-pipeline/pipeline/config/toolchain.json
# expects under ~/tools (on-create.sh links ~/tools -> /opt/es-tools). Every
# download is pinned by version and sha256; the hashes match the copies on the
# build VM (2026-09-24). Node, Python, gh and Claude Code come from the
# devcontainer features in devcontainer.json. No secrets here: this layer is
# baked by the Codespaces prebuild.
FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

ARG WINE_VERSION=11.13
ARG WINE_SHA256=889423273334f12bf2a4e2249f6ade72d7ceb466f72274925fda1e11b8326164
ARG BLENDER_VERSION=4.4.3
ARG BLENDER_SHA256=60a9703b07f2cf42509f699ccdec4f5ede71c1932f6c14329f0e14c023e27d5c
ARG PYNIFLY_TAG=V28.1.0
ARG PYNIFLY_SHA256=e7c3a8412ec763aeb8577369f823411a4e9d97b0f3e60796a2f0d2d7e80e5484
ARG GLTFPACK_VERSION=1.2
ARG GLTFPACK_SHA256=7e0dc08489835df804a83ca111c2cac6f8431f5a7b0e5453d94d6749a988b32f
ARG RCLONE_VERSION=1.75.1
ARG RCLONE_SHA256=982b5aa772841168f8e380f139e9e787b2a105403e32b94da8676a0e1c0a13ab
ARG RTK_VERSION=0.49.0
ARG RTK_SHA256=a051b22361c7cfa36022bc3f06bb41cdc88e58a07263dc340d8bd3468c41befe

# System packages. bsdtar reads the mod RARs (pipeline/build_kit.py); no X
# server: Wine and Blender run headless, as on the VM; the lib* set is what the wow64 Wine build
# links or loads for a headless Blender (no i386 packages: the build is wow64);
# libspatialindex backs rtree for the mounts miner; ffmpeg (with ffprobe) is
# called by tooling/audio-pipeline/audio_pipeline/codec.py.
RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      ca-certificates curl unzip xz-utils \
      libarchive-tools \
      ffmpeg \
      libspatialindex-dev \
      libx11-6 libx11-xcb1 libxext6 libxrender1 libxcursor1 libxi6 libxrandr2 \
      libxcomposite1 libxinerama1 libxfixes3 libxxf86vm1 libxkbcommon0 libxkbregistry0 \
      libwayland-client0 libwayland-egl1 libgl1 libegl1 libvulkan1 ocl-icd-libopencl1 \
      libfreetype6 libfontconfig1 fonts-dejavu-core \
      libgnutls30t64 libkrb5-3 libgssapi-krb5-2 libdbus-1-3 libudev1 libusb-1.0-0 \
      libasound2t64 libpulse0 libcups2t64 \
      libgstreamer1.0-0 libgstreamer-plugins-base1.0-0 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /tmp/es-dl

# pipefail so a failed download in a pipe fails the layer.
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# rclone (official binary, not apt) and rtk (the shell-output filter the
# global Claude hook calls) into /usr/local/bin.
RUN curl -fsSL -o rclone.zip "https://downloads.rclone.org/v${RCLONE_VERSION}/rclone-v${RCLONE_VERSION}-linux-amd64.zip" \
 && echo "${RCLONE_SHA256}  rclone.zip" | sha256sum -c - \
 && unzip -q rclone.zip \
 && install -m 755 "rclone-v${RCLONE_VERSION}-linux-amd64/rclone" /usr/local/bin/rclone \
 && curl -fsSL -o rtk.tgz "https://github.com/rtk-ai/rtk/releases/download/v${RTK_VERSION}/rtk-x86_64-unknown-linux-musl.tar.gz" \
 && tar -xzf rtk.tgz rtk \
 && echo "${RTK_SHA256}  rtk" | sha256sum -c - \
 && install -m 755 rtk /usr/local/bin/rtk \
 && rm -rf /tmp/es-dl/*

# Pipeline toolchain under /opt/es-tools:
#   wine-11.13-amd64-wow64/bin/wine            (Kron4ek Wine-Builds)
#   blender-4.4.3-windows-x64/blender.exe      (blender.org, Windows portable)
#   blender-4.4.3-windows-x64/4.4/scripts/addons_core/io_scene_nifly
#                                              (PyNifly release zip, unpacked
#                                               as on the VM; the Blender
#                                               scripts enable it by module)
#   gltfpack-1.2/gltfpack                      (meshoptimizer v1.2)
# The Wine prefix (wine-pynifly-prefix) is built by tooling/bootstrap/first-run.sh
# (run by hand) as the vscode user, since Wine refuses a prefix owned by
# someone else.
RUN mkdir -p /opt/es-tools \
 && curl -fsSL -o wine.tar.xz "https://github.com/Kron4ek/Wine-Builds/releases/download/${WINE_VERSION}/wine-${WINE_VERSION}-amd64-wow64.tar.xz" \
 && echo "${WINE_SHA256}  wine.tar.xz" | sha256sum -c - \
 && tar -C /opt/es-tools -xJf wine.tar.xz \
 && test -x "/opt/es-tools/wine-${WINE_VERSION}-amd64-wow64/bin/wine" \
 && rm wine.tar.xz \
 && curl -fsSL -o blender.zip "https://download.blender.org/release/Blender${BLENDER_VERSION%.*}/blender-${BLENDER_VERSION}-windows-x64.zip" \
 && echo "${BLENDER_SHA256}  blender.zip" | sha256sum -c - \
 && unzip -q blender.zip -d /opt/es-tools \
 && test -f "/opt/es-tools/blender-${BLENDER_VERSION}-windows-x64/blender.exe" \
 && rm blender.zip \
 && curl -fsSL -o pynifly.zip "https://github.com/BadDogSkyrim/PyNifly/releases/download/${PYNIFLY_TAG}/io_scene_nifly.zip" \
 && echo "${PYNIFLY_SHA256}  pynifly.zip" | sha256sum -c - \
 && unzip -q pynifly.zip -d "/opt/es-tools/blender-${BLENDER_VERSION}-windows-x64/${BLENDER_VERSION%.*}/scripts/addons_core" \
 && test -f "/opt/es-tools/blender-${BLENDER_VERSION}-windows-x64/${BLENDER_VERSION%.*}/scripts/addons_core/io_scene_nifly/NiflyDLL.dll" \
 && rm pynifly.zip \
 && curl -fsSL -o gltfpack.zip "https://github.com/zeux/meshoptimizer/releases/download/v${GLTFPACK_VERSION}/gltfpack-ubuntu.zip" \
 && unzip -q gltfpack.zip gltfpack \
 && echo "${GLTFPACK_SHA256}  gltfpack" | sha256sum -c - \
 && install -D -m 755 gltfpack "/opt/es-tools/gltfpack-${GLTFPACK_VERSION}/gltfpack" \
 && rm -rf /tmp/es-dl/* \
 && chown -R vscode:vscode /opt/es-tools

WORKDIR /
