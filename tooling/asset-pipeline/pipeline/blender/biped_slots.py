"""Reading Skyrim biped slots off pyNifly's dismember vertex groups.

Shared by ``build_character.py`` (which body mesh occupies which slot) and
``build_armour.py`` (which slots a worn piece covers, and therefore hides).
The two answers are compared against each other at runtime, so they have to be
produced by the same rule — this module is that rule, imported by both rather
than transcribed twice.
"""

import re

#: pyNifly writes each BSDismemberSkinInstance partition as a vertex group named
#: ``SBP_<raw id>_<NAME>``, using the raw id from the NIF.
BIPED_SLOT = re.compile(r"^SBP_(\d+)_", re.IGNORECASE)

#: Skyrim's "section cap" partitions mark the same body region as their base
#: slot: 130 caps the head, 141 the long hair, 143 the ears. Folding them onto
#: the base slot is right; doing it with ``% 100`` was not. ``% 100`` also
#: folded 230 (NECK) onto 30 (HEAD), so a partition that is not a wearable slot
#: at all was being reported as one — and on the armour side that made a neck
#: cap read as a head cover.
SECTION_CAPS = {130: 30, 131: 31, 141: 41, 142: 42, 143: 43, 150: 50}

#: Partitions that describe geometry rather than a slot anything can be worn in.
#: 230 is the neck cap: no armour declares it, so reporting it would only let a
#: hide rule match something no piece of art ever claims.
NON_SLOT_PARTITIONS = {230}

#: The torso. pyNifly hands a shape with a plain ``NiSkinInstance`` — no
#: dismember data at all — a synthetic ``SBP_32_BODY`` group, because 32 is
#: nifly's Skyrim-era default. Skyrim's eyes, mouth and brow meshes are exactly
#: that: unpartitioned. Reading their default back as "torso" is what made a
#: cuirass hide a character's face.
TORSO_SLOT = 32


def raw_partitions(vertex_groups):
    """Every dismember partition id named by a mesh's vertex groups."""
    return {
        int(match.group(1))
        for group in vertex_groups
        for match in [BIPED_SLOT.match(group.name)] if match
    }


def fold_partitions(raw):
    """Fold raw partition ids onto the wearable biped slots they mark."""
    return {SECTION_CAPS.get(part, part) for part in set(raw) - NON_SLOT_PARTITIONS}
