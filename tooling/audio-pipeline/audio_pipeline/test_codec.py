"""Round trip through ffmpeg: Opus/WebM keeps a padded loop seamless and the bytes deterministic."""

import hashlib
import shutil

import numpy as np
import pytest

from audio_pipeline import codec, loops
from audio_pipeline.test_loops import _periodic_noise

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")


def test_runtime_crossfade_is_seamless_after_encoding_and_the_hard_loop_is_not(tmp_path):
    x = np.stack([_periodic_noise(48000 * 2), _periodic_noise(48000 * 2)], axis=1)
    padded, ls, le = loops.pad_periodic(x, codec.SAMPLE_RATE)
    out = tmp_path / "bed.webm"
    codec.encode_opus_webm(padded, out, 64)
    dec = codec.decode(out, 2)
    assert len(dec) == len(padded)  # ffmpeg trims the priming delay exactly
    fade = int(loops.RUNTIME_FADE_S * codec.SAMPLE_RATE)
    for shift in (0, 312, -312):
        assert loops.runtime_join_score(dec, ls, le, fade, shift) <= loops.JOIN_PASS
    # The hard loop is what the runtime crossfade exists to avoid: the codec does not
    # keep the waveform, so the decoded end never meets the decoded start exactly.
    assert loops.decoded_seam_score(dec, ls, le, 0) > loops.SEAM_PASS


def test_encoding_is_deterministic(tmp_path):
    x = _periodic_noise(48000)
    a, b = tmp_path / "a.webm", tmp_path / "b.webm"
    codec.encode_opus_webm(x[:, None], a, 48)
    codec.encode_opus_webm(x[:, None], b, 48)
    assert hashlib.sha256(a.read_bytes()).digest() == hashlib.sha256(b.read_bytes()).digest()
