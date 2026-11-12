"use client";

import { useEffect } from "react";
import { supabase } from "../lib/supabase";

// Rede de segurança: qualquer erro inesperado numa tela mostra esta mensagem (em vez de
// "Application error" em branco) e fica registrado na Auditoria para investigarmos.
export default function Erro({ error, reset }) {
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        await supabase.from("logs_auditoria").insert({
          usuario_id: null,
          usuario_nome: data?.user?.email || "Desconhecido",
          acao: "Erro na tela",
          detalhe: `${typeof window !== "undefined" ? window.location.pathname : ""} — ${String(error?.message || error).slice(0, 500)}`,
        });
      } catch { /* o registro nunca pode gerar outro erro */ }
    })();
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-panel">
      <div className="cartao max-w-md w-full p-6 text-center">
        <div className="text-3xl mb-2">⚠️</div>
        <h1 className="font-head text-lg font-bold mb-1">Algo deu errado nesta tela</h1>
        <p className="text-sm text-muted mb-5">Nada do que você já salvou foi perdido. O problema foi registrado para correção.</p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button onClick={() => reset()} className="btn btn-primario">Tentar de novo</button>
          <a href="/dashboard" className="btn btn-contorno">Voltar ao início</a>
        </div>
        <details className="mt-4 text-left text-xs text-muteddim">
          <summary className="cursor-pointer">Detalhe técnico</summary>
          <pre className="whitespace-pre-wrap break-words mt-2">{String(error?.message || error)}</pre>
        </details>
      </div>
    </div>
  );
}
