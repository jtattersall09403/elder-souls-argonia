"""The armour build's contracts: per-sex paths, weight pairs, and the neck gate.

The neck gate is the one that matters. Four checks in this repo have now
shipped unable to fail on their own defect, 0055's collar gate among them, so
these tests exist to watch this one go red — and they are written against the
*exact* shape the Blender stage reports, not a convenient paraphrase of it.
"""

import json
import unittest


from .build_armour import (
    NECK_RING_ON_NECK,
    SEXES,
    mesh_pair,
    resolve_set,
    validate_neck_rings,
)
from .models import CONFIG


def job(item_id="iron-cuirass", sex="female", seam=True):
    return {"id": f"{item_id}-{sex}", "item_id": item_id, "sex": sex,
            "close_neck_seam": seam}


def against(male_0, male_1, female_0, female_1):
    return {
        "male_0": {"mean": male_0, "max": male_0},
        "male_1": {"mean": male_1, "max": male_1},
        "female_0": {"mean": female_0, "max": female_0},
        "female_1": {"mean": female_1, "max": female_1},
    }


def measurement_entry(sex, weight, comparisons):
    return {"neckRing": measurement(weight, comparisons, sex)}


def measurement(weight, comparisons, sex="female"):
    return {
        "collar": "measured", "referenceBody": sex, "sex": sex,
        "morphed": False,
        "weights": {weight: {
            "referenceBody": f"{sex}_{weight}", "vertices": 26,
            "ringRadius": 0.443796, "ringHeight": 11.17,
            "neckRadius": 0.386221, "neckMaxRadius": 0.443796,
            "maxDistance": comparisons.get(f"{sex}_{weight}", {}).get("max", 1.0),
            "against": comparisons,
        }},
    }


class NeckRingGateTests(unittest.TestCase):
    """Four checks in this repo have now shipped unable to fail on their own
    defect, 0055's collar gate among them. These watch this one go red, and the
    numbers are the ones the build actually measured."""

    def test_a_ring_copied_from_its_own_wearer_passes(self):
        """The shipped case: the female iron cuirass embeds femalebody_1's neck
        loop, so it is 0 from its own reference and far from every other."""
        built = {"iron-cuirass-female": {
            "neckRing": measurement("1", against(0.244462, 0.301, 0.19, 0.0))}}
        validate_neck_rings([job()], built)

    def test_a_male_mesh_on_a_female_wearer_is_rejected(self):
        """The defect that shipped, reproduced on purpose by pointing the female
        iron cuirass at the male mesh: the ring then lies on male_1 to 1e-6 and
        sits 0.244 off the female neck it is worn on."""
        built = {"iron-cuirass-female": {
            "neckRing": measurement("1", against(0.182615, 0.000001, 0.19, 0.244462))}}
        with self.assertRaisesRegex(RuntimeError, "copy of male_1"):
            validate_neck_rings([job()], built)

    def test_a_piece_blended_to_the_wrong_weight_is_rejected(self):
        """The other half a single-reference gate cannot see. A _0 target that
        still measures as _1 geometry is a piece that does not shrink with a
        thin wearer, and the head parts from it as the weight comes down."""
        built = {"iron-cuirass-female": {
            "neckRing": measurement("0", against(0.31, 0.29, 0.04, 0.0))}}
        with self.assertRaisesRegex(RuntimeError, "copy of female_1"):
            validate_neck_rings([job()], built)

    def test_an_authored_opening_is_not_condemned_by_a_body_it_is_not(self):
        """Eight of the nine vanilla cuirasses close the neck with their own
        raised opening rather than an embedded copy of the body's. A neck
        tapers, so such a ring is legitimately wider and higher than the body's
        neck ring, and a gate that compares the two condemns the whole set."""
        built = {"iron-cuirass-female": {
            "neckRing": measurement("1", against(0.3, 0.31, 0.22, 0.18))}}
        validate_neck_rings([job()], built)

    def test_both_sexes_wearing_the_same_ring_is_rejected(self):
        """Six pieces shipped built from one mesh for everybody."""
        same = against(0.24, 0.0, 0.19, 0.24)
        built = {"iron-cuirass-male": measurement_entry("male", "1", same),
                 "iron-cuirass-female": measurement_entry("female", "1", same)}
        jobs = [job(sex="male"), job(sex="female")]
        with self.assertRaisesRegex(RuntimeError, "one sex is wearing the other"):
            validate_neck_rings(jobs, built)

    def test_a_morph_target_that_does_not_move_is_rejected(self):
        ring = measurement("1", against(0.24, 0.3, 0.19, 0.0))
        ring["morphed"] = True
        ring["weights"]["0"] = dict(ring["weights"]["1"])
        ring["weights"]["0"]["referenceBody"] = "female_0"
        ring["weights"]["0"]["against"] = against(0.24, 0.3, 0.0009, 0.3)
        with self.assertRaisesRegex(RuntimeError, "not blending"):
            validate_neck_rings([job()], {"iron-cuirass-female": {"neckRing": ring}})

    def test_a_missing_measurement_is_a_failure_not_a_pass(self):
        with self.assertRaisesRegex(RuntimeError, "no neck-ring measurement"):
            validate_neck_rings([job()], {"iron-cuirass-female": {}})

    def test_a_measurement_with_nothing_to_compare_against_is_a_failure(self):
        built = {"iron-cuirass-female": {"neckRing": measurement("1", {})}}
        with self.assertRaisesRegex(RuntimeError, "no reference comparison"):
            validate_neck_rings([job()], built)

    def test_a_piece_with_no_neck_is_not_checked(self):
        validate_neck_rings([job("iron-boots", seam=False)], {})

    def test_the_copy_threshold_is_tighter_than_any_real_difference(self):
        """"Is a copy of" has to be tight enough that the smallest genuine
        difference in the set — 0.048 units between the female _0 and _1 necks —
        cannot be mistaken for one."""
        self.assertLess(NECK_RING_ON_NECK, 0.048 / 100)


