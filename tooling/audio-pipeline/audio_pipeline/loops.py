"""Loop-safe encoding for ambient beds: the seam is solved here, once (module 57 §107).

Three things break a loop, and each has one fix (decision 0094; measured on
vanilla beds in the sound-prep lane's round 1 report):

1. **Resampling.** A vanilla bed is seamless at its own rate (22.05/32 kHz)
   and ffmpeg's resampler treats the file as non-periodic, so the seam that
   was clean at 0.6-0.9 scored 10-64 at 48 kHz. Loops are therefore resampled
   in the frequency domain (``scipy.signal.resample``), which treats the
   signal as one period, to ``round(n * 48000 / sr)`` samples.
2. **A seam the source never had.** A source whose own join fails the click
   test gets an equal-power crossfade of its tail into its head.
3. **The lossy codec.** Opus's priming delay may or may not be trimmed by the
   browser, and Opus does not preserve the waveform, so the decoded end and
   the decoded start never meet sample-exactly: a hard loop (``loopStart``/
   ``loopEnd`` on one source node) scored 1.5-27 on vanilla beds at 64 and
   96 kbps. So a bed ships as ``[last PAD of the loop][loop][first PAD]`` and
   the runtime crossfades each cycle into the next over ``RUNTIME_FADE_S``
   inside the pad: the two voices then play two codings of the SAME audio,
   which blend without a join. The pads also absorb a +/-312-sample priming
   shift, because every point near either loop point is the loop wrapped.

``seam_score`` scores a join on two defects against the loop's own texture:
a click (linear-prediction residual) and a gap (a dropout in level); <= 1
passes. It gives 0.5-0.9 at arbitrary cut points of continuous vanilla beds
and fails on a broken period, a splice and priming left in (unit tests).
"""

from __future__ import annotations

import numpy as np
from scipy.linalg import solve_toeplitz
from scipy.signal import lfilter, resample

#: Padding either side of the loop (s): the runtime fade plus the codec
#: priming delay (6.5 ms) plus the decoder's edge smear.
PAD_S = 0.1
#: Runtime crossfade from one cycle into the next (s); must fit inside the pad.
RUNTIME_FADE_S = 0.05
#: Crossfade used to repair a failing seam (s), capped at a tenth of the loop.
CROSSFADE_S = 0.5
#: Passing threshold for ``seam_score``.
SEAM_PASS = 1.0
#: Passing threshold for ``runtime_join_score``: its click term compares a
#: window maximum with the 95th percentile of the loop's own window maxima, so
#: continuous audio scores up to ~1.2 by chance; a step or a dropped pad scores
#: several times more (unit tests; round-1 report).
JOIN_PASS = 1.5
#: Samples after the join examined for a prediction spike.
SEAM_HALF_WINDOW = 8
#: Linear-prediction order for the click test.
LPC_ORDER = 24
#: Window (samples) for the gap test: 1.3 ms at 48 kHz, shorter than the 6.5 ms priming.
GAP_WINDOW = 64


def _mono(x: np.ndarray) -> np.ndarray:
    return x if x.ndim == 1 else x.mean(axis=1)


def _lpc(m: np.ndarray, order: int) -> np.ndarray:
    """Prediction-error filter ``[1, a1..ap]`` by the autocorrelation method."""
    n = len(m)
    r = np.array([np.dot(m[: n - k], m[k:]) for k in range(order + 1)])
    if r[0] <= 0:
        return np.r_[1.0, np.zeros(order)]
    r[0] *= 1.0 + 1e-6  # white-noise correction keeps the Toeplitz solve stable
    a = solve_toeplitz(r[:order], -r[1 : order + 1])
    return np.r_[1.0, a]


