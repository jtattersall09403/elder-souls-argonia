"""A place authored as ONE layout file (decision 0100 decision 2).

A layout is ``{schemaVersion: 1, placeId, window: {centreKm: [E, S], halfM},
ops: [...]}``; each op is one mutating `wb.py` command as a JSON object with
the CLI's own argument names (the argparse ``dest``: ``child_face``,
``keep_yaw``, ``allow_terminal``...), e.g.
``{"op": "place", "uid": "house", "asset": "...", "at": [x, z], "yaw": 90,
"settle": true}``, ``{"op": "group", "action": "place", "name": ...}``,
``{"op": "path", "action": "add", "id": ..., "points": [[x, z], ...]}``;
a building pad is ``"pad": {"apronM": 1.5, "floorMinM": 35.8}`` on a
`place` op (``{}`` for every default; decision 0101). A ``"walkable": true``
water, piled or stilt piece settles with no ``settle`` (`measure.auto_settles`);
a house on stilts' landing plank is part of its composite's mesh and has no
per-placement override: the house pose sites it (placement-workbench skill).

A socket (decision 0103) is ``{"op": "socket", "id", "kind", "at": [x, z]
or "host": <scene uid | parcel id>, "yawDeg", "parcel", "why", <kind data>}``
in the vocabulary of ``world/sources/vocab/socket-vocabulary.json``. It moves
no piece, so `load` validates it and lifts it out of ``ops`` into
``sockets``; the compile reads it from the layout the blueprint's
``authoredOn.layout`` names (``worldgen.sockets``). Yard-set containers and
furniture yield their sockets without an op (`assembly.group_sockets`).
`replay` cannot recover sockets from a scene log: keep them in the layout.

A pool (16k walk 4) is ``{"op": "pool", "uid", "centreM": [x, z], "radiusM"
(2..12), "depthM" (0.2..1.5), "rimM" (blend, default 1.0), "why",
"sources"}``: a spring, a cistern, a basin. Like a socket it moves no piece:
`load` validates it (``worldgen.pad_overlay.pool_op_errors``) and lifts it
into ``pools``; the export reads it from the layout the blueprint names and
writes the basin as a ``pool`` ground overlay plus the place's ``pools[]``
still-water record, which the runtime draws at load. Never a raster edit.

`apply` builds a fresh scene from the window, runs the ops in order in one
process (one catalogue, no per-call reload), stops at the first failing op,
then runs `check` and `compile` and writes one summary. The scene file is
derived state; the layout is the source. `replay` turns a scene's command
log back into a layout (the migration path for scenes built call by call).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shlex
import time
from pathlib import Path

from . import paths

SCHEMA_VERSION = 1
# the commands a layout may carry: every mutating command except `window`
# (the layout's own window block opens the ground)
OPS = ("place", "move", "settle", "snap", "mount", "attach", "mirror", "swap", "group",
       "path", "bind", "remove", "note")
# positional arguments that may hold spaces (an asset id from a mod folder
# with spaces, a note): the pre-shlex log joined argv with single spaces
_SPACED = {"place": (2, "--"), "swap": (2, "--"), "note": (2, None)}
SOCKET_OP = "socket"
POOL_OP = "pool"


def sha256(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def _subparsers(ap: argparse.ArgumentParser) -> dict:
    return next(a for a in ap._actions if isinstance(a, argparse._SubParsersAction)).choices


def _flat(v) -> list:
    if isinstance(v, (list, tuple)):
        return [x for item in v for x in _flat(item)]
    return [v]


def _arg(v) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    return repr(float(v)) if isinstance(v, float) else str(v)


def op_to_argv(op: dict, ap: argparse.ArgumentParser) -> list[str]:
    """One layout op -> the CLI tokens of its command (no scene)."""
    op = dict(op)
    name = op.pop("op", None)
    if isinstance(name, str) and " " in name:          # "group place" / "path add"
        name, op["action"] = name.split(" ", 1)
    if name not in OPS:
        raise ValueError(f"op {name!r} is not a layout op (one of {', '.join(OPS)})")
    sp = _subparsers(ap)[name]
    op = {k.replace("-", "_"): v for k, v in op.items()}
    argv, known = [name], set()
    for act in sp._actions:
        if isinstance(act, argparse._HelpAction):
            continue
        known.add(act.dest)
        if act.dest not in op:
            if not act.option_strings and act.nargs not in ("?", "*"):
                raise ValueError(f"{name}: needs {act.dest!r}")
            continue
        v = op[act.dest]
        if isinstance(v, dict):            # `pad: {apronM: 1.5}` -> --pad apronM=1.5
            argv += [act.option_strings[0], *(
                f"{k}=" + (",".join(f"{a}:{_arg(b)}" for a, b in x.items()) if isinstance(x, dict)
                           else _arg(x)) for k, x in v.items())]
            continue
        if not act.option_strings:
            argv += [_arg(x) for x in _flat(v)] if v is not None else []
        elif isinstance(act, argparse._StoreTrueAction):
            if v:
                argv.append(act.option_strings[0])
        elif v is not None:
            argv += [act.option_strings[0], *(_arg(x) for x in _flat(v))]
    extra = set(op) - known
    if extra:
        raise ValueError(f"{name}: unknown argument(s) {sorted(extra)}")
    return argv


def argv_to_op(tokens: list[str], ap: argparse.ArgumentParser) -> dict:
    """CLI tokens (no scene) -> a layout op carrying only what differs from
    the command's defaults (positionals always)."""
    ns = ap.parse_args(["-", *tokens])
    sp = _subparsers(ap)[ns.cmd]
    op = {"op": ns.cmd}
    for act in sp._actions:
        if isinstance(act, argparse._HelpAction):
            continue
        v = getattr(ns, act.dest)
        if act.option_strings and v == act.default:
            continue
        if v is None:
            continue
        if act.dest in ("points",):
            v = [[v[i], v[i + 1]] for i in range(0, len(v), 2)]
        if act.dest == "pad":
            from .pads import parse
            v = parse(v)
        op[act.dest] = v
    return op


