"""The two rules the 2026-09-08 review added, in isolation.

A quest purpose is a socket and a socket is a quest purpose; a dock declares
the hull it serves and the direction in which it and its channel were made to
meet."""

from __future__ import annotations

from types import SimpleNamespace

import numpy as np

from . import blueprint as bp_mod


def _errors(bp: dict) -> list[str]:
    out: list[str] = []
    bp_mod._validate_socket_purposes(bp, out.append)
    return out


def _parcel(pid: str, purposes: list[dict]) -> dict:
    return {"id": pid, "playerPurpose": purposes}


def test_quest_purpose_without_a_socket_fails():
    bp = {"id": "place.x.y", "questSockets": [],
          "parcels": [_parcel("parcel.y.hall",
                              [{"kind": "quest-giver", "tier": "major", "note": "n" * 30}])]}
    assert any("no socketRef" in e for e in _errors(bp))


def test_socket_bound_to_the_wrong_parcel_fails():
    bp = {"id": "place.x.y",
          "questSockets": [{"id": "socket.y.a", "kind": "npc", "parcelId": "parcel.y.shed"}],
          "parcels": [
              _parcel("parcel.y.hall", [{"kind": "quest-giver", "tier": "major",
                                         "note": "n" * 30, "socketRef": "socket.y.a"}]),
              _parcel("parcel.y.shed", [{"kind": "quest-stage", "tier": "major",
                                         "note": "n" * 30, "socketRef": "socket.y.a"}])]}
    assert any("same place" in e for e in _errors(bp))


def test_socket_on_a_parcel_with_no_quest_purpose_fails():
    bp = {"id": "place.x.y",
          "questSockets": [{"id": "socket.y.a", "kind": "npc", "parcelId": "parcel.y.hall"}],
          "parcels": [_parcel("parcel.y.hall", [{"kind": "bed", "tier": "medium", "note": "n" * 30}])]}
    assert any("does not call a quest building" in e for e in _errors(bp))


def test_a_matched_pair_passes():
    bp = {"id": "place.x.y",
          "questSockets": [{"id": "socket.y.a", "kind": "npc", "parcelId": "parcel.y.hall"}],
          "parcels": [_parcel("parcel.y.hall", [{"kind": "quest-giver", "tier": "major",
                                                 "note": "n" * 30, "socketRef": "socket.y.a"}])]}
    assert _errors(bp) == []


class _Survey:
    """Two cells: a deep berth and a dry one."""
    extent_m = 100.0

    def __init__(self, depth: float, open_water: bool):
        self._depth, self._open = depth, open_water

    def sample(self, x, z):
        return {"hydrology": {"waterDepthM": self._depth}}

    def grid_px(self, x, z):
        return 0, 0

    @property
    def open_water(self):
        return np.array([[self._open]])


def test_fit_is_derived_from_the_berth_s_own_water():
    dock = {"position": [0.5, 0.5], "hullClass": "keeled"}
    deep = _Survey(4.0, True)
    dry = _Survey(0.0, False)
    need = bp_mod.HULL_CLASS_DEPTH_M["keeled"]
    # A deep berth is not evidence that the authored point was right: the
    # ordinary/default direction follows the independent natural water solve.
    assert bp_mod._derive_dock_fit(dock, deep, 5.0, need) == "to-water"
    assert bp_mod._derive_dock_fit(dock, dry, 5.0, need) == "to-water"
    fixed = {**dock, "fixedBerthReason": "stone quay cannot be moved"}
    assert bp_mod._derive_dock_fit(fixed, deep, 5.0, need) == "water-to-dock"
    assert bp_mod._derive_dock_fit(fixed, deep, 500.0, need) == "to-water"


def test_water_to_dock_needs_a_structured_physical_reason():
    bp = {"id": "place.test", "docks": [{"id": "dock.test", "position": [0.5, 0.5],
                    "waterBodyId": "water.test", "piledToBed": True,
                    "hullClass": "canoe", "fit": "water-to-dock"}],
          "networkTerminals": [{"id": "terminal.test", "kind": "channel",
                               "routeId": "waterway.test", "dockId": "dock.test",
                               "entryUV": [0.5, 0.5], "wayId": "boardwalk.test"}]}
    errors = []
    bp_mod._validate_docks(bp, errors.append, [], geometry=False)
    assert any("fixedBerthReason" in e for e in errors)


def test_marsh_water_is_credited_the_canoe_minimum_and_no_more():
    marsh = _Survey(0.0, True)
    assert bp_mod._water_depth_at(marsh, 1.0, 1.0) == bp_mod.HULL_CLASS_DEPTH_M["canoe"]
    dry = _Survey(0.0, False)
    assert bp_mod._water_depth_at(dry, 1.0, 1.0) == 0.0


def _channel_blueprint(route_id: str = "waterway.test") -> dict:
    return {
        "id": "place.test",
        "docks": [{"id": "dock.test", "position": [0.5, 0.5],
                   "waterBodyId": "water.test", "piledToBed": True,
                   "hullClass": "keeled", "fit": "to-water"}],
        "networkTerminals": [{"id": "terminal.test", "kind": "channel",
                              "routeId": route_id, "dockId": "dock.test",
                              "entryUV": [0.5, 0.5], "wayId": "boardwalk.test"}],
    }


def test_only_the_declared_serving_route_can_certify_dock_reach(monkeypatch):
    routes = {
        "waterway.test": SimpleNamespace(points_m=[(90.0, 90.0), (95.0, 95.0)]),
        "waterway.unrelated": SimpleNamespace(points_m=[(50.0, 50.0), (55.0, 50.0)]),
    }
    monkeypatch.setattr(bp_mod, "_water_routes", lambda: routes)
    errors: list[str] = []
    bp_mod._validate_docks(_channel_blueprint(), errors.append, [],
                           survey=_Survey(4.0, True))
    assert any("declared serving route" in error and "unrelated" in error for error in errors)


class _BarSurvey(_Survey):
    def sample(self, x, z):
        depth = 2.0 if 70.0 <= x <= 80.0 else 4.0
        return {"hydrology": {"waterDepthM": depth}}


def test_hull_depth_is_continuous_not_the_deepest_sample(monkeypatch):
    # Only the two route vertices are deep; the densely sampled segment
    # crosses a 2 m bar that a 3 m keeled hull cannot clear.
    routes = {"waterway.test": SimpleNamespace(points_m=[(50.0, 50.0), (150.0, 50.0)])}
    monkeypatch.setattr(bp_mod, "_water_routes", lambda: routes)
    errors: list[str] = []
    bp_mod._validate_docks(_channel_blueprint(), errors.append, [],
                           survey=_BarSurvey(4.0, True))
    assert any("needs 3.0 m continuously" in error and "falls to 2.00 m" in error
               for error in errors)


def test_passing_dock_evidence_is_not_labelled_a_warning(monkeypatch):
    routes = {"waterway.test": SimpleNamespace(points_m=[(50.0, 50.0), (150.0, 50.0)])}
    monkeypatch.setattr(bp_mod, "_water_routes", lambda: routes)
    errors: list[str] = []
    warnings: list[str] = []
    bp_mod._validate_docks(_channel_blueprint(), errors.append, warnings,
                           survey=_Survey(4.0, True))
    assert errors == []
    assert warnings == []
