/**
 * Builds the feedback form the project owner fills in after watching a capture.
 *
 * This is deliberately unenforced. Nothing machine-checks the owner's prose or
 * gates CI on it: the form exists so qualitative feedback comes back in a shape
 * an agent can act on, not so an agent can be graded compliant. Keep it short —
 * a long form is a form that does not get filled in.
 */

export const REVIEW_PROMPTS = Object.freeze([
  "Semantics: can you tell what each actor is doing without reading telemetry?",
  "Timing and weight: do anticipation, contact, and recovery read as one action?",
  "Transitions: any pose pop, freeze, early cut, or snap between clips?",
  "Grounding: do feet and body respect the floor, airtime, and travel?",
  "Contact: do weapon and body contacts land where they look like they should?",
]);

function scenarioSection({ scenario, label, evidence }) {
  const stripNote = evidence?.strips?.length
    ? `Frame strips (open only if something looked off): \`${scenario}/motion-strips/\`, \`${scenario}/transition-boundaries/\``
    : "Frame strips: none generated.";
  return `## ${scenario} — ${label}

Watch: \`${scenario}/recording.webm\` (or \`${scenario}/normal-speed-review.gif\`), then \`${scenario}/action-closeup.webm\`.
${stripNote}

Verdict: **PENDING**  <!-- GOOD | ISSUES -->

Notes:
`;
}

export function buildReviewMarkdown({
  generatedAt,
  runId,
  scenarios,
  automatedStatus = "PASS",
  probeStatus = "PASS",
}) {
  return `# Animation review — ${runId}

Generated: ${generatedAt}
Automated assertions: **${automatedStatus}**
Render-pose probes: **${probeStatus}**

Open \`review.html\` for everything below in one page.

For each scene: watch it once at normal speed and say what you saw. Set the
verdict to \`GOOD\` or \`ISSUES\` and write notes only where there is something to
say — a timestamp plus what looked wrong is the most useful thing you can give
the agent. Skip the frame strips unless the normal-speed watch raised a question.

Worth checking as you watch:

${REVIEW_PROMPTS.map((prompt) => `- ${prompt}`).join("\n")}

Automated probes can fail this run on their own; they never decide whether it
looks right.

---

${scenarios.map(scenarioSection).join("\n")}`;
}
