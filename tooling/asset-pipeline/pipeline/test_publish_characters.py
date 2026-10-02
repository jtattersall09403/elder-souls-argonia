"""Every GLB that ships from character-assets is compressed (standard 16)."""
import shutil
from pathlib import Path

from . import publish_characters as pc

RAW = Path(__file__).resolve().parents[1] / "output" / "armour" / "iron-cuirass-male.glb"


def test_shipped_character_assets_are_compressed():
    assert pc.uncompressed(pc.shipped_glbs()) == []


def test_gate_fails_on_an_uncompressed_glb(tmp_path, monkeypatch):
    # Standard 14: seen to fail. A raw JPEG-textured export placed in the
    # shipped folder must be named.
    if not RAW.exists():
        import pytest
        pytest.skip("raw armour build absent on this machine")
    files = tmp_path / "files"
    (files / "armour").mkdir(parents=True)
    shutil.copy(RAW, files / "armour" / RAW.name)
    monkeypatch.setattr(pc, "FILES", files)
    problems = pc.uncompressed(pc.shipped_glbs())
    assert problems == ["armour/iron-cuirass-male.glb: images ship as ['image/jpeg']"]
