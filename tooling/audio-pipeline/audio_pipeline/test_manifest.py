"""The shipped manifest matches the shipped files (hash, bytes, seams, variants)."""

import pytest

from audio_pipeline import build, paths


@pytest.mark.skipif(not paths.MANIFEST.exists(), reason="no audio manifest built yet")
def test_manifest_matches_files():
    assert build.check(paths.MANIFEST) == []


def test_asset_ids_are_path_derived():
    assert build.asset_id("sound/fx/wpn/swing/x_01.wav") == "skyrim/fx/wpn/swing/x_01"


def test_track_resolution_prefers_the_named_file_then_xwm():
    names = {"sound/fx/a.wav", "sound/fx/b.xwm"}
    assert build.resolve_track("sound/fx/a.wav", names) == "sound/fx/a.wav"
    assert build.resolve_track("sound/fx/b.wav", names) == "sound/fx/b.xwm"
    assert build.resolve_track("sound/fx/c.wav", names) is None
