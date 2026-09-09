"""Where on the map an edit landed — the chain's changed-region currency.

The terrain chain fingerprints each stage's CODE and FILES (`chain_stages`),
which tells it *that* something moved but never *where*. A 172 m dock dredge
therefore invalidated the whole 4033² province and cost a full rebuild, with
every byte outside the dredge recomputed identically.

A **footprint** is that missing fact: a list of half-open boxes
``[y0, y1, x0, x1]`` in FULL-RESOLUTION sample coordinates (row = +Z, col =
+X, the `refined-height-f32.npy` lattice). The local carves report one per
cut; the per-tile stages downstream turn it into a set of chunks and redo
only those.

Two rules keep it honest:

* a footprint is only ever **widened**, never narrowed — the union of the
  boxes an edit touched and the boxes the previous run touched, because
  undoing the old cut is as much a change as making the new one; and
* a stage that can measure the truth **checks the footprint against it**
  (`changed_boxes` diffs an array against the snapshot the stage last
  compiled). A footprint that under-reports is caught and widened rather
  than silently shipping a stale tile.

Boxes are stored on disk as::

    {"schemaVersion": 1, "sampleBoxes": [[y0, y1, x0, x1], ...],
     "gridShape": [rows, cols]}

(engineering standard 4: schemaVersion on runtime data, no timestamps.)
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

SCHEMA_VERSION = 1
# Above this many disjoint changed components, one bounding box is cheaper to
# carry than the list, and the tile set it selects is the same to within a
# chunk or two.
MAX_COMPONENTS = 64

Box = tuple[int, int, int, int]


def normalise(boxes) -> list[Box]:
    """Clean, ordered, de-duplicated boxes; empty ones dropped."""
    out = {(int(y0), int(y1), int(x0), int(x1))
           for y0, y1, x0, x1 in boxes if y1 > y0 and x1 > x0}
    return sorted(out)


def union(*groups) -> list[Box]:
    """Every box of every group. Boxes never merge: overlap is harmless."""
    return normalise([box for group in groups for box in (group or ())])


def pad(boxes, cells: int) -> list[Box]:
    """Grow every box by `cells` samples on all sides."""
    return normalise([(y0 - cells, y1 + cells, x0 - cells, x1 + cells)
                      for y0, y1, x0, x1 in boxes])


def mask(boxes, shape) -> np.ndarray:
    """A bool grid of `shape` that is True inside any box."""
    out = np.zeros(shape, dtype=bool)
    for y0, y1, x0, x1 in boxes:
        out[max(y0, 0):min(y1, shape[0]), max(x0, 0):min(x1, shape[1])] = True
    return out


def cells(boxes, shape) -> int:
    return int(mask(boxes, shape).sum())


def chunks(boxes, chunk_samples: int, grid=None) -> set[tuple[int, int]]:
    """Which chunks a footprint intersects, as {(cx, cy)}.

    A chunk owns samples ``[cy*C, cy*C + C]`` INCLUSIVE of the overlap row and
    column it duplicates from its neighbour (`compile_chunks.chunk_grid`), so a
    box touching sample ``cy*C`` also changes chunk ``cy - 1``. The -1 below is
    that overlap, and leaving it out was the obvious way to ship one stale
    seam per edit.
    """
    out: set[tuple[int, int]] = set()
    for y0, y1, x0, x1 in boxes:
        for cy in range(max((y0 - 1) // chunk_samples, 0), (y1 - 1) // chunk_samples + 1):
            for cx in range(max((x0 - 1) // chunk_samples, 0), (x1 - 1) // chunk_samples + 1):
                if grid is not None and not (cx < grid[0] and cy < grid[1]):
                    continue
                out.add((cx, cy))
    return out


def changed_boxes(new: np.ndarray, old: np.ndarray | None,
                  max_components: int = MAX_COMPONENTS) -> list[Box] | None:
    """Boxes covering every cell where `new` differs from `old`.

    `None` means "no comparison was possible" (no snapshot, or a different
    shape) — the caller must then treat everything as changed, because an
    absent measurement is not evidence of no change.
    """
    if old is None or old.shape != new.shape:
        return None
    diff = new != old
    while diff.ndim > 2:                  # an RGBA raster: any channel moving
        diff = diff.any(axis=-1)
    return boxes_from_mask(diff, max_components)


def boxes_from_mask(diff: np.ndarray, max_components: int = MAX_COMPONENTS) -> list[Box]:
    """Boxes covering every True cell of a 2-D mask."""
    if not diff.any():
        return []
    from scipy import ndimage
    labels, count = ndimage.label(diff)
    if count > max_components:
        ys, xs = np.nonzero(diff)
        return [(int(ys.min()), int(ys.max()) + 1, int(xs.min()), int(xs.max()) + 1)]
    return normalise([(sy.start, sy.stop, sx.start, sx.stop)
                      for sy, sx in ndimage.find_objects(labels)])


# ------------------------------------------------------------------ on disk

def save(path, boxes, grid_shape=None) -> list[Box]:
    boxes = normalise(boxes)
    doc = {"schemaVersion": SCHEMA_VERSION,
           "sampleBoxes": [list(b) for b in boxes]}
    if grid_shape is not None:
        doc["gridShape"] = [int(v) for v in grid_shape]
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, indent=1, sort_keys=True) + "\n")
    return boxes


def load(path) -> list[Box]:
    """The boxes in a footprint file; `[]` if the file is not there."""
    try:
        doc = json.loads(Path(path).read_text())
    except (OSError, json.JSONDecodeError):
        return []
    if doc.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(f"{path}: footprint schemaVersion "
                         f"{doc.get('schemaVersion')!r}, expected {SCHEMA_VERSION}")
    return normalise(tuple(b) for b in doc.get("sampleBoxes", []))


def load_or_none(path):
    """`None` when the file is absent — "no footprint given", not "empty"."""
    return load(path) if Path(path).exists() else None
