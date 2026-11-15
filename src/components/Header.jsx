import { useEffect, useRef, useState } from "react";
import { AU } from "../lib/audio.js";
import { getCfg, useCfg } from "../lib/config.js";
import { useData } from "../api/DataContext.jsx";
import { useUi } from "./Ui.jsx";

function Clock() {
  const [t, setT] = useState("");
  useEffect(() => {
    const f = () => { const n = new Date(), jd = n / 864e5 + 2440587.5, sol = Math.floor((jd - 2405522.0028779) / 1.0274912517); setT(n.toISOString().slice(11, 19) + " UTC  Sol " + sol); };
    f(); const i = setInterval(f, 1000); return () => clearInterval(i);
  }, []);
  return <span className="mono dm" id="clk">{t}</span>;
}

function Visualizer() {
  const ref = useRef();
  useEffect(() => {
    const vc = ref.current.getContext("2d"), vb = new Uint8Array(32); let raf;
    (function v() {
      vc.clearRect(0, 0, 40, 18); const c = getCfg(); vc.fillStyle = c.acc;
      const on = AU.an && !document.hidden && c.mot !== "off";
      if (on) AU.an.getByteFrequencyData(vb);
      for (let i = 0; i < 8; i++) { const h = on ? Math.max(2, vb[i * 2 + 1] / 255 * 18) : 2; vc.fillRect(i * 5, 18 - h, 3, h); }
      raf = requestAnimationFrame(v);
    })();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas id="vz" ref={ref} width="40" height="18" aria-hidden="true" />;
}

export default function Header({ name, onMenu, onSearch, onMute, go }) {
  const cfg = useCfg();
  const { health } = useData();
  const { openModal, events } = useUi();
  const up = !!health.at && !health.error;
  const status = health.loading && !health.at ? ["Checking", "dm"] : up ? ["Online", "ok"] : ["Offline", "er"];

  const notif = () => openModal({
    title: "Notifications", sound: "notify",
    body: events.length ? events.map((e, i) => (
      <div className="st" key={i}><span>{e.text}</span><span className="dm">{e.at.toLocaleTimeString()}</span></div>
    )) : <p className="dm">No events in this session.</p>,
  });

  return (
    <header>
      <button onClick={onMenu} aria-label="Toggle sidebar">☰</button>
      <div className="bc">Astral Horizon / <b>{name}</b></div>
      <button id="sch" onClick={onSearch}>Search  Ctrl K</button>
      <button className="srv" onClick={() => go("server")} title="Server status from /api/health">
        <span className={status[1]}>●</span> {status[0]}
      </button>
      <Clock />
      <Visualizer />
      <button onClick={onMute} aria-label="Mute all sounds" aria-pressed={cfg.au.mute} title={cfg.au.mute ? "Unmute (M)" : "Mute (M)"}>{cfg.au.mute ? "🔇" : "🔊"}</button>
      <button onClick={notif} aria-label="Notifications">🔔{events.length ? <span className="badge">{events.length}</span> : null}</button>
    </header>
  );
}
