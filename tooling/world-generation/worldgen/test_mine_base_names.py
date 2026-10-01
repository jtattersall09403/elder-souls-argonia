from worldgen.mine_base_names import pick


def test_pick_is_earliest_plugin_then_first_edid():
    rows = [(3, "BSK.esm", "BSKMudHut01"), (0, "Skyrim.esm", "MudHutB"),
            (0, "Skyrim.esm", "MudHutA")]
    assert pick(rows) == ("MudHutA", "Skyrim.esm")
    assert pick(list(reversed(rows))) == ("MudHutA", "Skyrim.esm")
