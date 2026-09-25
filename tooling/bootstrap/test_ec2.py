"""Checks for the EC2 bootstrap (run: python3 -m pytest -q tooling/bootstrap/test_ec2.py).

- install-toolchain.sh pins equal the Dockerfile ARGs (the two must not drift
  while the Dockerfile cannot call the script);
- every bootstrap script parses (bash -n);
- session_tokens.py finds this repo's transcripts the way lane_resume.py does;
- cpu_watchdog never throttles the `code tunnel` CLI;
- on-start.sh off a codespace takes ES_TUNNEL_URL from the machine file.
"""
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
STANDARDS = REPO / "tooling" / "repo-standards"
sys.path.insert(0, str(STANDARDS))


def assigns(text, pattern):
    return dict(re.findall(pattern, text, re.M))


def test_pins_match_the_dockerfile():
    docker = assigns((REPO / ".devcontainer" / "Dockerfile").read_text(), r"^ARG (\w+)=(\S+)$")
    script = assigns((HERE / "install-toolchain.sh").read_text(), r"^([A-Z_]+(?:VERSION|SHA256|TAG))=(\S+)$")
    assert docker, "no ARG pins read from the Dockerfile"
    assert {k: script.get(k) for k in docker} == docker


def test_every_script_parses():
    for f in sorted(HERE.glob("*.sh")):
        r = subprocess.run(["bash", "-n", str(f)], capture_output=True, text=True)
        assert r.returncode == 0, f"{f.name}: {r.stderr}"


def test_session_tokens_derives_the_project_folder(monkeypatch, tmp_path):
    import lane_resume
    import session_tokens
    assert session_tokens.PROJ == str(lane_resume.project_dir())
    assert "analyticalplatform" not in session_tokens.PROJ
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(tmp_path))
    assert lane_resume.project_dir(Path("/workspaces/elder-souls-argonia")) == \
        tmp_path / "projects" / "-workspaces-elder-souls-argonia"


def test_watchdog_exempts_the_vscode_tunnel():
    import cpu_watchdog as wd
    assert wd.EXEMPT_ARGS.search("/usr/local/bin/code tunnel service internal-run")
    assert wd.EXEMPT_ARGS.search("code tunnel --accept-server-license-terms --name es-argonia")
    assert wd.EXEMPT_ARGS.search("/usr/local/bin/code --verbose --cli-data-dir /home/es/.vscode/cli tunnel service internal-run")
    assert "code" in wd.EXEMPT_COMM
    assert not wd.EXEMPT_ARGS.search("python3 -m worldgen.mine_mounts --code tunnelling")


def test_on_start_reads_the_tunnel_url_off_a_codespace(tmp_path):
    root = tmp_path / "repo"
    (root / "tooling" / "bootstrap").mkdir(parents=True)
    (root / "tooling" / "repo-standards").mkdir(parents=True)
    shutil.copy(HERE / "on-start.sh", root / "tooling" / "bootstrap" / "on-start.sh")
    (root / "tooling" / "bootstrap" / "cache-links.sh").write_text('echo "links ES_CACHE_LINKS=${ES_CACHE_LINKS:-unset}"\n')
    (root / "tooling" / "repo-standards" / "cpu_watchdog.sh").write_text("echo running, nice 0\n")
    home = tmp_path / "home"
    home.mkdir()
    machine = tmp_path / "machine.env"
    env = {k: v for k, v in os.environ.items() if not k.startswith(("CODESPACE", "GITHUB_CODESPACES", "ES_TUNNEL"))}
    env.update(HOME=str(home), ES_MACHINE_ENV=str(machine))
    run = lambda: subprocess.run(["bash", str(root / "tooling" / "bootstrap" / "on-start.sh")],
                                 env=env, capture_output=True, text=True)
    r = run()
    assert r.returncode == 0 and "leaving ES_TUNNEL_URL alone" in r.stdout, r.stdout + r.stderr
    machine.write_text("ES_CACHE_LINKS=0\nES_TUNNEL_URL=https://abc-8081.euw.devtunnels.ms/\n")
    r = run()
    assert r.returncode == 0, r.stderr
    assert "links ES_CACHE_LINKS=0" in r.stdout
    assert 'export ES_TUNNEL_URL="https://abc-8081.euw.devtunnels.ms"' in (home / ".bashrc").read_text()
    settings = json.loads((root / ".claude" / "settings.local.json").read_text())
    assert settings["env"] == {"ES_TUNNEL_URL": "https://abc-8081.euw.devtunnels.ms", "ES_STUDIO_PORT": "8081"}
