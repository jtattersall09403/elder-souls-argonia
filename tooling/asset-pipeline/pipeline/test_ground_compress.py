"""The published ground albedo arrays match their PNGs and are well-formed
KTX2 arrays (pipeline/ground_compress.py)."""
import json

from pipeline.ground_compress import GROUND, ARRAY_FILE, check, layer_files, parse_ktx2


def _sets():
    return sorted(json.loads((GROUND / "index.json").read_text())["sets"])


def test_every_set_array_is_current():
    problems = [p for s in _sets() for p in check(s)]
    assert not problems, problems


def test_array_layers_and_levels():
    for s in _sets():
        hdr = parse_ktx2((GROUND / s / ARRAY_FILE).read_bytes())
        manifest = json.loads((GROUND / s / "materials.json").read_text())
        assert hdr["layers"] == len(layer_files(manifest))
        assert (hdr["w"], hdr["h"]) == (512, 512)
        assert hdr["levels"] == 10  # full mip chain to 1x1
        # each level holds every layer: uncompressed size = layers x one image
        blocks = lambda k: max(1, -(-(512 >> k) // 4)) ** 2 * 16  # noqa: E731 (UASTC 16 B per 4x4)
        for k, (_, unc) in enumerate(hdr["levelData"]):
            assert unc == blocks(k) * hdr["layers"]
