#!/usr/bin/env python3
"""Owner inbox: one pinned GitHub issue whose comments are the owner's updates.

The owner reads them on their phone (GitHub mobile app, or the email GitHub
sends for each comment). tooling/repo-standards/README.md § Owner inbox.

  owner_inbox.py --post <file.md> [--title <text>] [--attach <png>...]
                 [--walk <name>] [--branch <name>]
      post the file as a comment headed "## <title or Update> — <UTC time>".
      Refused while lane_status.py lists a running subagent and the file has
      no `## Live` section (each live agent and pod, its expected end, each
      pod's id and who deletes it; method review r7 P4).
      Each --attach image (any path, gitignored render output included) is
      copied to tooling/.reports/16k/<walk>/pictures/ and `git add -f`-ed;
      <walk> is --walk, else the folder of a packet under tooling/.reports/16k/.
      Each becomes a markdown image linked to its blob on --branch (default
      main: packets are walked on the deployed build) with `?raw=true`: an
      image link in the file that names the source or the copy is rewritten
      in place, any other is appended under "Pictures". It commits nothing
      (decision 0102 decision 11) and REFUSES to post (exit 2) while any image
      the comment links (attached, a relative image link, or a blob link into
      this repo) is not committed on that branch (origin/<branch> when it
      exists): commit, push, then run the same command again.
  owner_inbox.py --from-progress [--if-changed]
      post the story built from the repo: the commit subjects on dev since the
      last inbox comment, docs/PROGRESS.md § Waiting on user (links made
      absolute) and where to look. --if-changed skips the post when the last
      comment carries the same waiting-hash.
  owner_inbox.py --list
      one line per inbox comment: id, UTC date, title line.
  owner_inbox.py --collapse <comment-id> [--reason <text>]
      fold a superseded comment: its body goes inside
      `<details><summary>Superseded packet (collapsed): <reason></summary>`
      (PATCH through `gh api`); a folded comment is left as it is.

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
REPO_URL = "https://github.com/jtattersall09403/elder-souls-argonia"
BLOB = f"{REPO_URL}/blob/dev/"
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


COLLAPSED = "<details><summary>Superseded packet (collapsed): "


def comments(number):
    """Every comment on the inbox issue, oldest first."""
    lines = gh("api", "--paginate", "--jq", ".[] | {id, created_at, body}",
               f"repos/{{owner}}/{{repo}}/issues/{number}/comments?per_page=100")
    return [json.loads(line) for line in lines.splitlines() if line.strip()]


def title_line(body):
    """The first non-blank line; a folded comment shows "[collapsed]" and its own heading."""
    lines = [line.strip() for line in (body or "").splitlines() if line.strip()]
    if lines and lines[0].startswith(COLLAPSED):
        return "[collapsed] " + (lines[1] if len(lines) > 1 else "")
    return lines[0] if lines else ""


def list_lines(rows):
    return [f"{c['id']}  {(c.get('created_at') or '')[:16].replace('T', ' ')}  "
            f"{title_line(c.get('body'))[:100]}" for c in rows]


def collapse_body(body, reason):
    """The body folded under a Superseded summary; None when already folded."""
    if (body or "").lstrip().startswith(COLLAPSED):
        return None
    return f"{COLLAPSED}{reason}</summary>\n\n{(body or '').rstrip()}\n\n</details>\n"


def collapse(comment_id, reason):
    path = f"repos/{{owner}}/{{repo}}/issues/comments/{comment_id}"
    body = collapse_body(json.loads(gh("api", path)).get("body"), reason)
    if body is None:
        print(f"owner_inbox: comment {comment_id} is already collapsed")
        return
    gh("api", "-X", "PATCH", path, "--input", "-", stdin=json.dumps({"body": body}))
    print(f"owner_inbox: collapsed comment {comment_id}")


def post(number, title, text):
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    body = f"## {title or 'Update'} — {now}\n\n{text.rstrip()}\n"
    out = gh("issue", "comment", str(number), "--body-file", "-", stdin=body).strip()
    print(f"owner_inbox: posted {out or f'to issue #{number}'}")


def raw_image_url(rel_path, branch):
    return f"{REPO_URL}/blob/{branch}/{rel_path}?raw=true"


def repo_relative(path):
    full = Path(path).resolve()
    try:
        return full.relative_to(REPO_ROOT.resolve()).as_posix()
    except ValueError:
        raise ValueError(f"{path}: not inside the repo ({REPO_ROOT}); only committed repo files can be linked")


def attach_images(text, images, branch, base_dir=None):
    """Each image as `![name](blob link?raw=true)`. An image is a repo-relative
    path, or a (link path, {paths that name it}) pair: an image link in `text`
    whose target resolves to one of those paths (relative to `base_dir`, the
    packet's folder, or to the repo root) is rewritten in place; the rest are
    appended under a "Pictures" heading."""
    appended = []
    for image in images:
        rel, names = (image, {image}) if isinstance(image, str) else (image[0], {image[0], *image[1]})
        url = raw_image_url(rel, branch)
        hit = False

        def swap(m, rel=rel, url=url):
            nonlocal hit
            target = m.group(2)
            if re.match(r"^(https?:|#)", target):
                return m.group(0)
            candidates = {posixpath.normpath(target.lstrip("/"))}
            if base_dir is not None:
                candidates.add(posixpath.normpath(posixpath.join(base_dir, target)))
            if names & candidates:
                hit = True
                return f"{m.group(1)}({url})"
            return m.group(0)
        text = re.sub(r"(!\[[^\]]*\])\(([^)\s]+)\)", swap, text)
        if not hit:
            appended.append(f"![{posixpath.basename(rel)}]({url})")
    if appended:
        text = text.rstrip() + "\n\n**Pictures**\n\n" + "\n\n".join(appended) + "\n"
    return text


def git(*args, check=False):
    r = subprocess.run(["git", "-C", str(REPO_ROOT), *args], capture_output=True, text=True)
    if check and r.returncode != 0:
        raise ValueError(f"git {' '.join(args)} failed: {(r.stderr or r.stdout).strip()[-200:]}")
    return r


def branch_ref(branch):
    """origin/<branch> after a fetch when the repo has that remote branch,
    else the local branch: the link loads only once the image is there."""
    if git("remote", "get-url", "origin").returncode == 0:
        git("fetch", "-q", "origin", branch)
        if git("rev-parse", "--verify", "-q", f"origin/{branch}").returncode == 0:
            return f"origin/{branch}"
    return branch


def not_committed(links):
    """The (branch, path) links whose file is not committed on that branch."""
    refs = {b: branch_ref(b) for b in sorted({b for b, _ in links})}
    return [f"{p} (on {refs[b]})" for b, p in links if git("cat-file", "-e", f"{refs[b]}:{p}").returncode != 0]


WALK_RE = re.compile(r"^tooling/\.reports/16k/([^/]+)/")
BLOB_LINK_RE = re.compile(re.escape(REPO_URL) + r"/blob/([^/\s)]+)/([^?#\s)]+)")


def walk_name(packet_rel, walk):
    if walk:
        return walk
    m = WALK_RE.match(packet_rel or "")
    if not m:
        raise ValueError("--attach needs --walk <name> when the packet is not under tooling/.reports/16k/<walk>/")
    return m.group(1)


def copy_pictures(sources, walk):
    """Copy each image into tooling/.reports/16k/<walk>/pictures/ and `git add
    -f` it (tooling/.reports/ is gitignored). Returns [(copy rel, source rel)].
    A second image with the same file name is prefixed with its folder name."""
    dest_dir = f"tooling/.reports/16k/{walk}/pictures"
    (REPO_ROOT / dest_dir).mkdir(parents=True, exist_ok=True)
    out, taken = [], {}
    for src in sources:
        src_path = Path(src).resolve()
        if not src_path.is_file():
            raise ValueError(f"{src}: no such image")
        src_rel = repo_relative(src_path)
        name = src_path.name
        if taken.get(name, src_rel) != src_rel:
            name = f"{src_path.parent.name}-{name}"
        taken[name] = src_rel
        rel = f"{dest_dir}/{name}"
        if (REPO_ROOT / rel).resolve() != src_path:
            shutil.copyfile(src_path, REPO_ROOT / rel)
        git("add", "-f", "--", rel, check=True)
        out.append((rel, src_rel))
    return out


def linked_images(text, branch, base_dir):
    """(branch, repo path) of every image the comment links: blob links into
    this repo on their own branch, and relative image links (resolved from
    `base_dir`, or the root for a leading "/") on `branch`."""
    out = []
    for m in re.finditer(r"!\[[^\]]*\]\(([^)\s]+)\)", text):
        target = m.group(1)
        b = BLOB_LINK_RE.match(target)
        if b:
            out.append((b.group(1), b.group(2)))
        elif not re.match(r"^(https?:|#|data:)", target):
            rel = target.lstrip("/") if target.startswith("/") else posixpath.join(base_dir or "", target)
            out.append((branch, posixpath.normpath(rel)))
    return out


def prepare_pictures(text, packet, attach, walk, branch):
    """The comment body with every attached image copied, staged and linked
    on `branch`; raises ValueError (post refused) while any linked image is
    not committed there."""
    try:
        base = repo_relative(Path(packet).resolve().parent)
    except ValueError:
        base = None           # a packet outside the repo: links resolve from the root
    if attach:
        pairs = copy_pictures(attach, walk_name(base and base + "/", walk))
        text = attach_images(text, [(rel, {src}) for rel, src in pairs], branch, base_dir=base)
    missing = not_committed(linked_images(text, branch, base))
    if missing:
        raise ValueError(f"{len(missing)} linked image(s) not committed (the link would 404): "
                         + ", ".join(missing) + ". Commit them (attached ones are staged), push "
                         f"{branch}, then run the same command again")
    return text


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


LIVE_HEADING = re.compile(r"^#{1,4}\s*Live\b", re.M | re.I)


def running_agents():
    """Running subagents of the newest session (lane_status); [] when unreadable."""
    try:
        import lane_status
        pdir = lane_status.project_dir()
        session = lane_status.newest_session(pdir)
        return [r for r in lane_status.rows(pdir, session) if r["state"] in lane_status.RUNNING] if session else []
    except Exception:
        return []


def live_section_missing(text, running):
    """Method review r7 P4: a packet posted while agents run lists them, their
    expected end and every pod id (deleted or handed over) under a `## Live`
    heading; the reason it is refused, else ''."""
    if not running or LIVE_HEADING.search(text):
        return ""
    ids = ", ".join(f"{r['id'][:10]} ({r['type']})" for r in running)
    return (f"{len(running)} agent(s) still running ({ids}) and the packet has no `## Live` section: "
            "list each live agent and pod with its expected end time, and each pod's id with who deletes it")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--post", metavar="FILE")
    g.add_argument("--from-progress", action="store_true")
    g.add_argument("--list", action="store_true")
    g.add_argument("--collapse", metavar="COMMENT_ID", type=int)
    ap.add_argument("--reason", default="superseded by a later packet",
                    help="the summary line of a --collapse")
    ap.add_argument("--title")
    ap.add_argument("--attach", nargs="+", metavar="PNG", default=[],
                    help="images to copy into the walk's pictures folder and embed (with --post)")
    ap.add_argument("--walk", help="the tooling/.reports/16k/<walk> folder for --attach copies")
    ap.add_argument("--branch", default="main", help="the branch the links point at (default main)")
    ap.add_argument("--if-changed", action="store_true")
    a = ap.parse_args(argv)
    if a.attach and not a.post:
        ap.error("--attach goes with --post")
    text = None
    if a.post:
        text = Path(a.post).read_text(encoding="utf-8")
        missing = live_section_missing(text, running_agents())
        if missing:
            print(f"owner_inbox: {missing}; nothing posted", file=sys.stderr)
            return 2
        try:
            text = prepare_pictures(text, a.post, a.attach, a.walk, a.branch)
        except ValueError as e:
            print(f"owner_inbox: {e}; nothing posted", file=sys.stderr)
            return 2
    if not shutil.which("gh"):
        print("owner_inbox: gh is not installed; nothing posted")
        return 0
    try:
        if a.collapse is not None:
            collapse(a.collapse, a.reason)
            return 0
        number = ensure_issue()
        if a.list:
            print("\n".join(list_lines(comments(number))))
            return 0
        if a.post:
            post(number, a.title, text)
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