def log_tokens(line: str) -> list[str]:
    """A scene log line -> tokens. Lines written since `apply` exists are
    `shlex.join`ed; older lines joined argv with spaces, so an asset id with
    spaces is rejoined up to the next option."""
    if "'" in line or '"' in line:
        try:
            tokens = shlex.split(line)
        except ValueError:          # an old note with an apostrophe
            tokens = None
        if tokens is not None and shlex.join(tokens) == line:
            return tokens
    tokens = line.split(" ")
    spaced = _SPACED.get(tokens[0])
    if spaced and len(tokens) > spaced[0]:
        i, stop = spaced
        j = len(tokens) if stop is None else next(
            (k for k in range(i + 1, len(tokens)) if tokens[k].startswith(stop)), len(tokens))
        tokens = tokens[:i] + [" ".join(tokens[i:j])] + tokens[j:]
    return tokens


def replay(scene, ap: argparse.ArgumentParser) -> dict:
    """The scene's command log as a layout: its `window` line becomes the
    window block, every other logged command one op, in order."""
    window, ops = None, []
    for n, line in enumerate(scene.log):
        tokens = log_tokens(line)
        op = argv_to_op(tokens, ap)
        if op["op"] == "window":
            got = {"centreKm": op["centre_km"], "halfM": op.get("half", 150.0)}
            if window is not None and got != window:
                raise ValueError(f"log line {n}: a second window {got} differs from {window}")
            window = got
            continue
        if op["op"] not in OPS:
            raise ValueError(f"log line {n}: {op['op']!r} is not a layout op")
        ops.append(op)
    if window is None:
        meta = scene.ground().meta
        window = {"centreKm": [meta["centreM"][0] / 1000, meta["centreM"][1] / 1000],
                  "halfM": meta["halfM"]}
    return {"schemaVersion": SCHEMA_VERSION, "placeId": scene.placeId, "window": window,
            "ops": drop_removed(ops)}


