"""Per-culture name pools and forms for the Phase 16g NPC roster.

Pools only — no sampling policy, no catalogue knowledge. ``npc_roster`` owns
the seeding, the caps and the joins; this module owns *what a name of form F
for culture C may look like*, so a text reviewer can read the pools without
reading the generator.

Sources for the shapes (never invented):
  * Jel: two hyphenated elements — Im-Kilaya, Haj-Ei, Deem-Ra
    (UESP Lore:Argonian Names; style guide 1.5). Stems below are new
    combinations of attested-shaped syllables, never a canon name reused.
  * Translated Tamrielic: a hyphenated verb clause, often a literal
    translation of the Jel — "Hides His Eyes" (Lore:Argonian Names).
    Split by REGION IDIOM (catalogue README naming register, mining 3.4):
    hist-heartland takes definite abstractions, saxhleel-coast takes the
    clause at its purest, mercantile-coast takes working trade names.
  * Epithet: earned by an event — Red Bramman, One-Eye, Drakeeh the
    Unchained (quests 35 54).
  * Imperial: Latinate praenomen + nomen (Larrius Varro).
  * Dunmer: given + house (Bolvyn Venim); houses from the Velothi lists in
    world/sources/lore/regions/shadowfen.md and the Morrowind Great Houses.
  * Khajiit: apostrophised prefix (Ra'Virr) or epithet-first.
  * Nord / Breton / Bosmer / Altmer / Orc / Redguard: their own province's
    conventions (style guide 1.5, quests 35 54 rule 4).

Every pool is an ORDERED tuple. The roster walks a pool in order from a
seeded offset, so a cap or a collision is repaired by "take the next item",
deterministically.
"""

from __future__ import annotations

# --------------------------------------------------------------------- Jel

JEL_FIRST: tuple[str, ...] = (
    "Nesh", "Deeka", "Xal", "Keshu", "Im", "Haj", "Am", "Deesh", "Tsono",
    "Nurwul", "Ux", "Ohl", "Kaska", "Neexa", "Ssa", "Vees", "Teeb", "Wuleen",
    "Jeen", "Xuth", "Mee", "Okan", "Heita", "Sal", "Bux", "Reeh", "Zaxi",
    "Guul", "Ninx", "Hassk",
)

JEL_SECOND: tuple[str, ...] = (
    "Meen", "Kaya", "Ei", "Ra", "Xuhil", "Teeba", "Sei", "Nakka", "Tei",
    "Wai", "Vei", "Kai", "Ossa", "Rekh", "Jei", "Nasha", "Leel", "Hassa",
    "Tuja", "Xeek", "Kanna", "Moro", "Seesh", "Vakka", "Yuul", "Duun",
    "Neel", "Shaal", "Ozzu", "Katta",
)


def jel_pool() -> tuple[str, ...]:
    """Every first-second combination, in a fixed diagonal order.

    The diagonal walk (offset by the row) keeps consecutive names from
    sharing a stem, so a place that draws three in a row does not read as
    one family.
    """
    n = len(JEL_SECOND)
    out: list[str] = []
    for step in range(n):
        for i, first in enumerate(JEL_FIRST):
            out.append(f"{first}-{JEL_SECOND[(i + step) % n]}")
    return tuple(out)


# ------------------------------------------------- translated Tamrielic

