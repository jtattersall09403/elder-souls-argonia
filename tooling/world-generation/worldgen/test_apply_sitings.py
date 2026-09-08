"""Command-level contracts for the siting write-back chain."""

import sys

from . import apply_sitings


def test_replot_is_a_true_whole_province_resolve():
    assert apply_sitings.replot_command() == [
        sys.executable, "-m", "worldgen.macro_plot", "--resolve-all",
    ]
