// Developer-only, local workflow: turn an exported TerraPulse evidence report into a draft research
// note with Claude Code. This never runs on the public site and no credential is stored or shipped.
//
//   1. In the simulator press "Evidence report" to download terrapulse-scenario-report-*.md
//   2. npm run research -- path/to/terrapulse-scenario-report-cat5.md
//
// Requirements: the `claude` CLI installed and signed in on this computer, with included usage
// available. Without it the script prints the prompt so it can be pasted into a Claude Code session.
// The result is saved under research/notes/ with a header marking it as AI-drafted and unverified.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.error("Usage: npm run research -- <exported scenario report .md>");
  process.exit(1);
}
const report = readFileSync(file, "utf8");
const prompt = `You are helping a developer interpret a TerraPulse scenario evidence report. The full report follows the rules below.

Rules:
- Use only figures that appear in the report. Do not add numbers from memory, and do not estimate prices, returns, outage sizes or durations.
- Keep the report's evidence labels (OBSERVED, MODELED, HYPOTHETICAL, RESEARCH HYPOTHESIS). Anything you infer yourself must be marked RESEARCH HYPOTHESIS.
- The scenario is hypothetical. Never describe it as a forecast.
- Suggest, as questions, what a researcher should check next and which public datasets could answer it. Name a dataset only if you are confident it exists; otherwise say "source to be identified".

Write, in plain Markdown: (1) a five-sentence summary; (2) the three exposures that matter most and why, quoting the report's figures; (3) what the report cannot tell us; (4) five research questions with candidate sources; (5) model improvements that would most reduce uncertainty.

REPORT:

${report}`;

mkdirSync("research/notes", { recursive: true });
const out = `research/notes/${basename(file).replace(/\.md$/, "")}-note-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}.md`;
const has = spawnSync(process.platform === "win32" ? "where" : "which", ["claude"], { encoding: "utf8" }).status === 0;
if (!has) {
  writeFileSync(out.replace(/\.md$/, ".prompt.txt"), prompt);
  console.log(`The claude CLI was not found. The prompt was saved to ${out.replace(/\.md$/, ".prompt.txt")}; paste it into Claude Code.`);
  process.exit(0);
}
console.log("Running Claude Code locally (uses your existing subscription)…");
const r = spawnSync("claude", ["-p"], { input: prompt, encoding: "utf8", shell: process.platform === "win32", maxBuffer: 16 * 1024 * 1024 });
if (r.status !== 0 || !r.stdout?.trim()) {
  console.error("Claude Code did not return a note (not signed in, or usage unavailable). Nothing was saved.");
  console.error((r.stderr ?? "").slice(0, 400));
  process.exit(1);
}
writeFileSync(
  out,
  `> **AI-drafted research note. Not verified.** Drafted locally with Claude Code on ${new Date().toISOString()} from \`${basename(file)}\`. It is a starting point for human research, not a finding. Figures should match the source report; check them before use.\n\n${r.stdout.trim()}\n`,
);
console.log(`Saved ${out}`);
