import { useCallback, useState } from "react";
import { useData } from "../api/DataContext.jsx";
import { api } from "../api/client.js";
import { buildReturnTripBody, readVerdict } from "../api/contract.js";
import DataView, { ErrorBox, Raw, label } from "../components/DataView.jsx";
import { ROUTE_COLORS } from "../components/GridMap.jsx";
import { useUi } from "../components/Ui.jsx";

/* Calls POST /api/return-trip for route i of the current plan. */
export function useReturnTrip() {
  const { plan, params, setTrips } = useData();
  const { toast, log } = useUi();
  return useCallback(async (i, supplyKg = 1) => {
    const route = plan.routes[i];
    if (!route) return;
    const body = buildReturnTripBody({ start: plan.start, end: plan.end, route, astronaut: params, supplyKg });
    setTrips(t => ({ ...t, [i]: { loading: true, req: body } }));
    try {
      const data = await api.returnTrip(body);
      setTrips(t => ({ ...t, [i]: { loading: false, data, req: body } }));
      const v = readVerdict(data);
      toast(v ? `${label(route.name)}: ${v.value ? "return possible" : "return not possible"}` : `${label(route.name)}: result received`, v && !v.value ? "warn" : "confirm");
      log(`Return trip checked for ${label(route.name)}`, "confirm");
    } catch (error) {
      setTrips(t => ({ ...t, [i]: { loading: false, error, req: body } }));
      toast("Return-trip request failed", "error"); log("Return-trip request failed: " + error.message, "error");
    }
  }, [plan, params, setTrips, toast, log]);
}

export default function ReturnTrip({ go }) {
  const { plan, trips } = useData();
  const check = useReturnTrip();
  const [supplies, setSupplies] = useState({});

  if (!plan.routes.length) {
    return (
      <>
        <div className="h1">Return Trip</div>
        <div className="w" style={{ maxWidth: 560 }}>
          <h3>No routes yet</h3>
          <p className="dm" style={{ margin: "6px 0 12px" }}>Compute routes in the Route Planner, then check whether the astronaut can complete each one and still get home.</p>
          <button className="pri" onClick={() => go("map")}>Open Route Planner</button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="h1">Return Trip</div>
      <p className="dm" style={{ marginBottom: 12 }}>
        From ({plan.start.row}, {plan.start.col}) to ({plan.end.row}, {plan.end.col}).{" "}
        <button onClick={() => plan.routes.forEach((_, i) => check(i))}>Check all routes</button>{" "}
        <button onClick={() => go("map")}>Back to map</button>
      </p>
      <div className="grid">
        {plan.routes.map((r, i) => {
          const t = trips[i]; const v = t?.data !== undefined ? readVerdict(t.data) : null;
          return (
            <div className="w" key={i}>
              <h3><span style={{ color: ROUTE_COLORS[i % ROUTE_COLORS.length] }}>■</span> {label(r.name)}</h3>
              {v && <p className={v.value ? "ok" : "er"} style={{ fontSize: "1.1rem", margin: "4px 0 8px" }}>{label(v.key)}: {v.value ? "Yes" : "No"}</p>}
              {t?.data?.can_return === false && <p className="er">Needs {t.data.required_supply_kg} kg, you carry {t.data.available_kg ?? t.data.tank?.supply_kg ?? t.req?.tank?.supply_kg} kg, short by {t.data.shortfall_kg} kg.</p>}
              {t?.data?.can_return === true && <p className="ok">Return possible</p>}
              <label className="tankfield">Tank supply (kg) <input type="number" min="0" step="0.01" value={supplies[i] ?? 1} onChange={e => setSupplies(s => ({ ...s, [i]: e.target.value }))} /></label>
              {t?.data?.can_return === false && <button onClick={() => { const amount = Math.ceil(Number(t.data.required_supply_kg) * 100) / 100; setSupplies(s => ({ ...s, [i]: amount })); check(i, amount); }} disabled={t?.loading}>Use required amount</button>}
              <ErrorBox error={t?.error} onRetry={() => check(i)} />
              {t?.data !== undefined && t?.data !== null ? <><DataView data={t.data} /><Raw data={t.req} title="Request body" /></>
                : !t?.error && <p className="dm">Not checked yet.</p>}
              <p style={{ marginTop: 10 }}><button className={t?.data ? "" : "pri"} disabled={t?.loading} onClick={() => check(i, Number(supplies[i] ?? 1))}>{t?.loading ? "Checking…" : t?.data ? "Check again" : "Check return trip"}</button></p>
            </div>
          );
        })}
      </div>
    </>
  );
}
