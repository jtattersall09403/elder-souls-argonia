"""ffmpeg in and out: decode any vanilla source to float PCM, encode Opus in WebM.

Why Opus in WebM (decision 0094): Opus is the smallest codec with transparent
fx at 48-96 kbps, and WebM is the container every target browser decodes
through ``decodeAudioData`` — Chrome, Firefox and Safari from 15 (macOS 12,
iOS 15); Ogg Opus only decodes from Safari 18.4. xWMA (``.xwm``) decodes
through ffmpeg's own ``xwma`` demuxer and ``wmav2`` decoder, so both vanilla
formats take one path. Everything is resampled to 48 kHz (Opus's native rate)
(loops through ``loops.periodic_resample``, one-shots through ffmpeg) so loop
points are sample-exact in the encoded stream.

Constrained VBR: plain VBR overshot its target by up to 40 % on dense
material (thunder, a cicada swell) in the round-1 sample, and the download
budget wants a size that follows from duration x bitrate.

``-fflags +bitexact`` (and ``-bitexact`` on the muxer) keeps the WebM free of
random UIDs and the writing-application string, so the same input gives the
same bytes and the manifest's hashes are deterministic.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import numpy as np

SAMPLE_RATE = 48000


def probe(path: Path) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=codec_name,channels,sample_rate:format=duration",
         "-of", "json", str(path)], check=True, capture_output=True, text=True).stdout
    d = json.loads(out)
    s = d["streams"][0]
    return {"codec": s["codec_name"], "channels": int(s["channels"]), "sampleRate": int(s["sample_rate"]),
            "duration": float(d.get("format", {}).get("duration", 0.0))}


def decode(path: Path, channels: int | None = None, rate: int | None = SAMPLE_RATE) -> np.ndarray:
    """``[n, ch]`` float32 at ``rate`` (``None``: the file's own rate, no resampling)."""
    ch = channels or probe(path)["channels"]
    resample = ["-ar", str(rate)] if rate else []
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-acodec", "pcm_f32le",
         "-ac", str(ch), *resample, "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype="<f4").reshape(-1, ch).copy()


def encode_opus_webm(pcm: np.ndarray, dest: Path, bitrate_kbps: int) -> None:
    pcm = np.ascontiguousarray(np.clip(pcm, -1.0, 1.0), dtype="<f4")
    ch = 1 if pcm.ndim == 1 else pcm.shape[1]
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-fflags", "+bitexact", "-f", "f32le", "-ar", str(SAMPLE_RATE),
         "-ac", str(ch), "-i", "-", "-c:a", "libopus", "-b:a", f"{bitrate_kbps}k", "-vbr", "constrained",
         "-application", "audio", "-frame_duration", "60", "-flags", "+bitexact", "-map_metadata", "-1",
         "-f", "webm", "-bitexact", str(dest)],
        input=pcm.tobytes(), check=True, capture_output=True)
