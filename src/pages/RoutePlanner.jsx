import { useEffect, useRef, useState } from "react";
import { useData } from "../api/DataContext.jsx";
import { api, BLOCKED_MAP_URL, TERRAIN_MAP_URL } from "../api/client.js";
import { buildRoutesBody, cellToApi, readDefaults, readGridSize, readMapAsset, readRoutes } from "../api/contract.js";
import GridMap, { ROUTE_COLORS } from "../components/GridMap.jsx";
import ParamsForm from "../components/ParamsForm.jsx";
import DataView, { ErrorBox, Raw, Scalar, label } from "../components/DataView.jsx";
import { useCfg, setCfg } from "../lib/config.js";
import { AU } from "../lib/audio.js";
import { useUi } from "../components/Ui.jsx";
import { useReturnTrip } from "./ReturnTrip.jsx";

function CellInput({ name, cell, size, onChange }) {
  const set = (k, v) => {
    const n = Math.max(0, Math.min((k === "row" ? size.rows : size.cols) - 1, Math.floor(+v || 0)));
    onChange({ row: cell?.row ?? 0, col: cell?.col ?? 0, [k]: n });
  };
  return (
    <div className="row cmp">
      <div>{name}</div>
      <div>
        <input type="number" aria-label={name + " row"} placeholder="row" min="0" max={size.rows - 1} value={cell?.row ?? ""} onChange={e => set("row", e.target.value)} style={{ width: 64 }} />
        <input type="number" aria-label={name + " column"} placeholder="col" min="0" max={size.cols - 1} value={cell?.col ?? ""} onChange={e => set("col", e.target.value)} style={{ width: 64 }} />
      </div>
    </div>
  );
}

function readShare() {
  const q = new URLSearchParams(location.hash.split("?")[1] || "");
  const p = s => { const m = /^(\d+),(\d+)$/.exec(s || ""); return m ? { row: +m[1], col: +m[2] } : null; };
  return { start: p(q.get("start")), end: p(q.get("end")) };
}

