"""Load and validate the world's authored record families (decision 0104
decision 8). ``families.json`` is the registry; ``schemas/`` holds one JSON
Schema per family, keyed by ``$id`` so a schema can ``$ref`` another (a
layout's socket ops are ``socket.v1``). Python readers validate through
``jsonschema``; the TypeScript types are to be generated from the same files
(queued, docs/phases/P-polish/backlog.md).

    from world_schema import validate, load_family
    errors = validate("promises", doc)            # [] when valid
    for path, doc in load_family("layout"): ...
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

HERE = Path(__file__).resolve().parent
SCHEMA_DIR = HERE / "schemas"
REPO_ROOT = HERE.parents[1]


def families() -> dict[str, dict]:
    return json.loads((HERE / "families.json").read_text(encoding="utf-8"))["families"]


@lru_cache(maxsize=1)
def _registry() -> tuple[Registry, dict[str, dict]]:
    by_file, registry = {}, Registry()
    for path in sorted(SCHEMA_DIR.glob("*.schema.json")):
        schema = json.loads(path.read_text(encoding="utf-8"))
        by_file[path.name] = schema
        registry = registry.with_resource(schema["$id"], Resource.from_contents(schema))
    return registry, by_file


def validator(family: str) -> Draft202012Validator:
    registry, by_file = _registry()
    return Draft202012Validator(by_file[families()[family]["schema"]], registry=registry)


def validate(family: str, doc: object) -> list[str]:
    """Every schema error of ``doc`` as ``<json path>: <message>``."""
    return [f"{'/'.join(str(p) for p in e.absolute_path) or '<root>'}: {e.message}"
            for e in sorted(validator(family).iter_errors(doc), key=lambda e: list(e.absolute_path))]


def load_family(family: str, root: Path = REPO_ROOT) -> list[tuple[Path, dict]]:
    """(path, document) for every file of a family under ``root``."""
    out = []
    for pattern in families()[family].get("files") or []:
        for path in sorted(Path(root).glob(pattern)):
            out.append((path, json.loads(path.read_text(encoding="utf-8"))))
    return out
