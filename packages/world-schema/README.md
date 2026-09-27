# @elder-souls/world-schema

One JSON Schema per authored world record family, versioned by
`schemaVersion`, and the referential-integrity gate over them
(decision 0104, engineering standard 18).

| File | What |
|---|---|
| `families.json` | the registry: family -> schema, files, the id prefix it is the home of |
| `schemas/*.schema.json` | the schemas, keyed by `$id` so one can `$ref` another |
| `world_schema.py` | `validate(family, doc)`, `load_family(family)` (Python, `jsonschema`) |
| `integrity.py` | `integrity_errors(root)`: schema, references, duplicate homes, open promises; `python3 packages/world-schema/integrity.py` prints them |
| `test_world_schema.py` | `npm test`: every schema valid, every data-registry family has a schema or a queued owner, the real records whole, the ferry-poler fixture failing then fixed |

Adding a family: write its schema, add it to `families.json`, and name it
as `schema` on its `tooling/repo-standards/data-registry.json` entry.
TypeScript types generated from these schemas are queued
(docs/phases/P-polish/backlog.md).
