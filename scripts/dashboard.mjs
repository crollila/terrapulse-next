// Local engineering dashboard. Developer-only, never deployed. Binds to 127.0.0.1.
//   npm run dashboard   ->  http://localhost:4600
// It shows measured state only: status/status.json (written by scripts/status.mjs), the git log,
// the task queue, saved screenshots and logs. Agent activity is shown as last reported, with its
// timestamp, because there is no live link to agent sessions.
import { createServer } from "node:http";
import { spawn, execSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, openSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.TP_DASH_PORT ?? 4600);
const ROOT = process.cwd();
const LOGS = join(ROOT, "status", "logs");
mkdirSync(LOGS, { recursive: true });

/** Processes started from this dashboard (and only those) can be stopped from it. */
const procs = new Map();
const JOBS = {
  quick: ["node", ["scripts/status.mjs", "--quick"]],
  full: ["node", ["scripts/status.mjs"]],
  e2e: ["node", ["scripts/status.mjs", "--quick", "--e2e"]],
  dev: ["npm", ["run", "dev"]],
  preview: ["npm", ["run", "preview"]],
};

function start(name) {
  if (!JOBS[name]) return { ok: false, error: "unknown job" };
  if (procs.get(name)?.running) return { ok: false, error: "already running" };
  const [cmd, args] = JOBS[name];
  const log = join(LOGS, `${name}.log`);
  const fd = openSync(log, "w");
  const child = spawn(cmd, args, { cwd: ROOT, shell: process.platform === "win32", stdio: ["ignore", fd, fd] });
  const rec = { name, pid: child.pid, startedAt: new Date().toISOString(), running: true, exitCode: null, endedAt: null };
  child.on("exit", (code) => Object.assign(rec, { running: false, exitCode: code, endedAt: new Date().toISOString() }));
  rec.child = child;
  procs.set(name, rec);
  return { ok: true, pid: child.pid };
}
function stop(name) {
  const p = procs.get(name);
  if (!p?.running) return { ok: false, error: "not running" };
  try {
    if (process.platform === "win32") execSync(`taskkill /pid ${p.pid} /T /F`, { stdio: "ignore" });
    else p.child.kill("SIGTERM");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message) };
  }
}
const readJson = (f, fallback) => {
  try {
    return JSON.parse(readFileSync(join(ROOT, f), "utf8"));
  } catch {
    return fallback;
  }
};
const tail = (f, n = 60) => {
  try {
    return readFileSync(f, "utf8").split(/\r?\n/).slice(-n).join("\n");
  } catch {
    return "";
  }
};
const git = (args) => {
  try {
    return execSync(`git ${args}`, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

function api() {
  const events = tail(join(ROOT, "status", "events.jsonl"), 25)
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .reverse();
  return {
    now: new Date().toISOString(),
    status: readJson("status/status.json", null),
    agents: readJson("docs/agents-last-report.json", { note: "No agent report recorded.", agents: [] }),
    events,
    git: { head: git("log -1 --format=%h%x09%cI%x09%s"), dirty: git("status --porcelain").split("\n").filter(Boolean).length },
    processes: [...procs.values()].map(({ child, ...p }) => p),
    progressUpdated: existsSync(join(ROOT, "PROGRESS.md")) ? statSync(join(ROOT, "PROGRESS.md")).mtime.toISOString() : null,
  };
}

const PAGE = String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TerraPulse engineering dashboard</title>
<style>
:root{--navy:#0b1f3f;--ink:#26313f;--muted:#64728a;--line:rgba(13,42,91,.12);--blue:#1d6bff;--green:#1f8a57;--red:#d93a3f;--amber:#b76a00}
*{box-sizing:border-box}body{margin:0;font:14px/1.45 -apple-system,"Segoe UI Variable Text","Segoe UI",Inter,Roboto,sans-serif;color:var(--ink);background:#f7f8fa}
header{display:flex;align-items:center;gap:14px;padding:14px 22px;background:#fff;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:2}
h1{font-size:17px;margin:0;color:var(--navy)}h2{font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}
main{display:grid;grid-template-columns:repeat(12,1fr);gap:14px;padding:18px 22px;max-width:1500px;margin:0 auto}
.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:0 1px 2px rgba(13,42,91,.04);min-width:0}
.c3{grid-column:span 3}.c4{grid-column:span 4}.c6{grid-column:span 6}.c8{grid-column:span 8}.c12{grid-column:span 12}
@media(max-width:1000px){.c3,.c4,.c6,.c8{grid-column:span 12}}
.big{font-size:26px;font-weight:680;color:var(--navy);letter-spacing:-.02em}.muted{color:var(--muted)}.small{font-size:12px}
.ok{color:var(--green)}.bad{color:var(--red)}.warn{color:var(--amber)}
.pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.pill.ok{background:#e4f6ec}.pill.bad{background:#fdeceb}.pill.warn{background:#fff4dd}.pill.todo{background:#e8f1ff;color:#0b4fd6}
button{font:inherit;border:1px solid rgba(13,42,91,.2);background:#fff;border-radius:9px;padding:6px 11px;font-weight:600;color:var(--navy);cursor:pointer}
button.primary{background:var(--blue);border-color:#1257dc;color:#fff}button:disabled{opacity:.5}
table{width:100%;border-collapse:collapse;font-size:12.5px}td,th{padding:6px 8px 6px 0;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}
pre{background:#f2f5fa;border-radius:10px;padding:10px;font:11.5px/1.45 ui-monospace,Consolas,monospace;overflow:auto;max-height:260px;white-space:pre-wrap;margin:0}
.shots{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}.shots a{display:block;border:1px solid var(--line);border-radius:10px;overflow:hidden;text-decoration:none;color:var(--muted);font-size:11px}
.shots img{width:100%;display:block;aspect-ratio:16/10;object-fit:cover;object-position:top}.shots span{display:block;padding:5px 8px}
a{color:#0b4fd6}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
</style></head><body>
<header><h1>TerraPulse Next · engineering dashboard</h1><span class="muted small" id="now"></span><span style="flex:1"></span>
<div class="row"><button onclick="run('quick')">Refresh status</button><button onclick="run('full')">Run tests + build</button><button class="primary" onclick="run('e2e')">Browser tests on live site</button></div></header>
<main id="app"><div class="card c12">Loading…</div></main>
<script>
const $=s=>document.querySelector(s);const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const ago=iso=>{if(!iso)return"never";const m=(Date.now()-Date.parse(iso))/6e4;return m<1?"just now":m<60?Math.round(m)+" min ago":m<2880?Math.round(m/60)+" h ago":Math.round(m/1440)+" d ago"};
const pill=(ok,t)=>'<span class="pill '+(ok===true?"ok":ok===false?"bad":"warn")+'">'+esc(t)+"</span>";
async function run(job){await fetch("/api/run?job="+job,{method:"POST"});load()}
async function proc(name,action){await fetch("/api/proc?name="+name+"&action="+action,{method:"POST"});load()}
async function showLog(name){const t=await (await fetch("/api/log?name="+name)).text();$("#log").textContent=t||"(empty)";$("#logname").textContent=name}
async function load(){
  const d=await (await fetch("/api/status")).json();const s=d.status;$("#now").textContent="page data read "+new Date(d.now).toLocaleTimeString();
  if(!s){$("#app").innerHTML='<div class="card c12">No status recorded yet. Press <b>Refresh status</b>.</div>';return}
  const u=s.tests?.unit,e=s.tests?.e2eLive,t=s.tasks||{},running=d.processes.filter(p=>p.running);
  const phase=t.next?("Phase "+t.next.phase+" · "+t.next.title):"No open task";
  $("#app").innerHTML=
  '<div class="card c3"><h2>Deployment</h2><div class="big '+(s.live.ok?"ok":"bad")+'">'+(s.live.ok?"Live":"Problem")+'</div><div class="small"><a href="'+s.live.url+'" target="_blank">'+s.live.url+'</a></div><div class="small muted">HTTP '+esc(s.live.httpStatus??s.live.error)+" · checked "+ago(s.live.checkedAt)+"</div></div>"+
  '<div class="card c3"><h2>Unit tests</h2><div class="big '+(u?.ok?"ok":"bad")+'">'+(u?(u.passed+" / "+u.total):"not run")+'</div><div class="small muted">'+(u?((u.failed||0)+" failed · "+(u.skipped||0)+" skipped · run "+ago(u.ranAt)):"")+"</div></div>"+
  '<div class="card c3"><h2>Browser tests on live site</h2><div class="big '+(e?(e.ok?"ok":"bad"):"warn")+'">'+(e?(e.passed+" passed"+(e.failed?" · "+e.failed+" failed":"")):"not run")+'</div><div class="small muted">'+(e?("last successful verification run "+ago(e.ranAt)):"press the blue button")+"</div></div>"+
  '<div class="card c3"><h2>Latest commit</h2><div style="font-weight:650;color:var(--navy)">'+esc((d.git.head||"").split("\t")[2])+'</div><div class="small muted">'+esc((d.git.head||"").split("\t")[0])+" · "+ago((d.git.head||"").split("\t")[1])+" · "+(d.git.dirty?('<span class="warn">'+d.git.dirty+" uncommitted</span>"):"clean")+"</div></div>"+
  '<div class="card c8"><h2>Current phase and tasks</h2><div style="font-weight:650;color:var(--navy);margin-bottom:8px">'+esc(phase)+'</div><div class="row small" style="margin-bottom:8px">'+pill(true,t.done+" verified")+' <span class="pill todo">'+t.todo+" pending</span> "+pill(null,t.blocked+" blocked")+'<span class="muted">queue updated '+ago(t.updated)+"</span></div><table><tr><th>ID</th><th>Task</th><th>Owner</th><th>Status</th></tr>"+
    (t.list||[]).filter(x=>x.status!=="done").map(x=>"<tr><td>"+esc(x.id)+"</td><td>"+esc(x.title)+(x.blockedBy?'<div class="small warn">Blocked: '+esc(x.blockedBy)+"</div>":"")+"</td><td>"+esc(x.owner||"")+"</td><td>"+(x.status==="blocked"?pill(null,"blocked"):'<span class="pill todo">todo</span>')+"</td></tr>").join("")+"</table></div>"+
  '<div class="card c4"><h2>Agent assignments (last reported)</h2><div class="small muted" style="margin-bottom:6px">'+esc(d.agents.note||"")+"</div>"+
    (d.agents.agents||[]).map(a=>'<div style="margin-bottom:8px"><b>'+esc(a.role)+"</b> "+pill(a.state==="finished"?true:null,a.state)+'<div class="small">'+esc(a.task)+'</div><div class="small muted">reported '+ago(a.reportedAt)+" ("+esc(a.reportedAt)+")</div></div>").join("")+
    '<h2 style="margin-top:14px">Local processes</h2>'+["dev","preview"].map(n=>{const p=d.processes.find(x=>x.name===n);const on=p?.running;return '<div class="row small" style="margin-bottom:6px"><b style="width:64px">'+n+"</b>"+(on?pill(true,"running pid "+p.pid):pill(null,"stopped"))+'<button onclick="proc(\''+n+"','"+(on?"stop":"start")+'\')">'+(on?"Stop":"Start")+'</button><button onclick="showLog(\''+n+'\')">Log</button></div>'}).join("")+
    (running.filter(p=>!["dev","preview"].includes(p.name)).map(p=>'<div class="small">job <b>'+p.name+"</b> running since "+ago(p.startedAt)+' <button onclick="proc(\''+p.name+"','stop')\">Stop</button></div>").join(""))+"</div>"+
  '<div class="card c6"><h2>Recent progress events</h2><table><tr><th>When</th><th>Commit</th><th>Unit</th><th>Live</th><th>Browser</th></tr>'+d.events.slice(0,12).map(x=>"<tr><td>"+ago(x.at)+"</td><td>"+esc(x.commit)+"</td><td>"+(x.unit?(x.unit.ok?'<span class="ok">'+x.unit.passed+" ok</span>":'<span class="bad">failing</span>'):"–")+"</td><td>"+(x.live?'<span class="ok">ok</span>':'<span class="bad">down</span>')+"</td><td>"+(x.e2eLive==null?"–":x.e2eLive?'<span class="ok">ok</span>':'<span class="bad">fail</span>')+"</td></tr>").join("")+"</table>"+
    '<h2 style="margin-top:14px">Recent commits</h2><pre>'+esc((s.git.recent||[]).map(l=>l.replace(/\t/g,"  ")).join("\n"))+"</pre></div>"+
  '<div class="card c6"><h2>Known defects and blockers</h2><pre style="max-height:420px">'+esc(s.blockers||"none recorded")+"</pre>"+((s.tests?.unitFailures||[]).length?'<h2 style="margin-top:12px">Failing tests</h2><pre>'+esc(s.tests.unitFailures.join("\n"))+"</pre>":"")+"</div>"+
  '<div class="card c12"><h2>Log: <span id="logname">status</span></h2><div class="row" style="margin-bottom:8px">'+["quick","full","e2e","dev","preview"].map(n=>'<button onclick="showLog(\''+n+'\')">'+n+"</button>").join("")+'</div><pre id="log">Select a log.</pre></div>'+
  '<div class="card c12"><h2>Latest screenshots (from the real app)</h2><div class="shots">'+(s.screenshots||[]).map(x=>'<a href="/shots/'+x.file.split("/").pop()+'" target="_blank"><img loading="lazy" src="/shots/'+x.file.split("/").pop()+'"><span>'+esc(x.file.split("/").pop())+" · "+ago(x.modifiedAt)+"</span></a>").join("")+"</div></div>";
}
load();setInterval(load,8000);
</script></body></html>`;

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const send = (code, body, type = "application/json") => {
    res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  };
  if (req.method === "POST") {
    // local only: refuse cross-site requests
    const origin = req.headers.origin;
    if (origin && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return send(403, { ok: false, error: "forbidden" });
    if (url.pathname === "/api/run") return send(200, start(url.searchParams.get("job")));
    if (url.pathname === "/api/proc") {
      const name = url.searchParams.get("name");
      return send(200, url.searchParams.get("action") === "stop" ? stop(name) : start(name));
    }
    return send(404, { ok: false });
  }
  if (url.pathname === "/") return send(200, PAGE, "text/html; charset=utf-8");
  if (url.pathname === "/api/status") return send(200, api());
  if (url.pathname === "/api/log") {
    const name = (url.searchParams.get("name") ?? "").replace(/[^a-z0-9]/gi, "");
    return send(200, tail(join(LOGS, `${name}.log`), 200), "text/plain; charset=utf-8");
  }
  if (url.pathname.startsWith("/shots/")) {
    const f = normalize(join(ROOT, "docs", "screenshots", url.pathname.slice(7).replace(/[^\w.-]/g, "")));
    if (!f.startsWith(join(ROOT, "docs", "screenshots")) || !existsSync(f) || extname(f) !== ".png") return send(404, "not found", "text/plain");
    res.writeHead(200, { "content-type": "image/png" });
    return createReadStream(f).pipe(res);
  }
  send(404, "not found", "text/plain");
});
server.listen(PORT, "127.0.0.1", () => console.log(`Engineering dashboard: http://localhost:${PORT}  (Ctrl+C to stop; stops the processes it started)`));
const shutdown = () => {
  for (const [name, p] of procs) if (p.running) stop(name);
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
