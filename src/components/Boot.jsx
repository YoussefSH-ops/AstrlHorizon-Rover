import { useEffect, useRef, useState } from "react";
import { startBootRenderer } from "../lib/bootRenderer.js";
import { AU } from "../lib/audio.js";
import { getCfg, setCfg, useCfg } from "../lib/config.js";
import { api } from "../api/client.js";

const SU = ["Core", "Map engine", "3D renderer", "Telemetry", "ASTRA", "Data catalog"];
const MS = ["Establishing Deep Space Network uplink", "Calibrating orbital reference frame", "Mounting map engine", "Initializing 3D terrain renderer", "Synchronizing Martian clock", "Indexing rover telemetry", "Waking ASTRA inference core", "Verifying system integrity"];
const reduced = () => matchMedia("(prefers-reduced-motion:reduce)").matches;

export default function Boot({ onFinish, onMuteToggle }) {
  const cfg = useCfg();
  const cv = useRef(), img = useRef(), hud = useRef(), lg = useRef(), sb = useRef(), fl = useRef(), pc = useRef(), root = useRef();
  const st = useRef({ B0: 0, BP: 0, CALM: false });
  const fin = useRef(false), timers = useRef([]), cleanup = useRef(null);
  const [gate, setGate] = useState(true), [gateFade, setGateFade] = useState(false), [hold, setHold] = useState(true), [done, setDone] = useState(false);

  useEffect(() => {
    cleanup.current = startBootRenderer(cv.current, img.current, hud.current, st.current);
    return () => { cleanup.current?.(); timers.current.forEach(clearTimeout); };
  }, []);

  function finish() {
    if (fin.current) return;
    fin.current = true;
    timers.current.forEach(clearTimeout);
    AU.done();
    setGate(false); setDone(true);
    onFinish();
    timers.current.push(setTimeout(() => { cleanup.current?.(); if (root.current) root.current.style.display = "none"; }, 1200));
  }

  useEffect(() => {
    if (getCfg().skip) { const t = setTimeout(finish, 0); return () => clearTimeout(t); }
    const k = e => { if (e.key === "Escape" && !fin.current) finish(); };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function start(withSound) {
    setCfg({ au: { mute: !withSound } });
    AU.unlock(); AU.vol();
    setGateFade(true); setTimeout(() => setGate(false), 600);
    setHold(false); AU.boot(); run();
  }

  function run() {
    const s = st.current;
    s.B0 = performance.now(); s.CALM = reduced() || getCfg().mot === "off";
    const T = reduced() ? 1500 : 9000, t0 = performance.now();
    const health = api.health().then(() => true, () => false);
    let n = 0;
    (function k() {
      if (fin.current) return;
      const p = Math.min((performance.now() - t0) / T, 1);
      AU.prog(p); s.BP = p;
      fl.current.style.inset = `0 ${100 - p * 100}% 0 0`;
      pc.current.textContent = Math.round(p * 100) + "%";
      while (n < MS.length && p >= (n + .6) / (MS.length + .4)) {
        const e = document.createElement("div");
        e.innerHTML = `<b>[${n + 1}]</b> ${MS[n]}… OK`;
        lg.current.append(e); AU.pulse(n);
        if (lg.current.children.length > 4) lg.current.firstChild.remove();
        sb.current.children[Math.min(n, 5)].classList.add("on");
        n++;
      }
      if (p >= 1) {
        [...sb.current.children].forEach(x => x.classList.add("on"));
        health.then(up => {
          if (fin.current) return;
          const e = document.createElement("div");
          e.innerHTML = up ? "<b>[ok]</b> Verification complete. Welcome, operator."
            : "<b>[!!]</b> Server did not respond to /api/health. Continuing offline.";
          lg.current.append(e);
          timers.current.push(setTimeout(finish, up ? 900 : 1800));
        });
        return;
      }
      requestAnimationFrame(k);
    })();
  }

  return (
    <div id="boot" ref={root} className={(hold ? "hold" : "") + (done ? " done" : "")}>
      <canvas ref={cv} />
      {gate && (
        <div id="gate" style={{ opacity: gateFade ? 0 : 1 }}>
          <div>
            <h1>ASTRAL HORIZON</h1>
            <p>This experience includes sound design. Headphones recommended.</p>
            <button className="pri" autoFocus onClick={() => start(true)}>Initialize with sound</button>
            <button onClick={() => start(false)}>Continue silent</button>
          </div>
        </div>
      )}
      <div className="bt">
        <label><input type="checkbox" checked={cfg.skip} onChange={e => setCfg({ skip: e.target.checked })} /> Disable intro</label>
        <button onClick={finish}>Skip intro</button>
        <button onClick={onMuteToggle} aria-label="Mute all sounds" aria-pressed={cfg.au.mute} title={cfg.au.mute ? "Unmute (M)" : "Mute (M)"}>{cfg.au.mute ? "🔇" : "🔊"}</button>
      </div>
      <img ref={img} src="/logo.jpg" alt="Astral Horizon" style={{ display: "none" }} />
      <div id="hud1" ref={hud} aria-hidden="true" />
      <div className="bh">
        <div id="lg2" ref={lg} />
        <div className="sb" ref={sb}>{SU.map(s => <span key={s}>{s}</span>)}</div>
        <div className="tr"><div className="tk"><div id="fl" ref={fl} /></div><span ref={pc}>0%</span></div>
      </div>
    </div>
  );
}
