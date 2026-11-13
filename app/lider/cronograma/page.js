"use client";

import { useState } from "react";
import { useTabela } from "../../../lib/dados";
import { useAuth, pode } from "../../../lib/AuthContext";
import { useMinhasPis, agruparPorCliente, useFinanceiroPi, consumo } from "../../../lib/dados";
import { NAV_LIDER } from "../../../lib/nav";
import { formatarDataCurta, diasAte } from "../../../lib/datas";
import MobileShell from "../../../components/MobileShell";
import { Esqueleto, EstadoVazio } from "../../../components/ui";
import Icone from "../../../components/Icone";
import { ModalQrPi } from "../../../components/LeitorQR";
import { STATUS_ETAPA, porOrdem, consolidarMacros } from "../../../lib/constantes";

export default function LiderCronogramaPage() {
  const { usuario } = useAuth();
  const { meusPis, carregando } = useMinhasPis(usuario);
  const { dados: etapas } = useTabela("etapas");
  const [abertos, setAbertos] = useState({});
  const porCliente = agruparPorCliente(meusPis);
  const toggle = (id) => setAbertos((p) => ({ ...p, [id]: !p[id] }));
  const [qrPi, setQrPi] = useState(null); // PI com o QR Code aberto

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
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono text-cyan font-bold tracking-wide">{pi.codigo}</div>
                      <div className="titulo-destaque">{pi.projeto || pi.cliente}</div>
                      {pi.projeto && <div className="text-sm text-muted">{pi.cliente}</div>}
                    </div>
                    <a href={`/equipe/ocorrencia?pi=${pi.id}`} className="shrink-0 flex flex-col items-center gap-0.5 rounded-xl border border-line bg-white px-2.5 py-1.5 text-amber active:bg-panel" aria-label={`Registrar ocorrência no PI ${pi.codigo}`}>
                      <Icone nome="alerta" className="w-6 h-6" />
                      <span className="text-[10px] font-semibold">Ocorrência</span>
                    </a>
                    <button onClick={() => setQrPi(pi)} className="shrink-0 flex flex-col items-center gap-0.5 rounded-xl border border-line bg-white px-2.5 py-1.5 text-cyan active:bg-panel" aria-label={`QR Code do PI ${pi.codigo}`}>
                      <Icone nome="qr" className="w-6 h-6" />
                      <span className="text-[10px] font-semibold">QR Code</span>
                    </button>
                  </div>
                  <ResumoObra pi={pi} etapas={doPi} usuario={usuario} />
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
      {qrPi && <ModalQrPi pi={qrPi} onFechar={() => setQrPi(null)} />}
    </MobileShell>
  );
}

// Resumo da obra (o mesmo painel da Página do PI): avanço, atrasos e — com a permissão
// "financeiro.horas" — horas orçadas × consumo × resultado por classificação (sem R$)
function ResumoObra({ pi, etapas, usuario }) {
  const [aberto, setAberto] = useState(false);
  const verHoras = pode(usuario, "financeiro.horas") || pode(usuario, "relatorio.ver");
  const fin = useFinanceiroPi(pi);
  const ets = consolidarMacros(etapas);
  const macros = ets.filter((e) => !e.parent_etapa_id);
  const avanco = macros.length ? Math.round(macros.reduce((s, e) => s + (e.status === "concluida" ? 100 : Number(e.percentual) || 0), 0) / macros.length) : 0;
  const atrasadas = ets.filter((e) => !e.calculada && e.status !== "concluida" && (diasAte(e.data_prevista_fim) ?? 0) < 0).length;
  const cons = verHoras ? consumo(fin, "moi_horas") : null;
  const linhas = verHoras ? fin.grupo("moi_horas") : [];
  const h = (v) => `${(Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`;
  const tot = (campo) => fin.soma(linhas, campo);
  const Celula = ({ rotulo, valor, cor = "" }) => (
    <div className="min-w-0"><div className="text-[11px] text-muted">{rotulo}</div><div className={`font-head font-bold text-xl tabular-nums ${cor}`}>{valor}</div></div>
  );
  return (
    <div className="cartao p-3.5">
      <div className={`grid ${verHoras ? "grid-cols-3" : "grid-cols-2"} gap-3`}>
        <Celula rotulo="Avanço" valor={`${avanco}%`} cor="text-cyan" />
        <Celula rotulo="Etapas atrasadas" valor={atrasadas} cor={atrasadas ? "text-red" : "text-green"} />
        {verHoras && <Celula rotulo="Consumo horas" valor={cons === null ? "—" : `${cons}%`} cor={cons === null ? "text-muteddim" : cons <= avanco ? "text-green" : "text-red"} />}
      </div>
      {verHoras && (
        <>
          <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} className="flex items-center gap-1 text-xs text-cyan font-semibold mt-3">
            <Icone nome="seta" className={`w-3.5 h-3.5 transition-transform ${aberto ? "rotate-90" : ""}`} strokeWidth={2.4} />
            {aberto ? "Ocultar" : "Ver"} horas por classificação
          </button>
          {aberto && (
            <div className="mt-2 -mx-1 overflow-x-auto animar-fade">
              {!linhas.length ? <div className="text-sm text-muteddim px-1 py-2">Sem horas orçadas neste PI.</div> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-line text-left">
                    <th className="py-1.5 px-1 titulo-secao">Classificação</th><th className="py-1.5 px-1 titulo-secao text-right">Orçado</th>
                    <th className="py-1.5 px-1 titulo-secao text-right">Consumo</th><th className="py-1.5 px-1 titulo-secao text-right">Resultado</th>
                  </tr></thead>
                  <tbody>
                    {[...linhas.map(({ c, it }) => ({ k: c.id, rot: <><span className="font-mono text-[11px] text-muted mr-1">{c.codigo}</span>{c.nome}</>, o: Number(it.valor_orcado) || 0, r: Number(it.valor_realizado) || 0 })),
                      { k: "total", rot: <strong>Total</strong>, o: tot("valor_orcado"), r: tot("valor_realizado"), total: true }].map((l) => {
                      const res = l.o - l.r;
                      return (
                        <tr key={l.k} className={l.total ? "font-semibold" : "border-b border-line/60"}>
                          <td className="py-1.5 px-1 leading-snug">{l.rot}</td>
                          <td className="py-1.5 px-1 text-right tabular-nums whitespace-nowrap">{h(l.o)}</td>
                          <td className="py-1.5 px-1 text-right tabular-nums whitespace-nowrap">{h(l.r)}</td>
                          <td className={`py-1.5 px-1 text-right tabular-nums whitespace-nowrap ${res >= 0 ? "text-green" : "text-red"}`}>{res > 0 ? "+" : ""}{h(res)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <div className="text-[11px] text-muteddim mt-1.5 px-1">Resultado = Orçado − Consumo · verde: dentro do orçado · vermelho: acima.</div>
            </div>
          )}
        </>
      )}
    </div>
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
