import { useEffect, useRef } from "react";
import { useData } from "../api/DataContext.jsx";
import { readDefaults, readGridSize } from "../api/contract.js";
import DataView, { ErrorBox, label } from "../components/DataView.jsx";
import { ROUTE_COLORS } from "../components/GridMap.jsx";
import { useUi } from "../components/Ui.jsx";

/* Drag a widget by its title to move it (same behaviour as the original design). */
export function useDnd() {
  const ref = useRef();
  useEffect(() => {
    const c = ref.current; if (!c) return;
    let d;
    c.querySelectorAll(".w:not(.hero)").forEach(w => {
      w.draggable = true;
      w.ondragstart = () => { d = w; w.classList.add("dg"); };
      w.ondragend = () => w.classList.remove("dg");
      w.ondragover = e => { e.preventDefault(); if (d && d !== w) { const r = w.getBoundingClientRect(); c.insertBefore(d, e.clientY > r.top + r.height / 2 ? w.nextSibling : w); } };
    });
  });
  return ref;
}

function Loadable({ res, retry, children }) {
  if (res.loading && !res.at) return <><div className="sk" /><div className="sk" style={{ width: "60%" }} /></>;
  if (res.error) return <ErrorBox error={res.error} onRetry={retry} />;
  return children;
}

export default function Dashboard({ go }) {
  const { health, info, defaults, loadHealth, loadInfo, loadDefaults, plan } = useData();
  const { events } = useUi();
  const size = readGridSize(info.data);
  const up = !health.error && health.at;
  const d = readDefaults(defaults.data);
  const ref = useDnd();

  return (
    <>
      <div className="h1">Welcome back, Operator</div>
      <div className="grid" ref={ref}>
        <div className="w hero">
          <div>
            <h3>Mission overview</h3>
            <p style={{ fontSize: "1.1rem", margin: "6px 0" }}>
              {health.loading && !health.at ? "Contacting the server…" : up ? "Server is online and ready for route planning." : "Server is not responding."}
            </p>
            <div className="st"><span>Server</span><span className={up ? "ok" : health.at ? "er" : "dm"}>{up ? "Online" : health.at ? "Offline" : "Checking"}</span></div>
            <div className="st"><span>Map grid</span><span className="mono">{size ? `${size.rows} × ${size.cols}` : "—"}</span></div>
            <div className="st"><span>Routes this session</span><span className="mono">{plan.routes.length}</span></div>
            <p style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="pri" onClick={() => go("map")}>Plan a route</button>
              <button onClick={() => go("return")}>Return trip</button>
              <button onClick={() => go("astronaut")}>Astronaut</button>
            </p>
          </div>
          <div className="mars" />
        </div>

        <div className="w"><h3>Server health</h3>
          <Loadable res={health} retry={loadHealth}><DataView data={health.data} /></Loadable>
          {health.at && <p className="dm" style={{ fontSize: 12, marginTop: 6 }}>Checked {health.at.toLocaleTimeString()}</p>}
        </div>

        <div className="w"><h3>Map</h3><Loadable res={info} retry={loadInfo}><DataView data={info.data} /></Loadable></div>

        <div className="w"><h3>Astronaut defaults</h3>
          <Loadable res={defaults} retry={loadDefaults}><DataView data={d.params} /></Loadable>
        </div>

        <div className="w"><h3>Latest routes</h3>
          {plan.routes.length ? plan.routes.map((r, i) => (
            <div className="st" key={i}><span><span style={{ color: ROUTE_COLORS[i % ROUTE_COLORS.length] }}>■</span> {label(r.name)}</span><span className="dm">{r.path.length} cells</span></div>
          )) : <p className="dm">No routes computed yet. Open the Route Planner to start.</p>}
        </div>

        <div className="w"><h3>Activity</h3>
          {events.length ? events.slice(0, 6).map((e, i) => (
            <div className="st" key={i}><span>{e.text}</span><span className="dm">{e.at.toLocaleTimeString()}</span></div>
          )) : <p className="dm">No activity in this session yet.</p>}
        </div>
      </div>
    </>
  );
}
