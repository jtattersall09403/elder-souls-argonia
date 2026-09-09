"""Tropical Skyrim is the default resolution for every vanilla texture.

Owner ruling 2026-09-09: *if something ever calls for a vanilla asset, we use
the tropicalised version everywhere by default, unless there is an explicit
recorded reason not to.* Before that ruling tropicalisation was a per-kit
`textureOverlayPools` key, and seven of the twenty-two built kits had simply
never been given it — including `route-structures-v1`, whose 4,147 placed
pieces put Whiterun castle stairs and a Nordic stone bridge on graded roads
across a tropical marsh.

The fix is the default, not the key. These tests hold the default in place:
a new kit config written next month inherits tropical without knowing the
mechanism exists, and the only way out is a named, written reason. Nothing
here reads the vault, so it runs in CI (`npm run test:pipeline`).
"""

import json
from pathlib import Path

import pytest

from pipeline.build_kit import (
    TROPICAL_TEXTURES,
    VANILLA_TEXTURES,
    tropicalised,
    vanilla_texture_roots,
)

CONFIG_DIR = Path(__file__).resolve().parent / "config" / "kits"

#: The kits that deliberately keep the un-tropicalised vanilla textures, with
#: the reason. NAMED, NEVER SILENT: an opt-out that is not listed here fails,
#: and so does a listing for a kit that no longer opts out — so the exception
#: set can only change by someone writing down why.
#:
#: Empty as of 2026-09-09, and that is a measured result rather than a default.
#: Tropical Skyrim repaints landscape and architecture, not clutter: of the
#: 13 textures its overlay changes in `mudmother-hut-int`, every one is
#: structural (bark, wood post, river mud, Whiterun interior beam, Riften log
#: detail, hearth clutter) and not one is a sack, brazier or piece of woven
#: furniture. The interior kits therefore need no exception — the overlay
#: already limits itself to the pieces a climate replacer should touch.
UNTROPICALISED: dict[str, str] = {}


def _kit_configs() -> list[tuple[str, dict]]:
    return [
        (path.stem, json.loads(path.read_text()))
        for path in sorted(CONFIG_DIR.glob("*.json"))
        if not path.stem.startswith("probe-")
    ]


def test_vanilla_textures_resolve_through_tropical_first() -> None:
    vault = Path("/vault")
    roots = vanilla_texture_roots(vault)
    assert roots == [vault / TROPICAL_TEXTURES, vault / VANILLA_TEXTURES]


def test_opting_out_yields_the_bare_vanilla_bsa() -> None:
    vault = Path("/vault")
    assert vanilla_texture_roots(vault, tropical=False) == [vault / VANILLA_TEXTURES]


def test_a_kit_is_tropicalised_unless_it_says_otherwise() -> None:
    assert tropicalised({"id": "k", "assets": []}) is True


def test_a_reasonless_opt_out_fails_the_build() -> None:
    for bad in ("", "no", "   ", None, True):
        with pytest.raises(ValueError, match="untropicalisedReason"):
            tropicalised({"id": "k", "untropicalisedReason": bad})


def test_a_written_opt_out_is_honoured() -> None:
    reason = (
        "Dwemer interior brass is not a climate surface and Tropical repaints "
        "none of it, so the overlay would only add search cost."
    )
    assert tropicalised({"id": "k", "untropicalisedReason": reason}) is False


def test_the_redundant_overlay_key_is_rejected() -> None:
    with pytest.raises(ValueError, match="textureOverlayPools"):
        tropicalised({"id": "k", "textureOverlayPools": ["tropical"]})


def test_every_built_kit_is_tropicalised_or_named_here() -> None:
    opted_out = {}
    for kit_id, kit in _kit_configs():
        if not tropicalised(kit):
            opted_out[kit_id] = kit["untropicalisedReason"]
    assert sorted(opted_out) == sorted(UNTROPICALISED), (
        "a kit opted out of Tropical without being named in UNTROPICALISED "
        "(or is named there and no longer opts out)"
    )
    for kit_id, reason in opted_out.items():
        assert reason.strip() == UNTROPICALISED[kit_id].strip(), kit_id


def test_no_kit_config_declares_the_tropical_overlay() -> None:
    for kit_id, kit in _kit_configs():
        assert "tropical" not in (kit.get("textureOverlayPools") or []), (
            f"{kit_id}: tropical is the pipeline default; the key reads as if "
            "the kits without it opted out"
        )
