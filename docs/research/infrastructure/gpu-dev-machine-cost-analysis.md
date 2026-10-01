# GPU dev machine: cost analysis (2026-10-01)

Cost-only comparison for the owner's question: give agents a GPU to test the studio, inspect and iterate before an owner walk. Nothing here changes the setup.

## Baseline

- Current box: EC2 `m7i.2xlarge` (8 vCPU, 30 GiB, no GPU), one 242 GiB root volume (80 GiB used), vault local; instance type from `docs/research/infrastructure/codespaces-migration-plan.md`.
- Region assumed us-east-1 (metadata unreachable from the box). Prices are on-demand Linux, from third-party trackers checked 2026-10-01; verify on the AWS calculator before buying.
- Month = 30.4 days: 8 h/day = 243 h, 12 h/day = 365 h. EBS gp3 = $0.08/GB-month: 250 GB $20, 500 GB $40 (billed while stopped).
- Target: MacBook Air M2, 8-core GPU, ~3.6 TFLOPS FP32, Metal (Chrome WebGPU over Dawn/Metal). The project's frame budget (decision 0084) is measured on that machine.
- GPU-bound work today: studio probes and walks, the WebGPU boot check, Blender Cycles/Eevee renders, frame-time measurement. CLAUDE.md forbids studio renders here because SwiftShader (CPU) runs them at a crawl.

## Options

| Option | $/h | Month 8 h/d | Month 12 h/d | Disk | Enables | Does not | Migration |
|---|---|---|---|---|---|---|---|
| A. Current m7i.2xlarge, no GPU | 0.403 | 98 + 20 EBS = **118** | 147 + 20 = **167** | 250 GB gp3 | everything except GPU work | GPU probes; real WebGPU | none |
| B. g4dn.2xlarge (T4, 8 vCPU, 32 GiB, 225 GB local NVMe) | 0.752 | 183 + 20 = **203** | 274 + 20 = **294** | same EBS (+ free scratch NVMe) | headless Chrome WebGL2/WebGPU on a real GPU (Vulkan/ANGLE), Blender GPU renders, agent probe-iterate loop | Metal; T4 (~8 TFLOPS) is ~2x the M2, so frame times don't carry over and only ratios are valid; older Turing card | stop, change instance type, install NVIDIA driver + Vulkan, Chrome flags: ~half a day |
| C. g6.2xlarge (L4, 24 GB) | 0.978 | 238 + 20 = **258** | 357 + 20 = **377** | same | as B, newer Ada card with better Vulkan/WebGPU support | Metal; ~8x the M2 | as B |
| D. g5.2xlarge (A10G) | 1.212 | 295 + 20 = **315** | 442 + 20 = **462** | same | as C | Metal; way above M2 class | as B |
| E. g6e.2xlarge (L40S) | ~2.24 | ~545 + 20 | ~818 + 20 | same | far beyond the need | Metal | as B |
| F. A (current) + RunPod L4/A5000 pod spun up via API for GPU jobs only (~2 h/day) | 0.403 + 0.27–0.39 GPU | 118 + ~16–24 GPU + ~3 volume = **~140** | 167 + same = **~190** | 45 GiB RunPod network volume $0.07/GB ($3) | the same GPU loop as B/C, billed per second, only while a job runs | Metal; per-job start-up (pod boot ~1–3 min, sync the build); a second machine to script and secure | API script, image with Chrome+driver, rsync built site (a few GB per sync; AWS egress $0.09/GB, so ~$0.20–0.50 per sync; vault kept on the RunPod volume, a one-time ~$4 egress for 45 GiB): 1–2 days |
| F1. RunPod as adopted (owner 2026-10-01, [0119](../../decisions/0119-runpod-is-the-gpu-lane.md)) | pod GPU price, stated before each create | **$15/mo credit cap, total** | same cap | pod disk only; deleted after each loop | the WebGPU fix loop on a real GPU | Blender (CPU here); anything slower end to end than SwiftShader | `tooling/webgpu/runpod-setup.sh`; plugin OAuth, no key stored |
| G. A + Lambda / GCP g2-standard-8 (L4) / Azure NVadsA10 v5 on demand | Lambda A10 ~0.75; GCP g2-standard-8 ~0.85; Azure partial A10 ~0.45–0.9 | similar to F, a bit higher per hour | — | each has its own disk | as F | Metal; Lambda bills per minute, with less API-driven ephemeral tooling than RunPod | as F |
| H. Hetzner GEX44 dedicated (RTX 4000 SFF Ada), monthly | flat ~EUR 184/mo + setup fee | ~$200 as a *second* box (+A) or as the only box | same (24/7) | 2x1.92 TB NVMe included | always-on GPU box with large disk; could replace A outright | Metal; EU latency; monthly contract; a full migration if it replaces A | 1–3 days if it replaces A |
| I. AWS mac2-m2.metal (Mac mini M2) | ~0.88 | dedicated host, 24 h minimum per allocation, so in practice ~**640/mo** always-on | same | EBS | the **actual target**: Metal, Chrome WebGPU on Apple GPU, M2-class frame times | Linux tooling (Blender runs but a different OS); expensive; macOS automation is clunkier | 2–3 days (second host, Chrome automation over SSH) |
| J. MacStadium / Scaleway Mac mini M2 rental | — | ~$110–180/mo flat (always-on) | same | 256–512 GB internal | as I, at a fraction of the price | as I; monthly contract | as I |
| K. Owner's own MacBook as a remote test runner (a tunnel to an agent-driven headless Chrome) | 0 | 0 extra | 0 | owner's | true target hardware and frame numbers | only works while the Mac is awake and online; owner hardware tied up; security exposure of a remote-control agent | ~1 day (runner script + tunnel), but needs the owner's set-up |