def _names(op: dict) -> set:
    """Every piece uid an op reads or writes."""
    return {op.get(k) for k in ("uid", "child", "parent") if op.get(k)} | set(op.get("uids") or [])


def drop_removed(ops: list[dict]) -> list[dict]:
    """Drop a piece that was placed and later removed (a trial the author
    threw away): its `place`, every op on it alone and the `remove`, when no
    other piece read it in between. What the scene ends with is unchanged;
    a trial whose evidence has since been re-mined can no longer fail the
    replay."""
    ops = list(ops)
    i = 0
    while i < len(ops):
        op = ops[i]
        if op["op"] == "remove":
            uid = op["uid"]
            start = max((k for k in range(i) if ops[k]["op"] == "place"
                         and ops[k]["uid"] == uid), default=None)
            span = range(start, i) if start is not None else range(0)
            # an op that moves ANOTHER piece by this one (it is the parent
            # of a snap, a member of a saved group) keeps the trial
            if start is not None and not any(
                    uid in _names(ops[k]) and (ops[k].get("uid") or ops[k].get("child")) != uid
                    for k in span):
                keep = [k for k in span if uid not in _names(ops[k])]
                ops = ops[:start] + [ops[k] for k in keep] + ops[i + 1:]
                i = start + len(keep)
                continue
        i += 1
    return ops


def repo_path(path: Path) -> str:
    """The layout's path as recorded: repo-relative POSIX when it lies in the
    repo (the same file typed two ways records the same bytes), else
    absolute."""
    full = Path(path).resolve()
    try:
        return full.relative_to(paths.REPO_ROOT).as_posix()
    except ValueError:
        return full.as_posix()


def load(path: Path) -> dict:
    doc = json.loads(Path(path).read_text())
    if doc.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(f"{path}: layout schemaVersion {doc.get('schemaVersion')} "
                         f"!= {SCHEMA_VERSION}")
    for key in ("placeId", "window", "ops"):
        if key not in doc:
            raise ValueError(f"{path}: a layout needs {key!r}")
    return split_pools(split_sockets(doc, path), path)


def split_sockets(doc: dict, path="layout") -> dict:
    """Lift the `socket` ops out of ``ops`` into ``sockets`` (in order),
    refusing a malformed one with every reason at once."""
    paths.bridge()
    from worldgen import sockets as sk
    vocab = sk.load_vocabulary()
    got = [op for op in doc["ops"] if op.get("op") == SOCKET_OP]
    errors = [e for op in got for e in sk.op_errors(op, vocab)]
    ids = [op.get("id") for op in got + list(doc.get("sockets") or [])]
    errors += [f"socket {i}: id used twice" for i in sorted({i for i in ids if ids.count(i) > 1})]
    if errors:
        raise ValueError(f"{path}: " + "; ".join(errors))
    return {**doc, "ops": [op for op in doc["ops"] if op.get("op") != SOCKET_OP],
            "sockets": list(doc.get("sockets") or []) + got}


def split_pools(doc: dict, path="layout") -> dict:
    """Lift the `pool` ops out of ``ops`` into ``pools`` (in order), refusing
    a malformed one with every reason at once."""
    paths.bridge()
    from worldgen import pad_overlay as po
    got = [op for op in doc["ops"] if op.get("op") == POOL_OP]
    errors = [e for op in got for e in po.pool_op_errors(op)]
    uids = [op.get("uid") for op in got + list(doc.get("pools") or [])]
    errors += [f"pool {u}: uid used twice" for u in sorted({u for u in uids if uids.count(u) > 1})]
    if errors:
        raise ValueError(f"{path}: " + "; ".join(errors))
    return {**doc, "ops": [op for op in doc["ops"] if op.get("op") != POOL_OP],
            "pools": list(doc.get("pools") or []) + got}


