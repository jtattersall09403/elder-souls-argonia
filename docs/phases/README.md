# Phases

A phase folder holds the **plan** for one phase plus **one brief per chunk**. The owner
runs a phase by saying `deliver 16a`, then `deliver 16b`, and so on — one fresh agent per
chunk, with an owner check between chunks. The agent reads the phase `README.md` and then
only the brief it was named.

Naming: `NN-slug/README.md` for the plan, `NNx-chunk-slug.md` for each chunk brief.

What does **not** live here:

- **Status** — only [../PROGRESS.md](../PROGRESS.md) says what is in progress or done.
- **Deliverables and gates** — [../world/95-build-sequence.md](../world/95-build-sequence.md) §86.
- **Why** — the decision record in [../decisions/](../decisions/).

| Phase | Plan |
| --- | --- |
| 16 — terrain once, water once, places on a frozen world | [16-foundation-and-places/README.md](16-foundation-and-places/README.md) |
