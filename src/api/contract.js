/* ─────────────────────────────────────────────────────────────────────────────
   BACKEND CONTRACT
   Every assumption about request and response shapes lives in this file.
   If the FastAPI models use other field names, change them here only.
   Readers below accept several common shapes, so most backends work unchanged.
   ───────────────────────────────────────────────────────────────────────────── */

/* The backend cell model is an object with row and col fields. */
export const cellToApi = c => ({ row: c.row, col: c.col });

/* POST /api/routes body. The backend calls the destination `goal`. */
export const buildRoutesBody = ({ start, end, astronaut }) => ({
  start: cellToApi(start),
  goal: cellToApi(end),
  ...(astronaut && Object.keys(astronaut).length ? { astronaut } : {}),
});

const routeStrategy = route => {
  const name = String(route?.name ?? route ?? "").toLowerCase();
  if (name.includes("safe")) return "safest";
  if (name.includes("efficient")) return "efficient";
  return "shortest";
};

/* POST /api/return-trip follows the backend's documented request model. */
export const buildReturnTripBody = ({ start, end, route, astronaut, supplyKg = 1 }) => ({
  start: cellToApi(start),
  goal: cellToApi(end),
  route: routeStrategy(route),
  max_slope: 20,
  allowance: 0.2,
  work_minutes: 0,
  include_points: true,
  tank: {
    supply_kg: supplyKg,
    plss: "none",
    loss_kg_per_hour: 5,
    reserve_kg: 0,
  },
  astronaut: astronaut && Object.keys(astronaut).length ? astronaut : {
    mass_kg: 81.4,
    height_m: 1.78,
    intensity: "medium",
    speed_m_s: 1.3,
  },
});

/* ── readers ─────────────────────────────────────────────────────────────── */

const isObj = v => v && typeof v === "object" && !Array.isArray(v);
const num = v => (typeof v === "number" && isFinite(v) ? v : typeof v === "string" && v.trim() && isFinite(+v) ? +v : null);

/* Map dimensions from /api/info. Returns { rows, cols } or null. */
export function readGridSize(info) {
  if (!info) return null;
  const roots = [info, info.data, info.map_info, info.map, info.grid, info.settings].filter(isObj);
  const pools = roots.flatMap(o => [o, o.size, o.map_size, o.grid_size, o.dimensions].filter(isObj));
  for (const o of pools) {
    const r = num(o.rows ?? o.height ?? o.n_rows ?? o.nrows ?? o.h);
    const c = num(o.cols ?? o.columns ?? o.width ?? o.n_cols ?? o.ncols ?? o.w);
    if (r && c) return { rows: r, cols: c };
    const sh = o.shape ?? o.grid_shape ?? o.dimensions ?? o.dims ?? o.size ?? o.map_size ?? o.grid_size;
    if (Array.isArray(sh) && num(sh[0]) && num(sh[1])) return { rows: num(sh[0]), cols: num(sh[1]) };
  }
  const source = isObj(info.data) ? { ...info.data, ...info } : info;
  const s = source.size ?? source.grid_size ?? source.map_size;
  if (Array.isArray(s) && num(s[0]) && num(s[1])) return { rows: num(s[0]), cols: num(s[1]) };
  if (num(s)) return { rows: num(s), cols: num(s) };
  const map = source.map ?? source.grid ?? source.terrain ?? source.map_data;
  if (Array.isArray(map) && map.length && Array.isArray(map[0]) && map[0].length) return { rows: map.length, cols: map[0].length };
  return null;
}

