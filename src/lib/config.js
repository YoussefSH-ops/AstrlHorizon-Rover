import { useSyncExternalStore } from "react";

const KEY = "ah.cfg";
export const DEFAULTS = {
  skip: false, theme: "dark", acc: "#c8452d", fs: 15, den: "normal", op: 100, mot: "on", hc: false,
  grid: true, labels: true, sbc: false, home: "dashboard",
  au: { master: .7, sfx: .8, amb: .5, boot: true, ui: true, ambOn: false, mute: false },
};

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY)) || {};
    return { ...DEFAULTS, ...s, au: { ...DEFAULTS.au, ...(s.au || {}) } };
  } catch { return { ...DEFAULTS, au: { ...DEFAULTS.au } }; }
}

let cfg = load();
const subs = new Set();

export const getCfg = () => cfg;

export function setCfg(patch) {
  const p = typeof patch === "function" ? patch(cfg) : patch;
  cfg = { ...cfg, ...p, au: { ...cfg.au, ...(p.au || {}) } };
  try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* storage blocked */ }
  applyCfg();
  subs.forEach(f => f());
}

export function resetCfg() {
  try { localStorage.removeItem(KEY); } catch { /* storage blocked */ }
  cfg = load(); applyCfg(); subs.forEach(f => f());
}

export function applyCfg() {
  const r = document.documentElement;
  r.dataset.theme = cfg.theme;
  r.dataset.density = cfg.den;
  r.dataset.motion = cfg.mot;
  r.dataset.contrast = cfg.hc ? "on" : "off";
  r.style.setProperty("--ac", cfg.acc);
  r.style.setProperty("--op", cfg.op / 100);
  r.style.fontSize = cfg.fs + "px";
}

const subscribe = f => (subs.add(f), () => subs.delete(f));
export const useCfg = () => useSyncExternalStore(subscribe, getCfg);
