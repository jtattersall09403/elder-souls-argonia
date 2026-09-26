"""Which files in the blueprints folder are blueprints.

One rule, read by every loader: a blueprint is ``place.<region>.<slug>.json``
(``blueprint_paths`` filters on the filename alone — it does not open the
file or check for a top-level ``blueprint`` key; a well-formed blueprint
does carry one, and a stray ``place.*.json`` without one is a loader's
KeyError, not this module's job to catch). Anything else in the folder (a
place's ``<slug>.layout.json`` or ``place.<id>.layout.json`` from the
workbench, decision 0100 item 2; its ``<slug>.design.md``) is not one and is
never read as one. Kept import-light so every module can use it without a
cycle.
"""
from __future__ import annotations

from pathlib import Path

BLUEPRINT_DIR = Path(__file__).resolve().parents[3] / "world" / "sources" / "blueprints"


def blueprint_paths(blueprint_dir: Path | str = BLUEPRINT_DIR) -> list[Path]:
    """The blueprint files in ``blueprint_dir``, sorted: ``place.*.json``
    minus ``*.layout.json``."""
    return [path for path in sorted(Path(blueprint_dir).glob("place.*.json"))
            if not path.name.endswith(".layout.json")]


def parcel_services(parcel: dict) -> list[str]:
    """The services a parcel hosts, the one accessor every reader uses.
    Blueprint schema 2: ``services`` is a list (an inn is lodging and a trader
    under one roof); the schema-1 ``service`` string reads as a one-item
    list. A malformed value reads as what it names; the validator
    (`blueprint_promises.validate_promise_fields`) reports it."""
    many = parcel.get("services")
    if isinstance(many, list):
        return [str(s) for s in many]
    if isinstance(many, str):
        return [many]
    one = parcel.get("service")
    return [str(one)] if one else []
