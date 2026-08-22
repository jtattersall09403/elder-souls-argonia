"""Pure regression coverage for the structural character-GLB validator."""

from __future__ import annotations

import math
import struct
import unittest
from types import SimpleNamespace

from .models import ExportedContinuityCheck, QuaternionKeyRemoval
from .validate import (
    loop_animation_timeline_issues,
    quaternion_key_conditioning_issues,
)


def fixture(*, run_start: float = 0, run_end: float = 0.6333333) -> tuple[dict, list, dict]:
    gltf = {
        "accessors": [
            {"min": [run_start], "max": [run_end]},
            # One-shots retain their established frame-1 source timestamp.
            {"min": [0.0333333], "max": [1.3333333]},
        ],
        "animations": [
            {"name": "RUN", "samplers": [{"input": 0}, {"input": 0}]},
            {"name": "LIGHT_1", "samplers": [{"input": 1}]},
        ],
    }
    specs = [
        SimpleNamespace(semantic="RUN", looping=True),
        SimpleNamespace(semantic="LIGHT_1", looping=False),
    ]
    manifest = {"animations": {
        "RUN": {"sourceDuration": 0.6333},
        "LIGHT_1": {"sourceDuration": 1.3},
    }}
    return gltf, specs, manifest


class LoopAnimationTimelineValidationTests(unittest.TestCase):
    def test_accepts_a_zero_based_loop_with_rounded_manifest_span(self):
        self.assertEqual(loop_animation_timeline_issues(*fixture()), [])

    def test_rejects_the_old_one_frame_loop_lead_in(self):
        issues = loop_animation_timeline_issues(*fixture(
            run_start=0.0333333,
            run_end=0.6666667,
        ))
        self.assertTrue(any("starts at" in issue for issue in issues), issues)

    def test_rejects_a_loop_whose_exported_span_disagrees_with_the_manifest(self):
        issues = loop_animation_timeline_issues(*fixture(run_end=0.6666667))
        self.assertTrue(any("duration" in issue for issue in issues), issues)

    def test_does_not_apply_the_loop_rebase_contract_to_one_shots(self):
        gltf, specs, manifest = fixture()
        gltf["accessors"][1] = {"min": [0.25], "max": [9.0]}
        self.assertEqual(loop_animation_timeline_issues(gltf, specs, manifest), [])

    def test_checks_every_distinct_input_accessor_in_a_loop(self):
        gltf, specs, manifest = fixture()
        gltf["accessors"].append({"min": [0.0333333], "max": [0.6666667]})
        gltf["animations"][0]["samplers"].append({"input": 2})
        issues = loop_animation_timeline_issues(gltf, specs, manifest)
        self.assertTrue(any("accessor 2 starts at" in issue for issue in issues), issues)


WINDOW = ExportedContinuityCheck("NPC Hand [Hnd].L", 0.0666667, 0.1666667, 8.0)

# Every exported frame in the declared window, as a Z rotation in degrees. The
# real ROLL defect is this shape: the hand leaves its neighbours and returns.
SMOOTH_DEGREES = [0.0, 4.5, 9.0, 13.5]
SPIKE_DEGREES = [0.0, 70.0, 90.0, 13.5]


def spin(degrees: float) -> tuple[float, float, float, float]:
    half = math.radians(degrees) / 2.0
    return (0.0, 0.0, math.sin(half), math.cos(half))


def conditioned_rotation_fixture(
    degrees: list[float],
    *,
    times: list[float] | None = None,
) -> tuple[dict, bytes, list]:
    times = [0.0666667, 0.1, 0.1333333, 0.1666667] if times is None else times
    quaternions = [component for value in degrees for component in spin(value)]
    binary = (struct.pack("<" + "f" * len(times), *times)
              + struct.pack("<" + "f" * len(quaternions), *quaternions))
    time_bytes = 4 * len(times)
    gltf = {
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": time_bytes},
            {"buffer": 0, "byteOffset": time_bytes, "byteLength": 16 * len(degrees)},
        ],
        "accessors": [
            {
                "bufferView": 0,
                "componentType": 5126,
                "count": len(times),
                "type": "SCALAR",
            },
            {
                "bufferView": 1,
                "componentType": 5126,
                "count": len(degrees),
                "type": "VEC4",
            },
        ],
        "nodes": [{"name": "NPC Hand [Hnd].L"}],
        "animations": [{
            "name": "ROLL",
            "samplers": [{"input": 0, "output": 1, "interpolation": "LINEAR"}],
            "channels": [{
                "sampler": 0,
                "target": {"node": 0, "path": "rotation"},
            }],
        }],
    }
    specs = [SimpleNamespace(
        semantic="ROLL",
        remove_quaternion_keys=(
            QuaternionKeyRemoval("NPC Hand [Hnd].L", 0.1333333),
        ),
        exported_continuity=(WINDOW,),
    )]
    return gltf, binary, specs


class CurveConditioningValidationTests(unittest.TestCase):
    def test_accepts_a_window_that_steps_between_its_retained_neighbours(self):
        fixture = conditioned_rotation_fixture(SMOOTH_DEGREES)
        self.assertEqual(quaternion_key_conditioning_issues(*fixture), [])

    def test_rejects_a_surviving_outlier_excursion(self):
        issues = quaternion_key_conditioning_issues(
            *conditioned_rotation_fixture(SPIKE_DEGREES)
        )
        self.assertTrue(any("over the declared" in issue for issue in issues), issues)
        # Reported at the excursion's worst edge: the 90 -> 13.5 deg return.
        self.assertTrue(any("76.500 deg" in issue for issue in issues), issues)

    def test_reports_equivalent_quaternion_signs_as_continuous(self):
        """abs(dot) keeps a negated but identical rotation from reading as a pop."""
        gltf, binary, specs = conditioned_rotation_fixture(SMOOTH_DEGREES)
        flipped = list(struct.unpack_from("<16f", binary, 16))
        struct.pack_into("<16f", binary := bytearray(binary), 16,
                         *[-value for value in flipped])
        self.assertEqual(
            quaternion_key_conditioning_issues(gltf, bytes(binary), specs), [])

    def test_rejects_a_window_that_cannot_prove_anything(self):
        """A window off the exported curve must fail rather than pass vacuously."""
        gltf, binary, specs = conditioned_rotation_fixture(SMOOTH_DEGREES)
        specs[0].exported_continuity = (
            ExportedContinuityCheck("NPC Hand [Hnd].L", 5.0, 6.0, 8.0),
        )
        issues = quaternion_key_conditioning_issues(gltf, binary, specs)
        self.assertTrue(any("cannot prove continuity" in issue for issue in issues), issues)

    def test_rejects_a_missing_conditioned_rotation_channel(self):
        gltf, binary, specs = conditioned_rotation_fixture(SMOOTH_DEGREES)
        gltf["animations"][0]["channels"][0]["target"]["path"] = "translation"
        issues = quaternion_key_conditioning_issues(gltf, binary, specs)
        self.assertTrue(
            any("no single rotation sampler" in issue for issue in issues), issues)


if __name__ == "__main__":
    unittest.main()
