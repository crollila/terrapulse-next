import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../state/store";
import { useScenario, useTimeline } from "../state/derived";
import { TIERS, TIER_LABEL, chainOf, nodeVisible, type GNode, type NodeType } from "../sim/graph";

interface PathD {
  id: string;
  d: string;
  hyp: boolean;
}

export function ImpactGraph() {
  const { graph } = useScenario();
  const tl = useTimeline();
  const selection = useStore((s) => s.selection);
  const simStarted = useStore((s) => s.simStarted);
  const simPos = useStore((s) => s.simPos);
  const filter = useStore((s) => s.graphFilter);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const wrap = useRef<HTMLDivElement>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const [paths, setPaths] = useState<PathD[]>([]);
  const st = useStore.getState();

  const preview = !simStarted && simPos === 0;
  const visible = useMemo(() => {
    const ids = new Set<string>();
    for (const n of graph.nodes) {
      if (filter[n.type]) continue;
      if (preview || nodeVisible(n, tl.graphDepth, tl.tH)) ids.add(n.id);
    }
    return ids;
  }, [graph, tl.graphDepth, tl.tH, preview, filter]);

  // Which node does the current selection correspond to? (globe -> graph sync)
  const selNode: GNode | undefined = useMemo(() => {
    if (!selection) return undefined;
    if (selection.type === "node") return graph.nodes.find((n) => n.id === selection.id);
    if (selection.type === "refinery" || selection.type === "port") return graph.nodes.find((n) => n.assetId === selection.id) ?? graph.nodes.find((n) => n.type === "asset" && n.assetIds?.includes(selection.id));
    return undefined;
  }, [selection, graph]);
  const selEdge = selection?.type === "edge" ? selection.id : null;
  const chain = useMemo(() => (selNode ? chainOf(graph, selNode.id) : null), [graph, selNode]);

  const key = [...visible].join("|") + JSON.stringify(collapsed);
  useLayoutEffect(() => {
    const compute = () => {
      const root = wrap.current;
      if (!root) return;
      const rb = root.getBoundingClientRect();
      const out: PathD[] = [];
      for (const e of graph.edges) {
        const a = els.current.get(e.from);
        const b = els.current.get(e.to);
        if (!a || !b || !visible.has(e.from) || !visible.has(e.to) || !a.isConnected || !b.isConnected) continue;
        const ra = a.getBoundingClientRect();
        const rbb = b.getBoundingClientRect();
        const down = ra.top <= rbb.top;
        const x1 = ra.left + ra.width / 2 - rb.left;
        const y1 = (down ? ra.bottom : ra.top) - rb.top;
        const x2 = rbb.left + rbb.width / 2 - rb.left;
        const y2 = (down ? rbb.top : rbb.bottom) - rb.top;
        const k = Math.max(14, Math.abs(y2 - y1) * 0.45) * (down ? 1 : -1);
        out.push({ id: e.id, d: `M${x1.toFixed(1)},${y1.toFixed(1)} C${x1.toFixed(1)},${(y1 + k).toFixed(1)} ${x2.toFixed(1)},${(y2 - k).toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`, hyp: e.basis === "RESEARCH HYPOTHESIS" });
      }
      setPaths(out);
    };
    compute();
    const ro = new ResizeObserver(compute);
    if (wrap.current) ro.observe(wrap.current);
    // nodes animate in and the panel can still be settling: re-measure a few times
    const timers = [60, 250, 450, 900, 1600].map((ms) => setTimeout(compute, ms));
    return () => {
      ro.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [graph, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const tiers = TIERS.filter((t) => graph.nodes.some((n) => n.type === t));

  return (
    <div data-testid="impact-graph">
      <div className="row wrap" style={{ marginBottom: 6 }} role="group" aria-label="Filter node categories">
        {tiers.map((t) => (
          <button key={t} className="btn sm" aria-pressed={!filter[t]} onClick={() => st.toggleGraphFilter(t)} data-testid={`gf-${t}`} title={filter[t] ? `Show ${TIER_LABEL[t]}` : `Hide ${TIER_LABEL[t]}`}>
            {TIER_LABEL[t]}
          </button>
        ))}
        <button
          className="btn ghost sm"
          data-testid="graph-reset"
          onClick={() => {
            st.select(null);
            setCollapsed({});
            useStore.setState({ graphFilter: {} });
          }}
        >
          Reset view
        </button>
      </div>
      <div className="graph" ref={wrap}>
        <svg className="edges" aria-hidden="true">
          {paths.map((p) => {
            const hot = chain?.edges.has(p.id);
            return (
              <g key={p.id}>
                <path d={p.d} className={`${p.hyp ? "hyp" : ""} ${selEdge === p.id ? "sel" : hot ? "hot" : chain || selEdge ? "dim" : ""}`} />
                <path d={p.d} style={{ stroke: "transparent", strokeWidth: 11 }} onClick={() => st.select({ type: "edge", id: p.id })} data-edge={p.id} />
              </g>
            );
          })}
        </svg>
        {tiers.map((t: NodeType) => {
          const all = graph.nodes.filter((n) => n.type === t);
          const shown = all.filter((n) => visible.has(n.id));
          const isCollapsed = !!collapsed[t];
          return (
            <div className="tier" key={t} data-tier={t}>
              <button className="tier-name" onClick={() => setCollapsed((c) => ({ ...c, [t]: !c[t] }))} aria-expanded={!isCollapsed} title={isCollapsed ? "Expand this branch" : "Collapse this branch"}>
                {isCollapsed ? "▸" : "▾"} {TIER_LABEL[t]}
              </button>
              <div className="tier-nodes">
                {filter[t] ? (
                  <span className="tier-empty">hidden by filter</span>
                ) : shown.length === 0 ? (
                  <span className="tier-empty">{all.length ? "appears later in the timeline" : "none"}</span>
                ) : isCollapsed ? (
                  <span className="tier-empty">{shown.length} collapsed</span>
                ) : (
                  shown.map((n) => {
                    const isSel = selNode?.id === n.id;
                    const hot = chain?.nodes.has(n.id);
                    return (
                      <button
                        key={n.id}
                        ref={(el) => {
                          if (el) els.current.set(n.id, el);
                          else els.current.delete(n.id);
                        }}
                        className={`node ${n.type} ${isSel ? "sel" : hot ? "hot" : chain ? "dim" : ""}`}
                        onClick={() => st.select(isSel && selection?.type === "node" ? null : { type: "node", id: n.id })}
                        data-node={n.id}
                        title={`${n.label}${n.sub ? " · " + n.sub : ""}`}
                      >
                        <span className="node-label">{n.label}</span>
                        {n.sub && <span className="node-sub">{n.sub}</span>}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="legend" style={{ marginTop: 6 }}>
        <span>
          <i />
          documented or modelled link
        </span>
        <span>
          <i className="hyp" />
          research hypothesis
        </span>
        <span>Click a node to follow its chain; click a line to see its evidence.</span>
      </div>
      {preview && <p className="tiny muted" style={{ marginTop: 4 }}>Full network for the current inputs. Press Simulate to watch it build stage by stage.</p>}
    </div>
  );
}
