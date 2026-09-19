"""Command-level contracts for the siting write-back chain."""

import json
import sys

from . import apply_sitings


def _write(path, rows):
    path.write_text(json.dumps({"schemaVersion": 1, "overrides": rows}, indent=1) + "\n",
                    encoding="utf-8")


def test_a_plot_remedies_row_survives_an_apply(tmp_path):
    """The overrides file is shared. `apply_sitings` re-derives its own
    blueprint-sourced rows and must preserve every other source's rows verbatim
    — re-deriving the whole file once dropped 11 `plot-remedies` rows."""
    path = tmp_path / "macro-plot-overrides.json"
    remedy_row = {"id": "place.testland.alpha", "u": 0.1, "v": 0.2,
                  "why": "60 m east onto the channel", "source": "plot-remedies"}
    stale_blueprint = {"id": "place.testland.beta", "u": 0.9, "v": 0.9, "why": "old",
                       "source": "world/sources/blueprints/place.testland.beta.json",
                       "candidateId": "c0"}
    _write(path, [remedy_row, stale_blueprint])

    fresh = [{"id": "place.testland.beta", "u": 0.5, "v": 0.5, "why": "new",
              "source": "world/sources/blueprints/place.testland.beta.json",
              "candidateId": "c1"}]
    merged = apply_sitings.merge_overrides(fresh, path=path)

    assert remedy_row in merged                      # preserved verbatim
    assert stale_blueprint not in merged             # blueprint rows are re-derived
    assert fresh[0] in merged
    assert len(merged) == 2
    assert [o["id"] for o in merged] == sorted(o["id"] for o in merged)


def test_merge_overrides_on_a_missing_file_is_the_blueprint_rows(tmp_path):
    fresh = [{"id": "place.a", "u": 0.1, "v": 0.1, "why": "w",
              "source": "world/sources/blueprints/place.a.json"}]
    assert apply_sitings.merge_overrides(fresh, path=tmp_path / "nope.json") == fresh


def test_replot_is_a_true_whole_province_resolve():
    assert apply_sitings.replot_command() == [
        sys.executable, "-m", "worldgen.macro_plot", "--resolve-all",
    ]
