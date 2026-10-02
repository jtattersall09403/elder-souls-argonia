#!/usr/bin/env bash
# The repo-standards test suite (`npm test` here). It re-runs itself through
# job_guard.sh (off CI, when not already guarded), so the CPU watchdog never
# pauses it (walk 5
# 2026-09-29: unguarded runs were paused mid-suite and read as 300 s hangs;
# the suite itself takes ~30 s). Every part runs even when an earlier one
# fails, so one red never hides another.
cd "$(dirname "${BASH_SOURCE[0]}")" || exit 2
if [[ -z "${ES_JOB_GUARD:-}" && -z "${CI:-}" ]]; then
  exec bash job_guard.sh repo-standards-test -- bash test.sh
fi
python3 -m pytest -q -p no:cacheprovider -p no:randomly . ../bootstrap ../gpu-lane/walk; p=$?
node check.mjs; c=$?
node --test preflight_select.test.mjs preflight_heads.test.mjs ../province-artefact/common.test.mjs \
  ../pages-site/kit-ref.test.mjs ../pages-site/kit-reach.test.mjs ../gpu-lane/measure.test.mjs ../gpu-lane/walk/*.test.mjs; n=$?
node check_site_refs.mjs; r=$?
node check_no_glsl.mjs; g=$?
exit $(( p | c | n | r | g ))
