# 0113 — Every work socket carries the point where the player uses it

Planner brief, 16k walk 6 (owner question 2026-09-30: "are work sockets also
where the player interacts to use that job, e.g. buy, or is that separate?").
Extends 0103 decision 5 (sockets) and 0104 decision 4 (`station`).

## Decision

1. A work socket (a `station` socket, or an `idle` socket whose activity is
   `work-at`) carries `interact: {kind, position, facing}` in the same frame
   as its `positionM`. The socket stays where the worker stands.
2. `kind: "customer"` when the host is a service surface, named by the
   vocabulary's `serviceSurfaces.nameFamilies` (counter, stall, market),
   matched on the host asset's file name as `furnitureActivities` is. The
   point is along the worker's facing, 0.6 m past where that ray leaves the
   host's kit box (`sizeM`/`originOffsetM` × scale, turned by the host's
   yaw), facing back at the worker. The brief's "host depth + 0.6 m" assumed
   the worker stands at the host's edge. Interior furniture sockets stand at
   the host's pivot, so the exit distance is used: it gives the same point
   in both cases.
3. `kind: "station"` for every other work socket (forge, anvil, tanning
   rack, net bench, a free work spot): the player uses it where the worker
   stands, in the worker's pose.
4. One writer: `worldgen/sockets.py` `interact_point` is called by the
   settlement compile and by the interior exporter. The sockets record goes to
   `socketsSchemaVersion` 2, and interior bundles now carry
   `socketsSchemaVersion` too. The runtime (`settlement/sockets.ts`) reads 1
   (no interact points, bundles published before this) and 2 (required on
   work sockets). This follows the additive pattern of
   `SettlementBundle.schemaVersion`, so published places are not
   republished for this change.

## Why

Buying, crafting and serving need a place for the player to stand that the
navmesh, the prompt and later the dialogue camera can target. Deriving it at
runtime from names would scatter the rule. One record field computed from
real kit bounds keeps it measurable and in one home (standard 18).
