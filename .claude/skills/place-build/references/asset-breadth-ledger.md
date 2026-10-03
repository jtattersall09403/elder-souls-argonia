# Asset breadth ledger

One row per closed place, appended at slice close (newest last), so the
share of the whole asset pool the game uses is measurable over time
([palette-and-breadth.md](palette-and-breadth.md) § The ledger). The
schema row below is the format, with placeholders in angle brackets.

| place id | type | region classes | culture | landmark set | fabric families | sets new to the game | siblings compared (same region / other region) | not a subset of (ids) | used / available for (region, type) and the command | date |
|---|---|---|---|---|---|---|---|---|---|---|
| `<place.region.name>` | `<type>` | `<region classes>` | `<culture>` | `<set path>` | `<buildingFamily, ...>` | `<set paths>` | `<ids> / <ids>` | `<sibling ids>` | `<n> / <m>; <command>` | `<yyyy-mm-dd>` |
