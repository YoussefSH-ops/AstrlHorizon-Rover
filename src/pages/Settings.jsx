import { useState } from "react";
import { getCfg, setCfg, resetCfg, useCfg } from "../lib/config.js";
import { AU } from "../lib/audio.js";
import { NAME } from "../nav.js";
import { useUi } from "../components/Ui.jsx";
import { EndpointTable } from "./Server.jsx";

const R = ({ l, d, children }) => (
  <div className="row"><div><div>{l}</div><div className="dm" style={{ fontSize: 12 }}>{d}</div></div><div>{children}</div></div>
);
const TABS = ["General", "Appearance", "Map", "Data", "Accessibility", "Audio"];

export default function Settings() {
  const cfg = useCfg();
  const { toast, openModal } = useUi();
  const [tab, setTab] = useState(0);
  const tg = k => <input type="checkbox" className="sw" checked={!!cfg[k]} onChange={e => setCfg({ [k]: e.target.checked })} />;
  const sg = (k, o) => <div className="seg">{o.map(v => <button key={v} className={cfg[k] === v ? "on" : ""} onClick={() => setCfg({ [k]: v })}>{v}</button>)}</div>;
  const au = cfg.au;
  const atg = k => <input type="checkbox" className="sw" checked={!!au[k]} onChange={e => {
    setCfg({ au: { [k]: e.target.checked } });
    if (k === "ambOn") { if (e.target.checked) { AU.unlock(); AU.amb(AU.pg); } else AU.stopA(); }
  }} />;
  const sl = k => <><input type="range" min="0" max="100" value={Math.round(au[k] * 100)} onChange={e => setCfg({ au: { [k]: e.target.value / 100 } })} /> <span className="mono">{Math.round(au[k] * 100)}%</span></>;
  const muted = () => { if (getMute()) { toast("Sound is muted. Press M to unmute.", "warn"); return true; } AU.unlock(); return false; };
  const getMute = () => cfg.au.mute;
  const pv = (k, l) => <button key={k} onClick={() => { if (muted()) return; setTimeout(() => k === "impact" ? AU.impact(1) : k === "chime" ? AU.chime() : AU.play(k, 1), 120); }}>{l}</button>;
  const pa = (k, l) => <button key={k} onClick={() => { if (muted()) return; AU.ambK(k); if (!cfg.au.ambOn) { clearTimeout(AU.pt); AU.pt = setTimeout(() => { if (!getCfg().au.ambOn) AU.stopA(); }, 6000); } }}>{l}</button>;

  const panes = [
    <>
      <R l="Skip startup intro" d="Applies on next launch">{tg("skip")}</R>
      <R l="Default page" d="Opens after startup">
        <select value={cfg.home} onChange={e => setCfg({ home: e.target.value })}>{Object.entries(NAME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </R>
      <R l="Collapse sidebar">{tg("sbc")}</R>
    </>,
    <>
      <R l="Theme">{sg("theme", ["dark", "light"])}</R>
      <R l="Accent color"><div className="dots">{["#c8452d", "#e8782f", "#d4a017", "#3d8bd9", "#4aa37a"].map(c => <button key={c} className={cfg.acc === c ? "on" : ""} style={{ background: c }} aria-label={c} onClick={() => setCfg({ acc: c })} />)}</div></R>
      <R l="Font size" d={cfg.fs + " px"}><input type="range" min="13" max="20" value={cfg.fs} onChange={e => setCfg({ fs: +e.target.value })} /></R>
      <R l="Density">{sg("den", ["compact", "normal", "roomy"])}</R>
      <R l="Panel opacity" d={cfg.op + "%"}><input type="range" min="50" max="100" value={cfg.op} onChange={e => setCfg({ op: +e.target.value })} /></R>
      <R l="Animations">{sg("mot", ["on", "off"])}</R>
    </>,
    <>
      <R l="Gridlines" d="Shown when cells are large enough to see">{tg("grid")}</R>
      <R l="Labels" d="Start and end cell labels on the map">{tg("labels")}</R>
    </>,
    <><EndpointTable /><p className="dm" style={{ marginTop: 10 }}>Live status of the backend endpoints this interface uses.</p></>,
    <>
      <R l="High contrast">{tg("hc")}</R>
      <R l="Larger text" d="Sets 18 px"><button onClick={() => { setCfg({ fs: 18 }); toast("Text size set to 18 px"); }}>Apply</button></R>
      <R l="Reduced motion" d="Use the Animations control in Appearance" />
      <R l="Keyboard navigation" d="Tab to move, Enter to open, Ctrl K to search, Esc to close" />
    </>,
    <>
      <R l="Mute all sounds" d="Shortcut: M">{atg("mute")}</R>
      <R l="Master volume">{sl("master")}</R>
      <R l="Interface effects volume">{sl("sfx")}</R>
      <R l="Ambient volume">{sl("amb")}</R>
      <R l="Interface sound effects">{atg("ui")}</R>
      <R l="Boot sequence sound" d="Plays when you choose sound on the startup screen">{atg("boot")}</R>
      <R l="Background ambience" d="Starts after your next click and follows the current workspace">{atg("ambOn")}</R>
      <R l="Preview effects">{[["click", "Click"], ["nav", "Section"], ["confirm", "Confirm"], ["notify", "Notify"], ["warn", "Warning"], ["error", "Error"], ["open", "Panel open"], ["close", "Panel close"], ["scan", "Map scan"]].map(([k, l]) => pv(k, l))}</R>
      <R l="Preview boot">{pv("impact", "Logo impact")}{pv("chime", "System ready")}</R>
      <R l="Preview ambience" d="Plays for six seconds">{[["m", "Dashboard"], ["e", "Route Planner"], ["c", "Return Trip"], ["h", "Astronaut"]].map(([k, l]) => pa(k, l))}</R>
      <p className="dm" style={{ marginTop: 10 }}>All sounds are generated in your browser. Nothing is downloaded.</p>
    </>,
  ];

  return (
    <>
      <div className="h1">Settings</div>
      <div className="tabs">{TABS.map((t, i) => <button key={t} className={i === tab ? "on" : ""} onClick={() => setTab(i)}>{t}</button>)}</div>
      <div className="w">{panes[tab]}</div>
      <p style={{ marginTop: 12 }}>
        <button onClick={() => openModal({
          title: "Reset preferences?", body: <p className="dm">Interface preferences return to defaults.</p>,
          actions: [{ label: "Cancel" }, { label: "Reset", primary: true, onClick: () => { resetCfg(); toast("Preferences reset"); } }],
        })}>Reset interface preferences</button>
      </p>
    </>
  );
}
