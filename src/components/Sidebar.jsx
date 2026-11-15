import { useState } from "react";
import { NAV } from "../nav.js";

export default function Sidebar({ page, go, collapsed, mobileOpen }) {
  const [closed, setClosed] = useState({});
  return (
    <nav id="nv" className={(collapsed ? "c " : "") + (mobileOpen ? "mo" : "")}>
      {NAV.map(([g, items]) => (
        <div key={g}>
          <button className="gh" onClick={() => setClosed(c => ({ ...c, [g]: !c[g] }))} aria-expanded={!closed[g]}>
            <span>{g}</span><span>▾</span>
          </button>
          <div hidden={closed[g]}>
            {items.map(([k, i, n]) => (
              <a key={k} href={"#/" + k} className={k === page ? "on" : ""} title={n}
                onClick={e => { e.preventDefault(); go(k); }}>
                <i>{i}</i><span className="t">{n}</span>
              </a>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