#: Authored whole clauses, per region idiom. 20+ each = 60+ authored names,
#: walked before any composed name is used.
TRANSLATED_AUTHORED: dict[str, tuple[str, ...]] = {
    "hist-heartland": (
        "Answers-In-Season", "Keeps-The-Quiet", "Waits-It-Out",
        "Counts-The-Turnings", "Remembers-The-Drought", "Waits-For-The-Word",
        "Speaks-When-Asked", "Repeats-The-Ruling", "Gives-The-Second-Answer",
        "Sits-Out-The-Argument", "Tends-The-Old-Grievance",
        "Names-The-Trouble", "Learns-It-Twice", "Stands-For-The-Absent",
        "Weighs-The-Offering", "Sleeps-Through-It",
        "Refuses-The-Shorter-Road", "Holds-The-Third-Opinion",
        "Marks-The-Year-Badly", "Lets-The-Matter-Rest",
    ),
    "saxhleel-coast": (
        "Reaches-The-Low-Branch", "Two-Marks-One-Rope",
        "Speaks-Below-The-Water", "Ties-It-Again", "Swims-Before-Light",
        "Finds-The-Other-Bank", "Pulls-Against-The-Ebb",
        "Counts-Hulls-By-Sound", "Knows-Where-It-Shoals",
        "Runs-The-Line-Out", "Dives-For-The-Anchor", "Comes-Back-Wet",
        "Walks-The-Shallow-Way", "Holds-The-Thwart", "Lifts-The-Full-Trap",
        "Cuts-The-Fouled-Net", "Reads-The-Weather-Wrong",
        "Waits-Out-The-Tide", "Sings-Across-The-Channel",
        "Carries-Two-Loads",
    ),
    "mercantile-coast": (
        "Prices-It-Fairly", "Signs-For-The-Cargo", "Keeps-The-Second-Ledger",
        "Takes-The-Short-Weight", "Opens-Before-Dawn", "Sells-It-Twice",
        "Argues-The-Tally", "Meets-Every-Hull", "Holds-The-Key-To-The-Shed",
        "Counts-Out-Loud", "Trades-In-Small-Coin", "Knows-The-Whole-Quay",
        "Writes-It-Down-Later", "Closes-The-Account", "Hires-By-The-Day",
        "Pays-On-Landing", "Loses-Nothing-Twice", "Buys-The-Damp-Lot",
        "Names-Her-Own-Price", "Waits-For-The-Season-Boat",
    ),
}

