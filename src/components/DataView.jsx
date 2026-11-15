/* Renders any JSON the backend returns, exactly as returned. Nothing is invented. */

export const label = k => String(k).replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, c => c.toUpperCase());

export function fmt(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return Number.isInteger(v) ? v.toLocaleString() : (+v.toFixed(4)).toLocaleString(undefined, { maximumFractionDigits: 4 });
  return String(v);
}

export function Scalar({ v }) {
  const cls = typeof v === "boolean" ? (v ? "ok" : "er") : typeof v === "number" ? "mono" : "";
  return <span className={cls}>{fmt(v)}</span>;
}

export default function DataView({ data, depth = 0 }) {
  if (data === null || typeof data !== "object") return <Scalar v={data} />;
  if (Array.isArray(data)) {
    if (!data.length) return <span className="dm">None</span>;
    if (data.every(x => x === null || typeof x !== "object")) {
      return data.length <= 4 && data.every(x => typeof x === "number")
        ? <span className="mono">[{data.map(fmt).join(", ")}]</span>
        : <ul className="dl">{data.map((x, i) => <li key={i}><Scalar v={x} /></li>)}</ul>;
    }
    if (data.length > 50) return <span className="dm mono">{data.length} items</span>;
    return <div>{data.map((x, i) => <div key={i} className="nest"><DataView data={x} depth={depth + 1} /></div>)}</div>;
  }
  const entries = Object.entries(data);
  if (!entries.length) return <span className="dm">Empty</span>;
  return (
    <div>
      {entries.map(([k, v]) => v !== null && typeof v === "object" && !(Array.isArray(v) && v.length <= 4 && v.every(x => typeof x === "number")) ? (
        <div key={k} className="nest">
          <div className="dm" style={{ fontSize: 12, padding: "8px 0 2px" }}>{label(k)}</div>
          <DataView data={v} depth={depth + 1} />
        </div>
      ) : (
        <div className="st" key={k}><span>{label(k)}</span><DataView data={v} depth={depth + 1} /></div>
      ))}
    </div>
  );
}

export function Raw({ data, title = "Raw response" }) {
  if (data === undefined || data === null) return null;
  return (
    <details className="raw">
      <summary className="dm">{title}</summary>
      <pre className="mono">{JSON.stringify(data, null, 2)}</pre>
    </details>
  );
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="errbox">
      <b className="er">{error.status ? `Error ${error.status}` : "Error"}</b>
      <pre className="mono">{error.message}</pre>
      {onRetry && <button onClick={onRetry}>Retry</button>}
    </div>
  );
}
