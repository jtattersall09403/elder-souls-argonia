#!/usr/bin/env bash
# Runs ON a RunPod GPU pod (image runpod/base:1.0.2-ubuntu2404, env NVIDIA_DRIVER_CAPABILITIES=all):
# installs Chrome, Xvfb, rsync and node, registers the NVIDIA Vulkan ICD if missing, and starts headed
# Chrome (ANGLE on Vulkan) on Xvfb :99 1280x720 with DevTools on 127.0.0.1:9222 (reached over `ssh -L`).
# Idempotent; rerun to restart Chrome. tooling/gpu-lane/README.md says how the loop drives it.
#   bash pod-setup.sh [webgl|webgpu]   (webgpu adds the unsafe-WebGPU flags; default webgl)
set -euo pipefail
renderer=${1:-webgl}
export DEBIAN_FRONTEND=noninteractive
t0=$(date +%s)
if ! command -v google-chrome >/dev/null || ! command -v node >/dev/null; then
  apt-get update -qq
  apt-get install -y -qq wget curl ca-certificates libvulkan1 vulkan-tools xvfb rsync nodejs >/dev/null
  wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  apt-get install -y -qq /tmp/chrome.deb >/dev/null
fi
# The container toolkit mounts the driver's Vulkan library with the graphics capability; register it if
# the ICD manifest is missing.
if [ ! -e /usr/share/vulkan/icd.d/nvidia_icd.json ] && [ ! -e /etc/vulkan/icd.d/nvidia_icd.json ]; then
  lib=$(ls /usr/lib/x86_64-linux-gnu/libGLX_nvidia.so.0 2>/dev/null || true)
  if [ -n "$lib" ]; then
    mkdir -p /etc/vulkan/icd.d
    printf '{"file_format_version":"1.0.0","ICD":{"library_path":"%s","api_version":"1.3"}}\n' "$lib" > /etc/vulkan/icd.d/nvidia_icd.json
  fi
fi
vulkaninfo --summary 2>/dev/null | grep -E "deviceName|driverName|apiVersion" | head -6 || echo "vulkaninfo: no device"
# Vsync off and the frame-rate limit off, or every view reads 60 fps and fps cannot show headroom
# (walk-10 base run: every spot exactly 60.0). Headed Chrome on a virtual display: headless Chrome loses the WebGPU device the moment a page
# presents to its canvas (pod run 1, 2026-10-01: four "destroyed" losses in 10 s), so screenshots
# of the real frame need a real surface.
command -v Xvfb >/dev/null || apt-get install -y -qq xvfb >/dev/null
pkill -f "remote-debugging-port=9222" 2>/dev/null || true
pkill Xvfb 2>/dev/null || true
nohup Xvfb :99 -screen 0 1280x720x24 >/tmp/xvfb.log 2>&1 &
export DISPLAY=:99
webgpu_flags=()
[ "$renderer" = webgpu ] && webgpu_flags=(--enable-unsafe-webgpu --enable-features=Vulkan,UnsafeWebGPU)
nohup google-chrome --no-sandbox --no-first-run --no-default-browser-check --user-data-dir=/tmp/chrome-profile --remote-debugging-port=9222 \
  "${webgpu_flags[@]}" --use-angle=vulkan --use-vulkan=native --enable-precise-memory-info \
  --disable-gpu-vsync --disable-frame-rate-limit \
  --ignore-gpu-blocklist --enable-gpu-rasterization --disable-gpu-sandbox --window-size=1280,720 \
  --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling about:blank \
  >/tmp/chrome.log 2>&1 &
curl -s --retry 30 --retry-all-errors --retry-delay 1 127.0.0.1:9222/json/version | grep -E '"Browser"' \
  || { echo "chrome did not start"; tail -20 /tmp/chrome.log; exit 1; }
echo "setup $(( $(date +%s) - t0 )) s ($renderer)"
