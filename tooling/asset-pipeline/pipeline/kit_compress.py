"""Compress a built kit for shipping, and publish it: KTX2/Basis textures
and meshopt geometry, recorded in the manifest.

    python3 -m pipeline.kit_compress --kit flora-province-v1          # publish
    python3 -m pipeline.kit_compress --kit flora-province-v1 --check  # verify only

The raw build (`output/kits/<id>.glb`, git-ignored) is the MEASUREMENT
product: `trunk_solids`, `vet_kit`, `measure_footprints`, `interiors_index`
and trimesh all parse its plain accessors. What ships under
`apps/world-studio/public/kits/` is the same kit run through gltfpack:

* every image becomes a KTX2 container, UASTC-encoded (`KHR_texture_basisu`)
  — near-lossless (median 39–45 dB PSNR, indistinguishable on inspection)
  and transcoded on the device to BC7 / ASTC, so it STAYS compressed in VRAM
  (a 1024² RGBA8 texture is 5.3 MB with mips; BC7 is 1.3 MB). ETC1S was
  measured and rejected: 22–33 dB, 2–3x the alpha-cutoff flips on foliage
  cards, visibly blocky canopies (docs/research/rendering/
  gpu-texture-and-mesh-compression.md). A kit config may still choose it per
  class (`"compression": {"color": "etc1s"}`) with the numbers in hand;
* geometry keeps float positions and texture coordinates (see
  `gltfpack_args` for why), quantises normals/tangents/colours
  (KHR_mesh_quantization) and is meshopt-compressed
  (EXT_meshopt_compression); the runtime decodes it with
  the wasm decoder three.js bundles (packages/game-core/src/assets/kitLoader.ts);
* node names, material names and glTF extras survive (`-kn -km -ke`): the
  runtime finds assets by node name and reads `assetId`, `lod`, `billboard`
  and `cardSource` from extras.

Owner decision 2026-09-18: this work was pulled forward out of Phase 14
(streaming and deployment) and done in 16f, together with the duplicated
character assets, because the composed Pages site measured 1,041 MB against
the 1 GB limit and 70–91 % of every kit's bytes were PNG.

The manifest gains a `compression` record (tool, settings, bytes before and
after, image count) so the next agent can see what was done, and
`test_kit_compress.py` refuses a published kit without one.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
OUTPUT_KITS = REPO_ROOT / "tooling/asset-pipeline/output/kits"
PUBLIC_KITS = REPO_ROOT / "apps/world-studio/public/kits"
CONFIG = Path(__file__).parent / "config" / "kits"
TOOLCHAIN = json.loads((Path(__file__).parent / "config" / "toolchain.json").read_text())

SCHEMA_VERSION = 1
CLASSES = ("color", "normal", "attrib")
DEFAULT_POLICY = {"color": "uastc", "normal": "uastc", "attrib": "uastc", "quality": 8}
TEXTURE_EXTENSION = "KHR_texture_basisu"
MESH_EXTENSION = "EXT_meshopt_compression"

# The three measured sidecars ship beside every published kit pair: the
# settlement compile and the export read them from the SHIPPED build, so a
# kit published without them is a kit the studio cannot snap, foot or enter
# (16h item 6). They are small JSON and count against the site budget like
# everything else under kits/ (tooling/pages-site/compose.mjs walks the tree).
SIDECARS = ("connectors", "footprints", "interiors")
# Architecture measurements have nothing to say about a vegetation atlas:
# measure_connectors/footprints and interiors_index describe snap edges,
# ground contact hulls and interior claims of BUILDINGS. These two kits are
# instanced flora and groundcover, placed by the vegetation renderer, never
# snapped or entered; measuring them would add ~2 MB of meaningless rows to
# the startup payload. Exempt by name, with the reason, never by silence.
SIDECAR_EXEMPT = {
    "flora-province-v1": "vegetation atlas: no snap edges, no footprints, no interiors",
    "groundcover-province-v1": "groundcover atlas: no snap edges, no footprints, no interiors",
}


def gltfpack_path() -> Path:
    return Path(os.path.expanduser(TOOLCHAIN.get("gltfpack", "~/tools/gltfpack-1.2/gltfpack")))


def policy_for(kit: dict) -> dict:
    """The kit config's `compression` block over the defaults; `false`
    disables compression for that kit (recorded as such)."""
    block = kit.get("compression", {})
    if block is False:
        return {"enabled": False}
    policy = {**DEFAULT_POLICY, **(block or {})}
    for cls in CLASSES:
        if policy[cls] not in ("uastc", "etc1s"):
            raise ValueError(f"{kit.get('id')}: compression.{cls} must be uastc or etc1s")
    policy["enabled"] = True
    return policy


def gltfpack_args(policy: dict, threads: int = 4) -> list[str]:
    # -vpf: float positions. Quantised positions hang every mesh under an
    # extra unnamed node carrying the dequantisation transform, which moves
    # the mesh away from the node whose extras (`lod`, `billboard`,
    # `cardSource`) the runtime reads on the Mesh itself — every LOD level
    # would collapse to 0. Float positions keep the mesh on its named node
    # and cost nothing measurable (groundcover: 5.132 vs 5.136 MB).
    # -vtf: float texture coordinates (12-bit UVs lose 10 % on tiled flora).
    args = ["-cc", "-tc", "-tq", str(policy["quality"]), "-kn", "-km", "-ke", "-vtf", "-vpf",
            "-tj", str(threads)]
    uastc = [cls for cls in CLASSES if policy[cls] == "uastc"]
    if uastc:
        args += ["-tu", ",".join(uastc)]
    return args


def read_gltf_json(glb: Path) -> dict:
    data = glb.read_bytes()
    if data[:4] != b"glTF":
        raise ValueError(f"{glb} is not a GLB")
    length = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20:20 + length])


def describe(glb: Path) -> dict:
    """What a shipped GLB actually carries — the facts the gate checks."""
    gltf = read_gltf_json(glb)
    images = gltf.get("images", [])
    mimes = sorted({i.get("mimeType", "?") for i in images})
    used = set(gltf.get("extensionsUsed", []))
    return {
        "bytes": glb.stat().st_size,
        "images": len(images),
        "imageMimeTypes": mimes,
        "texturesCompressed": bool(images) and mimes == ["image/ktx2"] and TEXTURE_EXTENSION in used,
        "meshesCompressed": MESH_EXTENSION in used,
        "meshes": len(gltf.get("meshes", [])),
    }


def compress(src: Path, dst: Path, policy: dict, threads: int = 4) -> dict:
    """Run gltfpack src -> dst and return the compression record."""
    tool = gltfpack_path()
    if not tool.exists():
        raise RuntimeError(
            f"gltfpack not found at {tool}: download the native build "
            "(https://github.com/zeux/meshoptimizer/releases, gltfpack-ubuntu.zip; the npm "
            "package is built without the Basis encoder) or set toolchain.json `gltfpack`")
    before = src.stat().st_size
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / dst.name
        report = Path(tmp) / "report.json"
        args = gltfpack_args(policy, threads)
        proc = subprocess.run([str(tool), "-i", str(src), "-o", str(out), *args, "-r", str(report)],
                              capture_output=True, text=True)
        if proc.returncode != 0 or not out.exists():
            raise RuntimeError(f"gltfpack failed on {src.name}:\n{proc.stdout[-2000:]}{proc.stderr[-2000:]}")
        warnings = [line for line in (proc.stdout + proc.stderr).splitlines() if line.startswith("Warning")]
        version = subprocess.run([str(tool), "-v"], capture_output=True, text=True).stdout.strip()
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(out), dst)
        facts = describe(dst)
        data = json.loads(report.read_text()) if report.exists() else {}
    if not facts["texturesCompressed"] and facts["images"]:
        raise RuntimeError(f"{dst.name}: gltfpack left {facts['imageMimeTypes']} images")
    return {
        "schemaVersion": SCHEMA_VERSION,
        "tool": version or "gltfpack",
        "args": args,
        "textures": {cls: policy[cls] for cls in CLASSES},
        "textureQuality": policy["quality"],
        "textureContainer": "ktx2",
        "geometry": MESH_EXTENSION,
        "bytesBefore": before,
        "bytesAfter": facts["bytes"],
        "images": facts["images"],
        "imageBytesAfter": data.get("data", {}).get("buffers", {}).get("image"),
        "warnings": warnings,
        "sha256": hashlib.sha256(dst.read_bytes()).hexdigest(),
    }


def sidecar_problems(kit_id: str, public_dir: Path = PUBLIC_KITS) -> list[str]:
    """Why a published kit's sidecars are not acceptable (empty list = fine)."""
    if kit_id in SIDECAR_EXEMPT:
        return []
    missing = [name for name in SIDECARS
               if not (public_dir / f"{kit_id}.{name}.json").is_file()]
    if missing:
        return [f"{kit_id}: published without its {', '.join(missing)} sidecar(s); "
                f"run pipeline.measure_footprints / measure_connectors / interiors_index "
                f"on the raw build and republish"]
    return []