def scene_path(name: str) -> Path:
    """A scene NAME (output/scenes/NAME.json) or an explicit .json path."""
    if name.endswith(".json") or "/" in name:
        return Path(name)
    return paths.OUTPUT / "scenes" / f"{name}.json"


def default_scene_name(place_id: str) -> str:
    return place_id.removeprefix("place.").replace(".", "-") + "-layout"


def stale_ground(place_id: str, window: dict) -> str | None:
    """Why the place's blueprint was authored on other ground than the
    chunks on disk now, or None (no blueprint, no `authoredOn`, or equal)."""
    from . import ground
    bp_path = paths.BLUEPRINTS / f"{place_id}.json"
    if not bp_path.exists():
        return None
    authored = (json.loads(bp_path.read_text())["blueprint"].get("authoredOn") or {}).get("ground")
    if not authored or "sha256" not in authored:
        return None
    centre = (window["centreKm"][0] * 1000, window["centreKm"][1] * 1000)
    now = ground.current_provenance(centre, float(window["halfM"]))
    if now["sha256"] == authored["sha256"]:
        return None
    changed = sorted(k for k in set(now["chunks"]) | set(authored.get("chunks", {}))
                     if now["chunks"].get(k) != authored.get("chunks", {}).get(k))
    return (f"{bp_path.name} was authored on other ground: chunk files {changed} changed "
            f"since its export (authoredOn.ground.sha256 {authored['sha256'][:12]} != now "
            f"{now['sha256'][:12]}). A frozen layer moved under an authored place: a "
            f"world-level call (0100 decision 6); --allow-stale-ground rebuilds anyway")


def _reusable_ground(stem: Path, centre: tuple, half: float) -> bool:
    """An extracted window can be reused when it is the same window and its
    chunk files are byte-identical to the ones on disk now (the survey is
    the frozen refined raster)."""
    from . import ground
    meta_path = stem.with_suffix(".json")
    if not meta_path.exists() or not stem.with_suffix(".npz").exists():
        return False
    meta = json.loads(meta_path.read_text())
    if meta.get("schemaVersion") != ground.SCHEMA_VERSION or \
            list(meta["centreM"]) != list(centre) or meta["halfM"] != half:
        return False
    if not all("sha256" in c for c in meta["chunks"]):
        return False
    return ground.provenance(meta["chunks"]) == ground.current_provenance(centre, half)


def _warnings(out) -> list[str]:
    """What an op's own output flags: notes, warnings, a quay with no bank."""
    found = []
    if isinstance(out, dict):
        for k, v in out.items():
            if k in ("note", "warning", "bankError") and v:
                found.append(f"{k}: {v}")
            elif k == "warnings" and v:
                found += [str(w) for w in v]
            elif isinstance(v, dict):
                found += _warnings(v)
    return found


def check_failures(check: dict) -> list[str]:
    """The `check` rows that break a bar the compile or the yard gate holds
    (97 B3 slope, the fit delta, the sill, the pad fit of 0101, foot float,
    run joints and crossings, hull depth, quay bank, doors within reach of a
    way; 0102's walkRule, floorEdgeRule, pathReachRule, propSeatRule)."""
    return [row["text"] for row in check_failure_rows(check)]


