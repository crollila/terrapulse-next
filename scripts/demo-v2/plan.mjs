// Builds the timeline of the revised demo from the measured narration clips.
// Output: docs/media/v2/plan.json (video-time starts for narration, captions and scenes).
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const TOTAL = 29.3; // seconds; hard limit for the NASA demo is 30
const TITLE = 2.2; // title card length
const XFADE = 0.4; // cross-fade from the title card into the app footage
const GAP = 0.28; // pause between narration lines
const cfg = JSON.parse(readFileSync("scripts/demo-v2/narration.json", "utf8"));
const dur = (id) => Number(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 docs/media/v2/${id}.wav`, { encoding: "utf8" }).trim());

let t = 0.3;
const lines = cfg.lines.map((l) => {
  const d = dur(l.id);
  const item = { ...l, start: +t.toFixed(3), duration: +d.toFixed(3), end: +(t + d).toFixed(3) };
  t += d + GAP;
  return item;
});
const speechEnd = lines.at(-1).end;
if (speechEnd > TOTAL - 0.15) throw new Error(`Narration ends at ${speechEnd.toFixed(2)} s, beyond ${TOTAL} s. Raise the speech rate or shorten the text.`);
const by = Object.fromEntries(lines.map((l) => [l.id, l]));
const footageStart = TITLE - XFADE; // video time at which footage frame 0 is shown
// scene boundaries in video time
const scenes = {
  fourAnswers: [footageStart, by.n2.start - 0.15],
  amazon: [by.n2.start - 0.15, by.n3.start - 0.1],
  break2005: [by.n3.start - 0.1, by.n4.start - 0.2],
  alaska: [by.n4.start - 0.2, by.n4.end - 0.25],
  houston: [by.n4.end - 0.25, TOTAL],
};
const plan = {
  total: TOTAL,
  title: TITLE,
  xfade: XFADE,
  footageStart,
  footageDuration: +(TOTAL - footageStart).toFixed(3),
  lines,
  scenes,
  // scene lengths in footage time, used by the recorder
  sceneSeconds: Object.fromEntries(Object.entries(scenes).map(([k, [a, b]]) => [k, +(b - a).toFixed(3)])),
};
writeFileSync("docs/media/v2/plan.json", JSON.stringify(plan, null, 2));
console.log(JSON.stringify({ speechEnd, sceneSeconds: plan.sceneSeconds }, null, 1));
