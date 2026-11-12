"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

// Avisos rápidos ("toasts") de sucesso/erro — antes várias ações falhavam em
// silêncio (o botão só voltava ao normal e nada acontecia).
const ToastContext = createContext({ avisar: () => {} });

// mensagens técnicas do banco → texto que o usuário entende (travas de travas-dados.sql e outras)
const TRADUCOES = [
  [/chk_\w*_ano/, "Data inválida: o ano deve estar entre 2000 e 2100."],
  [/chk_aloc_periodo/, "O fim do período está antes do início."],
  [/chk_\w*(percentual|medicao_pct)/, "O percentual deve ficar entre 0 e 100."],
  [/chk_horas_/, "Quantidade de horas inválida (deve ficar entre 0 e 24)."],
  [/chk_orc_/, "O valor orçado não pode ser negativo."],
  [/duplicate key|unique constraint/i, "Este registro já existe."],
  [/violates foreign key/i, "Este item está ligado a outros registros e não pode ser alterado/excluído assim."],
  [/row-level security|permission denied/i, "Seu usuário não tem permissão para esta ação."],
  [/Failed to fetch|NetworkError|Load failed/i, "Sem conexão com o servidor. Verifique a internet e tente de novo."],
  [/JWT expired|invalid JWT/i, "Sua sessão expirou. Entre novamente."],
];
export function traduzirErro(texto) {
  const t = String(texto ?? "");
  const achou = TRADUCOES.find(([re]) => re.test(t));
  if (!achou) return t;
  const prefixo = t.match(/^(Não foi possível [^:]+:)/)?.[1];
  return prefixo ? `${prefixo} ${achou[1]}` : achou[1];
}

export function ToastProvider({ children }) {
  const [avisos, setAvisos] = useState([]);
  const idRef = useRef(0);

  const remover = useCallback((id) => setAvisos((p) => p.filter((a) => a.id !== id)), []);

  const avisar = useCallback((textoOriginal, tipo = "sucesso", duracao = 3500) => {
    const texto = traduzirErro(textoOriginal);
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
