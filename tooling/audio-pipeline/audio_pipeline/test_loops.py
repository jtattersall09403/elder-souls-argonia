"""The seam test must fail on a real click and pass on a seamless loop (a gate that can fail)."""

import numpy as np
import pytest

from audio_pipeline import loops

SR = 48000
rng = np.random.default_rng(7)


def _periodic_noise(n: int) -> np.ndarray:
    # Noise rolled off above 3 kHz like a real bed (rain, insects, water), exactly periodic
    # over n samples because it is built in the frequency domain.
    spec = np.zeros(n // 2 + 1, complex)
    k = np.arange(1, n // 2 + 1)
    hz = k * SR / n
    spec[1:] = (rng.normal(size=k.size) + 1j * rng.normal(size=k.size)) / (1 + (hz / 3000) ** 2)
    x = np.fft.irfft(spec, n)
    return (0.3 * x / np.abs(x).max()).astype(np.float32)


def test_seamless_periodic_signal_passes():
    x = _periodic_noise(SR * 2)
    assert loops.seam_score(x) <= loops.SEAM_PASS


def test_sine_with_broken_period_fails():
    t = np.arange(int(SR * 1.0137)) / SR  # 440 Hz does not complete a whole cycle here
    x = (0.5 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    assert loops.seam_score(x) > loops.SEAM_PASS


def test_crossfade_repairs_a_broken_seam():
    x = _periodic_noise(SR * 2)
    spliced = np.concatenate([x[:SR], x[SR // 2 + 123 :]])  # a jump at sample SR
    broken = np.concatenate([spliced[SR:], spliced[:SR]])  # rotate the jump onto the end -> start seam
    assert loops.seam_score(broken) > loops.SEAM_PASS
    loop, method, _ = loops.make_loop(broken, SR, SR)
    assert method == "crossfade"
    assert loops.seam_score(loop) <= loops.SEAM_PASS


def test_seamless_source_is_kept_sample_exact():
    x = _periodic_noise(SR)
    loop, method, _ = loops.make_loop(x, SR, SR)
    assert method == "source-seamless" and np.array_equal(loop, x)


def test_periodic_resample_keeps_a_seamless_loop_seamless():
    # 22.05 kHz -> 48 kHz: ffmpeg's resampler breaks the join; the FFT resampler keeps it.
    x = _periodic_noise(22050)
    y = loops.periodic_resample(x, 22050, 48000)
    assert len(y) == 48000 and loops.seam_score(y) <= loops.SEAM_PASS


def test_periodic_padding_survives_a_priming_shift():
    x = _periodic_noise(SR)
    padded, ls, le = loops.pad_periodic(x, SR)
    assert le - ls == len(x)
    for shift in (0, 312, -312):
        assert loops.decoded_seam_score(padded, ls, le, shift) <= loops.SEAM_PASS


def test_unpadded_loop_fails_when_priming_is_left_in():
    # A decoder that keeps Opus's 312 priming samples puts near-silence at the head of a
    # naively encoded loop: looping the whole buffer then jumps from the tail into silence.
    x = _periodic_noise(SR)
    untrimmed = np.concatenate([np.zeros(312, np.float32), x])
    assert loops.seam_score(untrimmed) > loops.SEAM_PASS


def test_short_loop_pads_by_wrapping():
    x = _periodic_noise(1000)
    padded, ls, le = loops.pad_periodic(x, SR, pad_s=0.05)  # pad (2400) longer than the loop
    assert np.array_equal(padded[ls:le], x)
    assert np.array_equal(padded[:ls], np.tile(x, 4)[-ls:])


def _bed(n: int = SR * 3) -> tuple[np.ndarray, int, int]:
    return loops.pad_periodic(_periodic_noise(n), SR)


FADE = int(loops.RUNTIME_FADE_S * SR)


def test_runtime_join_passes_on_a_wrapped_pad():
    padded, ls, le = _bed()
    for shift in (0, 312, -312):
        assert loops.runtime_join_score(padded, ls, le, FADE, shift) <= loops.JOIN_PASS


def test_runtime_join_fails_when_the_pad_steps_away_from_the_loop():
    # The tail pad is not the loop wrapped: voice 1 steps at loopEnd while at full gain.
    padded, ls, le = _bed()
    padded = padded.copy()
    padded[le:] += 0.3
    assert loops.runtime_join_score(padded, ls, le, FADE) > 2 * loops.JOIN_PASS


def test_runtime_join_fails_when_the_pad_is_silent():
    # Encoder or container dropped the pad: voice 1 fades into silence -> a level dip.
    padded, ls, le = _bed()
    padded = padded.copy()
    padded[le:] = 0.0
    padded[:ls] = 0.0
    padded[ls : ls + FADE] *= 0.0  # and voice 2's head is lost too
    assert loops.runtime_join_score(padded, ls, le, FADE) > 2 * loops.JOIN_PASS


def test_one_transient_in_the_body_does_not_raise_the_bar():
    padded, ls, le = _bed()
    clean = loops.runtime_join_score(padded, ls, le, FADE)
    loud = padded.copy()
    loud[ls + SR] += 0.9  # a single crackle mid-loop
    assert loops.runtime_join_score(loud, ls, le, FADE) == pytest.approx(clean, rel=0.05)
