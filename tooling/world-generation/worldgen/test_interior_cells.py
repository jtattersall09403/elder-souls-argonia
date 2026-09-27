"""PluginWorld resolves overrides in load order (closeout B): masters in the
main plugin's MAST order, the main plugin last, and the last plugin to define
a base object or a worldspace reference owns it."""

from __future__ import annotations

import struct

from .interior_cells import PluginWorld
from .test_export_interior_bundle import _grup, _rec, _sub


def _refr(form_id: int, base: int, x: float) -> bytes:
    return _rec(b"REFR", form_id, _sub(b"NAME", struct.pack("<I", base))
                + _sub(b"DATA", struct.pack("<6f", x, 0.0, 0.0, 0.0, 0.0, 0.0)))


def _world(refs: bytes) -> bytes:
    return _grup(b"WRLD", 0, _rec(b"WRLD", 0x50, _sub(b"EDID", b"W\0"))
                 + _grup(struct.pack("<I", 0x50), 1, refs))


def _plugin(masters: tuple[str, ...], stats: dict[int, str], refs: bytes = b"") -> bytes:
    head = _sub(b"HEDR", b"\0" * 12) + b"".join(_sub(b"MAST", m.encode() + b"\0") for m in masters)
    body = b"".join(_rec(b"STAT", fid, _sub(b"MODL", model.encode() + b"\0")) for fid, model in stats.items())
    return _rec(b"TES4", 0, head) + _grup(b"STAT", 0, body) + (_world(refs) if refs else b"")


def test_the_latest_plugin_in_load_order_owns_bases_and_world_refs(tmp_path):
    files = {
        "M.esm": _plugin((), {0x10: "m10.nif", 0x11: "m11.nif", 0x12: "m12.nif"}, _refr(0x60, 0x10, 1.0)),
        "U.esm": _plugin(("M.esm",), {0x10: "u10.nif", 0x11: "u11.nif"}, _refr(0x60, 0x10, 2.0)),
        "P.esp": _plugin(("M.esm", "U.esm"), {0x10: "p10.nif"}, _refr(0x60, 0x10, 3.0)),
    }
    for name, data in files.items():
        (tmp_path / name).write_bytes(data)
    world = PluginWorld("P.esp", lambda n: tmp_path / n if n in files else None)
    models = {fid: world.bases[("m.esm", fid)].model for fid in (0x10, 0x11, 0x12)}
    assert models == {0x10: "p10.nif", 0x11: "u11.nif", 0x12: "m12.nif"}
    ref = world.world_refs({("m.esm", 0x60)})[("m.esm", 0x60)]
    assert ref.pos[0] == 3.0
    assert list(world.plugins) == ["M.esm", "U.esm", "P.esp"]
