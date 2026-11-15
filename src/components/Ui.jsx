import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AU } from "../lib/audio.js";

const Ctx = createContext(null);
export const useUi = () => useContext(Ctx);

export function UiProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [modal, setModal] = useState(null);
  const [events, setEvents] = useState([]);

  const toast = useCallback((text, kind = "confirm") => {
    AU.play(kind);
    const id = Math.random();
    setToasts(t => [...t, { id, text }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2800);
  }, []);

  const log = useCallback((text, kind = "notify") => {
    setEvents(e => [{ text, kind, at: new Date() }, ...e].slice(0, 30));
  }, []);

  /* modal({ title, body, actions:[{label, primary, onClick}], sound }) */
  const openModal = useCallback(m => {
    AU.play(m.sound || (/Reset|Remove|Clear/.test(m.title) ? "warn" : "open"));
    setModal(m);
  }, []);
  const close = useCallback((confirmed) => { AU.play(confirmed ? "confirm" : "close"); setModal(null); }, []);

  useEffect(() => {
    const k = e => { if (e.key === "Escape") setModal(null); };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, []);

  return (
    <Ctx.Provider value={{ toast, openModal, closeModal: close, log, events }}>
      {children}
      <div id="mo" className={modal ? "s" : ""} onClick={e => e.target.id === "mo" && close(false)}>
        {modal && (
          <div role="dialog" aria-modal="true" aria-label={modal.title}>
            <h3>{modal.title}</h3>
            <div style={{ margin: "8px 0 16px" }}>{modal.body}</div>
            {(modal.actions || [{ label: "Close" }]).map((a, i) => (
              <button key={i} className={a.primary ? "pri" : ""} style={{ marginRight: 6 }}
                onClick={() => { close(!!a.primary); a.onClick?.(); }}>{a.label}</button>
            ))}
          </div>
        )}
      </div>
      <div id="ts" aria-live="polite">{toasts.map(t => <div key={t.id}>{t.text}</div>)}</div>
    </Ctx.Provider>
  );
}
