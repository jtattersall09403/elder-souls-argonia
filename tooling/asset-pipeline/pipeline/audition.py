"""Build a local-only character GLB containing explicit HKX candidates.

This keeps mod/FOMOD inspection separate from the production semantic manifest:
candidate paths can live under the gitignored ``skyrim-source/mod-sources``
tree, while the generated audition GLB remains under ignored ``output/``.

Example:
    python -m pipeline.audition --output-stem dodge-candidates \
      --candidate ROLL_A=/absolute/path/to/forward-a.hkx \
      --candidate ROLL_B=/absolute/path/to/forward-b.hkx
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from .build import (
    assemble_animations,
    assemble_data_root,
    run_blender,
    write_blender_plan,
    write_runtime_manifest,
)
from .models import ROOT, AnimationSpec, resolve_character


_SAFE_NAME = re.compile(r"^[A-Za-z0-9_-]+$")


def _candidate(value: str) -> tuple[str, Path]:
    semantic, separator, raw_path = value.partition("=")
    if not separator or not semantic or not raw_path:
        raise argparse.ArgumentTypeError("candidate must be NAME=/path/to/file.hkx")
    if not _SAFE_NAME.fullmatch(semantic):
        raise argparse.ArgumentTypeError(f"unsafe candidate name: {semantic}")
    path = Path(raw_path).expanduser().resolve()
    if path.suffix.lower() != ".hkx" or not path.is_file():
        raise argparse.ArgumentTypeError(f"candidate is not an HKX file: {path}")
    return semantic, path


def build_audition(character_id: str, output_stem: str, candidates: list[tuple[str, Path]]) -> None:
    if not _SAFE_NAME.fullmatch(output_stem):
        raise ValueError(f"unsafe output stem: {output_stem}")
    if len({name for name, _ in candidates}) != len(candidates):
        raise ValueError("candidate semantic names must be unique")

    # The audition id goes *into* the resolver rather than being patched on
    # afterwards. `resolve_character` derives the build data-root and every mesh
    # path from `char["id"]`, so renaming the plan after the fact left the mesh
    # paths pointing at one character's data-root while the assembler extracted
    # into another's — and the texture scan then tried to read a NIF nobody had
    # extracted. That is why this tool could not build anything.
    plan = resolve_character(
        character_id,
        overrides={"id": f"{character_id}-audition-{output_stem}"},
    )
    plan.animations = [
        AnimationSpec(
            semantic=name,
            source=name,
            looping=False,
            root_motion="consume",
            playback_rate=1.0,
            provenance=str(path),
        )
        for name, path in candidates
    ]
    plan.anim_local_overrides = {name: str(path) for name, path in candidates}
    plan.output_glb = ROOT / "output" / f"audition-{output_stem}.glb"
    plan.output_manifest = ROOT / "output" / f"audition-{output_stem}.animations.json"

    data_root = assemble_data_root(plan)
    animations = assemble_animations(plan)
    blender_plan = write_blender_plan(plan, data_root, animations)
    summary = run_blender(blender_plan, plan.output_glb)
    write_runtime_manifest(plan, summary)
    print(f"[audition] GLB -> {plan.output_glb}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build an ignored GLB from explicit local HKX candidates.")
    parser.add_argument("--character", default="dunmer-combat")
    parser.add_argument("--output-stem", required=True)
    parser.add_argument("--candidate", action="append", type=_candidate, required=True)
    args = parser.parse_args()
    build_audition(args.character, args.output_stem, args.candidate)


if __name__ == "__main__":
    main()