/* Map assets may be supplied as a data URL, a URL, or a two-dimensional grid. */
export function readMapAsset(info) {
  if (!isObj(info)) return { image: null, grid: null };
  const source = isObj(info.data) ? { ...info.data, ...info } : info;
  const candidates = [source.map_image, source.mapImage, source.map_png, source.map_url, source.mapUrl, source.map_path, source.map_file, source.map_info, source.map, source.grid, source.terrain, source.map_data];
  for (const value of candidates) {
    if (Array.isArray(value) && Array.isArray(value[0])) return { image: null, grid: value };
    if (typeof value === "string" && value) {
      const image = /^(data:image\/|https?:\/\/|\/)/i.test(value) ? value : null;
      if (image) return { image, grid: null };
      if (/\.(png|jpe?g|webp|gif)(?:[?#].*)?$/i.test(value)) return { image: `/api/${value.replace(/^\/+/, "")}`, grid: null };
      if (value.length > 128 && /^[A-Za-z0-9+/=\r\n]+$/.test(value)) return { image: `data:image/png;base64,${value.replace(/\s/g, "")}`, grid: null };
    }
    if (isObj(value)) {
      const grid = value.cells ?? value.elevation ?? value.values ?? value.data;
      if (Array.isArray(grid) && Array.isArray(grid[0])) return { image: null, grid };
      const image = value.url ?? value.href ?? value.path ?? value.file_path ?? value.filename ?? value.image_url ?? value.imageUrl;
      if (typeof image === "string" && image) return { image, grid: null };
      const data = value.base64 ?? value.data_base64 ?? value.content ?? (typeof value.data === "string" ? value.data : null);
      if (typeof data === "string" && data) {
        const mime = value.content_type ?? value.mime_type ?? value.mimeType ?? "image/png";
        return { image: data.startsWith("data:") ? data : `data:${mime};base64,${data}`, grid: null };
      }
    }
  }
  return { image: null, grid: null };
}

/* A single cell from many shapes: [r,c], {row,col}, {r,c}, {y,x}, {i,j}. */
export function readCell(p) {
  if (Array.isArray(p) && p.length >= 2 && num(p[0]) !== null && num(p[1]) !== null) return { row: num(p[0]), col: num(p[1]) };
  if (isObj(p)) {
    const r = num(p.row ?? p.r ?? p.i ?? p.y), c = num(p.col ?? p.c ?? p.j ?? p.x);
    if (r !== null && c !== null) return { row: r, col: c };
  }
  return null;
}

const PATH_KEYS = ["path", "cells", "points", "coordinates", "coords", "waypoints", "route", "nodes"];
const NAME_KEYS = ["name", "label", "title", "type", "kind", "strategy"];

function readPath(r) {
  if (Array.isArray(r) && r.every(p => readCell(p))) return r.map(readCell);
  if (!isObj(r)) return [];
  for (const k of PATH_KEYS) {
    const v = r[k];
    if (Array.isArray(v) && v.length && v.every(p => readCell(p))) return v.map(readCell);
  }
  return [];
}

/* Routes from /api/routes. Returns [{ name, path, metrics, raw }]. */
export function readRoutes(res) {
  let list = null;
  const src = isObj(res) && (res.routes ?? res.results ?? res.data) !== undefined ? (res.routes ?? res.results ?? res.data) : res;
  if (Array.isArray(src)) list = src.map((r, i) => [null, r, i]);
  else if (isObj(src)) list = Object.entries(src).filter(([, v]) => isObj(v) || Array.isArray(v)).map(([k, v], i) => [k, v, i]);
  if (!list) return [];
  return list.map(([key, r, i]) => {
    const nk = isObj(r) ? NAME_KEYS.find(k => typeof r[k] === "string" && r[k]) : null;
    const name = (nk && r[nk]) || key || `Route ${i + 1}`;
    const metrics = isObj(r) ? Object.entries(r).filter(([k, v]) => !PATH_KEYS.includes(k) && k !== nk && v !== null && typeof v !== "object") : [];
    const nested = isObj(r) ? Object.entries(r).filter(([k, v]) => !PATH_KEYS.includes(k) && v && typeof v === "object") : [];
    return { name: String(name), path: readPath(r), metrics, nested, raw: r };
  });
}

/* Astronaut defaults: { params (editable), options (choices per key), rest (read-only) }. */
export function readDefaults(d) {
  if (!isObj(d)) return { params: {}, options: {}, rest: {} };
  const pk = ["defaults", "settings", "astronaut", "parameters", "params"].find(k => isObj(d[k]));
  const ok = ["options", "choices", "allowed"].find(k => isObj(d[k]));
  const params = pk ? d[pk] : Object.fromEntries(Object.entries(d).filter(([, v]) => v === null || typeof v !== "object"));
  const options = ok ? d[ok] : {};
  const rest = Object.fromEntries(Object.entries(d).filter(([k]) => k !== pk && k !== ok && (pk || (d[k] && typeof d[k] === "object"))));
  return { params, options, rest };
}

/* Finds a yes/no verdict in a /api/return-trip response, if there is one. */
export function readVerdict(res) {
  if (!isObj(res)) return null;
  for (const k of ["feasible", "can_return", "possible", "safe", "ok", "success", "can_complete", "result"]) {
    if (typeof res[k] === "boolean") return { key: k, value: res[k] };
  }
  return null;
}
