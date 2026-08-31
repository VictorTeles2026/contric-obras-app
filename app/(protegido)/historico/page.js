"use client";

import { useState } from "react";
import { useTabela } from "../../../lib/dados";

export default function HistoricoPage() {
  const { dados: pis } = useTabela("pis");
  const { dados: usuarios } = useTabela("usuarios");
  const { dados: rdosTodos } = useTabela("rdos", { order: { coluna: "created_at" } });
  const { dados: horasTodas } = useTabela("apontamentos_horas", { order: { coluna: "created_at" } });

  const [filtro, setFiltro] = useState("");
  const piNome = (id) => pis.find((p) => p.id === id)?.codigo || "?";
  const nomeUsuario = (id) => usuarios.find((u) => u.id === id)?.nome || "?";

  const rdosDecididos = rdosTodos.filter((r) => r.status !== "pendente");
  const horasDecididas = horasTodas.filter((h) => h.status !== "pendente");

  const registros = [
    ...rdosDecididos.map((r) => ({ tipo: "rdo", ...r })),
    ...horasDecididas.map((h) => ({ tipo: "horas", ...h })),
  ].filter((r) => !filtro || r.tipo === filtro)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return (
    <div className="p-6">
      <h1 className="font-head font-bold text-xl mb-1">Histórico</h1>
      <p className="text-sm text-muted mb-4">Registro completo do que já foi decidido — RDOs e horas.</p>

      <div className="flex gap-2 mb-4">
        {[["", "Todos"], ["rdo", "RDOs"], ["horas", "Horas"]].map(([v, l]) => (
          <button key={v} onClick={() => setFiltro(v)} className={`px-3 py-1.5 rounded-full text-xs border ${filtro === v ? "bg-cyan text-white border-cyan" : "border-line text-muted"}`}>{l}</button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {registros.length === 0 && <div className="text-sm text-muteddim text-center py-8">Nada decidido ainda.</div>}
        {registros.map((r) => (
          <div key={r.id} className="border border-line rounded-lg p-3">
            <div className="flex justify-between items-center mb-1">
              <div>
                <span className="text-[10px] font-mono text-muteddim uppercase">{r.tipo}</span>
                <span className="ml-2 text-sm font-semibold">{piNome(r.pi_id)}</span>
                <span className="ml-2 text-xs text-muteddim">decidido por {nomeUsuario(r.decidido_por)}</span>
              </div>
              <span className={`text-[10px] font-mono rounded-full px-2 py-0.5 ${r.status === "aprovado" ? "text-green bg-green/10" : "text-red bg-red/10"}`}>
                {r.status?.toUpperCase()}
              </span>
            </div>
            {r.tipo === "rdo" && (r.atividades || []).map((a, i) => (
              <div key={i} className="flex justify-between text-xs py-0.5"><span>{a.nome}</span><span className="text-muted">{a.percentual}%</span></div>
            ))}
            {r.tipo === "rdo" && r.motivo_rejeicao && <div className="text-xs text-red mt-1">Motivo: {r.motivo_rejeicao}</div>}
            {r.tipo === "horas" && (
              <div className="text-xs text-muted">{r.horas_normais}h normais{r.horas_extras > 0 ? ` + ${r.horas_extras}h extras` : ""}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
