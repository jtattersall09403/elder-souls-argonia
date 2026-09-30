"""The workbench's mesh queries: `worldgen.mesh_query` (chunked trimesh ray
casts and closest-point calls, bounded memory), re-exported so workbench
modules import it locally."""
from __future__ import annotations

from . import paths

paths.bridge()

from worldgen.mesh_query import POINT_CHUNK, RAY_CHUNK, cast_rays, on_surface  # noqa: E402,F401
