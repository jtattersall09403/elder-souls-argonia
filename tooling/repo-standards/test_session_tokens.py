"""One model call is one turn, however many records the transcript writes for it."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from session_tokens import Calls, usage_of  # noqa: E402
from session_switch import assess, read_session  # noqa: E402


def rec(mid, out, ts="2026-09-22T18:00:00Z", content=(), **usage):
    u = {"input_tokens": 10, "cache_read_input_tokens": 1000, "cache_creation_input_tokens": 50,
         "output_tokens": out}
    u.update(usage)
    return {"type": "assistant", "entrypoint": "cli", "timestamp": ts,
            "message": {"id": mid, "model": "claude-fable-5-1", "usage": u, "content": list(content)}}


def prompt(text="go"):
    return {"type": "user", "entrypoint": "cli", "message": {"role": "user", "content": text}}


def tool_result():
    return {"type": "user", "entrypoint": "cli",
            "message": {"role": "user", "content": [{"type": "tool_result", "content": "x"}]}}


def write(tmp_path, lines):
    p = tmp_path / "s.jsonl"
    p.write_text("\n".join(json.dumps(x) for x in lines) + "\n")
    return str(p)


EDIT = [{"type": "tool_use", "name": "Edit", "input": {}}]
FIND = [{"type": "tool_use", "name": "Agent", "input": {"subagent_type": "find"}}]


def session(tmp_path, ctx_now, calls_per_turn=6, turns=3):
    """Orientation of four calls (a find look-up is still orientation), then work turns
    whose last call carries `ctx_now` cached context."""
    lines = [prompt()]
    for i in range(4):
        lines += [rec(f"o{i}", 1000, cache_read_input_tokens=10_000 * i,
                      cache_creation_input_tokens=15_000, content=FIND), tool_result()]
    k = 0
    for t in range(turns):
        if t:
            lines.append(prompt())
        for _ in range(calls_per_turn):
            k += 1
            lines += [rec(f"w{k}", 800, cache_read_input_tokens=60_000, content=EDIT), tool_result()]
    lines[-2]["message"]["usage"]["cache_read_input_tokens"] = ctx_now
    return read_session(write(tmp_path, lines))


def test_records_of_one_call_fold_to_one_turn(tmp_path):
    # a text block then a tool_use block: two records, one call; the later record
    # carries the fuller output count
    lines = [rec("m1", 20), rec("m1", 120), rec("m2", 30), rec("m2", 30)]
    p = write(tmp_path, lines)
    calls, _, _, entry = read_session(p)
    assert entry == "cli"
    assert len(calls) == 2
    assert calls[0]["output"] == 120 and calls[0]["cache_read"] == 1000
    total, models = usage_of(p)
    assert total["cache_read"] == 2000 and total["output"] == 150
    assert models == {"fable": 2}


def test_records_without_an_id_still_count():
    c = Calls()
    r = rec("x", 1)
    del r["message"]["id"]
    assert c.add(r) and c.add(r)
    assert len(c.calls) == 2


def test_orientation_ends_at_the_first_work_call(tmp_path):
    calls, starts, work_at, _ = session(tmp_path, 60_000)
    assert work_at == 4 and starts == [0, 10, 16]
    r = assess(calls, starts, work_at)
    assert r["orient_calls"] == 4 and r["n"] == 6


def test_a_session_still_orienting_is_never_advised(tmp_path):
    p = write(tmp_path, [prompt(), rec("a", 100, content=FIND), tool_result(), rec("b", 100)])
    assert assess(*read_session(p)[:3]) is None


def test_break_even_falls_as_the_context_grows(tmp_path):
    small = assess(*session(tmp_path, 80_000)[:3])
    big = assess(*session(tmp_path, 400_000)[:3])
    assert small["saving"] < big["saving"] and small["break_even"] > big["break_even"]
    # the one-off is the hand-off (re-reading C_now) plus this session's own orientation
    assert big["one_off"] > big["O"] > 0 and big["handoff"] > 2 * 400_000 * 0.1
    # at 400k a fresh session wins once ~10 steps remain, never for 5
    assert big["one_off"] + 5 * big["fresh_step"] > 5 * big["stay_step"]
    assert big["one_off"] + 10 * big["fresh_step"] < 10 * big["stay_step"]
