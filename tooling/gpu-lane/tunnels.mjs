#!/usr/bin/env node
/**
 * The ssh tunnels the gpu-lane harness opens, recorded so they are closed by PID and never by pkill.
 * Registry: $GPU_LANE_TUNNELS or /tmp/gpu-lane/tunnels.json, a list of {pid, purpose, localPort, remotePort, target, at}.
 *
 *   node tooling/gpu-lane/tunnels.mjs open --pod "ssh -i <key> -p <port> root@<ip>" [--local 9222] [--remote 9222] [--purpose cdp]
 *   node tooling/gpu-lane/tunnels.mjs keep --pod "<ssh>" --local 9242 [--remote 9222]   (foreground; re-opens on every drop)
 *   node tooling/gpu-lane/tunnels.mjs list
 *   node tooling/gpu-lane/tunnels.mjs close [--purpose cdp]     (kills only recorded PIDs whose command line is still ssh)
 *
 * pod-capture.mjs --pod opens its own CDP tunnel through openTunnel and closes it at exit (also on SIGINT/SIGTERM).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createServer } from "node:net";

export const registryPath = () => process.env.GPU_LANE_TUNNELS ?? "/tmp/gpu-lane/tunnels.json";
const load = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : []);
const save = (p, list) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, `${JSON.stringify(list, null, 1)}\n`); };

/** True when pid is alive and its command line is ssh (a recycled PID is never killed). */
export function isOurSsh(pid) {
  try { return /(^|\/)ssh\0/.test(readFileSync(`/proc/${pid}/cmdline`, "latin1")); } catch { return false; }
}

/** "ssh -i k -p 1 root@h" -> argv for `ssh -N -L local:127.0.0.1:remote ...`. */
export function tunnelArgs(pod, local, remote) {
  const parts = pod.trim().split(/\s+/);
  if (parts[0] !== "ssh" || parts.length < 2) throw new Error(`--pod wants "ssh [opts] user@host", got ${pod}`);
  return [...parts.slice(1, -1), "-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=4", "-o", "ExitOnForwardFailure=yes",
    "-N", "-L", `${local}:127.0.0.1:${remote}`, parts.at(-1)];
}

/** A free local TCP port. */
export const freePort = () => new Promise((res, rej) => {
  const s = createServer(); s.once("error", rej);
  s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); });
});

/** Open a tunnel, record it, wait until http://127.0.0.1:<local>/json/version answers (CDP) or the port accepts. */
export async function openTunnel({ pod, local, remote = 9222, purpose = "cdp", waitMs = 20_000, reg = registryPath() }) {
  local ??= await freePort();
  const child = spawn("ssh", tunnelArgs(pod, local, remote), { detached: true, stdio: "ignore" });
  child.unref();
  const rec = { pid: child.pid, purpose, localPort: local, remotePort: remote, target: pod.trim().split(/\s+/).at(-1), at: new Date().toISOString() };
  save(reg, [...load(reg).filter((t) => isOurSsh(t.pid)), rec]);
  const t0 = Date.now();
  while (Date.now() - t0 < waitMs) {
    if (child.exitCode !== null) break;
    if (await fetch(`http://127.0.0.1:${local}/json/version`).then((r) => r.ok, () => false)) return rec;
    await new Promise((r) => setTimeout(r, 500));
  }
  closeTunnels({ pid: rec.pid, reg });
  throw new Error(`tunnel ${purpose} 127.0.0.1:${local} -> ${rec.target}:${remote} did not answer in ${waitMs} ms`);
}

/** Re-establish a dropped tunnel on the same local port: a live recorded ssh for that port whose CDP answers is
 * kept; otherwise every recorded ssh for that port is closed and a new one opened. */
export async function ensureTunnel({ pod, local, remote = 9222, purpose = "cdp", reg = registryPath() }) {
  const live = load(reg).find((t) => t.localPort === local && isOurSsh(t.pid));
  if (live && await fetch(`http://127.0.0.1:${local}/json/version`).then((r) => r.ok, () => false)) return live;
  for (const t of load(reg).filter((x) => x.localPort === local)) closeTunnels({ pid: t.pid, reg });
  return openTunnel({ pod, local, remote, purpose, reg });
}

/** Keep a tunnel up: check every everyMs and re-establish it on a drop. Returns stop(). */
export function keepTunnel(args, everyMs = 10_000) {
  let busy = false;
  const h = setInterval(async () => {
    if (busy) return;
    busy = true;
    try { await ensureTunnel(args); } catch { /* retried next tick */ }
    busy = false;
  }, everyMs);
  return () => clearInterval(h);
}

/** Kill recorded tunnels (all, or those matching purpose / pid) and drop them and any dead entries from the registry. */
export function closeTunnels({ purpose, pid, reg = registryPath(), kill = process.kill.bind(process), alive = isOurSsh } = {}) {
  const list = load(reg), keep = [], closed = [];
  for (const t of list) {
    const match = (pid === undefined || t.pid === pid) && (purpose === undefined || t.purpose === purpose);
    if (!alive(t.pid)) continue;
    if (match) { try { kill(t.pid, "SIGTERM"); closed.push(t); } catch { /* already gone */ } } else keep.push(t);
  }
  if (list.length) save(reg, keep);
  return closed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...a] = process.argv.slice(2);
  const opt = (k, d) => { const i = a.indexOf(`--${k}`); return i < 0 ? d : a[i + 1]; };
  if (cmd === "open") {
    const pod = opt("pod", process.env.POD_SSH);
    if (!pod) { console.error("tunnels open: --pod or POD_SSH"); process.exit(2); }
    const t = await openTunnel({ pod, local: opt("local") && Number(opt("local")), remote: Number(opt("remote", 9222)), purpose: opt("purpose", "cdp") });
    console.log(JSON.stringify(t));
  } else if (cmd === "keep") {
    const pod = opt("pod", process.env.POD_SSH);
    if (!pod || !opt("local")) { console.error("tunnels keep: --pod and --local"); process.exit(2); }
    const args = { pod, local: Number(opt("local")), remote: Number(opt("remote", 9222)), purpose: opt("purpose", "cdp") };
    console.log(JSON.stringify(await ensureTunnel(args)));
    keepTunnel(args);
  } else if (cmd === "list") {
    for (const t of load(registryPath())) console.log(`${isOurSsh(t.pid) ? "up  " : "dead"} ${JSON.stringify(t)}`);
  } else if (cmd === "close") {
    const c = closeTunnels({ purpose: opt("purpose") });
    console.log(`tunnels: closed ${c.length}${c.map((t) => ` ${t.pid}(${t.purpose}:${t.localPort})`).join("")}`);
  } else { console.error("usage: tunnels.mjs open|list|close (see header)"); process.exit(2); }
}
