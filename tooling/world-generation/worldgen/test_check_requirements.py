"""The dependency check reads every declared module and fails on a missing one."""

from .check_requirements import declared, missing


def test_rtree_imports():
    # trimesh's proximity and ray queries need it (mine_mounts, 16h round 16).
    import rtree  # noqa: F401


def test_every_declared_requirement_imports():
    assert "rtree" in declared()
    # SSE BSAs are LZ4-frame (pipeline/bsa.py; 16h M19 ruling 4).
    assert "lz4" in declared()
    assert missing() == []


def test_a_missing_module_is_reported(tmp_path):
    path = tmp_path / "requirements.txt"
    path.write_text("numpy>=2\n# a comment\nno-such-module-xyz>=1  # why\n")
    assert declared(path) == ["numpy", "no-such-module-xyz"]
    assert [name for name, _ in missing(path)] == ["no-such-module-xyz"]
