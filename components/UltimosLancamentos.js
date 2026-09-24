"use client";

import { useEffect } from "react";
import { useTabela } from "../lib/dados";
import { formatarData, formatarHoras } from "../lib/datas";

const COR_STATUS = { pendente: "bg-amber/10 text-amber", aprovado: "bg-green/10 text-green", rejeitado: "bg-red/10 text-red" };

// `versao`: número que o pai incrementa após um lançamento, para recarregar a lista
// mesmo sem o tempo real do Supabase habilitado na tabela
export default function UltimosLancamentos({ usuario, pis, versao = 0 }) {
  const { dados, recarregar } = useTabela("apontamentos_horas", {
    filtro: [["usuario_id", usuario?.id]], order: { coluna: "created_at", asc: false },
  });
  useEffect(() => { if (versao) recarregar(); }, [versao, recarregar]);
  const recentes = dados.slice(0, 8);
  if (recentes.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 mt-2">
      <div className="titulo-secao">Últimos lançamentos</div>
      {recentes.map((h) => (
        <div key={h.id} className="cartao px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{pis.find((p) => p.id === h.pi_id)?.codigo || "—"}</div>
            <div className="text-xs text-muted">{formatarData(h.data)}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-head font-bold">{h.horas_totais != null ? formatarHoras(h.horas_totais) : "em aberto"}</span>
            <span className={`selo ${COR_STATUS[h.status] || "bg-panel text-muted"}`}>{h.status}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
