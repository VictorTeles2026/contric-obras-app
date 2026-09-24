"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

// Avisos rápidos ("toasts") de sucesso/erro — antes várias ações falhavam em
// silêncio (o botão só voltava ao normal e nada acontecia).
const ToastContext = createContext({ avisar: () => {} });

export function ToastProvider({ children }) {
  const [avisos, setAvisos] = useState([]);
  const idRef = useRef(0);

  const remover = useCallback((id) => setAvisos((p) => p.filter((a) => a.id !== id)), []);

  const avisar = useCallback((texto, tipo = "sucesso", duracao = 3500) => {
    const id = ++idRef.current;
    setAvisos((p) => [...p.slice(-2), { id, texto, tipo }]);
    setTimeout(() => remover(id), duracao);
  }, [remover]);

  const cores = {
    sucesso: "bg-green text-white",
    erro: "bg-red text-white",
    info: "bg-navy text-white",
  };

  return (
    <ToastContext.Provider value={{ avisar }}>
      {children}
      <div
        className="fixed left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none"
        style={{ top: "max(1rem, env(safe-area-inset-top))" }}
        aria-live="polite"
      >
        {avisos.map((a) => (
          <div key={a.id} role="status" onClick={() => remover(a.id)}
            className={`pointer-events-auto animar-surgir rounded-xl px-4 py-3 text-sm font-semibold shadow-lg cursor-pointer flex items-start gap-2 ${cores[a.tipo] || cores.info}`}>
            <span className="shrink-0">{a.tipo === "erro" ? "⚠" : a.tipo === "sucesso" ? "✓" : "ℹ"}</span>
            <span className="leading-snug">{a.texto}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
