# Text quality — the writer's shelf

Everything the player can read is written against these. Commissioned by the
owner 2026-09-03; scope and rationale in decision
[0043](../decisions/0043-text-quality-workstream.md).

| Read this | When |
|---|---|
| [style-guide.md](style-guide.md) | **Always, before writing any player-visible text.** House rules (spelling, punctuation, capitalisation, names) + the Morrowind voice + how each *surface* sounds |
| [culture-registers.md](culture-registers.md) | Writing any speaking character. The **layered model**: voice = race + upbringing + region + faction. Read §0 and your speaker's **four rows** — one per layer |
| [review-process.md](review-process.md) | You are reviewing text, or you are a writer about to commit it |

**Related, and not duplicated here:**

- [quests/60 §45e](../quests/60-writing-and-lore.md) — the owner's TES-voice
  directive and the **banned-constructions table** (the style guide points at
  it rather than copying it; add new rows there).
- [quests/60 §45b](../quests/60-writing-and-lore.md) — the Argonian Jel
  register in full (canon speech habits). It binds **Argonian speakers only**;
  the other nine races have their own rows in culture-registers §1.
- [quests/35-cast.md §54](../quests/35-cast.md) — the five canon Argonian name
  forms and the name-spread rules.
- [quests/60 §46b](../quests/60-writing-and-lore.md) — the six-item **voice
  sheet** (its first item is the character's four layers) every C1/C2 character gets before a line is written.
- [world/sources/catalogue/README.md](../../world/sources/catalogue/README.md)
  — the per-region **naming register** for places. Place names follow the
  region's dominant naming culture; *speech* follows the layered model, so a
  Khajiit in a verb-clause-named town still speaks as a Khajiit.
- `packages/text-catalogue` — where every string actually lives (engineering
  standard 4).
- [research/ai-writing-tells.md](../research/ai-writing-tells.md) — the evidence
  behind the AI-voice rules: what readers actually notice as machine prose
  (lexical, syntactic, structural, qualitative), with sources, plus the five
  tests a reviewer runs on the qualitative ones. Read it if you are *adding* a
  rule; the rules themselves are in the style guide and §45e.1.

- [research/speech-register-model-morrowind.md](../research/speech-register-model-morrowind.md)
  — the evidence behind the layered model: how Morrowind's own dialogue engine
  conditions lines on race, class, faction, rank and region at once.

**Source of the voice rules:** derived from TES III text on UESP
(`en.uesp.net/w/api.php`), page names cited inline throughout. Where a rule
says "Morrowind does X", there is a quoted line behind it.
