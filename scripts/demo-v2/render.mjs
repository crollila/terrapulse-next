// Renders the revised NASA demo: title card, cross-fade into the recorded app footage, captions,
// narration, fade-out. Inputs: docs/media/v2/{raw.webm, marks.json, plan.json, n*.wav}.
// Output: public/media/terrapulse-demo-v2.mp4 (the earlier terrapulse-next-demo-30s.mp4 is kept).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const plan = JSON.parse(readFileSync("docs/media/v2/plan.json", "utf8"));
const { marks } = JSON.parse(readFileSync("docs/media/v2/marks.json", "utf8"));
const OUT = process.argv[2] ?? "public/media/terrapulse-demo-v2.mp4";
const BOLD = "C\\:/Windows/Fonts/segoeuib.ttf";
const REG = "C\\:/Windows/Fonts/segoeui.ttf";
const NAVY = "0x0b1f3f";
const BLUE = "0x1d6bff";
const T = plan.total;

// caption text goes through files so punctuation needs no escaping
const caps = plan.lines.map((l, i) => {
  const file = `docs/media/v2/cap_${l.id}.txt`;
  writeFileSync(file, l.caption, "utf8");
  const start = i === 0 ? plan.footageStart + 0.2 : l.start - 0.15;
  const end = i === plan.lines.length - 1 ? T : Math.min(plan.lines[i + 1].start - 0.2, l.end + 0.2);
  return { file, start, end };
});
writeFileSync("docs/media/v2/title1.txt", "TerraPulse", "utf8");
writeFileSync("docs/media/v2/title2.txt", "Earth intelligence. Economic foresight.", "utf8");
writeFileSync("docs/media/v2/title3.txt", "NASA Space Apps 2026 · Be an Earth System Trend Detective", "utf8");

const fadeAlpha = (a, b, d = 0.25) => `'if(lt(t,${a}),0,if(lt(t,${a + d}),(t-${a})/${d},if(lt(t,${b - d}),1,if(lt(t,${b}),(${b}-t)/${d},0))))'`;
const capFilters = caps
  .map((c) => `drawtext=fontfile='${BOLD}':textfile=${c.file}:fontsize=24:fontcolor=${NAVY}:x=(w-text_w)/2:y=h-43:alpha=${fadeAlpha(c.start, c.end)}`)
  .join(",");

const filter = [
  // title card
  `color=c=0xf7f8fa:s=1280x720:r=30:d=${plan.title},` +
    `drawtext=fontfile='${BOLD}':textfile=docs/media/v2/title1.txt:fontsize=92:fontcolor=${NAVY}:x=(w-text_w)/2:y=250,` +
    `drawtext=fontfile='${REG}':textfile=docs/media/v2/title2.txt:fontsize=34:fontcolor=${BLUE}:x=(w-text_w)/2:y=372,` +
    `drawtext=fontfile='${REG}':textfile=docs/media/v2/title3.txt:fontsize=22:fontcolor=0x64728a:x=(w-text_w)/2:y=446,` +
    `format=yuv420p[title]`,
  // app footage from the first scene mark
  `[0:v]trim=start=${marks.fourAnswers.toFixed(3)}:duration=${(plan.footageDuration + 0.2).toFixed(3)},setpts=PTS-STARTPTS,fps=30,scale=1280:720,format=yuv420p[foot]`,
  `[title][foot]xfade=transition=fade:duration=${plan.xfade}:offset=${plan.footageStart}[v0]`,
  `[v0]drawbox=x=0:y=ih-62:w=iw:h=62:color=white@0.9:t=fill:enable='gte(t,${plan.footageStart + 0.1})',${capFilters},fade=t=out:st=${(T - 0.35).toFixed(2)}:d=0.35,trim=duration=${T},setpts=PTS-STARTPTS[v]`,
  // narration
  ...plan.lines.map((l, i) => `[${i + 1}:a]aresample=48000,adelay=${Math.round(l.start * 1000)}:all=1[a${i}]`),
  `${plan.lines.map((_, i) => `[a${i}]`).join("")}amix=inputs=${plan.lines.length}:normalize=0:duration=longest,apad=whole_dur=${T},atrim=duration=${T},volume=1.25,alimiter=limit=0.89[a]`,
].join(";\n");
writeFileSync("docs/media/v2/filter.txt", filter, "utf8");

const args = ["-y", "-v", "error", "-i", "docs/media/v2/raw.webm", ...plan.lines.flatMap((l) => ["-i", `docs/media/v2/${l.id}.wav`]), "-/filter_complex", "docs/media/v2/filter.txt", "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-t", String(T), "-movflags", "+faststart", OUT];
execFileSync("ffmpeg", args, { stdio: "inherit" });
console.log("rendered", OUT);
