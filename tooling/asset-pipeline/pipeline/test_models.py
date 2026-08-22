"""Pure regression coverage for declarative animation config validation."""

from __future__ import annotations

import unittest

from .models import (
    ExportedContinuityCheck,
    QuaternionKeyRemoval,
    parse_curve_conditioning,
)

CONTINUITY = [{
    "bone": "NPC Hand [Hnd].L",
    "startTime": 0.0666667,
    "endTime": 0.1666667,
    "maxAngularStepDegrees": 8.0,
}]


def conditioning(**overrides):
    """A minimal valid block: a removal plus the proof it must produce."""
    return {
        "removeQuaternionKeys": [{
            "bone": "NPC Hand [Hnd].L",
            "sourceTime": 0.1333333,
        }],
        "exportedContinuity": CONTINUITY,
        **overrides,
    }


class CurveConditioningConfigTests(unittest.TestCase):
    def test_resolves_a_removal_with_its_exported_continuity_proof(self):
        self.assertEqual(
            parse_curve_conditioning("ROLL", conditioning()),
            (
                (QuaternionKeyRemoval("NPC Hand [Hnd].L", 0.1333333),),
                (ExportedContinuityCheck("NPC Hand [Hnd].L", 0.0666667, 0.1666667, 8.0),),
            ),
        )

    def test_absent_conditioning_resolves_to_no_edits(self):
        self.assertEqual(parse_curve_conditioning("IDLE", None), ((), ()))

    def test_rejects_unknown_conditioning_operations(self):
        with self.assertRaisesRegex(ValueError, "unsupported keys"):
            parse_curve_conditioning("ROLL", {"smoothEverything": True})

    def test_rejects_a_malformed_removal(self):
        with self.assertRaisesRegex(ValueError, "exactly bone and sourceTime"):
            parse_curve_conditioning("ROLL", conditioning(
                removeQuaternionKeys=[{"bone": "NPC Hand [Hnd].L"}],
            ))

    def test_rejects_boolean_or_non_finite_source_times(self):
        for source_time in (True, float("nan"), float("inf"), -0.1):
            with self.subTest(source_time=source_time):
                with self.assertRaisesRegex(ValueError, "finite non-negative"):
                    parse_curve_conditioning("ROLL", conditioning(
                        removeQuaternionKeys=[{
                            "bone": "NPC Hand [Hnd].L",
                            "sourceTime": source_time,
                        }],
                    ))

    def test_rejects_duplicate_removals(self):
        removal = {"bone": "NPC Hand [Hnd].L", "sourceTime": 0.1333333}
        with self.assertRaisesRegex(ValueError, "duplicates"):
            parse_curve_conditioning("ROLL", conditioning(
                removeQuaternionKeys=[removal, dict(removal)],
            ))

    def test_rejects_a_removal_with_no_exported_proof(self):
        """A source edit nobody measures in the render is not evidence."""
        block = conditioning()
        del block["exportedContinuity"]
        with self.assertRaisesRegex(ValueError, "needs a matching exportedContinuity"):
            parse_curve_conditioning("ROLL", block)

    def test_rejects_continuity_on_an_unconditioned_bone(self):
        with self.assertRaisesRegex(ValueError, "unconditioned bone"):
            parse_curve_conditioning("ROLL", conditioning(
                exportedContinuity=[{**CONTINUITY[0], "bone": "NPC Hand [Hnd].R"}],
            ))

    def test_rejects_a_malformed_continuity_entry(self):
        with self.assertRaisesRegex(ValueError, "must contain exactly"):
            parse_curve_conditioning("ROLL", conditioning(
                exportedContinuity=[{"bone": "NPC Hand [Hnd].L"}],
            ))

    def test_rejects_an_inverted_or_empty_continuity_window(self):
        for start, end in ((0.2, 0.1), (0.1, 0.1)):
            with self.subTest(start=start, end=end):
                with self.assertRaisesRegex(ValueError, "endTime must be after"):
                    parse_curve_conditioning("ROLL", conditioning(
                        exportedContinuity=[{
                            **CONTINUITY[0], "startTime": start, "endTime": end,
                        }],
                    ))

    def test_rejects_a_non_positive_angular_limit(self):
        with self.assertRaisesRegex(ValueError, "maxAngularStepDegrees must be positive"):
            parse_curve_conditioning("ROLL", conditioning(
                exportedContinuity=[{**CONTINUITY[0], "maxAngularStepDegrees": 0}],
            ))


if __name__ == "__main__":
    unittest.main()
