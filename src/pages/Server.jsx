import { useData } from "../api/DataContext.jsx";
import { API_BASE, ENDPOINTS } from "../api/client.js";
import DataView, { ErrorBox, Raw } from "../components/DataView.jsx";
import { useUi } from "../components/Ui.jsx";

export function EndpointTable() {
  const { health, info, defaults, plan, trips } = useData();
  const tripVals = Object.values(trips);
  const st = {
    "/api/health": health, "/api/info": info, "/api/astronaut/defaults": defaults,
    "/api/routes": plan.error ? { error: plan.error } : plan.raw ? { data: 1 } : null,
    "/api/return-trip": tripVals.some(t => t.error) ? { error: 1 } : tripVals.some(t => t.data) ? { data: 1 } : null,
  };
  const show = s => !s ? ["Not called yet", "dm"] : s.loading && !s.at ? ["Checking", "dm"] : s.error ? [s.error.status ? `Error ${s.error.status}` : "Unreachable", "er"] : ["OK", "ok"];
  return (
    <table>
      <thead><tr><th>Method</th><th>Endpoint</th><th>Purpose</th><th>Status</th></tr></thead>
      <tbody>{ENDPOINTS.map(([m, p, d]) => { const [t, c] = show(st[p]); return <tr key={p}><td className="mono">{m}</td><td className="mono">{p}</td><td className="dm">{d}</td><td className={c}>{t}</td></tr>; })}</tbody>
    </table>
  );
}

export default function Server() {
  const { health, info, reloadAll, loadInfo } = useData();
  const { toast } = useUi();
  return (
    <>
      <div className="h1">Server &amp; Data</div>
      <div className="grid">
        <div className="w" style={{ gridColumn: "1/-1", overflow: "auto" }}>
          <h3>Endpoints</h3>
          <EndpointTable />
          <p style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="pri" onClick={async () => { await reloadAll(); toast("Server data refreshed"); }}>Re-check now</button>
            <span className="dm mono" style={{ fontSize: 12 }}>Base: {API_BASE || location.origin}</span>
          </p>
        </div>
        <div className="w"><h3>Health</h3>{health.error ? <ErrorBox error={health.error} /> : <DataView data={health.data} />}<Raw data={health.data} /></div>
        <div className="w"><h3>Map info</h3>{info.error ? <ErrorBox error={info.error} onRetry={loadInfo} /> : <DataView data={info.data} />}<Raw data={info.data} /></div>
      </div>
    </>
  );
}
