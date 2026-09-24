"use client";

import { useState } from "react";
import { useTabela } from "../../lib/dados";
import { formatarData, formatarDataHora, formatarHoras } from "../../lib/datas";
import { STATUS_ETAPA } from "../../lib/constantes";
import PainelShell from "../../components/PainelShell";
import { CabecalhoPagina, EstadoVazio, Esqueleto } from "../../components/ui";
import Icone from "../../components/Icone";

const POR_PAGINA = 30;

export default function HistoricoPage() {
  const { dados: pis } = useTabela("pis");
  const { dados: usuarios } = useTabela("usuarios");
  const { dados: rdosTodos, carregando: c1 } = useTabela("rdos", { order: { coluna: "created_at", asc: false } });
  const { dados: horasTodas, carregando: c2 } = useTabela("apontamentos_horas", { order: { coluna: "created_at", asc: false } });

  const [filtro, setFiltro] = useState("");
  const [filtroPi, setFiltroPi] = useState("");
  const [limite, setLimite] = useState(POR_PAGINA);
  const piNome = (id) => pis.find((p) => p.id === id)?.codigo || "?";
  const nomeUsuario = (id) => usuarios.find((u) => u.id === id)?.nome || "—";

  const registros = [
    ...rdosTodos.filter((r) => r.status !== "pendente").map((r) => ({ tipo: "rdo", ...r })),
    ...horasTodas.filter((h) => h.status !== "pendente").map((h) => ({ tipo: "horas", ...h })),
  ].filter((r) => (!filtro || r.tipo === filtro) && (!filtroPi || r.pi_id === filtroPi))
    .sort((a, b) => new Date(b.decidido_em || b.created_at) - new Date(a.decidido_em || a.created_at));

  return (
    <PainelShell>
      <div className="p-4 md:p-8 max-w-4xl mx-auto">
        <CabecalhoPagina titulo="Histórico" subtitulo="Tudo o que já foi decidido — RDOs e horas." />

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {[["", "Todos"], ["rdo", "RDOs"], ["horas", "Horas"]].map(([v, l]) => (
            <button key={v} onClick={() => { setFiltro(v); setLimite(POR_PAGINA); }} className={`chip ${filtro === v ? "chip-ativo" : ""}`}>{l}</button>
          ))}
          <select value={filtroPi} onChange={(e) => { setFiltroPi(e.target.value); setLimite(POR_PAGINA); }} className="input !w-auto sm:ml-auto">
            <option value="">Todos os PIs</option>
            {[...pis].sort((a, b) => (a.codigo || "").localeCompare(b.codigo || "")).map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.cliente}</option>)}
          </select>
        </div>

        {(c1 || c2) && <Esqueleto linhas={4} altura={72} />}
        {!c1 && !c2 && registros.length === 0 && <EstadoVazio icone="historico" titulo="Nada por aqui" texto="Nenhum registro decidido com esses filtros." />}

        <div className="flex flex-col gap-2">
          {registros.slice(0, limite).map((r) => {
            const aprovado = r.status === "aprovado";
            return (
              <div key={r.tipo + r.id} className="cartao p-4">
                <div className="flex justify-between items-start gap-3 mb-1">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${r.tipo === "rdo" ? "bg-cyan/10 text-cyan" : "bg-amber/10 text-amber"}`}>
                      <Icone nome={r.tipo === "rdo" ? "rdo" : "relogio"} className="w-[18px] h-[18px]" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">
                        <span className="font-mono text-cyan">{piNome(r.pi_id)}</span> · {r.tipo === "rdo" ? "RDO" : "Horas"} de {nomeUsuario(r.tipo === "rdo" ? r.lider_id : r.usuario_id)}
                      </div>
                      <div className="text-xs text-muted">
                        {formatarData(r.data)} · decidido por {nomeUsuario(r.decidido_por)}{r.decidido_em ? ` em ${formatarDataHora(r.decidido_em)}` : ""}
                      </div>
                    </div>
                  </div>
                  <span className={`selo shrink-0 ${aprovado ? "text-green bg-green/10" : "text-red bg-red/10"}`}>{aprovado ? "Aprovado" : "Rejeitado"}</span>
                </div>
                {r.tipo === "rdo" && (r.atividades || []).length > 0 && (
                  <div className="mt-2 pl-12 flex flex-col gap-0.5">
                    {(r.atividades || []).map((a, i) => (
                      <div key={i} className="flex justify-between gap-2 text-xs py-0.5">
                        <span className="truncate">{a.nome}</span>
                        <span className="text-muted shrink-0">{STATUS_ETAPA[a.status]?.rotulo || a.status}{a.status === "em_andamento" ? ` · ${a.percentual}%` : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
                {r.tipo === "rdo" && r.motivo_rejeicao && <div className="text-xs text-red mt-2 pl-12">Motivo: {r.motivo_rejeicao}</div>}
                {r.tipo === "horas" && (
                  <div className="text-sm text-muted pl-12 mt-1">
                    {formatarHoras(r.horas_normais ?? r.horas_totais)} normais{Number(r.horas_extras) > 0 ? ` + ${formatarHoras(r.horas_extras)} extras` : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {registros.length > limite && (
          <button onClick={() => setLimite((l) => l + POR_PAGINA)} className="btn btn-contorno w-full mt-4">
            Mostrar mais ({registros.length - limite} restantes)
          </button>
        )}
      </div>
    </PainelShell>
  );
}
