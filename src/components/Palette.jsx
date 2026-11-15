import { useState } from "react";
import { NAME } from "../nav.js";

export default function Palette({ close, go }) {
  const [q, setQ] = useState("");
  const items = Object.entries(NAME).filter(([, v]) => v.toLowerCase().includes(q.toLowerCase()));
  return (
    <div id="pal" className="s" onClick={e => e.target.id === "pal" && close()}>
      <div>
        <input autoFocus placeholder="Go to a page…" value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && items[0]) { close(); go(items[0][0]); } }} />
        <div style={{ padding: 8 }}>
          {items.length ? items.map(([k, v]) => (
            <button key={k} className="li" onClick={() => { close(); go(k); }}>{v}</button>
          )) : <p className="dm" style={{ padding: 8 }}>No matches. Try a page name.</p>}
        </div>
      </div>
    </div>
  );
}