def check_failure_rows(check: dict) -> list[dict]:
    """`check_failures` with each failure's rule and the piece uids it
    names ({rule, uids, text}), in the same order: the round summary groups
    them by rule and by uid (`wb.py round`)."""
    paths.bridge()
    from worldgen import blueprint_integration as bi
    from worldgen import test_proving_ground as tpg
    out = []

    def add(rule, uids, text):
        out.append({"rule": rule, "uids": uids, "text": text})
    from .seat_rules import is_rock
    for uid, r in check["pieces"].items():
        # a rock (seat_rules ROCK_POLICY, 0075) is judged by rockSeatRule on
        # its lowest three contacts, never by the direct fit's slope, delta
        # or foot float (planner ruling 5, CLAYWATER2)
        rock = is_rock(r.get("asset") or "")
        for rule in ("slopeRule", "deltaRule", "sillRule", "padRule", "beachedRule",
                     "stiltRule", "floorServiceRule", "notExportable"):
            if rock and rule in ("slopeRule", "deltaRule"):
                continue
            if r.get(rule):
                # the piece row's sillRule is the yard gate's ground line at the pivot
                add("yardSillRule" if rule == "sillRule" else rule, [uid], f"{uid}: {r[rule]}")
        # a piled deck (dock, jetty, landing span) stands on its piles and
        # seats by its deck: its feet are exempt (lessons L65, round 4)
        if (r.get("anchorClass") or "ground") == "ground" and not r.get("piled") and not rock and \
                (r.get("footFloatMaxM") or 0.0) > tpg.FLOAT_LIMIT_M:
            add("footFloat", [uid], f"{uid}: foot floats {r['footFloatMaxM']} m (> {tpg.FLOAT_LIMIT_M})")
        if r.get("hullWater") and not r["hullWater"]["ok"]:
            add("hullWater", [uid], f"{uid}: hull water {r['hullWater']['minDepthM']} m under its halo")
        if (r.get("quayReach") or {}).get("bankError"):
            add("quayBank", [uid], f"{uid}: {r['quayReach']['bankError']}")
    for pair in check["nearPairs"]:
        if not pair.get("ok", True):
            add(f"{pair['relation']}Pair", [pair.get("a"), pair.get("b")],
                f"{pair.get('a')}~{pair.get('b')}: {pair['relation']} pair fails "
                f"(gap {pair.get('gapM')}, penetration {pair.get('penetrationM')}, "
                f"crossing {pair.get('intersecting')})")
    for uid, d in check["doors"].items():
        dist = d["best"]["pathDistanceM"]
        if dist is None or dist > bi.DOOR_REACH_M:
            add("doorReach", [uid], f"{uid}: best doorway {dist} m from a way (> {bi.DOOR_REACH_M})")
    # decision 0102 decision 2: the measured walk-packet rules
    uids = list(check["pieces"])
    for key, rule in RULES:
        for x in (check.get(key) or {}).get("failures", []):
            add(rule, _named_uids(x, uids), f"{rule}: {x}")
    return out


def _named_uids(text: str, uids: list[str]) -> list[str]:
    """The scene uids a rule's failure text leads with (`uid: ...`,
    `door:uid[.k]: ...`, `uid~uid ...`); [] when it names none."""
    head = text.split(": ", 1)[0].removeprefix("door:")
    found = []
    for part in head.replace("~", " ").replace(",", " ").split():
        for cand in (part, part.rsplit(".", 1)[0]):
            if cand in uids and cand not in found:
                found.append(cand)
                break
    return found


RULES = (("walk", "walkRule"), ("floorEdge", "floorEdgeRule"), ("pathReach", "pathReachRule"),
         ("propSeat", "propSeatRule"), ("roadSurface", "roadSurfaceRule"), ("sill", "sillRule"),
         ("sign", "signRule"), ("berthReach", "berthReachRule"), ("collider", "colliderRule"),
         ("burial", "burialRule"), ("hanging", "hangingRule"), ("fixtureSeat", "fixtureSeatRule"),
         ("archway", "archwayRule"), ("rockSeat", "rockSeatRule"), ("padClear", "padClearRule"),
         ("landing", "landingRule"), ("walkway", "walkwayRule"), ("coplanar", "coplanarRule"), ("ownerOk", "ownerOkRule"), ("scanFresh", "scanFreshRule"))