def publish_sidecars(kit_id: str, raw_dir: Path = OUTPUT_KITS,
                     public_dir: Path = PUBLIC_KITS) -> dict:
    """Copy <kit>.connectors/footprints/interiors.json from the raw build to
    the published kits, and return {name: bytes}. A kit the measurements do
    not apply to (SIDECAR_EXEMPT) ships none; any other kit missing one is a
    hard error here rather than a silent gap the export discovers later."""
    written: dict[str, int] = {}
    if kit_id in SIDECAR_EXEMPT:
        return written
    missing = []
    for name in SIDECARS:
        source = raw_dir / f"{kit_id}.{name}.json"
        if not source.is_file():
            missing.append(name)
            continue
        target = public_dir / f"{kit_id}.{name}.json"
        public_dir.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        os.chmod(target, 0o644)
        written[name] = target.stat().st_size
    if missing:
        raise FileNotFoundError(
            f"{kit_id}: raw build has no {', '.join(missing)} sidecar. Measure it "
            f"(pipeline.measure_footprints / measure_connectors / interiors_index "
            f"--kit {kit_id}) or record the kit in kit_compress.SIDECAR_EXEMPT with "
            f"the reason it has none.")
    return written


def publish(kit_id: str, threads: int = 4) -> dict:
    """Compress output/kits/<id>.glb into public/kits/<id>.glb and copy the
    manifest across with the compression record added. Kits whose config
    `output` already sits under public/ are compressed in place."""
    kit = json.loads((CONFIG / f"{kit_id}.json").read_text())
    raw = (REPO_ROOT / kit["output"]).resolve()
    manifest_path = raw.with_suffix(".kit.json")
    if not raw.exists() or not manifest_path.exists():
        raise FileNotFoundError(f"{kit_id}: build the kit first ({raw})")
    dst = PUBLIC_KITS / f"{kit_id}.glb"
    policy = policy_for(kit)
    manifest = json.loads(manifest_path.read_text())
    if raw.resolve() == dst.resolve():
        # The kit builds straight into public/: keep the raw build under
        # output/kits/ for the measuring tools, and take it from there when
        # the public copy is already a compressed one.
        keep = OUTPUT_KITS / f"{kit_id}.glb"
        facts = describe(raw)
        if facts["texturesCompressed"] or facts["meshesCompressed"]:
            if not keep.exists():
                raise FileNotFoundError(f"{kit_id}: {dst} is already compressed and no raw build "
                                        f"exists at {keep}; rebuild the kit")
        else:
            OUTPUT_KITS.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(raw, keep)
        raw = keep
    if not policy["enabled"]:
        record = {"schemaVersion": SCHEMA_VERSION, "enabled": False,
                  "bytes": raw.stat().st_size,
                  "reason": kit.get("compressionReason", "disabled in kit config")}
        shutil.copyfile(raw, dst)
    else:
        record = compress(raw, dst, policy, threads)
    published = PUBLIC_KITS / f"{kit_id}.kit.json"
    sidecars = publish_sidecars(kit_id)
    record["sidecarBytes"] = sidecars
    # The single list of kits the three architecture measurements do not apply
    # to travels with the manifest, so the export reads the exemption rather
    # than keeping a second copy of it (export_settlement_bundle.kit_sidecar_errors).
    if kit_id in SIDECAR_EXEMPT:
        record["sidecarsExempt"] = SIDECAR_EXEMPT[kit_id]
    manifest["compression"] = record
    manifest_path.write_text(json.dumps(manifest, indent=1) + "\n")
    if published.resolve() != manifest_path.resolve():
        published.write_text(json.dumps(manifest, indent=1) + "\n")
    if sidecars:
        print(f"[kit] {kit_id}: sidecars " + ", ".join(
            f"{n} {b / 1e3:.1f} kB" for n, b in sorted(sidecars.items())))
    elif kit_id in SIDECAR_EXEMPT:
        print(f"[kit] {kit_id}: no sidecars ({SIDECAR_EXEMPT[kit_id]})")
    if record.get("enabled", True):
        print(f"[kit] {kit_id}: compressed {record['bytesBefore'] / 1e6:.1f} MB -> "
              f"{record['bytesAfter'] / 1e6:.1f} MB ({record['images']} images UASTC/KTX2, meshopt) "
              f"-> {dst.relative_to(REPO_ROOT)}")
    return record


