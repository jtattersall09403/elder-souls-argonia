import { resolve } from "node:path";

const STABLE_RUN_IDS = new Set(["latest", "smoke-latest"]);
const RUN_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;

export function assertVisualRunId(runId) {
  if (typeof runId !== "string"
    || !RUN_ID_PATTERN.test(runId)
    || runId === "."
    || runId === "..") {
    throw new Error(
      "Run ID may contain only letters, numbers, dot, underscore, and dash and cannot be . or ..",
    );
  }
  return runId;
}

/** Keep stable gate aliases shallow; isolate all named diagnostics under runs/. */
export function visualRunDirectory(root, runId) {
  assertVisualRunId(runId);
  return STABLE_RUN_IDS.has(runId)
    ? resolve(root, "artifacts/visual-validation", runId)
    : resolve(root, "artifacts/visual-validation/runs", runId);
}
