"""backup_changed.sh (the automatic incremental R2 backup), against a fake rclone.

A throwaway dev root holds a copy of the bootstrap scripts (so the repo root
they derive is the fixture, not this repo) and two fixture mod parts; the
fake rclone on PATH keeps the "bucket" in a directory, so nothing touches the
network.
"""
import fcntl
import json
import os
import shutil
import subprocess
import textwrap
from pathlib import Path

HERE = Path(__file__).resolve().parent

FAKE_RCLONE = textwrap.dedent('''\
    #!/usr/bin/env python3
    import json, os, shutil, sys
    root = os.environ["FAKE_R2"]
    # drop flag values (--s3-chunk-size 64M etc.)
    raw = sys.argv[1:]; args = []; i = 0
    while i < len(raw):
        if raw[i].startswith("--"):
            i += 2 if raw[i] in ("--s3-chunk-size", "--s3-upload-concurrency", "--retries", "--low-level-retries", "--max-depth") else 1
            continue
        args.append(raw[i]); i += 1
    def p(x):
        return os.path.join(root, x.split(":", 1)[1])
    op = args[0]
    if op == "lsf":
        sys.exit(0)
    if op == "lsjson":
        f = p(args[1])
        print(json.dumps([{"Size": os.path.getsize(f)}] if os.path.isfile(f) else []))
    elif op == "rcat":
        f = p(args[1]); os.makedirs(os.path.dirname(f), exist_ok=True)
        with open(f, "wb") as o: shutil.copyfileobj(sys.stdin.buffer, o)
    elif op == "copyto":
        f = p(args[2]); os.makedirs(os.path.dirname(f), exist_ok=True); shutil.copyfile(args[1], f)
    elif op == "moveto":
        f = p(args[2]); os.makedirs(os.path.dirname(f), exist_ok=True); os.replace(p(args[1]), f)
    elif op == "deletefile":
        os.remove(p(args[1]))
    elif op == "cat":
        sys.stdout.buffer.write(open(p(args[1]), "rb").read())
    else:
        sys.exit("fake rclone: unsupported " + op)
''')


def make_env(tmp_path):
    dev = tmp_path / "dev"
    repo = dev / "repo"
    boot = repo / "tooling" / "bootstrap"
    boot.mkdir(parents=True)
    for name in ("lib.sh", "snapshot-vault.sh", "backup_changed.sh"):
        shutil.copy(HERE / name, boot / name)
    manifest = boot / "snapshot-manifest.json"
    manifest.write_text(json.dumps({"schemaVersion": 1, "bucket": "elder-souls-vault",
                                    "prefix": "snapshot/v1/", "parts": []}))
    mods = dev / "elder-scrolls-asset-pipeline" / "skyrim-source" / "mod-sources"
    for m in ("moda", "modb"):
        (mods / m).mkdir(parents=True)
        (mods / m / "mesh.nif").write_text(m)
    binp = tmp_path / "bin"
    binp.mkdir()
    rc = binp / "rclone"
    rc.write_text(FAKE_RCLONE)
    rc.chmod(0o755)
    (tmp_path / "r2").mkdir()
    env = {**os.environ,
           "PATH": f"{binp}:{os.environ['PATH']}",
           "RCLONE": str(rc),
           "FAKE_R2": str(tmp_path / "r2"),
           "ES_DEVROOT": str(dev),
           "CLAUDE_CONFIG_DIR": str(tmp_path / "no-claude"),
           "ES_BACKUP_LOCK": str(tmp_path / "backup.lock"),
           "ES_BACKUP_NO_GUARD": "1",
           "TMPDIR": str(tmp_path)}
    return dev, repo, boot, mods, env


def run(boot, env, *args):
    return subprocess.run(["bash", str(boot / "backup_changed.sh"), *args], env=env,
                          capture_output=True, text=True, timeout=120)


def test_denylist_blocks_secret_paths():
    names = ["a/mesh.nif", "home/.config/nexus/api_key", "x/.config/rclone/rclone.conf",
             "workspaces/.es-secrets.env", "elder-souls-argonia/.claude/settings.local.json",
             ".claude-home/.credentials.json", "b/settings.json"]
    out = subprocess.run(["bash", "-c", f"source {HERE / 'lib.sh'}; es_drop_secrets"],
                         input="\0".join(names).encode(), capture_output=True, check=True)
    kept = [x for x in out.stdout.decode().split("\0") if x]
    assert kept == ["a/mesh.nif", "b/settings.json"]
    assert out.stderr.decode().count("secret path left out") == 5


def test_secret_in_a_part_never_reaches_the_bucket(tmp_path):
    dev, repo, boot, mods, env = make_env(tmp_path)
    (mods / "moda" / "api_key").write_text("SECRET")
    r = run(boot, env)
    assert r.returncode == 0, r.stdout + r.stderr
    tar = tmp_path / "r2" / "elder-souls-vault" / "snapshot" / "v1" / "mod-sources" / "moda.tar"
    listing = subprocess.run(["tar", "-tf", str(tar)], capture_output=True, text=True, check=True).stdout
    assert "mesh.nif" in listing and "api_key" not in listing


def test_dry_run_lists_exactly_the_changed_part_and_check_follows(tmp_path):
    dev, repo, boot, mods, env = make_env(tmp_path)
    r = run(boot, env)                      # first run: every part uploaded, manifest filled
    assert r.returncode == 0, r.stdout + r.stderr
    last = json.loads((repo / "tooling" / ".reports" / "backup" / "last.json").read_text())
    assert last["partsUploaded"] == last["partsChecked"] >= 2 and last["failures"] == []
    assert (tmp_path / "r2" / "elder-souls-vault" / "snapshot" / "v1" / "manifest.json").is_file()
    assert run(boot, env, "--check").returncode == 0
    (mods / "modb" / "mesh.nif").write_text("modb, changed")
    r = run(boot, env, "--dry-run")
    assert r.returncode == 0
    assert [ln for ln in r.stdout.splitlines() if ln.startswith("would upload")] == ["would upload mod-sources/modb"]
    assert run(boot, env, "--check").returncode == 1
    r = run(boot, env)
    last = json.loads((repo / "tooling" / ".reports" / "backup" / "last.json").read_text())
    assert last["partsUploaded"] == 1
    assert run(boot, env, "--check").returncode == 0


def test_second_run_exits_zero_while_the_lock_is_held(tmp_path):
    dev, repo, boot, mods, env = make_env(tmp_path)
    with open(env["ES_BACKUP_LOCK"], "w") as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)
        r = run(boot, env)
    assert r.returncode == 0 and "already running" in r.stdout
    assert not (tmp_path / "r2" / "elder-souls-vault").exists()
