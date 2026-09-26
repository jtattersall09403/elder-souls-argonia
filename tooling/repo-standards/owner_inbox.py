#!/usr/bin/env python3
"""Owner inbox: one pinned GitHub issue whose comments are the owner's updates.

The owner reads them on their phone (GitHub mobile app, or the email GitHub
sends for each comment). tooling/repo-standards/README.md § Owner inbox.

  owner_inbox.py --post <file.md> [--title <text>]
      post the file as a comment headed "## <title or Update> — <UTC time>"
  owner_inbox.py --from-progress [--if-changed]
      post the story built from the repo: the commit subjects on dev since the
      last inbox comment, docs/PROGRESS.md § Waiting on user (links made
      absolute) and where to look. --if-changed skips the post when the last
      comment carries the same waiting-hash.

Uses `gh` only. A missing or offline `gh` is a one-line message and exit 0:
a notification never breaks a commit.
"""
import argparse
import datetime
import hashlib
import json
import os
import posixpath
import re
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(os.environ.get("ES_INBOX_REPO") or Path(__file__).resolve().parents[2])
BLOB = "https://github.com/jtattersall09403/elder-souls-argonia/blob/dev/"
LABEL = "owner-inbox"
TITLE = "Owner inbox: what is waiting on you"
BODY = ("Every comment on this issue is one update from the agents working on the game. "
        "The newest comment is the current state.")
HASH_RE = re.compile(r"<!-- waiting-hash: ([0-9a-f]{64}) -->")
MAX_SUBJECTS = 25


class GhUnavailable(Exception):
    pass


def gh(*args, stdin=None):
    try:
        r = subprocess.run(["gh", *args], input=stdin, capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.TimeoutExpired) as e:
        raise GhUnavailable(str(e))
    if r.returncode != 0:
        raise GhUnavailable(((r.stderr or r.stdout).strip().splitlines() or ["gh failed"])[-1])
    return r.stdout


def ensure_issue():
    # The REST list, not `gh issue list`: its search index lags a new issue
    # by minutes, and a lagging answer would open a second inbox.
    found = [i for i in json.loads(gh("api", f"repos/{{owner}}/{{repo}}/issues?labels={LABEL}&state=open") or "[]")
             if "pull_request" not in i]   # the endpoint lists labelled PRs too
    if found:
        return found[0]["number"]
    gh("label", "create", LABEL, "--color", "0E8A16", "--description", "Updates for the owner's phone", "--force")
    url = gh("issue", "create", "--title", TITLE, "--body", BODY, "--label", LABEL).strip().splitlines()[-1]
    number = int(url.rstrip("/").rsplit("/", 1)[-1])
    try:
        gh("issue", "pin", str(number))
    except GhUnavailable as e:
        print(f"owner_inbox: issue #{number} created, pin failed: {e}")
    return number


def last_story(number):
    """The newest --from-progress comment (it carries a waiting-hash), from
    the 100 newest comments of the repo: a --post packet in between neither
    shortens the "since" window nor defeats the hash skip, and the fetch
    stays one page however long the inbox grows."""
    page = json.loads(gh("api", "repos/{owner}/{repo}/issues/comments?sort=created&direction=desc&per_page=100") or "[]")
    for c in page:
        if (c.get("issue_url") or "").endswith(f"/issues/{number}") and HASH_RE.search(c.get("body") or ""):
            return c
    return None


def post(number, title, text):
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    body = f"## {title or 'Update'} — {now}\n\n{text.rstrip()}\n"
    out = gh("issue", "comment", str(number), "--body-file", "-", stdin=body).strip()
    print(f"owner_inbox: posted {out or f'to issue #{number}'}")


def waiting_section(progress_text):
    lines, inside = [], False
    for line in progress_text.splitlines():
        if line.startswith("## "):
            if inside:
                break
            inside = line.strip() == "## Waiting on user"
            continue
        if inside:
            lines.append(line)
    return "\n".join(lines).strip()


def absolute_links(text, base="docs/"):
    def fix(m):
        target = m.group(2)
        if re.match(r"^(https?:|mailto:|#)", target):
            return m.group(0)
        path, _, anchor = target.partition("#")
        full = posixpath.normpath(posixpath.join(base, path))
        return f"{m.group(1)}({BLOB}{full}{'#' + anchor if anchor else ''})"
    return re.sub(r"(\[[^\]]*\])\(([^)\s]+)\)", fix, text)


def commit_subjects(since):
    args = ["git", "-C", str(REPO_ROOT), "log", "-n", "200", "--format=%s"]
    if since:
        args.append(f"--since={since}")
    r = subprocess.run([*args, "dev"], capture_output=True, text=True)
    if r.returncode != 0:
        return []
    subjects = [s for s in r.stdout.splitlines() if s and not s.startswith("Vault snapshot manifest")]
    return list(reversed(subjects[:MAX_SUBJECTS]))


def build_story(progress_text, subjects, tunnel_url=None):
    waiting = waiting_section(progress_text)
    digest = hashlib.sha256(waiting.encode()).hexdigest()
    since = "\n".join(f"- {s}" for s in subjects) or "- (no new commits)"
    look = []
    if tunnel_url:
        look.append(f"- The studio: {tunnel_url}")
    look.append(f"- The progress page: {BLOB}docs/PROGRESS.md")
    story = (f"**Since the last update**\n\n{since}\n\n"
             f"**Waiting on you**\n\n{absolute_links(waiting) or '- Nothing.'}\n\n"
             f"**Where to look**\n\n" + "\n".join(look) + f"\n\n<!-- waiting-hash: {digest} -->\n")
    return story, digest


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--post", metavar="FILE")
    g.add_argument("--from-progress", action="store_true")
    ap.add_argument("--title")
    ap.add_argument("--if-changed", action="store_true")
    a = ap.parse_args(argv)
    if not shutil.which("gh"):
        print("owner_inbox: gh is not installed; nothing posted")
        return 0
    try:
        number = ensure_issue()
        if a.post:
            post(number, a.title, Path(a.post).read_text(encoding="utf-8"))
            return 0
        last = last_story(number)
        progress = (REPO_ROOT / "docs" / "PROGRESS.md").read_text(encoding="utf-8")
        story, digest = build_story(progress, commit_subjects(last and last.get("created_at")),
                                    os.environ.get("ES_TUNNEL_URL"))
        if a.if_changed and last:
            m = HASH_RE.search(last.get("body") or "")
            if m and m.group(1) == digest:
                print("owner_inbox: Waiting on user unchanged since the last story; nothing posted")
                return 0
        post(number, a.title or "Progress update", story)
    except GhUnavailable as e:
        print(f"owner_inbox: gh unavailable or offline ({e}); nothing posted")
    return 0


if __name__ == "__main__":
    sys.exit(main())