export default function RoutePlanner() {
  const cfg = useCfg();
  const { info, defaults, params, setParams, resetParams, plan, setPlan, trips, loadInfo } = useData();
  const { toast, log } = useUi();
  const checkTrip = useReturnTrip();
  const r = plan.routes[plan.sel];
  const trip = trips[plan.sel];
  const [imageSize, setImageSize] = useState(null);
  const size = readGridSize(info.data) ?? imageSize;
  const mapAsset = readMapAsset(info.data);
  const opts = readDefaults(defaults.data).options;
  const [hover, setHover] = useState(null);
  const [tab, setTab] = useState(0);
  const [mapStyle, setMapStyle] = useState("color");
  const [walk, setWalk] = useState({ loading: false, data: null, index: 0, active: false, paused: false, muted: false });
  const [tankSupply, setTankSupply] = useState(1);
  const [mode, setMode] = useState("route");
  const [baseTool, setBaseTool] = useState(false);
  const [home, setHome] = useState(null);
  const [position, setPosition] = useState(null);
  const [workMinutes, setWorkMinutes] = useState(0);
  const [navError, setNavError] = useState(0);
  const [maxSlope, setMaxSlope] = useState(20);
  const [allowance, setAllowance] = useState(.2);
  const [loss, setLoss] = useState(5);
  const [reserve, setReserve] = useState(0);
  const [plss, setPlss] = useState("none");
  const [survival, setSurvival] = useState(null);
  const [survivalError, setSurvivalError] = useState(null);
  const [survivalLoading, setSurvivalLoading] = useState(false);
  const [explanation, setExplanation] = useState(null);
  const [explainError, setExplainError] = useState(null);
  const [victim, setVictim] = useState(null);
  const [victimO2, setVictimO2] = useState(.5);
  const [victimFactor, setVictimFactor] = useState(.5);
  const [rescue, setRescue] = useState(null);
  const [rescueError, setRescueError] = useState(null);
  const [rescueLoading, setRescueLoading] = useState(false);
  const [sim, setSim] = useState({ active: false, index: 0, remaining: 0, warning: "" });
  const survivalAbort = useRef(null), explainAbort = useRef(null), rescueAbort = useRef(null), simTimer = useRef(null);
  const astronaut = { mass_kg: 81.4, height_m: 1.78, intensity: "medium", speed_m_s: 1.3, ...(params || {}) };
  const tank = { supply_kg: Math.max(0, Number(tankSupply) || 0), plss, loss_kg_per_hour: Number(loss) || 0, reserve_kg: Number(reserve) || 0 };
  const survivalBody = (h = home, pos = position, supply = tank.supply_kg) => ({ home: h || plan.start, ...(pos ? { position: pos } : {}), astronaut, tank: { ...tank, supply_kg: supply }, work_minutes: Number(workMinutes) || 0, max_slope: Number(maxSlope), allowance: Number(allowance), position_error_m: Number(navError) || 0 });

  useEffect(() => {
    if (mode !== "survival" && mode !== "simulate") return;
    const h = home || plan.start;
    if (!h || !tank.supply_kg) { setSurvival(null); return; }
    const ctl = new AbortController(); survivalAbort.current?.abort(); survivalAbort.current = ctl;
    const timer = setTimeout(async () => {
      setSurvivalLoading(true); setSurvivalError(null);
      try { const data = await api.survivalMap(survivalBody(h, position), { signal: ctl.signal }); if (!ctl.signal.aborted) { setSurvival(data); if (data.moved) setHome(data.home); if (mode === "simulate") { const warning = !data.position_is_safe ? "danger" : data.best_margin_kg < .02 ? "soon" : ""; setSim(s => ({ ...s, warning })); if (warning === "danger") { window.speechSynthesis?.cancel(); window.speechSynthesis?.speak(new SpeechSynthesisUtterance("Turn back now")); } } } }
      catch (e) { if (!ctl.signal.aborted) setSurvivalError(e); }
      finally { if (!ctl.signal.aborted) setSurvivalLoading(false); }
    }, 400);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [mode, home, plan.start, position, tankSupply, workMinutes, navError, maxSlope, allowance, loss, reserve, plss, params]);

  useEffect(() => () => { survivalAbort.current?.abort(); explainAbort.current?.abort(); rescueAbort.current?.abort(); clearInterval(simTimer.current); }, []);
  const callExplain = async cell => {
    const h = home || plan.start; if (!h) return;
    const ctl = new AbortController(); explainAbort.current?.abort(); explainAbort.current = ctl; setExplainError(null); setExplanation({ cell, loading: true });
    try { const data = await api.explainCell({ ...survivalBody(h, position), cell }, { signal: ctl.signal }); if (!ctl.signal.aborted) setExplanation({ cell, data }); }
    catch (e) { if (!ctl.signal.aborted) { setExplainError(e); setExplanation({ cell }); } }
  };
  const checkRescue = async () => {
    const h = home || plan.start; if (!h || !victim) return toast("Set a base and stranded astronaut position first", "warn");
    rescueAbort.current?.abort(); const ctl = new AbortController(); rescueAbort.current = ctl; setRescueLoading(true); setRescueError(null);
    const body = { home: h, victim, victim_remaining_kg: Number(victimO2), victim_speed_factor: Number(victimFactor), victim_astronaut: astronaut, rescuer: astronaut, tank, route: "shortest", max_slope: Number(maxSlope), prep_minutes: 10, allowance: Number(allowance) };
    try { const data = await api.rescue(body, { signal: ctl.signal }); if (!ctl.signal.aborted) setRescue(data); }
    catch (e) { if (!ctl.signal.aborted) setRescueError(e); }
    finally { if (!ctl.signal.aborted) setRescueLoading(false); }
  };
  const startSim = () => {
    const path = r?.path?.length ? r.path : (plan.start && plan.end ? [plan.start, plan.end] : []);
    if (!home && !plan.start) return toast("Set a base first", "warn");
    if (path.length < 2) return toast("Choose a route with at least two cells first", "warn");
    clearInterval(simTimer.current); setHome(home || plan.start); setPosition(path[0]); setSim({ active: true, index: 0, remaining: tank.supply_kg, warning: "" });
    simTimer.current = setInterval(() => setSim(s => {
      if (!s.active) return s;
      const route = r?.path?.length ? r.path : [plan.start, plan.end]; const ni = Math.min(route.length - 1, s.index + 1);
      setPosition(route[ni]); const left = Math.max(0, s.remaining - .015 - (Number(loss) * .3 / 3600)); setTankSupply(left);
      if (ni >= route.length - 1) { clearInterval(simTimer.current); return { ...s, active: false, index: ni, remaining: left }; }
      return { ...s, index: ni, remaining: left };
    }), 1000);
  };
  const setFault = type => { if (type === "leak") setLoss(v => v + .3); if (type === "injury") setParams(p => ({ ...(p || {}), speed_m_s: Math.max(.5, Number(p?.speed_m_s ?? 1.3) / 2) })); if (type === "reset") { clearInterval(simTimer.current); setPosition(null); setSim({ active: false, index: 0, remaining: Number(tankSupply), warning: "" }); setLoss(5); if (params) setParams(p => ({ ...p, speed_m_s: 1.3 })); } };
  const cvRef = useRef();
  const zoomRef = useRef();
  const utterance = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    const s = readShare();
    if (s.start || s.end) setPlan(p => ({ ...p, start: s.start ?? p.start, end: s.end ?? p.end }));
  }, [setPlan]);

  const stopWalk = (reset = true) => {
    window.speechSynthesis?.cancel(); clearTimeout(timer.current); utterance.current = null;
    setWalk({ loading: false, data: null, index: 0, active: false, paused: false, muted: false });
    if (reset) zoomRef.current?.reset();
  };
  const setCells = patch => { stopWalk(); setPlan(p => ({ ...p, ...patch, routes: [], raw: null, error: null, sel: 0 })); };

  useEffect(() => { stopWalk(); }, [plan.sel, plan.raw, plan.start, plan.end, plan.routes]); // eslint-disable-line react-hooks/exhaustive-deps

  const advanceWalk = index => setWalk(w => {
    if (!w.active || !w.data?.steps?.length) return w;
    const next = Math.max(0, Math.min(w.data.steps.length - 1, index));
    return { ...w, index: next };
  });
  const stepCell = value => Array.isArray(value) ? { row: value[0], col: value[1] } : value;
  const speakCurrent = index => {
    clearTimeout(timer.current); window.speechSynthesis?.cancel();
    const step = walk.data?.steps?.[index]; if (!step) return;
    if (walk.muted || !window.speechSynthesis) { timer.current = setTimeout(() => index + 1 < walk.data.steps.length ? advanceWalk(index + 1) : setWalk(w => ({ ...w, active: false })), 4000); return; }
    const u = new SpeechSynthesisUtterance(step.text), voices = window.speechSynthesis.getVoices();
    u.voice = voices.find(v => /^en([_-]|$)/i.test(v.lang)) || null; utterance.current = u;
    u.onend = () => { if (utterance.current !== u) return; if (index + 1 < walk.data.steps.length) advanceWalk(index + 1); else setWalk(w => ({ ...w, active: false })); };
    window.speechSynthesis.speak(u);
  };
  useEffect(() => {
    if (!walk.active || walk.paused) return;
    const step = walk.data?.steps?.[walk.index]; if (!step) return;
    if (step.from_cell && step.to_cell) zoomRef.current?.focusCells([stepCell(step.from_cell), stepCell(step.to_cell)]);
    speakCurrent(walk.index);
  }, [walk.index, walk.active, walk.paused, walk.data, walk.muted]);
  const startWalk = async () => {
    if (!plan.start || !plan.end || !r) return;
    stopWalk(); setWalk(w => ({ ...w, loading: true }));
    const body = { start: cellToApi(plan.start), goal: cellToApi(plan.end), route: /safe/i.test(r.name) ? "safest" : /efficient/i.test(r.name) ? "efficient" : "shortest", max_slope: 20, astronaut: params ?? readDefaults(defaults.data).params };
    try {
      const data = await api.directions(body);
      if (!data?.route_found) { setWalk({ loading: false, data: { ...data, summary: "No safe route to guide" }, index: 0, active: false, paused: false, muted: false }); toast("No safe route to guide", "warn"); return; }
      setWalk({ loading: false, data, index: 0, active: true, paused: false, muted: false });
    } catch (error) { setWalk({ loading: false, data: null, index: 0, active: false, paused: false, muted: false }); toast("Directions request failed: " + error.message, "error"); }
  };
  const walkSteps = walk.data?.steps || [];
  const currentStep = walkSteps[walk.index];
  const walkRoute = currentStep && r ? { path: r.path.slice(Math.min(currentStep.from_index ?? 0, currentStep.to_index ?? 0), Math.max(currentStep.from_index ?? 0, currentStep.to_index ?? 0) + 1) } : null;
  const jumpToStep = index => { window.speechSynthesis?.cancel(); clearTimeout(timer.current); setWalk(w => ({ ...w, index: Math.max(0, Math.min(walkSteps.length - 1, index)), active: true, paused: false })); };

  const pick = c => {
    AU.play("scan");
    if (baseTool) { setHome(c); setPosition(c); setBaseTool(false); return; }
    if (mode === "rescue") { setVictim(c); return; }
    if (mode === "survival" || mode === "simulate") { if (mode === "survival") callExplain(c); else { setPosition(c); setSim(s => ({ ...s, active: false })); } return; }
    if (!plan.start || (plan.start && plan.end)) setCells({ start: c, end: null });
    else setCells({ end: c });
  };

  const compute = async () => {
    if (!plan.start || !plan.end) return toast("Choose a start and an end cell first", "warn");
    const body = buildRoutesBody({ start: plan.start, end: plan.end, astronaut: params });
    setPlan(p => ({ ...p, loading: true, error: null, req: body }));
    try {
      const res = await api.routes(body);
      const routes = readRoutes(res);
      setPlan(p => ({ ...p, loading: false, raw: res, routes, sel: 0, at: Date.now() }));
      AU.play("scan"); setTab(0);
      toast(routes.length ? `${routes.length} routes received` : "Server returned no routes", routes.length ? "confirm" : "warn");
      log(`Routes computed: (${plan.start.row}, ${plan.start.col}) → (${plan.end.row}, ${plan.end.col})`, "confirm");
    } catch (error) {
      setPlan(p => ({ ...p, loading: false, error }));
      toast("Route request failed", "error"); log("Route request failed: " + error.message, "error");
    }
  };

  const share = () => {
    if (!plan.start || !plan.end) return toast("Choose both cells to share a link", "warn");
    const url = `${location.origin}${location.pathname}#/map?start=${plan.start.row},${plan.start.col}&end=${plan.end.row},${plan.end.col}`;
    navigator.clipboard?.writeText(url).then(() => toast("Link copied"), () => toast("Copy failed. Copy the address from your browser.", "error"));
  };

  const exportJson = () => {
    if (!plan.raw) return toast("Compute routes before exporting", "warn");
    const b = new Blob([JSON.stringify({ request: plan.req, response: plan.raw }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "astral-horizon-routes.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  if (!size) {
    return (
      <div className="w" style={{ maxWidth: 560 }}>
        <h3>Route Planner</h3>
        <img src={TERRAIN_MAP_URL} alt="" aria-hidden="true" style={{ display: "none" }} onLoad={e => setImageSize({ rows: e.currentTarget.naturalHeight, cols: e.currentTarget.naturalWidth })} />
        {info.loading ? <div className="sk" /> : info.error ? <ErrorBox error={info.error} onRetry={loadInfo} />
          : <><p className="dm">The map size could not be read from /api/info. Update readGridSize in src/api/contract.js to match the response.</p><Raw data={info.data} /></>}
      </div>
    );
  }

  return (
    <div className="ws">
      <aside>
        <h3 className="dm" style={{ fontSize: 12, marginBottom: 8 }}>Route Planner</h3>
        <div className="tabs mode-tabs">{[["route", "Routes"], ["survival", "Survival map"], ["simulate", "Simulate EVA"], ["rescue", "Rescue"]].map(([v, n]) => <button key={v} className={mode === v ? "on" : ""} onClick={() => { setMode(v); setBaseTool(false); }}>{n}</button>)}</div>
        <button className={baseTool ? "pri" : ""} onClick={() => setBaseTool(v => !v)}>{baseTool ? "Click map to set base…" : "Set base"}</button>
        <p className="dm" style={{ fontSize: 12, margin: "8px 0 6px" }}>{baseTool ? "Choose the home/base cell on the map." : mode === "rescue" ? "Click the stranded astronaut's position." : <>Click the map to place A, then B. Grid {size.rows} × {size.cols}.</>}</p>
        <CellInput name="Start (A)" cell={plan.start} size={size} onChange={c => setCells({ start: c })} />
        <CellInput name="End (B)" cell={plan.end} size={size} onChange={c => setCells({ end: c })} />
        <p style={{ margin: "12px 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button className="pri" onClick={compute} disabled={plan.loading || !plan.start || !plan.end}>{plan.loading ? "Computing…" : "Compute routes"}</button>
          <button onClick={() => setCells({ start: null, end: null })}>Clear</button>
        </p>
        <h3 className="dm" style={{ fontSize: 12, margin: "14px 0 4px", display: "flex", justifyContent: "space-between" }}>
          Astronaut <button style={{ fontSize: 11, padding: "2px 8px" }} onClick={resetParams} disabled={!defaults.data}>Defaults</button>
        </h3>
        {defaults.loading && !params ? <div className="sk" /> : defaults.error ? <ErrorBox error={defaults.error} />
          : <ParamsForm params={params} options={opts} onChange={setParams} compact />}
        {(mode === "survival" || mode === "simulate" || mode === "rescue") && <div className="mission-controls">
          <h3>Oxygen & terrain</h3>
          <label className="tankfield">Tank supply (kg) <input type="number" min="0" step="0.01" value={tankSupply} onChange={e => setTankSupply(e.target.value)} /></label>
          <label className="tankfield">PLSS <select value={plss} onChange={e => setPlss(e.target.value)}><option value="none">None</option><option value="standard">Standard</option></select></label>
          <label className="tankfield">Loss kg/hour <input type="number" min="0" step="0.1" value={loss} onChange={e => setLoss(e.target.value)} /></label>
          <label className="tankfield">Reserve kg <input type="number" min="0" step="0.1" value={reserve} onChange={e => setReserve(e.target.value)} /></label>
          <label className="tankfield">Max slope: {maxSlope}° <input type="range" min="1" max="60" value={maxSlope} onChange={e => setMaxSlope(+e.target.value)} /></label>
          <label className="tankfield">Allowance <input type="number" min="0" max="2" step="0.05" value={allowance} onChange={e => setAllowance(e.target.value)} /></label>
          {mode !== "rescue" && <><label className="tankfield">Work minutes at destination <input type="number" min="0" max="600" value={workMinutes} onChange={e => setWorkMinutes(e.target.value)} /></label><label className="tankfield">Navigation error: {navError} m <input type="range" min="0" max="500" step="10" value={navError} onChange={e => setNavError(+e.target.value)} /></label></>}
          {mode === "rescue" && <><label className="tankfield">Victim oxygen kg <input type="number" min="0.01" step="0.01" value={victimO2} onChange={e => setVictimO2(e.target.value)} /></label><label className="tankfield">Victim injury/speed factor <select value={victimFactor} onChange={e => setVictimFactor(+e.target.value)}>{[[1,"Uninjured"],[.8,"Mild"],[.6,"Moderate"],[.4,"Severe"]].map(([v,n]) => <option key={v} value={v}>{n} ({v})</option>)}</select></label><button className="pri" onClick={checkRescue} disabled={rescueLoading || !victim}>{rescueLoading ? "Checking rescue…" : "Check rescue"}</button></>}
          {mode === "simulate" && <div className="fault-controls"><button className="pri" onClick={startSim} disabled={sim.active}>Simulate walk</button><button onClick={() => setFault("leak")}>Slow leak</button><button onClick={() => setFault("injury")}>Injury</button><button onClick={() => setFault("reset")}>Reset</button><p>Simulated oxygen: {Number(sim.remaining || tankSupply).toFixed(2)} kg</p></div>}
        </div>}
      </aside>

      <section className="cv nogrid" ref={cvRef}>
        <GridMap size={size} start={home || plan.start} end={mode === "route" ? plan.end : null} routes={mode === "route" ? plan.routes : []} sel={plan.sel} mapGrid={mapAsset.grid}
          mapImage={`${TERRAIN_MAP_URL}?style=${mapStyle}`} blockedImage={BLOCKED_MAP_URL} zoomRef={zoomRef} guidedLeg={walkRoute}
          overlayImage={(mode === "survival" || mode === "simulate") && survival?.image ? survival.image : null} extraPath={mode === "rescue" ? rescue?.cells : null} extraMarker={mode === "rescue" ? victim : (mode === "simulate" ? position : null)}
          onPick={pick} onHover={setHover} grid={cfg.grid} labels={cfg.labels} />
        <div className="tb">
          <button onClick={() => cvRef.current.requestFullscreen?.()}>Fullscreen</button>
          <button onClick={exportJson}>Export</button>
          <button onClick={share}>Share</button>
          <select aria-label="Map style" value={mapStyle} onChange={e => setMapStyle(e.target.value)}>{[["gray", "Gray"], ["color", "Color"], ["mars", "Mars"], ["slope", "Slope"]].map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
          <button onClick={() => { setCfg({ grid: !cfg.grid }); AU.play("scan"); }} aria-pressed={cfg.grid}>Grid</button>
        </div>
        <div className="cp">N</div>
        <div className="hd">{hover ? `Row ${hover.row}  Col ${hover.col}` : "Row —  Col —"} | {size.rows} × {size.cols}</div>
        <div className="maplegend">{mapStyle === "slope" ? <><span style={{ color: "#55bd69" }}>■</span> Flat <span style={{ color: "#e34f43" }}>■</span> Steep</> : mapStyle === "color" ? <>Low <span className="elevgrad" /> High ground</> : mapStyle === "mars" ? "Mars terrain" : "Grayscale terrain"}</div>
        {(mode === "survival" || mode === "simulate") && <div className="survival-legend"><span>Survival map</span><i /> <small>Green = plenty · Red = barely</small></div>}
        {survivalLoading && <div className="survival-loading">Computing survival area…</div>}
        {mode === "survival" && survival?.moved && <div className="survival-message">Base was on blocked ground, so it was moved</div>}
        {mode === "simulate" && sim.warning && <div className={"sim-warning " + sim.warning}>{sim.warning === "danger" ? "POINT OF NO RETURN PASSED" : "Turn back soon"}</div>}
        {mode === "survival" && survival && <div className="survival-stats"><b>Safe area</b><span>{Number(survival.safe_area_km2).toFixed(2)} km²</span><b>Farthest safe</b><span>{Number(survival.farthest_safe_km).toFixed(2)} km</span></div>}
        {mode === "rescue" && <div className="rescue-overlay"><b className="provisional">Provisional estimates</b>{rescueLoading && <span>Checking…</span>}{rescueError && <ErrorBox error={rescueError} />}{rescue && (rescue.route_found === false ? <strong className="rescue-banner red">No safe route to the stranded astronaut</strong> : <><strong className={`rescue-banner ${rescue.verdict === "rescue_possible" ? "green" : rescue.verdict === "too_late" ? "red" : "orange"}`}>{rescue.verdict?.replaceAll("_", " ")}</strong><div className="clock-panel"><span>Victim time left <b>{rescue.victim_minutes_left} min</b></span><span>Rescuer arrival <b>{rescue.rescuer_arrival_minutes} min</b></span><progress max={Math.max(1, rescue.rescuer_arrival_minutes)} value={Math.min(rescue.victim_minutes_left, rescue.rescuer_arrival_minutes)} /><b>Rescue window: {rescue.rescue_window_minutes} min</b></div><div className="clock-panel"><span>O₂ on arrival <b>{rescue.rescuer_kg_at_arrival} kg</b></span><span>Transfer needed <b>{rescue.transfer_needed_kg} kg</b></span><span>Spare after rescue <b>{rescue.spare_kg_after_rescue} kg</b></span></div><details><summary>Show assumptions</summary><ul>{(rescue.assumptions || []).map((a,i) => <li key={i}>{a}</li>)}</ul></details></>)}</div>}
        {mode === "survival" && explanation && <div className="cell-explanation"><button className="close-explain" onClick={() => setExplanation(null)}>×</button>{explanation.loading ? "Explaining cell…" : explanation.data && <><b className={`verdict ${explanation.data.verdict}`}>{explanation.data.verdict?.replaceAll("_", " ")}</b><p>{explanation.data.text}</p>{explanation.data.verdict === "not_enough_oxygen" && <><p>Needs {explanation.data.required_supply_kg} kg, short by {explanation.data.shortfall_kg} kg.</p><button onClick={() => setTankSupply(explanation.data.required_supply_kg)}>Use required amount</button>{explanation.data.nearest_safe_cell && <button onClick={() => { zoomRef.current?.focusCells([explanation.data.nearest_safe_cell]); setPosition(explanation.data.nearest_safe_cell); }}>Show nearest safe cell</button>}</>}{explanation.data.verdict === "too_steep" && <button onClick={() => setMaxSlope(Math.ceil(explanation.data.slope_deg))}>Raise slope limit to {Math.ceil(explanation.data.slope_deg)}°</button>}</>}{explainError && <ErrorBox error={explainError} />}</div>}
        {survivalError && <div className="survival-message">{survivalError.message === "Server unreachable" ? "Backend not running" : survivalError.message}</div>}
        <div className="walkcontrols">
          {!walk.data && <button className="pri" onClick={startWalk} disabled={!r || walk.loading || !plan.start || !plan.end}>{walk.loading ? "Loading directions…" : "Start guided walk"}</button>}
          {walk.data && <><span className="walkcaption">{currentStep ? `Step ${walk.index + 1} of ${walkSteps.length} · ${currentStep.text}` : walk.data.summary}</span>{currentStep?.bearing_deg != null && <span className="compassarrow" title={`${currentStep.bearing_deg}°`} style={{ transform: `rotate(${currentStep.bearing_deg}deg)` }}>↑</span>}
            <button onClick={() => jumpToStep(walk.index - 1)} disabled={walk.index === 0}>Previous</button>
            <button onClick={() => jumpToStep(walk.index + 1)} disabled={walk.index >= walkSteps.length - 1}>Next</button>
            <button onClick={() => { if (walk.paused) { setWalk(w => ({ ...w, paused: false })); } else { window.speechSynthesis?.pause(); clearTimeout(timer.current); setWalk(w => ({ ...w, paused: true })); } }}>{walk.paused ? "Resume" : "Pause"}</button>
            <button onClick={() => setWalk(w => ({ ...w, muted: !w.muted }))}>{walk.muted ? "Unmute" : "Mute"}</button>
            <button onClick={() => stopWalk()}>Stop</button></>}
        </div>
        {walk.data?.summary && <div className="walksummary">{walk.data.summary}</div>}
        {plan.loading && <div className="slot" style={{ background: "#0006" }}>Computing routes…</div>}
      </section>

      <aside>
        <div className="tabs">{["Routes", "Return trip", "Raw"].map((x, i) => <button key={x} className={tab === i ? "on" : ""} onClick={() => setTab(i)}>{x}</button>)}</div>
        <ErrorBox error={plan.error} onRetry={compute} />
        {tab === 0 && (plan.routes.length ? plan.routes.map((rt, i) => (
            <button key={i} className={"li rt" + (i === plan.sel ? " on" : "")} onClick={() => setPlan(p => ({ ...p, sel: i }))}>
            <span style={{ color: ROUTE_COLORS[i % ROUTE_COLORS.length] }}>■</span> <b>{label(rt.name)}</b>
            {rt.metrics.map(([k, v]) => <div className="st" key={k}><span className="dm">{label(k)}</span><Scalar v={v} /></div>)}
            {rt.nested.map(([k, v]) => <div key={k} className="nest"><div className="dm" style={{ fontSize: 12 }}>{label(k)}</div><DataView data={v} /></div>)}
            {!rt.path.length && <div className="wn" style={{ fontSize: 12 }}>No drawable path found in this route</div>}
          </button>
        )) : !plan.error && <p className="dm">{plan.start && plan.end ? "Press Compute routes." : "Select a start and an end cell."}</p>)}
        {tab === 1 && (r ? <>
          <p><b>{label(r.name)}</b></p>
          <p style={{ margin: "8px 0" }}><button className="pri" onClick={() => checkTrip(plan.sel, Number(tankSupply))} disabled={trip?.loading}>{trip?.loading ? "Checking…" : "Check return trip"}</button></p>
          <ErrorBox error={trip?.error} />
          {trip?.data?.can_return === false && <p className="er">Needs {trip.data.required_supply_kg} kg, you carry {trip.data.available_kg ?? trip.data.tank?.supply_kg ?? trip.req?.tank?.supply_kg} kg, short by {trip.data.shortfall_kg} kg.</p>}
          {trip?.data?.can_return === true && <p className="ok">Return possible</p>}
          <label className="tankfield">Tank supply (kg) <input type="number" min="0" step="0.01" value={tankSupply} onChange={e => setTankSupply(e.target.value)} /></label>
          {trip?.data?.can_return === false && <button onClick={() => { const amount = Math.ceil(Number(trip.data.required_supply_kg) * 100) / 100; setTankSupply(amount); checkTrip(plan.sel, amount); }} disabled={trip?.loading}>Use required amount</button>}
          {trip?.data !== undefined && trip?.data !== null && <DataView data={trip.data} />}
        </> : <p className="dm">Compute routes first, then select one.</p>)}
        {tab === 2 && (plan.raw ? <><Raw data={plan.req} title="Request body" /><Raw data={plan.raw} /></> : <p className="dm">No response yet.</p>)}
        {walk.data?.steps?.length > 0 && <div className="guidedlist"><h3>Guided walk · {walk.data.total_m} m · {walk.data.total_minutes} min</h3><p className="dm">{walk.data.summary}</p>{walkSteps.map((step, i) => <button key={`${step.number}-${i}`} className={"li" + (i === walk.index ? " on" : "")} onClick={() => jumpToStep(i)}><b>Step {i + 1}</b><div style={{ fontSize: 12, marginTop: 3 }}>{step.text}</div></button>)}</div>}
      </aside>
    </div>
  );
}