#: Composed fallback, used only once an idiom's authored clauses are spent.
#: Each verb carries ITS OWN objects: a blind verb x object cross-product
#: produces clauses no translator would write ("Prices-The-Season-Price",
#: "Meets-The-Damp-Lot", "Swims-The-Cold-Morning"), and a translated name is
#: meant to read as a literal translation, plain or faintly comic.
TRANSLATED_COMPOSED: dict[str, tuple[tuple[str, tuple[str, ...]], ...]] = {
    "hist-heartland": (
        ("Keeps", ("The-Long-Season", "The-Old-Count", "The-Third-Seat",
                   "The-Quiet-Room", "The-Winter-Store")),
        ("Holds", ("The-Hard-Year", "The-Empty-Seat", "The-Last-Turning",
                   "The-Small-Debt", "The-Old-Boundary")),
        ("Answers", ("The-Second-Question", "Late", "For-The-House",
                     "Only-Once", "The-Third-Time")),
        ("Tends", ("The-Slow-Fire", "The-Sick-Guar", "The-Long-Row",
                   "The-Old-Boundary", "The-Small-Debt")),
        ("Remembers", ("The-Hard-Year", "The-Wrong-Year", "Every-Debt",
                       "The-Old-Argument", "The-Long-Season")),
        ("Carries", ("The-Word", "The-Small-Debt", "The-Second-Answer",
                     "The-Long-Season", "The-Old-Argument")),
        ("Refuses", ("The-Second-Helping", "To-Hurry", "The-Last-Word",
                     "The-Easy-Answer", "The-Third-Seat")),
        ("Weighs", ("Every-Word", "The-Small-Debt", "The-Whole-Year",
                    "Both-Answers", "The-Late-Offering")),
        ("Marks", ("The-Turnings", "Every-Absence", "The-Old-Boundary",
                   "The-Quiet-Day", "The-Wrong-Year")),
        ("Names", ("The-Absent", "The-Wrong-Child", "The-Last-Turning",
                   "The-Second-Heir", "The-Late-Guest")),
    ),
    "saxhleel-coast": (
        ("Reaches", ("The-Far-Bank", "The-Bottom", "The-Other-Boat",
                     "The-Deep-Run", "The-Shore-Last")),
        ("Pulls", ("The-Wet-Rope", "Two-Traps", "The-Boat-In",
                   "The-Full-Net", "Hard")),
        ("Swims", ("The-Night-Channel", "Under-The-Hull", "The-Deep-Run",
                   "The-Channel-Twice", "At-Slack-Water")),
        ("Ties", ("The-Wet-Rope", "The-Loose-Plank", "The-Bad-Knot",
                  "The-Boat-Short", "Two-Ropes")),
        ("Finds", ("The-Lost-Trap", "The-Bent-Pole", "The-Way-Back",
                   "The-Shallow-Way", "Nothing")),
        ("Runs", ("The-Night-Channel", "The-Long-Shore", "The-Trap-Line",
                  "Ahead-Of-The-Tide", "The-Boat-Aground")),
        ("Lifts", ("The-Wet-Rope", "The-Empty-Trap", "The-Stern-Clear",
                   "The-Heavy-End", "Two-Traps")),
        ("Cuts", ("The-Wet-Rope", "The-Loose-Plank", "The-Trap-Line",
                  "The-Anchor-Free", "The-Fouled-Line")),
        ("Walks", ("The-Low-Tide", "The-Plank-Slowly", "The-Long-Way-Round",
                   "The-Boards-At-Night", "The-Far-Shore")),
        ("Dives", ("For-The-Lost-Trap", "The-Deep-Run", "Without-A-Rope",
                   "At-Slack-Water", "For-The-Dropped-Knife")),
    ),
    "mercantile-coast": (
        ("Prices", ("The-Damp-Lot", "The-Late-Hull", "The-Whole-Consignment",
                    "The-Sealed-Crate", "The-Salvage", "The-Season-Boat",
                    "The-Short-Weight")),
        ("Signs", ("For-The-Crate", "For-The-Late-Hull", "For-Nobody",
                   "For-The-Whole-Lot", "For-The-Second-Time",
                   "For-The-Master", "For-The-Damp-Lot")),
        ("Counts", ("The-Sacks", "The-Hulls", "The-Short-Weight", "Twice",
                    "The-Crates-Again", "The-Day-Wage", "The-Empty-Shed")),
        ("Sells", ("The-Damp-Lot", "The-Salvage", "The-Late-Hull",
                   "Before-Landing", "The-Empty-Crate", "The-Last-Sack",
                   "The-Whole-Consignment")),
        ("Opens", ("Before-Dawn", "The-Sealed-Crate", "The-Shed", "Late",
                   "The-Second-Shed", "The-Wrong-Crate", "The-Books")),
        ("Argues", ("The-Quay-Rent", "The-Day-Wage", "Every-Price",
                    "With-The-Clerk", "The-Weight", "The-Toll",
                    "The-Late-Landing")),
        ("Hires", ("The-Same-Crew", "Too-Many", "Cheap", "By-The-Hull",
                   "The-Wrong-Boat", "Nobody", "By-The-Season")),
        ("Pays", ("In-Small-Coin", "The-Quay-Rent", "Late", "The-Day-Wage",
                  "The-Toll", "In-Salt", "The-Crew-First")),
        ("Buys", ("The-Damp-Lot", "The-Whole-Consignment", "The-Salvage",
                  "Cheap", "The-Late-Hull", "The-Second-Lot",
                  "The-Empty-Shed")),
        ("Meets", ("The-Season-Boat", "The-Late-Hull", "The-Tide",
                   "The-Clerk", "Nobody", "The-Last-Boat", "Every-Tide")),
    ),
}

TRANSLATED_IDIOMS = tuple(TRANSLATED_AUTHORED)


def translated_pool(idiom: str) -> tuple[str, ...]:
    authored = TRANSLATED_AUTHORED[idiom]
    rows = TRANSLATED_COMPOSED[idiom]
    depth = max(len(objects) for _, objects in rows)
    composed = tuple(
        f"{verb}-{objects[step]}"
        for step in range(depth)
        for verb, objects in rows
        if step < len(objects)
    )
    seen: set[str] = set()
    out: list[str] = []
    for name in authored + composed:
        if name not in seen:
            seen.add(name)
            out.append(name)
    return tuple(out)


