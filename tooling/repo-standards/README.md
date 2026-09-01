# repo-standards

The mechanical half of [docs/engineering-standards.md](../../docs/engineering-standards.md)
(decision 0042 §8). Zero dependencies; runs as part of root `npm test`.

```
npm test -w @elder-souls/repo-standards
```

| File | Enforces |
|---|---|
| `check.mjs` | all of the below |
| `allowlist-determinism.json` | **standard 6** — scopes for world-building code + reasoned exemptions |
| `baseline-singletons.json` | **standard 8** — existing module-level singletons in `packages/`; may shrink, never grow |
| `id-registry.json` | **standard 2** — stable-ID sources, shape, global uniqueness, retired IDs (goes live at Phase 11) |
| `data-registry.json` | **standard 7** — runtime data paths that must carry `schemaVersion`; unversioned debt prints as a note every run |
| — | **standard 10** — every asset pool in `world/sources/assets/registry-summary.json` is credited in the root README |

Two habits this exists to enforce:

- **Notes are debt, not decoration.** A note names an unversioned bundle or a
  baselined singleton that has been removed. Clear them when you are in the file
  anyway.
- **If a check is wrong, fix the check.** Adding an exemption without a reason
  in the allowlist is how a ratchet stops ratcheting.

The remaining standards (3, 5, 9, 11 and the condition vocabulary) are phase
hooks and conventions, not greppable properties — they are verified at the
kickoffs named in the standards doc.
