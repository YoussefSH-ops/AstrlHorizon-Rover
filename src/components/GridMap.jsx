import { useEffect, useRef, useState } from "react";

export const ROUTE_COLORS = ["#e8782f", "#4aa37a", "#3d8bd9", "#d4a017", "#c8452d"];

export default function GridMap({ size, start, end, routes = [], sel = 0, mapGrid, mapImage, blockedImage, overlayImage, extraPath, extraMarker, onPick, onHover, grid = true, labels = true, zoomRef, guidedLeg }) {
  const wrap = useRef(), cv = useRef(), layer = useRef(), view = useRef({ scale: 1, x: 0, y: 0 });
  const gesture = useRef(null), pointers = useRef(new Map()), dragged = useRef(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [viewTick, setViewTick] = useState(0);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const geo = (() => {
    if (!size || !box.w || !box.h) return null;
    const pad = 16, cs = Math.max(0.05, Math.min((box.w - pad * 2) / size.cols, (box.h - pad * 2) / size.rows));
    const W = cs * size.cols, H = cs * size.rows;
    return { cs, W, H, ox: (box.w - W) / 2, oy: (box.h - H) / 2 };
  })();

  const applyView = v => {
    view.current = v;
    if (layer.current) layer.current.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.scale})`;
    setViewTick(t => t + 1);
  };
  const animateView = (target, duration = 450) => {
    const from = view.current, startAt = performance.now();
    const tick = now => {
      const t = Math.min(1, (now - startAt) / duration), eased = 1 - (1 - t) ** 3;
      applyView({ scale: from.scale + (target.scale - from.scale) * eased, x: from.x + (target.x - from.x) * eased, y: from.y + (target.y - from.y) * eased });
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if (zoomRef) zoomRef.current = { reset: () => animateView({ scale: 1, x: 0, y: 0 }), focusCells: cells => {
    if (!geo || !cells?.length) return;
    const xs = cells.map(c => geo.ox + (c.col + .5) * geo.cs), ys = cells.map(c => geo.oy + (c.row + .5) * geo.cs);
    const pad = Math.max(36, geo.cs * 3), spanX = Math.max(...xs) - Math.min(...xs) + pad * 2, spanY = Math.max(...ys) - Math.min(...ys) + pad * 2;
    const scale = Math.max(1, Math.min(5, box.w / spanX, box.h / spanY));
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    animateView({ scale, x: box.w / 2 - cx * scale, y: box.h / 2 - cy * scale });
  } };

  useEffect(() => {
    const c = cv.current; if (!c) return;
    const D = Math.min(devicePixelRatio || 1, 2);
    c.width = box.w * D; c.height = box.h * D;
    const x = c.getContext("2d"); x.setTransform(D, 0, 0, D, 0, 0); x.clearRect(0, 0, box.w, box.h);
    if (!geo) return;
    const css = getComputedStyle(document.documentElement);
    const ln = css.getPropertyValue("--ln").trim() || "#2c2321", ac = css.getPropertyValue("--ac").trim() || "#c8452d", tx = css.getPropertyValue("--tx").trim() || "#ece5e1";
    const { cs, W, H, ox, oy } = geo;
    if (Array.isArray(mapGrid) && mapGrid.length) {
      let min = Infinity, max = -Infinity;
      mapGrid.forEach(row => Array.isArray(row) && row.forEach(v => { if (typeof v === "number" && Number.isFinite(v)) { min = Math.min(min, v); max = Math.max(max, v); } }));
      mapGrid.forEach((row, ri) => Array.isArray(row) && row.forEach((v, ci) => {
        if (ri >= size.rows || ci >= size.cols) return;
        const blocked = v === true || /blocked|obstacle|rock|crater/i.test(String(v));
        const t = typeof v === "number" && max > min ? (v - min) / (max - min) : Number(v) > 0 ? 1 : 0;
        x.fillStyle = blocked ? "#171412" : `rgba(213, ${Math.round(105 + 75 * t)}, ${Math.round(49 + 36 * t)}, .72)`;
        x.fillRect(ox + ci * cs, oy + ri * cs, Math.ceil(cs), Math.ceil(cs));
      }));
    }
    x.strokeStyle = ln; x.lineWidth = 1; x.strokeRect(ox + .5, oy + .5, W - 1, H - 1);
    if (grid && cs >= 5) {
      x.globalAlpha = .7; x.beginPath();
      for (let i = 1; i < size.cols; i++) { const px = Math.round(ox + i * cs) + .5; x.moveTo(px, oy); x.lineTo(px, oy + H); }
      for (let j = 1; j < size.rows; j++) { const py = Math.round(oy + j * cs) + .5; x.moveTo(ox, py); x.lineTo(ox + W, py); }
      x.stroke(); x.globalAlpha = 1;
    }
    const cx = c2 => ox + (c2.col + .5) * cs, cy = c2 => oy + (c2.row + .5) * cs;
    const routeCells = extraPath?.map(p => Array.isArray(p) ? { row: p[0], col: p[1] } : p) || [];
    if (routeCells.length > 1) { x.globalAlpha = 1; x.strokeStyle = "#62d7e9"; x.lineWidth = Math.max(3, Math.min(cs * .45, 9)); x.setLineDash([8, 5]); x.beginPath(); x.moveTo(cx(routeCells[0]), cy(routeCells[0])); routeCells.slice(1).forEach(q => x.lineTo(cx(q), cy(q))); x.stroke(); x.setLineDash([]); }
    const order = routes.map((r, i) => i).filter(i => i !== sel).concat(routes[sel] ? [sel] : []);
    x.lineCap = "round"; x.lineJoin = "round";
    for (const i of order) {
      const p = routes[i].path; if (!p || p.length < 2) continue;
      const on = i === sel; x.globalAlpha = on ? 1 : .45; x.strokeStyle = ROUTE_COLORS[i % ROUTE_COLORS.length];
      x.lineWidth = Math.max(on ? 3 : 2, Math.min(cs * (on ? .5 : .35), 10));
      if (on) { x.shadowColor = x.strokeStyle; x.shadowBlur = 10; }
      x.beginPath(); x.moveTo(cx(p[0]), cy(p[0])); p.slice(1).forEach(q => x.lineTo(cx(q), cy(q))); x.stroke(); x.shadowBlur = 0;
    }
    if (guidedLeg?.path?.length > 1) {
      x.globalAlpha = 1; x.strokeStyle = "#fff"; x.lineWidth = Math.max(5, Math.min(cs * .8, 14)); x.shadowColor = "#fff"; x.shadowBlur = 16;
      x.beginPath(); x.moveTo(cx(guidedLeg.path[0]), cy(guidedLeg.path[0])); guidedLeg.path.slice(1).forEach(q => x.lineTo(cx(q), cy(q))); x.stroke(); x.shadowBlur = 0;
    } else if (guidedLeg?.path?.length === 1) {
      x.globalAlpha = 1; x.strokeStyle = "#fff"; x.lineWidth = 3; x.shadowColor = "#fff"; x.shadowBlur = 12;
      x.beginPath(); x.arc(cx(guidedLeg.path[0]), cy(guidedLeg.path[0]), Math.max(5, cs * .35), 0, Math.PI * 2); x.stroke(); x.shadowBlur = 0;
    }
    x.globalAlpha = 1;
    const pin = (c2, t) => { if (!c2) return; const r = Math.max(6, Math.min(cs * .45, 12)); x.fillStyle = ac; x.strokeStyle = "#e8782f"; x.lineWidth = 2; x.beginPath(); x.arc(cx(c2), cy(c2), r, 0, 7); x.fill(); x.stroke(); if (labels) { x.fillStyle = tx; x.font = "600 12px ui-monospace,Menlo,monospace"; x.fillText(`${t}  ${c2.row}, ${c2.col}`, cx(c2) + r + 4, cy(c2) - r - 2); } };
    pin(start, "A"); pin(end, "B");
    if (extraMarker) { x.fillStyle = "#f5d547"; x.strokeStyle = "#fff"; x.lineWidth = 2; x.shadowColor = "#f5d547"; x.shadowBlur = 14; x.beginPath(); x.arc(cx(extraMarker), cy(extraMarker), Math.max(7, Math.min(cs * .55, 14)), 0, 7); x.fill(); x.stroke(); x.shadowBlur = 0; }
  }, [box, geo?.cs, size, start, end, routes, sel, mapGrid, grid, labels, guidedLeg, extraPath, extraMarker]); // eslint-disable-line react-hooks/exhaustive-deps

  const cellAt = e => {
    if (!geo) return null;
    const r = wrap.current.getBoundingClientRect(), v = view.current;
    const px = (e.clientX - r.left - v.x) / v.scale, py = (e.clientY - r.top - v.y) / v.scale;
    const col = Math.floor((px - geo.ox) / geo.cs), row = Math.floor((py - geo.oy) / geo.cs);
    return row >= 0 && col >= 0 && row < size.rows && col < size.cols ? { row, col } : null;
  };
  const down = e => { if (e.button !== 0) return; pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pointers.current.size === 1) gesture.current = { x: e.clientX, y: e.clientY, ox: view.current.x, oy: view.current.y }; else if (pointers.current.size === 2) { const pts = [...pointers.current.values()]; gesture.current = { pinch: true, dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), scale: view.current.scale, center: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }, view: { ...view.current } }; } e.currentTarget.setPointerCapture(e.pointerId); };
  const move = e => { if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (gesture.current?.pinch && pointers.current.size >= 2) { const pts = [...pointers.current.values()], dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), center = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }, rect = wrap.current.getBoundingClientRect(), p = { x: center.x - rect.left, y: center.y - rect.top }, g = gesture.current, scale = Math.max(1, Math.min(6, g.scale * dist / g.dist)); dragged.current = true; applyView({ scale, x: p.x - (p.x - g.view.x) * scale / g.view.scale, y: p.y - (p.y - g.view.y) * scale / g.view.scale }); } else if (gesture.current) { const dx = e.clientX - gesture.current.x, dy = e.clientY - gesture.current.y; if (Math.abs(dx) + Math.abs(dy) > 4) dragged.current = true; applyView({ ...view.current, x: gesture.current.ox + dx, y: gesture.current.oy + dy }); } onHover?.(cellAt(e)); };
  const up = e => { pointers.current.delete(e.pointerId); gesture.current = null; if (!pointers.current.size) setTimeout(() => { dragged.current = false; }, 0); };
  const wheel = e => { e.preventDefault(); const rect = wrap.current.getBoundingClientRect(), p = { x: e.clientX - rect.left, y: e.clientY - rect.top }, old = view.current, scale = Math.max(1, Math.min(6, old.scale * Math.exp(-e.deltaY * .001))); applyView({ scale, x: p.x - (p.x - old.x) * scale / old.scale, y: p.y - (p.y - old.y) * scale / old.scale }); };

  return <div ref={wrap} style={{ position: "absolute", inset: 0, overflow: "hidden", touchAction: "none", cursor: gesture.current ? "grabbing" : "crosshair" }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel} onMouseLeave={() => onHover?.(null)} onClick={e => { if (dragged.current) return; const c = cellAt(e); if (c) onPick?.(c); }}>
    <div ref={layer} style={{ position: "absolute", inset: 0, transformOrigin: "0 0", willChange: "transform" }}>
      {geo && mapImage && <img src={mapImage} alt="Backend map" draggable="false" style={{ position: "absolute", left: geo.ox, top: geo.oy, width: geo.W, height: geo.H, objectFit: "fill", pointerEvents: "none" }} />}
      {geo && blockedImage && <img src={blockedImage} alt="Blocked terrain overlay" draggable="false" style={{ position: "absolute", left: geo.ox, top: geo.oy, width: geo.W, height: geo.H, objectFit: "fill", pointerEvents: "none" }} />}
      {geo && overlayImage && <img src={overlayImage} alt="Survival oxygen overlay" draggable="false" style={{ position: "absolute", left: geo.ox, top: geo.oy, width: geo.W, height: geo.H, objectFit: "fill", imageRendering: "pixelated", opacity: .65, pointerEvents: "none" }} />}
      <canvas ref={cv} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", pointerEvents: "none" }} />
    </div>
  </div>;
}
