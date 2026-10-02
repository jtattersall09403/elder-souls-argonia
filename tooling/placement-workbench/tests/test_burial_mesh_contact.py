"""burialRule grants a mesh-only sink guess only as far as the mesh contact
allows (16k walk 9: the notice board's mesh-sill sink of 1.82 m buried it to
its roof and burialRule passed it; third such escape after the Bosmer stair
and the cave door)."""
from workbench import seat_rules as sr


class _Cat:
    def __init__(self, rows):
        self.rows = rows

    def row(self, asset):
        return self.rows[asset]


def _row(p50, evidence, height, pab=0.0):
    return {"designedSinkM": {"p50": p50, "evidence": evidence},
            "originOffsetM": [0.0, 0.0, pab], "sizeM": [1.5, 1.4, height]}


def test_a_mesh_sill_guess_on_a_short_piece_designs_at_most_the_cap():
    cat = _Cat({"board": _row(1.82, "mesh-sill", 2.47)})
    designed, ev, cap = sr.designed_burial(cat, "board", 1.0)
    assert ev == "mesh-sill"
    assert cap == sr.GUESS_BURY_SHARE * 2.47
    assert designed == cap < 1.82          # the 1.82 m burial now fails


def test_a_mesh_sill_guess_on_a_tall_shell_keeps_a_foundation_band():
    cat = _Cat({"house": _row(0.9, "mesh-sill (plugin-unsupported)", 8.0)})
    designed, _, cap = sr.designed_burial(cat, "house", 1.0)
    assert cap == 1.6 and abs(designed - 0.9) < 1e-9


def test_plugin_and_reviewed_sinks_design_in_full_and_a_fallback_designs_nothing():
    cat = _Cat({"stable": _row(0.5, "plugin", 3.0, pab=0.4),
                "row": _row(1.0, "policy", 3.0),
                "fallback": _row(0.4, "policy-fallback", 3.0)})
    assert abs(sr.designed_burial(cat, "stable", 1.0)[0] - 0.9) < 1e-9
    assert sr.designed_burial(cat, "stable", 1.0)[2] is None
    assert sr.designed_burial(cat, "row", 1.0)[0] == 1.0
    assert sr.designed_burial(cat, "fallback", 1.0)[0] == 0.0


def test_a_mesh_sill_evidence_is_never_read_as_designed():
    assert not "mesh-sill".startswith(sr.DESIGNED_EVIDENCE)
    assert "mesh-sill (plugin-spread)".startswith(sr.GUESS_EVIDENCE)
