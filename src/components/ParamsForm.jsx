import { label, fmt } from "./DataView.jsx";

/* Editable form generated from /api/astronaut/defaults. Field names, types and
   choices all come from the backend response. */

function setIn(obj, path, v) {
  if (!path.length) return v;
  const [h, ...t] = path;
  return { ...obj, [h]: setIn(obj?.[h], t, v) };
}

function Field({ k, v, opt, onChange }) {
  const choices = Array.isArray(opt) ? opt : Array.isArray(opt?.choices) ? opt.choices : Array.isArray(opt?.options) ? opt.options : null;
  const range = opt && typeof opt === "object" && !Array.isArray(opt) && (typeof opt.min === "number" || typeof opt.max === "number") ? opt : null;
  if (choices) {
    const vals = choices.map(c => (c && typeof c === "object" ? c.value ?? c.id ?? c.name : c));
    const names = choices.map(c => (c && typeof c === "object" ? c.label ?? c.name ?? c.value : c));
    return (
      <select value={String(v)} onChange={e => onChange(vals.find(x => String(x) === e.target.value))}>
        {vals.map((x, i) => <option key={i} value={String(x)}>{fmt(names[i])}</option>)}
      </select>
    );
  }
  if (typeof v === "boolean") return <input type="checkbox" className="sw" checked={v} onChange={e => onChange(e.target.checked)} />;
  if (typeof v === "number") {
    return <input type="number" step={range?.step ?? "any"} min={range?.min} max={range?.max} value={Number.isFinite(v) ? v : ""}
      onChange={e => onChange(e.target.value === "" ? 0 : +e.target.value)} style={{ width: 110 }} aria-label={label(k)} />;
  }
  if (typeof v === "string") return <input type="text" value={v} onChange={e => onChange(e.target.value)} aria-label={label(k)} />;
  return <span className="mono dm">{JSON.stringify(v)}</span>;
}

export default function ParamsForm({ params, options = {}, onChange, compact }) {
  if (!params) return null;
  const walk = (obj, opts, path) => Object.entries(obj).map(([k, v]) => {
    const p = [...path, k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return <fieldset key={p.join(".")} className="fs"><legend className="dm">{label(k)}</legend>{walk(v, opts?.[k] || {}, p)}</fieldset>;
    }
    return (
      <div className={compact ? "row cmp" : "row"} key={p.join(".")}>
        <div>{label(k)}</div>
        <div><Field k={k} v={v} opt={opts?.[k]} onChange={nv => onChange(setIn(params, p, nv))} /></div>
      </div>
    );
  });
  const out = walk(params, options, []);
  return out.length ? <div>{out}</div> : <p className="dm">The server returned no editable astronaut settings.</p>;
}
