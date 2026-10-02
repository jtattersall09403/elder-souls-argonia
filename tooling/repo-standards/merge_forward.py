#!/usr/bin/env python3
"""Merge `dev` into `webgpu` so every improvement on dev flows to the WebGPU branch.

  python3 tooling/repo-standards/merge_forward.py            merge and verify
  python3 tooling/repo-standards/merge_forward.py --check    report only, no merge

Merge mode works in the webgpu worktree (WEBGPU_WORKTREE, default
/workspaces/elder-souls-argonia-webgpu; created with `git worktree add` if
missing). Exit codes: 0 merged and verified (prints `merged <sha>`), 1 conflicts
or a failed verification step, 2 worktree dirty. The verification is the
branch's no-GLSL check (tooling/repo-standards/check_no_glsl.mjs) and the
world-studio typecheck, under job_guard.sh.

`--check` exits 0 when `git merge-base --is-ancestor dev webgpu` holds, else 1.
It is the preflight gate `webgpu-merged` (decision 0111, 16k packet step 3).
"""
import argparse
import os
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORKTREE = os.environ.get("WEBGPU_WORKTREE", "/workspaces/elder-souls-argonia-webgpu")


def git(cwd, *args):
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True)


def check(repo=REPO):
    """True when dev is an ancestor of webgpu (nothing left to merge forward).
    A clone without both branches (the --runner clean clone) has nothing to check."""
    for ref in ("dev", "webgpu"):
        if git(repo, "rev-parse", "--verify", "-q", ref).returncode:
            return True
    return git(repo, "merge-base", "--is-ancestor", "dev", "webgpu").returncode == 0


def merge(repo=REPO, worktree=WORKTREE):
    if not os.path.isdir(worktree):
        r = git(repo, "worktree", "add", worktree, "webgpu")
        if r.returncode:
            print(r.stderr.strip())
            return 1
    if git(worktree, "status", "--porcelain").stdout.strip():
        print("webgpu worktree dirty: the WebGPU lane commits first")
        return 2
    r = git(worktree, "merge", "--no-edit", "dev")
    if r.returncode:
        files = git(worktree, "diff", "--name-only", "--diff-filter=U").stdout.split()
        print("\n".join(files))
        git(worktree, "merge", "--abort")
        print("conflicts: resolve with a deliver agent (port each dev GLSL/behaviour change "
              "into the TSL twin), then rerun")
        return 1
    guard = os.path.join(repo, "tooling/repo-standards/job_guard.sh")
    steps = [("no-glsl", "node tooling/repo-standards/check_no_glsl.mjs"),
             ("typecheck", "npm run typecheck -w @elder-souls/world-studio")]
    for name, cmd in steps:
        r = subprocess.run(["bash", guard, "mergefwd", "--mem", "6", "--", "bash", "-c", cmd],
                           cwd=worktree)
        if r.returncode:
            print(f"failed step: {name}")
            return 1
    print("merged " + git(worktree, "rev-parse", "--short", "HEAD").stdout.strip())
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--check", action="store_true", help="report whether dev is merged into webgpu; no merge")
    args = ap.parse_args(argv)
    if args.check:
        ok = check()
        print("webgpu has every dev commit" if ok else "dev has commits not on webgpu")
        return 0 if ok else 1
    return merge()


if __name__ == "__main__":
    sys.exit(main())
