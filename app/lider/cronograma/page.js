"use client";

import { useTabela } from "../../../lib/dados";
import { useAuth } from "../../../lib/AuthContext";
import MobileShell from "../../../components/MobileShell";
import { useMinhasPis } from "../page";

const NAV = [
  { href: "/lider", label: "Início", icone: "🏠" },
  { href: "/lider/rdo", label: "RDO", icone: "📋" },
  { href: "/lider/horas", label: "Horas", icone: "⏱" },
  { href: "/lider/cronograma", label: "Obras", icone: "📅" },
  { href: "/lider/solicitar", label: "Solicitar", icone: "✎" },
];
const STATUS_LABEL = { nao_iniciada: "Não iniciada", em_andamento: "Em andamento", concluida: "Concluída", parada: "Parada" };
const STATUS_COR = { nao_iniciada: "text-muteddim", em_andamento: "text-cyan", concluida: "text-green", parada: "text-red" };

export default function LiderCronogramaPage() {
  const { usuario } = useAuth();
  const meusPis = useMinhasPis(usuario);
  const { dados: etapas } = useTabela("etapas");

  return (
    <MobileShell nav={NAV}>
      <div className="p-4 flex flex-col gap-5">
        <div className="font-head font-bold text-lg">Minhas obras</div>
        {meusPis.length === 0 && <div className="text-sm text-muteddim">Você não está alocado em nenhuma obra.</div>}
        {meusPis.map((pi) => {
          const macroEtapas = etapas.filter((e) => e.pi_id === pi.id && !e.parent_etapa_id);
          return (
            <div key={pi.id}>
              <div className="text-[10px] font-mono text-cyan font-bold">{pi.codigo}</div>
              <div className="font-semibold text-sm mb-2">{pi.cliente} — {pi.projeto}</div>
              <div className="flex flex-col gap-2">
                {macroEtapas.map((e) => (
                  <div key={e.id} className="bg-white rounded-xl border border-line p-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold">{e.nome}</span>
                      <span className={`text-xs font-mono ${STATUS_COR[e.status]}`}>{STATUS_LABEL[e.status]}</span>
                    </div>
                    <div className="text-xs text-muteddim mt-1">
                      {e.data_prevista_inicio} → {e.data_prevista_fim}
                      {e.status === "em_andamento" && ` · ${e.percentual || 0}%`}
                    </div>
                  </div>
                ))}
                {macroEtapas.length === 0 && <div className="text-xs text-muteddim">Nenhuma macro-etapa cadastrada.</div>}
              </div>
            </div>
          );
        })}
      </div>
    </MobileShell>
  );
}