class ArmourConfigTests(unittest.TestCase):
    def test_every_piece_declares_a_mesh_for_every_sex(self):
        items = resolve_set("armour", None)["items"]
        self.assertEqual(len(items), 35)
        for item in items:
            self.assertEqual(sorted(item["meshes"]), sorted(SEXES), item["id"])
            for sex in SEXES:
                base = item["meshes"][sex]
                self.assertFalse(base.endswith(("_0", "_1", ".nif")), f"{item['id']} {sex}")

    def test_no_piece_is_built_from_the_other_sex_mesh(self):
        """Six pieces shipped built from the wrong sex's mesh, because the
        builder inferred sex from the path and Bethesda's conventions do not
        agree with each other. The paths are declared now; this is the check
        that they were declared *right*, and it reads the convention off the
        mesh rather than trusting the id."""
        def looks_female(path: str) -> bool:
            directory, name = path.rsplit("/", 1)
            return directory.endswith(("/f", "/female")) or name.endswith("f")

        items = resolve_set("armour", None)["items"]
        for item in items:
            male, female = item["meshes"]["male"], item["meshes"]["female"]
            self.assertNotEqual(male, female, item["id"])
            self.assertTrue(looks_female(female), f"{item['id']}: {female} is not a female mesh")
            # The half that actually shipped wrong: three orcish pieces and two
            # daedric ones had the female mesh in the male slot.
            self.assertFalse(looks_female(male), f"{item['id']}: {male} is a female mesh")

    def test_the_config_on_disk_matches_what_the_resolver_requires(self):
        raw = json.loads((CONFIG / "armour" / "armour.json").read_text())
        self.assertEqual(raw["bodies"], ["male", "female"])
        self.assertTrue(all("nif" not in item for item in raw["items"]))


class MeshPairTests(unittest.TestCase):
    class FakeArchive:
        def __init__(self, names):
            self.names = set(names)

        def contains(self, name):
            return name in self.names

    def test_a_weight_pair_ships_both_halves(self):
        archive = self.FakeArchive(["a/b_0.nif", "a/b_1.nif"])
        self.assertEqual(mesh_pair(archive, "a/b"), {"0": "a/b_0.nif", "1": "a/b_1.nif"})

    def test_a_single_authored_mesh_is_not_an_error(self):
        """Both iron helmets and both orcish helmets are authored once, with no
        weight variant. That is a piece with no morph target, not a broken
        pair, and refusing it would refuse four shipped helmets."""
        archive = self.FakeArchive(["a/helmet.nif"])
        self.assertEqual(mesh_pair(archive, "a/helmet"), {"1": "a/helmet.nif"})

    def test_a_base_that_resolves_to_nothing_is_refused(self):
        with self.assertRaises(KeyError):
            mesh_pair(self.FakeArchive([]), "a/missing")


if __name__ == "__main__":
    unittest.main()
