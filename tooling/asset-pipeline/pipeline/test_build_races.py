"""Regression coverage for race-build acceptance checks."""

from __future__ import annotations

import unittest

import json

from .build_races import RACE_RECORD_IDS, _appearance, _load_roster, validate_facegen_summary
from .models import CONFIG, load_races


def valid_summary(*, detail: bool = True) -> dict:
    return {
        "faceGenRegistration": {"registrationVertices": 898},
        "faceGenNeckSeam": {
            "headVertices": 29,
            "bodyVertices": 26,
            "maxDistanceAfter": 1.2e-6,
        },
        "faceGenTintBakes": [{
            "mesh": "MaleHeadKhajiit" if not detail else "MaleHeadNord",
            "material": "FaceGenHead",
            "usesDetailMap": detail,
        }],
        "hairMeshes": ["BrowsMaleHumanoid09", "HairMaleNord11"],
        "browMeshes": ["BrowsMaleHumanoid09"],
        "headPartAlphaModes": {
            "materials": ["BrowsMaleHumanoid09.Mat", "HairMaleNord11.Mat"],
            "masked": 2,
            "alphaCutoff": 0.5,
        },
    }


class FaceGenBuildContractTests(unittest.TestCase):
    def test_accepts_a_closed_tinted_full_surface_head(self):
        validate_facegen_summary("nord", valid_summary())

    def test_accepts_beast_tint_without_a_humanoid_detail_map(self):
        validate_facegen_summary("khajiit", valid_summary(detail=False))

    def test_rejects_the_old_mouth_loop_registration(self):
        summary = valid_summary()
        summary["faceGenRegistration"]["registrationVertices"] = 12
        with self.assertRaisesRegex(RuntimeError, "full-surface"):
            validate_facegen_summary("nord", summary)

    def test_rejects_an_open_neck_or_unbaked_head_tint(self):
        summary = valid_summary()
        summary["faceGenNeckSeam"]["maxDistanceAfter"] = 0.02
        summary["faceGenTintBakes"] = []
        with self.assertRaisesRegex(RuntimeError, "seam remains open.*FaceTint"):
            validate_facegen_summary("nord", summary)

    def test_rejects_a_brow_outside_the_hair_tint_path(self):
        summary = valid_summary()
        summary["hairMeshes"] = ["HairMaleNord11"]
        with self.assertRaisesRegex(RuntimeError, "brows were not classified"):
            validate_facegen_summary("nord", summary)

    def test_rejects_blended_head_part_cards(self):
        summary = valid_summary()
        summary["headPartAlphaModes"]["masked"] = 1
        with self.assertRaisesRegex(RuntimeError, "not alpha-tested"):
            validate_facegen_summary("nord", summary)


if __name__ == "__main__":
    unittest.main()


class RosterShapeTests(unittest.TestCase):
    """Decision 0054: ten races, two sexes, twenty builds -- and every build has
    a config to build it from. A roster naming a build with no appearance file
    fails three minutes into a Blender run otherwise."""

    def test_playable_roster_is_the_full_race_by_sex_product(self):
        roster = _load_roster("skyrim-playable")
        races = load_races(roster["races"])
        self.assertEqual(len(races), 10)
        self.assertEqual(
            sorted(roster["builds"]),
            sorted(f"{race}-{sex}" for race in races for sex in ("male", "female")),
        )
        self.assertEqual(set(races), set(RACE_RECORD_IDS))

    def test_every_roster_build_has_a_matching_appearance(self):
        for roster_id in ("skyrim-playable", "sheet-variants"):
            roster = _load_roster(roster_id)
            races = load_races(roster["races"])
            self.assertEqual(len(roster["builds"]), 20, roster_id)
            for build_id in roster["builds"]:
                appearance = _appearance(build_id)
                self.assertEqual(appearance["id"], build_id)
                self.assertIn(appearance["race"], races)
                self.assertIn(appearance["sex"], ("male", "female"))
                self.assertTrue((CONFIG / "bodies" / f"{appearance['body']}.json").exists())
                self.assertTrue(appearance["body"].startswith(appearance["sex"]))

    def test_reference_builds_name_one_build_per_sex(self):
        roster = _load_roster("skyrim-playable")
        self.assertEqual(set(roster["referenceBuilds"]), {"male", "female"})
        for sex, build_id in roster["referenceBuilds"].items():
            self.assertIn(build_id, roster["builds"])
            self.assertEqual(_appearance(build_id)["sex"], sex)

    def test_sheet_variants_are_never_shipped_as_playable(self):
        sheet = _load_roster("sheet-variants")
        playable = _load_roster("skyrim-playable")
        self.assertFalse(set(sheet["builds"]) & set(playable["builds"]))
        self.assertNotEqual(sheet["raceOutputDir"], playable["raceOutputDir"])
        self.assertFalse(sheet["referenceBuilds"])

    def test_a_measured_neck_seam_can_still_fail_the_gate(self):
        """The measurement replaced a hardcoded 0.0 (decision 0052). Prove the
        gate reacts to the value it is given in both directions."""
        summary = valid_summary()
        summary["faceGenNeckSeam"]["maxDistanceAfter"] = 9e-6
        validate_facegen_summary("nord", summary)
        summary["faceGenNeckSeam"]["maxDistanceAfter"] = 1.1e-5
        with self.assertRaisesRegex(RuntimeError, "seam remains open"):
            validate_facegen_summary("nord", summary)
