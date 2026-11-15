import { useData } from "../api/DataContext.jsx";
import { readDefaults } from "../api/contract.js";
import ParamsForm from "../components/ParamsForm.jsx";
import DataView, { ErrorBox, Raw, label } from "../components/DataView.jsx";
import { useUi } from "../components/Ui.jsx";

export default function Astronaut({ go }) {
  const { defaults, loadDefaults, params, setParams, resetParams } = useData();
  const { toast } = useUi();
  const d = readDefaults(defaults.data);

  return (
    <>
      <div className="h1">Astronaut</div>
      {defaults.loading && !defaults.at ? <div className="w"><div className="sk" /><div className="sk" style={{ width: "60%" }} /></div>
        : defaults.error ? <ErrorBox error={defaults.error} onRetry={loadDefaults} /> : (
          <div className="grid">
            <div className="w" style={{ gridColumn: "1/-1" }}>
              <h3>Settings used for route and return-trip requests</h3>
              <ParamsForm params={params} options={d.options} onChange={setParams} />
              <p style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => { resetParams(); toast("Server defaults restored"); }}>Restore server defaults</button>
                <button className="pri" onClick={() => go("map")}>Use in Route Planner</button>
              </p>
            </div>
            {Object.keys(d.options).length > 0 && <div className="w"><h3>Options</h3><DataView data={d.options} /></div>}
            {Object.entries(d.rest).map(([k, v]) => <div className="w" key={k}><h3>{label(k)}</h3><DataView data={v} /></div>)}
            <div className="w"><h3>Source</h3><p className="dm" style={{ fontSize: 12 }}>GET /api/astronaut/defaults</p><Raw data={defaults.data} /></div>
          </div>
        )}
    </>
  );
}
