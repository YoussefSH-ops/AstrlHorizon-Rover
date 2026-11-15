import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "./client.js";
import { readDefaults } from "./contract.js";

const Ctx = createContext(null);
export const useData = () => useContext(Ctx);

const HEALTH_EVERY = 30000;

function useResource(fn) {
  const [s, set] = useState({ loading: true, data: null, error: null, at: null });
  const load = useCallback(async () => {
    set(p => ({ ...p, loading: true }));
    try { const data = await fn(); set({ loading: false, data, error: null, at: new Date() }); return data; }
    catch (error) { set(p => ({ ...p, loading: false, error, at: new Date() })); return null; }
  }, [fn]);
  return [s, load];
}

export function DataProvider({ children, onEvent }) {
  const [health, loadHealth] = useResource(api.health);
  const [info, loadInfo] = useResource(api.info);
  const [defaults, loadDefaults] = useResource(api.astronautDefaults);
  const [params, setParams] = useState(null);
  const [plan, setPlan] = useState({ start: null, end: null, routes: [], raw: null, sel: 0, loading: false, error: null, req: null });
  const [trips, setTrips] = useState({});
  const ev = useRef(onEvent); ev.current = onEvent;
  const wasUp = useRef(null);

  useEffect(() => {
    loadHealth(); loadInfo(); loadDefaults();
    const t = setInterval(loadHealth, HEALTH_EVERY);
    return () => clearInterval(t);
  }, [loadHealth, loadInfo, loadDefaults]);

  useEffect(() => {
    if (health.loading && !health.at) return;
    const up = !health.error;
    if (wasUp.current !== null && wasUp.current !== up) ev.current?.(up ? "Server is back online" : "Server is not responding", up ? "confirm" : "error");
    wasUp.current = up;
  }, [health]);

  useEffect(() => {
    if (defaults.data && params === null) setParams(structuredClone(readDefaults(defaults.data).params));
  }, [defaults.data, params]);

  useEffect(() => { setTrips({}); }, [plan.raw, plan.start, plan.end]);

  const resetParams = () => defaults.data && setParams(structuredClone(readDefaults(defaults.data).params));

  return (
    <Ctx.Provider value={{
      health, info, defaults, loadHealth, loadInfo, loadDefaults,
      params, setParams, resetParams, plan, setPlan, trips, setTrips,
      reloadAll: () => Promise.all([loadHealth(), loadInfo(), loadDefaults()]),
    }}>{children}</Ctx.Provider>
  );
}
