// Prints what to do next, from the task queue and the measured state. It does not run an AI model.
//   npm run resume            show the next task and a prompt to paste into Claude Code
//   npm run resume -- --run   also start Claude Code non-interactively, if the `claude` CLI is installed
//
// Conditions for any autonomous continuation: this computer is on, the `claude` CLI is signed in,
// and included usage is available. Nothing here schedules itself or runs in the cloud.
import { execSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const q = JSON.parse(readFileSync("TASK_QUEUE.json", "utf8"));
const next = q.tasks.find((t) => t.status === "todo");
const sh = (c) => {
  try {
    return execSync(c, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};
console.log(`HEAD      ${sh("git log -1 --format=%h%x20%s")}`);
console.log(`dirty     ${sh("git status --porcelain").split("\n").filter(Boolean).length} file(s)`);
if (!next) {
  console.log("No task with status todo. See BLOCKERS.md for blocked items.");
  process.exit(0);
}
const prompt = [
  `Resume TerraPulse Next. Read CLAUDE.md, PROGRESS.md, BLOCKERS.md and TASK_QUEUE.json first, then verify them with git status, npm test and npm run status:quick.`,
  `Then do task ${next.id}: ${next.title}.`,
  `Follow the hard rules in CLAUDE.md (original repository is read-only, $0, no invented numbers).`,
  `When done: run npm run test:all, update PROGRESS.md, TASK_QUEUE.json, MODEL_VALIDATION.md and TEST_REPORT.md to match what is true, commit, push, and verify the live site with npm run check:live.`,
].join(" ");
console.log(`next      ${next.id} (phase ${next.phase}): ${next.title}`);
console.log(`\nPrompt for Claude Code:\n\n${prompt}\n`);
if (process.argv.includes("--run")) {
  const has = spawnSync(process.platform === "win32" ? "where" : "which", ["claude"], { encoding: "utf8" }).status === 0;
  if (!has) {
    console.log("The `claude` CLI was not found on PATH. Paste the prompt into a Claude Code session instead.");
    process.exit(1);
  }
  console.log("Starting Claude Code (uses your existing subscription; stops when usage is unavailable)…");
  spawnSync("claude", ["-p", prompt], { stdio: "inherit", shell: process.platform === "win32" });
}