## Ranking (cost to get an agent-driven GPU probe loop)

1. K: owner's Mac, $0, only target-exact option at no cost; availability-limited.
2. F: current box + RunPod on demand, ~$20–25/mo over today.
3. J: rented Mac mini M2, ~$110–180/mo; target-exact and always available.
4. B: g4dn.2xlarge as the only box, ~$85–127/mo over today; simplest change (same box, new type).
5. C: g6.2xlarge, ~$140–210/mo over today.
6. H: Hetzner GPU box, ~$200/mo flat.
7. D / I / E: $300–800+/mo; out of proportion to the need.

## Caveats common to every Linux GPU option

- Headless Chrome WebGPU on Linux needs the NVIDIA driver and Vulkan (`--enable-unsafe-webgpu --enable-features=Vulkan --use-angle=vulkan`). Without a GPU it falls back to SwiftShader, which is the current slow path. Expect a day of flag and driver work, and a one-shot boot check to prove the real adapter is used.
- Frame times on NVIDIA are not M2 Metal times; use them as ratios against a reference scene measured once on the owner's Mac. Shader-compile and driver bugs specific to Metal (e.g. the ANGLE/Metal multi-draw expansion found in perf round 12) do not reproduce on Linux; only options I–K catch those.
- Spot: g6.2xlarge spot measured at ~$0.89–0.98, close to on-demand, so not worth the interruption risk for a dev box. A 1-year savings plan cuts g6.2xlarge to ~$0.64/h but locks the type in.

Sources: [cloudprice.net g4dn.2xlarge](https://cloudprice.net/aws/ec2/instances/g4dn.2xlarge), [Holori g6.2xlarge](https://calculator.holori.com/aws/ec2/g6.2xlarge), [Wring AWS GPU pricing](https://wring.co/blog/aws-gpu-instance-pricing-guide), [RunPod cloud GPUs](https://www.runpod.io/product/cloud-gpus), [Hivenet RunPod pricing 2026](https://www.hivenet.com/post/runpod-pricing-complete-guide-to-gpu-cloud-costs). Lambda, GCP, Azure, Hetzner, MacStadium and mac2-m2 figures are from training knowledge (mid-2026), not re-fetched: confirm before purchase.
