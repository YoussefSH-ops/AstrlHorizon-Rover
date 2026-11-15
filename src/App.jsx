import { useCallback, useEffect, useRef, useState } from "react";
import Boot from "./components/Boot.jsx";
import Header from "./components/Header.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Palette from "./components/Palette.jsx";
import { useUi } from "./components/Ui.jsx";
import { AU } from "./lib/audio.js";
import { getCfg, setCfg, useCfg } from "./lib/config.js";
import Dashboard from "./pages/Dashboard.jsx";
import RoutePlanner from "./pages/RoutePlanner.jsx";
import ReturnTrip from "./pages/ReturnTrip.jsx";
import Astronaut from "./pages/Astronaut.jsx";
import Server from "./pages/Server.jsx";
import Settings from "./pages/Settings.jsx";
import { Help, About } from "./pages/Static.jsx";
import { NAME } from "./nav.js";

const PAGES = { dashboard: Dashboard, map: RoutePlanner, return: ReturnTrip, astronaut: Astronaut, server: Server, settings: Settings, help: Help, about: About };

const fromHash = () => { const p = location.hash.replace(/^#\/?/, "").split("?")[0]; return NAME[p] ? p : null; };

export default function App() {
  const cfg = useCfg();
  const { toast } = useUi();
  const [booted, setBooted] = useState(false);
  const [page, setPage] = useState(() => fromHash() || getCfg().home);
  const [loading, setLoading] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [pal, setPal] = useState(false);
  const pageRef = useRef(page);

  const go = useCallback(p => {
    if (!NAME[p]) p = "dashboard";
    if (p !== pageRef.current) AU.play("nav");
    pageRef.current = p;
    AU.amb(p);
    if (fromHash() !== p) history.pushState(null, "", "#/" + p);
    setPage(p); setMobileNav(false);
    setLoading(true); setTimeout(() => setLoading(false), 220);
  }, []);

  useEffect(() => { const h = () => { const p = fromHash(); if (p) { pageRef.current = p; setPage(p); AU.amb(p); } }; addEventListener("popstate", h); return () => removeEventListener("popstate", h); }, []);
  useEffect(() => { AU.vol(); }, [cfg]);

  const togMute = useCallback(() => {
    setCfg(c => ({ au: { mute: !c.au.mute } }));
    AU.unlock(); AU.vol();
    if (!getCfg().au.mute) AU.play("confirm");
  }, []);

  useEffect(() => {
    const click = e => { AU.unlock(); const el = e.target.closest("button,.li,select,input,a"); if (el && !el.disabled && !el.matches("select,input.sw")) AU.play("click"); };
    const change = () => AU.play("confirm");
    const key = e => {
      if (e.key.toLowerCase() === "m" && !e.ctrlKey && !e.metaKey && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) togMute();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); AU.play("open"); setPal(true); }
      if (e.key === "Escape") setPal(false);
    };
    addEventListener("click", click, true); addEventListener("change", change); addEventListener("keydown", key);
    return () => { removeEventListener("click", click, true); removeEventListener("change", change); removeEventListener("keydown", key); };
  }, [togMute]);

  const finishBoot = () => {
    setBooted(true);
    const start = fromHash() || getCfg().home;
    pageRef.current = start; go(start);
  };

  const Page = PAGES[page] || Dashboard;

  return (
    <>
      <Boot onFinish={finishBoot} onMuteToggle={togMute} />
      <div id="app" hidden={!booted}>
        <Header name={NAME[page]} onMenu={() => innerWidth < 820 ? setMobileNav(v => !v) : setCfg({ sbc: !cfg.sbc })}
          onSearch={() => { AU.play("open"); setPal(true); }} onMute={togMute} go={go} />
        <Sidebar page={page} go={go} collapsed={cfg.sbc} mobileOpen={mobileNav} />
        <main id="mn">
          {loading ? <><div className="sk" /><div className="sk" style={{ width: "60%" }} /></> : <Page go={go} toast={toast} />}
        </main>
      </div>
      {pal && <Palette close={() => setPal(false)} go={go} />}
    </>
  );
}
