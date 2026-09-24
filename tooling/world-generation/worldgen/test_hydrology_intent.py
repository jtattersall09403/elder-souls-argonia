"""Pre-water typed hydrology intent contracts."""

from . import hydrology_intent


def record(*, relation="channel-linked", connections=1, radius=80):
    return {
        "id": "place.test.landing", "position": {"u": 0.5, "v": 0.5},
        "terrainRequests": [{
            "kind": "cut", "radiusM": radius,
            "delivery": {"feature": "landing-cut", "waterRelation": relation,
                         "connectionCount": connections, "depthClass": "navigable"},
            "note": "A typed channel connection for the landing.",
        }],
    }


def target(target_id="water.major", points=None):
    return {"id": target_id, "pointsM": points or [[540.0, 500.0], [560.0, 500.0]]}


def request_id(rec):
    from . import terrain_requests
    plan, errors = terrain_requests.build_plan([rec], extent_m=1000.0)
    assert not errors
    return plan["requests"][0]["id"]


def test_connection_intent_is_absolute_content_addressed_and_deterministic():
    rec = record()
    bindings = {request_id(rec): ["water.major"]}
    first, errors = hydrology_intent.compile_intents(
        [rec], [target()], bindings, extent_m=1000.0)
    second, errors2 = hydrology_intent.compile_intents(
        [rec], [target()], bindings, extent_m=1000.0)
    assert not errors and not errors2 and first == second
    intent = first["intents"][0]
    assert intent["id"].endswith(intent["contentDigest"][:20])
    assert intent["geometry"] == {"type": "water-centreline",
                                  "linesM": [[[500.0, 500.0], [540.0, 500.0]]]}
    assert intent["connections"][0]["targetId"] == "water.major"


def test_connections_fail_closed_when_missing_unknown_count_mismatched_or_unreachable():
    rec = record(connections=2)
    rid = request_id(rec)
    for targets, bindings, phrase in (
        ([target()], {}, "underspecified"),
        ([target()], {rid: ["water.missing", "water.other"]}, "does not exist"),
        ([target()], {rid: ["water.major"]}, "promises 2 connection"),
        ([target(points=[[900.0, 900.0]])], {rid: ["water.major", "water.major"]}, "duplicate"),
    ):
        document, errors = hydrology_intent.compile_intents(
            [rec], targets, bindings, extent_m=1000.0)
        assert document == {}
        assert any(phrase in error for error in errors)

    one = record(connections=1, radius=20)
    document, errors = hydrology_intent.compile_intents(
        [one], [target(points=[[900.0, 900.0]])],
        {request_id(one): ["water.major"]}, extent_m=1000.0)
    assert document == {}
    assert any("beyond 20.0 m reach" in error for error in errors)


def test_local_pool_emits_absolute_radial_geometry_without_a_connection():
    rec = record(relation="standing-water", connections=0, radius=40)
    delivery = rec["terrainRequests"][0]["delivery"]
    delivery.pop("connectionCount")
    rec["terrainRequests"][0]["kind"] = "pool"
    document, errors = hydrology_intent.compile_intents(
        [rec], [], {}, extent_m=1000.0)
    assert not errors
    geometry = document["intents"][0]["geometry"]
    assert geometry["type"] == "radial-water-body"
    assert geometry["centerM"] == [500.0, 500.0]
    assert geometry["ringM"][0] == geometry["ringM"][-1]


def test_authored_waterways_end_at_their_terminal_without_rasters(tmp_path):
    # Both live rows were retired with their blueprints (2026-09-23/24), so
    # the claim is proved on a written row as well as on every live one.
    import json
    from .test_authored_waterways import SYNTHETIC_AUTHORED_ROW
    live, errors = hydrology_intent.load_authored_minor_waterways()
    assert not errors, errors
    path = tmp_path / "authored-minor-waterways.json"
    path.write_text(json.dumps({"waterways": [SYNTHETIC_AUTHORED_ROW]}))
    written, errors = hydrology_intent.load_authored_minor_waterways(path)
    assert not errors and written
    for row in live + written:
        assert row["pointsM"][-1] == row["terminalM"], row["id"]
        assert row["terminalId"].startswith("terminal."), row["id"]
        assert row["connectsTo"] == ["network.minor-waterways.hist-heartland"], row["id"]
        assert len(row["contentDigest"]) == 64, row["id"]