def seam_score(loop: np.ndarray, click_pct: float = 99.9, gap_pct: float = 0.1) -> float:
    """How far the loop's end -> start join stands out from the loop itself (<= 1 passes).

    Two defects, each scored against the loop's own texture so a rain bed and
    a tonal frog chorus are judged on their own terms:

    - **click**: the linear-prediction residual across the join (a step or a
      spike the loop's spectrum cannot predict) over the loop's own 99.9th
      percentile residual;
    - **gap**: the loop's 0.1st-percentile short-window level over the
      quietest window spanning the join (a dropout, e.g. codec priming left
      in, is quieter than anything the bed does on its own).
    """
    m = _mono(np.asarray(loop, dtype=np.float64))
    n = len(m)
    if n < 4 * (LPC_ORDER + GAP_WINDOW):
        return float("inf")
    if np.abs(m).max() <= 1e-9:
        return 0.0
    a = _lpc(m, LPC_ORDER)
    res = np.abs(lfilter(a, [1.0], m)[LPC_ORDER:])
    ref = float(np.percentile(res, click_pct))
    w = LPC_ORDER + SEAM_HALF_WINDOW
    joined = np.concatenate([m[-w:], m[:SEAM_HALF_WINDOW]])
    seam = float(np.abs(lfilter(a, [1.0], joined)[w - SEAM_HALF_WINDOW :]).max())
    click = seam / ref if ref > 1e-12 else (0.0 if seam <= 1e-12 else float("inf"))
    g = GAP_WINDOW
    frames = m[: n - n % g].reshape(-1, g)
    level = np.sqrt((frames**2).mean(axis=1))
    floor = float(np.percentile(level, gap_pct))
    ring = np.concatenate([m[-4 * g :], m[: 4 * g]])
    seam_level = min(float(np.sqrt((ring[i : i + g] ** 2).mean())) for i in range(0, 7 * g + 1, g // 4))
    gap = floor / seam_level if seam_level > 1e-12 else float("inf")
    return max(click, gap)


def crossfade_loop(x: np.ndarray, sr: int, seconds: float = CROSSFADE_S) -> np.ndarray:
    """Equal-power crossfade of the tail into the head; returns ``len - L`` samples.

    out[:L] = head * sin + tail * cos, so out ends on x[n-L-1] and starts on
    x[n-L] (weight 1): the join is the source's own continuous waveform.
    """
    x = np.asarray(x, dtype=np.float32)
    n = len(x)
    length = int(min(seconds * sr, n // 10))
    if length < 2:
        return x.copy()
    t = (np.arange(length, dtype=np.float64) + 0.5) / length
    fade_in = np.sin(t * np.pi / 2)
    fade_out = np.cos(t * np.pi / 2)
    if x.ndim == 2:
        fade_in, fade_out = fade_in[:, None], fade_out[:, None]
    out = x[: n - length].copy()
    out[:length] = x[:length] * fade_in + x[n - length :] * fade_out
    return out


def periodic_resample(x: np.ndarray, sr_in: int, sr_out: int) -> np.ndarray:
    """Resample one period as a period (FFT), to a whole number of samples."""
    if sr_in == sr_out:
        return np.asarray(x, dtype=np.float32)
    n_out = int(round(len(x) * sr_out / sr_in))
    return resample(np.asarray(x, dtype=np.float64), n_out, axis=0).astype(np.float32)


def make_loop(x: np.ndarray, sr: int, sr_out: int) -> tuple[np.ndarray, str, float]:
    """``(loop at sr_out, method, source_score)`` from a loop at its native rate.

    The source is kept (only resampled) when its own join passes; otherwise
    its tail is crossfaded into its head first.
    """
    score = seam_score(x)
    if score <= SEAM_PASS:
        return periodic_resample(x, sr, sr_out), "source-seamless", score
    return periodic_resample(crossfade_loop(x, sr), sr, sr_out), "crossfade", score


def pad_periodic(loop: np.ndarray, sr: int, pad_s: float = PAD_S) -> tuple[np.ndarray, int, int]:
    """``(padded, loop_start, loop_end)`` in samples; the pads are the loop wrapped."""
    pad = int(round(pad_s * sr))
    n = len(loop)
    reps = int(np.ceil(pad / n)) + 1  # a loop shorter than the pad still wraps
    tiled = np.concatenate([loop] * (2 * reps + 1))
    start = reps * n - pad
    padded = tiled[start : start + n + 2 * pad]
    return padded, pad, pad + n


def decoded_seam_score(decoded: np.ndarray, loop_start: int, loop_end: int, shift: int = 0) -> float:
    """Seam score of a HARD loop over ``[loop_start, loop_end)``, optionally shifted.

    ``shift`` models a decoder that keeps (+) or over-trims (-) priming samples:
    the whole signal moves while the manifest's loop points do not.
    """
    s, e = loop_start - shift, loop_end - shift
    if s < 0 or e > len(decoded):
        return float("inf")
    return seam_score(decoded[s:e])


def render_runtime_loop(decoded: np.ndarray, loop_start: int, loop_end: int, fade: int,
                        shift: int = 0, tail: int = 400) -> tuple[np.ndarray, int]:
    """What the runtime plays across one cycle boundary: ``(pcm, boundary index)``.

    Voice 1 plays ``[start, end + fade)`` and fades out linearly over the pad;
    voice 2 starts at ``start`` when voice 1 reaches ``end`` and fades in. The
    AudioManager's bed scheduler does exactly this (packages/audio).
    """
    s, e = loop_start - shift, loop_end - shift
    n = e - s
    if s < 0 or e + fade > len(decoded) or fade < 1:
        raise ValueError("fade does not fit inside the pad")
    x = decoded if decoded.ndim == 2 else decoded[:, None]
    ramp = np.linspace(0.0, 1.0, fade, endpoint=False)[:, None]
    out = np.zeros((n + fade + tail, x.shape[1]))
    out[:n] += x[s:e]
    out[n : n + fade] += x[e : e + fade] * (1.0 - ramp)
    out[n : n + fade] += x[s : s + fade] * ramp
    out[n + fade :] += x[s + fade : s + fade + tail]
    return out, n


def runtime_join_score(decoded: np.ndarray, loop_start: int, loop_end: int, fade: int, shift: int = 0) -> float:
    """How far the rendered cycle change stands out from the loop's own texture.

    Passes at <= ``JOIN_PASS``. The reference is taken from the loop body in
    blocks as long as the boundary window (the fade plus 4 gap windows either
    side), so a long window is not judged against single samples:

    - **click**: the worst prediction residual in the boundary window over the
      95th percentile of the per-block worst residual (one transient inside a
      bed does not raise the bar);
    - **dip**: the quietest fade-length block of the body over the level of the
      rendered fade itself (a pad that is not the loop wrapped fades to less).
    """
    out, n = render_runtime_loop(decoded, loop_start, loop_end, fade, shift)
    m = _mono(out)
    body = m[LPC_ORDER : n - LPC_ORDER]
    a = _lpc(body, LPC_ORDER)
    lo, hi = n - 4 * GAP_WINDOW, n + fade + 4 * GAP_WINDOW
    width = hi - lo
    res_body = np.abs(lfilter(a, [1.0], body)[LPC_ORDER:])
    blocks = res_body[: len(res_body) - len(res_body) % width].reshape(-1, width).max(axis=1)
    if len(blocks) < 4:
        return float("inf")
    ref = float(np.percentile(blocks, 95))
    worst = float(np.abs(lfilter(a, [1.0], m[lo - LPC_ORDER : hi])[LPC_ORDER:]).max())
    click = worst / ref if ref > 1e-12 else (0.0 if worst <= 1e-12 else float("inf"))
    levels = np.sqrt((body[: len(body) - len(body) % fade].reshape(-1, fade) ** 2).mean(axis=1))
    fade_level = float(np.sqrt((m[n : n + fade] ** 2).mean()))
    dip = float(levels.min()) / fade_level if fade_level > 1e-12 else float("inf")
    return max(click, dip)
