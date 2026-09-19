#!/usr/bin/env python3
"""Where do our Claude Code tokens go? Reads the session transcripts for this
repo and reports, per session and in total, the billed token classes and the
share of context each tool family adds (decision 0079).

    python3 tooling/repo-standards/session_tokens.py            # last 10 sessions
    python3 tooling/repo-standards/session_tokens.py --last 25

Images are counted at a flat 1,600 tokens (how they are billed); text at
bytes/4. "carried" weights each result by how many later turns re-sent it,
which is what the bill tracks (cache reads dominate: cost ~ turns x length).
"""
import argparse, collections, glob, json, os, re, sys

PROJ = os.path.expanduser(
    "~/.claude/projects/-home-analyticalplatform-workspace-elder-souls-dev-elder-souls-argonia")
EXPLORE = re.compile(r"^\s*(rtk )?(cat|head|tail|sed -n|grep|rg|ls|find|wc|git (log|status|diff|show|grep)|"
                     r"python3? - <<|python3 -c|jq|tree|stat|du|file)\b")


def classify(name, inp):
    if name == "Bash":
        return "bash-explore" if EXPLORE.match(inp.get("command", "")) else "bash-do"
    if name == "Read":
        p = inp.get("file_path", "").lower()
        return "image" if p.endswith((".png", ".jpg", ".jpeg")) else ("read-doc" if p.endswith(".md") else "read-code")
    return name


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--last", type=int, default=10)
    ap.add_argument("--dir", default=PROJ)
    ap.add_argument("--brief", action="store_true",
                    help="two lines for the SessionStart hook: recent sessions vs the 0079 baseline")
    a = ap.parse_args()
    files = sorted(glob.glob(os.path.join(a.dir, "*.jsonl")), key=os.path.getmtime)[-a.last:]
    if not files:
        sys.exit(f"no transcripts under {a.dir}")
    bill = collections.Counter(); added = collections.Counter(); carried = collections.Counter()
    rows = []
    for f in files:
        ids, turns, usage, models = {}, [], [], collections.Counter()
        for line in open(f):
            try:
                d = json.loads(line)
            except ValueError:
                continue
            m = d.get("message")
            if not isinstance(m, dict):
                continue
            if m.get("usage"):
                usage.append(m["usage"]); models[m.get("model", "?")] += 1
            c = m.get("content")
            if not isinstance(c, list):
                continue
            for x in c:
                if x.get("type") == "tool_use":
                    ids[x["id"]] = classify(x["name"], x.get("input") or {})
                elif x.get("type") == "tool_result":
                    k = ids.get(x.get("tool_use_id"), "?")
                    t = 1600 if k == "image" else len(json.dumps(x.get("content"))) / 4
                    turns.append((len(usage), k, t))
        n = len(usage)
        for at, k, t in turns:
            added[k] += t; carried[k] += t * max(1, n - at)
        cr = sum(u.get("cache_read_input_tokens", 0) for u in usage)
        cc = sum(u.get("cache_creation_input_tokens", 0) for u in usage)
        out = sum(u.get("output_tokens", 0) for u in usage)
        bill["cache_read"] += cr; bill["cache_create"] += cc; bill["output"] += out
        rows.append((os.path.basename(f)[:8], n, cr / 1e6, cc / 1e6, out / 1e6, models.most_common(1)[0][0] if models else "?"))
    if a.brief:
        real = [r for r in rows if r[1] >= 20]
        if not real:
            return
        avg_cached = sum(r[2] for r in real) / len(real)
        avg_turns = sum(r[1] for r in real) / len(real)
        shell = 100 * (carried["bash-do"] + carried["bash-explore"]) / (sum(carried.values()) or 1)
        # baseline: the 25 sessions measured for decision 0079 (2026-09-19)
        print(f"[token report, decision 0079] last {len(real)} sessions: avg {avg_cached:.0f}M cached input, "
              f"{avg_turns:.0f} turns, shell {shell:.0f}% of carried context "
              f"(baseline 111M, 280 turns, 68%). Full report: python3 tooling/repo-standards/session_tokens.py")
        return
    print(f"{len(files)} sessions   session  turns  cached(M)  new(M)  out(M)  main model")
    for r in rows:
        print(f"                     {r[0]}  {r[1]:5d}  {r[2]:9.1f}  {r[3]:6.1f}  {r[4]:6.2f}  {r[5]}")
    print(f"totals (M tokens): cached {bill['cache_read']/1e6:.0f}  new {bill['cache_create']/1e6:.0f}  output {bill['output']/1e6:.1f}")
    A, C = sum(added.values()) or 1, sum(carried.values()) or 1
    print("\ncontext by source      added   carried")
    for k, v in carried.most_common(8):
        print(f"  {k:14s} {100*added[k]/A:6.1f}%  {100*v/C:6.1f}%")


if __name__ == "__main__":
    main()
