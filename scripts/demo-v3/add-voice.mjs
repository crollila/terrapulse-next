// Lays a recorded narration under the silent V3 demo without touching the picture.
//   node scripts/demo-v3/add-voice.mjs path/to/voice.wav [offsetSeconds]
// Output: public/media/terrapulse-demo-v3-voice.mp4 (the silent terrapulse-demo-v3.mp4 is kept).
// The recording starts at 0:00 (or at the optional offset) and is cut or padded to the picture length.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { TOTAL } from "./timeline.mjs";

const voice = process.argv[2];
const offset = Number(process.argv[3] ?? 0);
if (!voice || !existsSync(voice)) {
  console.error("Usage: node scripts/demo-v3/add-voice.mjs <voice file: wav, m4a or mp3> [offsetSeconds]");
  process.exit(1);
}
const src = "public/media/terrapulse-demo-v3.mp4";
const out = "public/media/terrapulse-demo-v3-voice.mp4";
const len = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", voice], { encoding: "utf8" }).trim());
if (len + offset > TOTAL + 0.05) console.warn(`Warning: the recording is ${len.toFixed(2)} s; anything after ${TOTAL} s is cut.`);
execFileSync(
  "ffmpeg",
  ["-y", "-v", "error", "-i", src, "-i", voice, "-filter_complex", `[1:a]aresample=48000,adelay=${Math.round(offset * 1000)}:all=1,apad=whole_dur=${TOTAL},atrim=duration=${TOTAL},loudnorm=I=-16:TP=-1.5:LRA=11[a]`, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-t", String(TOTAL), "-movflags", "+faststart", out],
  { stdio: "inherit" },
);
console.log(`Wrote ${out} (${TOTAL} s). Picture unchanged; captions already match the script.`);
