/* Thin client for the Astral Horizon FastAPI backend.
   By default requests go to the same origin (/api/...), which nginx (production)
   or the Vite dev server (development) proxies to the backend.
   Set VITE_API_BASE_URL at build time to call the backend directly instead (needs CORS). */

export const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
export const TERRAIN_MAP_URL = API_BASE + "/api/map/terrain.png";
export const BLOCKED_MAP_URL = API_BASE + "/api/map/blocked.png?max_slope=20";

export class ApiError extends Error {
  constructor(message, { status, body, path } = {}) {
    super(message);
    this.status = status; this.body = body; this.path = path;
  }
}

/* Turns FastAPI error payloads (including 422 validation lists) into readable text. */
export function describeError(body, status) {
  const d = body && body.detail;
  if (Array.isArray(d)) {
    return d.map(e => `${(e.loc || []).filter(x => x !== "body").join(".") || "request"}: ${e.msg}`).join("\n");
  }
  if (typeof d === "string") return d;
  if (d) return JSON.stringify(d);
  if (typeof body === "string" && body) return body.slice(0, 300);
  return status ? `Server responded with ${status}` : "Request failed";
}

async function request(method, path, payload, { timeout = 30000, signal } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  signal?.addEventListener("abort", () => ctl.abort());
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers: payload !== undefined ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "application/json" },
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
      signal: ctl.signal,
    });
  } catch (e) {
    throw new ApiError(e.name === "AbortError" ? "Request timed out" : "Server unreachable", { path });
  } finally { clearTimeout(t); }
  const text = await res.text();
  let body = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
  if (!res.ok) throw new ApiError(describeError(body, res.status), { status: res.status, body, path });
  return body;
}

export const api = {
  health: opts => request("GET", "/api/health", undefined, { timeout: 8000, ...opts }),
  info: opts => request("GET", "/api/info", undefined, opts),
  astronautDefaults: opts => request("GET", "/api/astronaut/defaults", undefined, opts),
  routes: (body, opts) => request("POST", "/api/routes", body, { timeout: 120000, ...opts }),
  returnTrip: (body, opts) => request("POST", "/api/return-trip", body, { timeout: 120000, ...opts }),
  directions: (body, opts) => request("POST", "/api/directions", body, { timeout: 120000, ...opts }),
  survivalMap: (body, opts) => request("POST", "/api/survival-map", body, { timeout: 120000, ...opts }),
  explainCell: (body, opts) => request("POST", "/api/explain-cell", body, { timeout: 120000, ...opts }),
  rescue: (body, opts) => request("POST", "/api/rescue", body, { timeout: 120000, ...opts }),
};

export const ENDPOINTS = [
  ["GET", "/api/health", "Server alive check"],
  ["GET", "/api/info", "Map size and settings"],
  ["GET", "/api/astronaut/defaults", "Astronaut settings, options and assumptions"],
  ["POST", "/api/routes", "Three routes between two cells, with oxygen needs"],
  ["POST", "/api/return-trip", "Can the astronaut do a route and still get home"],
  ["POST", "/api/directions", "Voice-guided directions for a selected route"],
  ["POST", "/api/survival-map", "Oxygen-safe area around a base"],
  ["POST", "/api/explain-cell", "Explain a cell safety verdict"],
  ["POST", "/api/rescue", "Evaluate a stranded astronaut rescue"],
];