def check(kit_id: str) -> list[str]:
    """Why a published kit is not acceptable (empty list = fine)."""
    glb = PUBLIC_KITS / f"{kit_id}.glb"
    if not glb.exists():
        return [f"{kit_id}: no published GLB"]
    return glb_problems(kit_id, glb, PUBLIC_KITS / f"{kit_id}.kit.json") + sidecar_problems(kit_id)


def glb_problems(kit_id: str, glb: Path, manifest_path: Path) -> list[str]:
    """Why a GLB and its manifest may not ship (empty list = fine): the
    `--check` rule minus the sidecars, for any pair about to be published.
    16h M19 ruling 5: `export_settlement_bundle --copy-assets` copied the raw
    `output/kits` builds over the compressed ones (K12 B found 15 kits at raw
    size); every writer into public/kits runs this first."""
    problems = []
    try:
        facts = describe(glb)
    except ValueError as exc:
        return [f"{kit_id}: {exc}"]
    record = json.loads(manifest_path.read_text()).get("compression") if manifest_path.exists() else None
    if record is None:
        problems.append(f"{kit_id}: manifest has no `compression` record (published without pipeline.kit_compress)")
    elif record.get("enabled", True):
        if facts["images"] and not facts["texturesCompressed"]:
            problems.append(f"{kit_id}: images are {facts['imageMimeTypes']}, not KTX2")
        if facts["meshes"] and not facts["meshesCompressed"]:
            problems.append(f"{kit_id}: meshes are not meshopt-compressed")
        if record.get("bytesAfter") != facts["bytes"]:
            problems.append(f"{kit_id}: manifest records {record.get('bytesAfter')} B, GLB is {facts['bytes']} B")
    return problems


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--kit", required=True)
    ap.add_argument("--check", action="store_true", help="verify the published kit, do not rebuild")
    ap.add_argument("--sidecars-only", action="store_true",
                    help="republish the measured sidecars beside an already-compressed "
                         "kit, without re-running gltfpack")
    ap.add_argument("--threads", type=int, default=4)
    args = ap.parse_args()
    if args.check:
        problems = check(args.kit)
        for p in problems:
            print(p)
        sys.exit(1 if problems else 0)
    if args.sidecars_only:
        written = publish_sidecars(args.kit)
        print(f"[kit] {args.kit}: sidecars " + (", ".join(
            f"{n} {b / 1e3:.1f} kB" for n, b in sorted(written.items()))
            or f"none ({SIDECAR_EXEMPT.get(args.kit, 'none measured')})"))
        return
    publish(args.kit, args.threads)


if __name__ == "__main__":
    main()