# ------------------------------------------------------------------ epithets

EPITHET_POOL: tuple[str, ...] = (
    "Old Nusa", "One-Scale", "Salt-Teeth", "Half-Tail", "Bright-Frill",
    "Short-Claw", "Wet Jeeba", "Copper-Crest", "Three-Rings", "Quiet Uxa",
    "Dry-Foot", "Bent-Spine", "Pale-Eye", "Long-Shanks", "Two-Boats",
    "Black-Tongue Vees", "Rope-Hand", "Split-Frill", "Low Ossu",
    "Chain-Mark", "Green Teeba", "No-Debt", "Hook-Thumb", "Slow Xeekh",
    "Hard-Water", "Broke-Oar", "Knife Meeka", "Mud-Cap", "Six-Hulls",
    "Cold Nakka", "Nine-Marks", "Last-Ashore",
)

# ------------------------------------------------------------------ Imperial

#: Latinate given names are sexed; the nomen is not.
IMPERIAL_PRAENOMINA: dict[str, tuple[str, ...]] = {
    "male": ("Aulus", "Iulus", "Marcus", "Titus", "Decius", "Gaius",
             "Publius", "Quintus", "Varro", "Rufus", "Sextus", "Gnaeus"),
    "female": ("Lucia", "Antonia", "Sergia", "Valeria", "Cassia", "Fabia",
               "Aelia", "Livia", "Tullia", "Severa", "Julia", "Marcina"),
}

IMPERIAL_NOMINA: tuple[str, ...] = (
    "Pell", "Cato", "Martius", "Varinius", "Sextilis", "Loryn", "Draco",
    "Nerva", "Rufinus", "Calvus", "Maro", "Tarquinius", "Venatius",
    "Otho", "Sabinus", "Gemellus", "Vibius", "Camillus", "Faustus",
    "Corvinus",
)

# -------------------------------------------------------------------- Dunmer

DUNMER_GIVEN: dict[str, tuple[str, ...]] = {
    "male": ("Andas", "Serven", "Faryn", "Dalvyn", "Ralas", "Neras",
             "Milvyn", "Dovres", "Velas", "Athyn", "Drerys", "Beden"),
    "female": ("Dravyna", "Tavynu", "Sedyni", "Arara", "Galsa", "Nilyne",
               "Uvoo", "Llarvi", "Fathasa", "Vedelea", "Dalyne", "Ravela"),
}

DUNMER_HOUSES: tuple[str, ...] = (
    "Andalen", "Hlaalu", "Dres", "Sadri", "Sarethi", "Indoril", "Redoran",
    "Llethri", "Telvayn", "Ulen", "Ienith", "Omalen", "Uvirith", "Brolas",
    "Alenim", "Maryon", "Dalomax", "Hlervu", "Rethandus", "Sendas",
)

# ------------------------------------------------------------------- Khajiit

#: Ta'agra prefixes carry sex: Dar', Dro', Ri', J', S' and Ra' are male
#: honorifics, so the pool is keyed by sex like the other foreign pools.
KHAJIIT_BY_SEX: dict[str, tuple[str, ...]] = {
    "male": ("Ra'Zhad", "S'Rasha", "J'Kier", "Dro'Shava", "Ri'Dasha",
             "M'Rishi", "Dar'Jeen", "S'Tabi", "Ri'Sakka", "Khazir",
             "Ma'Zeen", "Ra'Meel", "J'Sarra"),
    "female": ("Ahnjazzi", "Kiseema", "Zabhila", "Abhuki", "Nisuzi",
               "Ma'ren", "Ta'Juna", "Sugar-Foot Khiri", "Ahkari", "Tsanji"),
}

#: Both, in one tuple, for the pool-floor check.
KHAJIIT_POOL: tuple[str, ...] = KHAJIIT_BY_SEX["male"] + KHAJIIT_BY_SEX["female"]

# ------------------------------------------------------------- other races

