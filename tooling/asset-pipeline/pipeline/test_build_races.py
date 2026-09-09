"""Regression coverage for race-build acceptance checks."""

from __future__ import annotations

import unittest

from .build_races import validate_facegen_summary


def valid_summary(*, detail: bool = True) -> dict:
    return {
        "faceGenRegistration": {"registrationVertices": 898},
        "faceGenNeckSeam": {
            "headVertices": 29,
            "bodyVertices": 26,
            "maxDistanceAfter": 0.0,
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
