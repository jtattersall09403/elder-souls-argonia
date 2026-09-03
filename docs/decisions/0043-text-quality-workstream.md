# 0043 — Text quality workstream: the style guide and the review process

**Date:** 2026-09-03 · **Status:** delivered; **one open owner question**
(spelling, below). Commissioned by the owner the same day.

## Why

The game will carry Morrowind-scale text — names, dialogue, books, journals,
quest text, system messages — written by many agents, most starting from fresh
context. Two failure modes were already identified but not yet defended
against:

1. **AI voice.** Owner directive of 2026-09-01
   ([0042 §6](0042-buildout-steers-and-engineering-standards.md), quests 60
   §45e): model prose reaches for gravitas and produces constructions nobody
   writes.
2. **Convergence.** Eight culture zones and a large cast quietly growing one
   voice, which no per-line review catches because every individual line is
   fine.

Quests 60 §45e specified the *shape* of the answer — a voice research pass, a
rulebook that binds writers, and an independent reviewer — and left all three
unbuilt. This decision builds them.

## Scope

**In:** the derivation of house rules and voice from the Morrowind corpus; the
binding style guide; per-culture registers for the eight zones; the review
process and its triggers.

**Out:** writing any actual game text; localisation (permanently out of scope);
retrofitting existing debug/sandbox UI strings (exempt under engineering
standard 4).

## What was delivered

`docs/text/` — a four-file shelf with a router README:

| File | Owns |
|---|---|
| `style-guide.md` | house rules (spelling, punctuation, capitalisation, numbers, names), the Morrowind voice, and per-**surface** rules for the six `TextSurface` values |
| `culture-registers.md` | the eight culture zones + cross-cutting registers, each derived from a named Morrowind register |
| `review-process.md` | when reviews run, what they check, what they produce, escalation |
| `README.md` | the router, and pointers to what is *not* duplicated |

**Deliberately not duplicated.** The banned-constructions table stays in quests
60 §45e.1 (single growth point); the Jel register stays in 60 §45b; the Argonian
name forms stay in 35-cast §54; the place-naming register stays in the place
catalogue README. The style guide points at each. This keeps a writing agent's
read to the router plus one or two rows.

**Anchored to the eight catalogue regions** rather than a new taxonomy, so how a
place is named and how its people speak cannot drift apart.

## Method

Voice derived from TES III text fetched via the UESP MediaWiki API
(`en.uesp.net/w/api.php`, project user-agent — plain page fetches 403), ~50
dialogue and Lore book pages. Every claim in the guide carries the UESP page
name of the line it rests on. Registers were taken from Morrowind's *proven
contrast set* (Ashlander / Telvanni / Redoran / Hlaalu / Imperial officialdom /
Sixth House / criminal / Temple) and mapped onto our zones, rather than invented
eight times over.

## Rulings recorded

- **No phonetic accent spelling, ever.** Morrowind marks every race and class by
  syntax and address terms alone; the only systematic grammatical marker in the
  entire game is Khajiit illeism. This is the guide's most important negative
  rule.
- **Em dash and ellipsis modernised.** Morrowind writes ` -- ` and `....`; those
  are 2002 font and input artefacts, not style. We write `—` and `…`.
- **ALL-CAPS single-word emphasis kept** — it is a genuine and consistent
  Morrowind convention across every register, and italics do not exist in its
  dialogue.
- **Capitalisation by the hundred-of-them test**: institutions, offices and
  unique things capitalised; creatures, materials and goods lowercase — matching
  Morrowind's own split (House Redoran / guar).
- **`ui` is the one surface where the voice rules stop.** A menu in character is
  a menu nobody can use.
- **Review is always a different agent from the writer**, and the *batch* review
  at phase wrap is the one that catches convergence. It cannot be replaced by
  more per-change passes.

## Open — owner decision

**British or American spelling?** Morrowind's own text is unambiguously
**American** (*armor* 75 / *armour* 0; *honor* 30 / *honour* 0; UESP flags
"defence" in game text as an error, `{{sic|...|description=British spelling}}`).
The guide provisionally rules **British**, because the American spelling is an
artefact of Bethesda being American rather than a flavour any player perceives
as Morrowind-ness, and because every doc in this repo is already British.

Reversible cheaply while the catalogue is small — this is exactly what
engineering standard 4 buys. If the owner prefers fidelity, flip
`style-guide.md` §1.1 and the change is a pass over one keyed table.