OTHER_POOLS: dict[str, dict[str, tuple[str, ...]]] = {
    "nord": {
        "male": ("Halvar", "Bjolfr", "Thorvald", "Hrolf", "Egil", "Steinar",
                 "Ulfgar", "Jorund"),
        "female": ("Gunda", "Sigrun", "Aslaug", "Inga", "Rannveig", "Frida",
                   "Hilde", "Solveig"),
    },
    "breton": {
        "male": ("Lucien Marcel", "Perrin Vaudois", "Gaspar Millet",
                 "Edouard Arnaise", "Thierry Foucart", "Olivier Renne",
                 "Armand Cheval", "Denis Vallon"),
        "female": ("Aurine Dorard", "Cindel Rouillard", "Jeanne Laval",
                   "Simone Cadiz", "Mireille Duval", "Colette Basset",
                   "Blanche Ferrier", "Odette Maurin"),
    },
    "bosmer": {
        "male": ("Nerion", "Fanoir", "Dulian", "Yeth Camoran", "Rindel",
                 "Eneiro", "Galdor", "Pinarus"),
        "female": ("Elsynia", "Aerin", "Nirwe", "Faunwe", "Beldrose",
                   "Milwe", "Anwen", "Tirwen"),
    },
    "altmer": {
        "male": ("Calindil", "Nilaendril", "Sinderion", "Varondil",
                 "Hilmorion", "Earille", "Culantil", "Ancarion"),
        "female": ("Nerusaire", "Alenwen", "Eromaire", "Tandilwe",
                   "Elenglynn", "Sirinwe", "Ardaire", "Niralore"),
    },
    "orc": {
        "male": ("Bolak gro-Rush", "Dumbuk gro-Bolak", "Shagrol gro-Kurz",
                 "Ghorbash gro-Dul", "Durz gro-Shub", "Mogak gro-Ulm",
                 "Lurz gro-Khazh", "Braga gro-Yath"),
        "female": ("Mahk gra-Nagol", "Urzoga gra-Dush", "Batul gra-Mor",
                   "Yatul gra-Bol", "Snak gra-Bura", "Shel gra-Dum",
                   "Orbuma gra-Kazh", "Rogmesh gra-Lum"),
    },
    "redguard": {
        "male": ("Samir Assan", "Hakim Solus", "Rashan Dree", "Jaffe Wayrest",
                 "Omar Sadiq", "Kassim Verro", "Tahir Nabhan", "Idris Sallah"),
        "female": ("Dahlia Rashid", "Nadia al-Kirat", "Zaynab Tamrith",
                   "Lamiya Sarad", "Suraya Kaan", "Firuza Belen",
                   "Amira Josal", "Hadiya Rell"),
    },
}

FORMS = ("jel", "translated", "epithet", "chosen", "foreign")

#: Imagery words that may appear at most once inside one place (quests 35 54).
IMAGERY_WORDS = ("reed", "root", "water", "stone", "shadow", "blood", "bone",
                 "egg", "mud", "salt")


def _paired(given: tuple[str, ...], family: tuple[str, ...]) -> tuple[str, ...]:
    n = len(family)
    return tuple(f"{given[i]} {family[(i + s) % n]}"
                 for s in range(n) for i in range(len(given)))


def imperial_pool(sex: str) -> tuple[str, ...]:
    return _paired(IMPERIAL_PRAENOMINA[sex], IMPERIAL_NOMINA)


def dunmer_pool(sex: str) -> tuple[str, ...]:
    return _paired(DUNMER_GIVEN[sex], DUNMER_HOUSES)


def chosen_pool() -> tuple[str, ...]:
    """Chosen names: a claim, stated flat (quests 35 54)."""
    return (
        "Never-Sold", "Owes-Nothing", "Came-Back", "Names-Herself",
        "Free-Of-It", "Chose-The-Water", "Walks-Out", "Kept-The-Name",
        "Not-That-One", "Stands-Unentered", "Begins-Again", "Paid-In-Full",
        "Left-The-Ledger", "Took-The-Other-Road", "Answers-To-This",
        "Burnt-The-Bond",
    )
