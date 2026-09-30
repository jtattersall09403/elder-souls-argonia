"""walkRule's socket targets (`rules.socket_targets`): an interior socket
(`interiorCell` set, hosted on a placement of the cell's own bundle) is no
overworld target. Its reach is the compile's gate `sockets.interior` (the host
must carry a furniture socket `interior_walk` reached from the cell's doors),
so walkRule skips it rather than failing "host ... is no piece of the scene"
(Riverwalk, 524914dd moved its home sockets into KeebaHouseCrafter)."""
from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from workbench import layout as lay, paths, rules  # noqa: E402

paths.bridge()
from worldgen import sockets as sk  # noqa: E402


def test_an_interior_socket_is_no_walk_target_but_an_exterior_one_is(tmp_path, monkeypatch):
    layout_file = tmp_path / "x.layout.json"
    layout_file.write_text("{}")
    ops = [
        {"op": "socket", "id": "socket.x.idle-home", "kind": "idle",
         "interiorCell": "KeebaHouseCrafter", "host": "KeebaHouseCrafter.0809B556"},
        {"op": "socket", "id": "socket.x.idle-work", "kind": "idle", "at": [10.0, 20.0]},
        {"op": "socket", "id": "socket.x.idle-lost", "kind": "idle", "host": "no-such-piece"},
    ]
    monkeypatch.setattr(lay, "split_sockets", lambda doc, ref: doc)
    monkeypatch.setattr(sk, "socket_ops", lambda doc, category_of, vocab: [dict(o) for o in ops])
    scene = SimpleNamespace(pieces=[], placeId="place.x", layout={"path": str(layout_file)})
    rows = {r["id"]: r for r in rules.socket_targets(SimpleNamespace(row=lambda a: {}), scene)}
    assert "socket:socket.x.idle-home" not in rows
    assert rows["socket:socket.x.idle-work"]["reason"] is None
    # an exterior socket whose host is missing still fails walkRule by name
    assert "is no piece of the scene" in rows["socket:socket.x.idle-lost"]["reason"]
