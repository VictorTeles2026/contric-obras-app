"use client";

import { useState } from "react";
import { useTabela } from "../../../lib/dados";
import { useAuth } from "../../../lib/AuthContext";
import { useMinhasPis, agruparPorCliente } from "../../../lib/minhasPis";
import { NAV_LIDER } from "../../../lib/nav";
import { formatarDataCurta, diasAte } from "../../../lib/datas";
import MobileShell from "../../../components/MobileShell";
import { Esqueleto, EstadoVazio } from "../../../components/ui";
import Icone from "../../../components/Icone";
import { STATUS_ETAPA, porOrdem } from "../../../lib/constantes";

export default function LiderCronogramaPage() {
  const { usuario } = useAuth();
  const { meusPis, carregando } = useMinhasPis(usuario);
  const { dados: etapas } = useTabela("etapas");
  const [abertos, setAbertos] = useState({});
  const porCliente = agruparPorCliente(meusPis);
  const toggle = (id) => setAbertos((p) => ({ ...p, [id]: !p[id] }));

  return (
    <MobileShell nav={NAV_LIDER} perfis={["lider"]}>
      <div className="p-4 flex flex-col gap-5">
        <div className="font-head font-bold text-2xl pt-1">Minhas obras</div>
        {carregando && <Esqueleto linhas={4} />}
        {!carregando && meusPis.length === 0 && (
          <div className="cartao"><EstadoVazio icone="obra" titulo="Nenhuma obra" texto="Você não está alocado em nenhuma obra." /></div>
        )}
        {porCliente.map(([cliente, pisDoCliente]) => (
          <div key={cliente} className="flex flex-col gap-4">
            {porCliente.length > 1 && <div className="titulo-secao -mb-2">{cliente}</div>}
            {pisDoCliente.map((pi) => {
              const doPi = etapas.filter((e) => e.pi_id === pi.id);
              const macroEtapas = doPi.filter((e) => !e.parent_etapa_id).sort(porOrdem);
              return (
                <div key={pi.id} className="flex flex-col gap-2.5">
                  <div>
                    <div className="text-xs font-mono text-cyan font-bold tracking-wide">{pi.codigo}</div>
                    <div className="font-head font-bold text-lg leading-tight">{pi.projeto || pi.cliente}</div>
                    {pi.projeto && <div className="text-sm text-muted">{pi.cliente}</div>}
                  </div>
                  {macroEtapas.map((e) => {
                    const subs = doPi.filter((s) => s.parent_etapa_id === e.id).sort(porOrdem);
                    return (
                      <div key={e.id} className="cartao overflow-hidden">
                        <button type="button" onClick={() => subs.length && toggle(e.id)} className="w-full text-left p-4" aria-expanded={!!abertos[e.id]}>
                          <LinhaEtapa etapa={e} />
                          {subs.length > 0 && (
                            <div className="flex items-center gap-1 text-xs text-cyan font-semibold mt-2.5">
                              <Icone nome="seta" className={`w-3.5 h-3.5 transition-transform ${abertos[e.id] ? "rotate-90" : ""}`} strokeWidth={2.4} />
                              {abertos[e.id] ? "Ocultar" : "Ver"} {subs.length} sub-etapa(s)
                            </div>
                          )}
                        </button>
                        {abertos[e.id] && (
                          <div className="border-t border-line bg-panel/60 px-4 py-2 flex flex-col divide-y divide-line animar-fade">
                            {subs.map((s) => <div key={s.id} className="py-2.5"><LinhaEtapa etapa={s} sub /></div>)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {macroEtapas.length === 0 && <div className="text-sm text-muteddim">Nenhuma etapa cadastrada.</div>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </MobileShell>
  );
}

function LinhaEtapa({ etapa: e, sub }) {
  const st = STATUS_ETAPA[e.status] || STATUS_ETAPA.nao_iniciada;
  const dias = diasAte(e.data_prevista_fim);
  const atrasada = e.status !== "concluida" && dias !== null && dias < 0;
  const perc = e.status === "concluida" ? 100 : Number(e.percentual) || 0;
  return (
    <div>
      <div className="flex justify-between items-start gap-2">
        <span className={`${sub ? "text-sm" : "text-base"} font-semibold leading-snug`}>{e.nome}</span>
        <span className={`selo shrink-0 ${st.classe}`}>{st.rotulo}</span>
      </div>
      <div className="flex items-center justify-between gap-2 text-sm text-muted mt-1.5">
        <span className="flex items-center gap-1.5">
          <Icone nome="calendario" className="w-4 h-4 text-muteddim" />
          {formatarDataCurta(e.data_prevista_inicio)} → {formatarDataCurta(e.data_prevista_fim)}
        </span>
        {atrasada && <span className="text-xs font-semibold text-red">{Math.abs(dias)}d de atraso</span>}
      </div>
      {(e.status === "em_andamento" || e.status === "concluida") && (
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 h-1.5 rounded-full bg-line overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${perc}%`, background: st.barra }} />
          </div>
          <span className="text-xs font-mono text-muted w-9 text-right">{perc}%</span>
        </div>
      )}
    </div>
  );
}
