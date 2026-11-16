// Renders terrapulse-demo-v3.mp4 from the recorded frames: animated zooms, top-left labels, a
// caption band below the picture (clear of the app and of player controls), and a closing
// overlay. Silent by design: the team lead records the narration (see add-voice.mjs).
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { CLOSING, CUES, FPS, LABELS, SCENES, TOTAL, ZOOM } from "./timeline.mjs";

const OUT = process.argv[2] ?? "public/media/terrapulse-demo-v3.mp4";
const D = "docs/media/v3";
mkdirSync(D, { recursive: true });
const BOLD = "C\\:/Windows/Fonts/segoeuib.ttf";
const SEMI = "C\\:/Windows/Fonts/seguisb.ttf";
const W = 1920;
const PH = 900; // picture height; the 180 px band below keeps the caption line above the bottom 10% that player controls cover
const H = 1080;

// ---- piecewise smooth zoom expressions for zoompan (time = on / FPS) ----
const T = `(on/${FPS})`;
const piece = (col) => {
  let e = String(ZOOM[ZOOM.length - 1][col]);
  for (let i = ZOOM.length - 2; i >= 0; i--) {
    const [t0, , ,] = ZOOM[i];
    const t1 = ZOOM[i + 1][0];
    const a = ZOOM[i][col];
    const b = ZOOM[i + 1][col];
    const p = `((${T}-${t0})/${(t1 - t0).toFixed(4)})`;
    const seg = a === b ? `${a}` : `(${a}+(${b - a})*(${p}*${p}*(3-2*${p})))`;
    e = `if(lt(${T},${t1}),${seg},${e})`;
  }
  return e;
};
const Z = piece(1);
const CX = piece(2);
const CY = piece(3);
const zoompan = `zoompan=z='${Z}':x='max(0,min(iw-iw/zoom,(${CX})*iw-iw/zoom/2))':y='max(0,min(ih-ih/zoom,(${CY})*ih-ih/zoom/2))':d=1:s=${W}x${PH}:fps=${FPS}`;

const alpha = (a, b, d = 0.22) => `'if(lt(t,${a}),0,if(lt(t,${a + d}),(t-${a})/${d},if(lt(t,${b - d}),1,if(lt(t,${b}),(${b}-t)/${d},0))))'`;
const file = (name, text) => {
  writeFileSync(`${D}/${name}`, text, "utf8");
  return `${D}/${name}`;
};

const labels = LABELS.map((l, i) => `drawtext=fontfile='${SEMI}':textfile=${file(`label${i}.txt`, l.text)}:fontsize=27:fontcolor=${l.color}:x=(w-text_w)/2:y=${PH + 100}:alpha=${alpha(l.start, l.end)}`);
const captions = CUES.map((c, i) => `drawtext=fontfile='${BOLD}':textfile=${file(`cue${i}.txt`, c.text)}:fontsize=45:fontcolor=0x0b1f3f:x=(w-text_w)/2:y=${PH + 22}:alpha=${alpha(c.start, i === CUES.length - 1 ? TOTAL + 5 : c.end, 0.12)}`);
const closing = [
  `drawtext=fontfile='${BOLD}':textfile=${file("close1.txt", CLOSING.title)}:fontsize=104:fontcolor=0x0b1f3f:box=1:boxcolor=white@0.9:boxborderw=130:x=(w-text_w)/2:y=${PH / 2 - 100}:alpha=${alpha(CLOSING.start, TOTAL + 5, 0.3)}`,
  `drawtext=fontfile='${SEMI}':textfile=${file("close2.txt", CLOSING.tagline)}:fontsize=44:fontcolor=0x1d6bff:x=(w-text_w)/2:y=${PH / 2 + 44}:alpha=${alpha(CLOSING.start + 0.15, TOTAL + 5, 0.3)}`,
];

const filter = [
  `[0:v]fps=${FPS},setsar=1,${zoompan},trim=duration=${TOTAL},setpts=PTS-STARTPTS,format=yuv420p[pic]`,
  `color=c=0xffffff:s=${W}x${H}:r=${FPS}:d=${TOTAL},format=yuv420p[bg]`,
  `[bg][pic]overlay=0:0:shortest=1[v0]`,
  `[v0]drawbox=x=0:y=${PH}:w=${W}:h=2:color=0x0d2a5b@0.14:t=fill,` +
    `drawtext=fontfile='${BOLD}':textfile=${file("brand.txt", "TerraPulse")}:fontsize=30:fontcolor=0x1d6bff:x=44:y=${PH + 32},` +
    [...labels, ...closing, ...captions].join(",") +
    `,trim=duration=${TOTAL},setpts=PTS-STARTPTS[v]`,
].join(";\n");
file("filter.txt", filter);

execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", `${D}/frames.txt`, "-/filter_complex", `${D}/filter.txt`, "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS), "-t", String(TOTAL), "-movflags", "+faststart", OUT], { stdio: "inherit" });

// ---- sidecar files for the narrator: subtitles and a cue sheet ----
const tc = (s) => {
  const ms = Math.round(s * 1000);
  const p = (n, l = 2) => String(n).padStart(l, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
writeFileSync("public/media/terrapulse-demo-v3.srt", CUES.map((c, i) => `${i + 1}\n${tc(c.start)} --> ${tc(c.end)}\n${c.text}\n`).join("\n"), "utf8");
writeFileSync(
  "docs/DEMO_V3_CUES.md",
  `# TerraPulse demo V3: narration cues and shot list\n\nVideo: \`public/media/terrapulse-demo-v3.mp4\`, ${TOTAL.toFixed(2)} s at ${FPS} fps, ${W}×${H}, silent.\nCaptions are burned in and match the script word for word. Speak each line inside its window.\n\n## Narration cues\n\n| Start | End | Words | Line |\n|---|---|---|---|\n${CUES.map((c) => `| ${c.start.toFixed(2)} s | ${c.end.toFixed(2)} s | ${c.text.split(/\s+/).length} | ${c.text} |`).join("\n")}\n\nFull script:\n\n> ${CUES.map((c) => c.text).join(" ")}\n\n## Shot list\n\n| Time | Shot |\n|---|---|\n${SCENES.map((s) => `| ${s.start.toFixed(1)}–${s.end.toFixed(1)} s | ${s.title} |`).join("\n")}\n\n## Adding your recorded narration\n\n\`\`\`bash\nnode scripts/demo-v3/add-voice.mjs path/to/your-voice.wav\n\`\`\`\n\nThis keeps the picture untouched, lays your recording under it from 0:00 and writes\n\`public/media/terrapulse-demo-v3-voice.mp4\`. Record against the silent video so your timing follows\nthe captions; a recording longer than ${TOTAL.toFixed(1)} s is cut at the end of the picture.\n`,
  "utf8",
);
console.log("rendered", OUT);
