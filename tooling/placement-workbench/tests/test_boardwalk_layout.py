"""boardwalk.replace_in_layout: a bind never precedes the place it names (16k walk 9 type 10)."""
from workbench.boardwalk import replace_in_layout


def _run(prefix, run):
    ops = [{"op": "place", "uid": f"{prefix}00"}, {"op": "place", "uid": f"{prefix}01"}]
    binds = [{"op": "bind", "uid": f"{prefix}0{i}", "kind": "run", "id": run, "index": i} for i in (0, 1)]
    return ops, binds


def _order_ok(doc):
    placed = set()
    for o in doc["ops"]:
        if o["op"] == "place":
            placed.add(o["uid"])
        if o["op"] == "bind":
            assert o["uid"] in placed, f"bind {o['uid']} before its place"


def test_second_run_binds_follow_its_places():
    doc = {"ops": []}
    doc = replace_in_layout(doc, "run.a", "a-", *_run("a-", "run.a"))
    doc = replace_in_layout(doc, "run.b", "b-", *_run("b-", "run.b"))
    _order_ok(doc)
    assert [o["uid"] for o in doc["ops"] if o["op"] == "bind"] == ["a-00", "a-01", "b-00", "b-01"]


def test_rerouting_a_run_keeps_its_slot():
    doc = {"ops": []}
    doc = replace_in_layout(doc, "run.a", "a-", *_run("a-", "run.a"))
    doc = replace_in_layout(doc, "run.b", "b-", *_run("b-", "run.b"))
    doc = replace_in_layout(doc, "run.a", "a-", *_run("a-", "run.a"))
    _order_ok(doc)
