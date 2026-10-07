"use client";

import { useState, useMemo, useEffect, useLayoutEffect, useRef } from "react";
import { tsLocal, formatarData as formatarDataIso } from "../lib/datas";
import { TIPOS_RECURSO } from "../lib/constantes";
import { useTabela, compararPis } from "../lib/dados";
import { EstadoVazio, Esqueleto } from "./ui";
import Icone from "./Icone";

const PALETA = ["#0B84A5", "#2E9E44", "#C97A21", "#8E5CD9", "#D64545", "#3D8FB5"];
const LABEL_W = 320;
const DIA = 86400000;
const OPCOES_JANELA = [[14, "2 sem."], [30, "1 mês"], [60, "2 meses"], [90, "3 meses"], [180, "6 meses"], [null, "Tudo"]];

// marcas da régua sempre à meia-noite local
function proximaMeiaNoite(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  if (d.getTime() < ts) d.setDate(d.getDate() + 1);
  return d.getTime();
}
function calcularPico(alocs) {
  const eventos = [];
  alocs.forEach((a) => {
    eventos.push([tsLocal(a.periodo_inicio), Number(a.percentual)]);
    eventos.push([tsLocal(a.periodo_fim) + DIA, -Number(a.percentual)]);
  });
  // no mesmo instante, processa saídas antes de entradas: uma alocação que termina no dia 10 e outra que começa no 11 não se somam
  eventos.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let atual = 0, pico = 0;
  eventos.forEach(([, d]) => { atual += d; pico = Math.max(pico, atual); });
  return pico;
}
const dataCurta = (ts) => new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

// Aba "Utilização" da página Recursos: para cada recurso, as alocações agrupadas por
// CLIENTE, mostrando o PI (com a descrição do projeto) e a etapa planejada.
// Mesma navegação da Linha do Tempo: período visível, barra de rolagem, botão Hoje,
// faixas cinzas paradas e só a área das barras rolando na horizontal.
export default function GraficoUtilizacao({ recursos, alocacoes, pis, carregando, onSelecionarRecurso }) {
  const { dados: etapas } = useTabela("etapas", { select: "id,nome,parent_etapa_id" });
  const [filtroTipos, setFiltroTipos] = useState([]);
  const [busca, setBusca] = useState("");
  const [soSobrealocados, setSoSobrealocados] = useState(false);
  const [janelaDias, setJanelaDias] = useState(60);
  const rolagemRef = useRef(null);
  const [larguraContainer, setLarguraContainer] = useState(0);
  const [rolagem, setRolagem] = useState(0);

  const piDe = (id) => pis.find((p) => p.id === id);
  const piIndex = (id) => pis.findIndex((p) => p.id === id);
  // etapa planejada: "Macro › Sub" quando for sub-etapa
  const nomeEtapa = (id) => {
    const e = etapas.find((x) => x.id === id);
    if (!e) return null;
    const pai = e.parent_etapa_id ? etapas.find((x) => x.id === e.parent_etapa_id) : null;
    return pai ? `${pai.nome} › ${e.nome}` : e.nome;
  };

  const termo = busca.trim().toLowerCase();
  const picoDe = (r) => calcularPico(alocacoes.filter((a) => a.recurso_id === r.id && a.modo === "periodo_percentual"));
  const recursosFiltrados = recursos.filter((r) =>
    (!filtroTipos.length || filtroTipos.includes(r.tipo)) &&
    (!termo || r.nome.toLowerCase().includes(termo)) &&
    (!soSobrealocados || picoDe(r) > 100));
  const qtdSobrealocados = recursos.filter((r) => picoDe(r) > 100).length;

  const todasAlocs = useMemo(() => recursosFiltrados.flatMap((r) => alocacoes.filter((a) => a.recurso_id === r.id)), [recursosFiltrados, alocacoes]);
  const escala = useMemo(() => {
    const tempos = todasAlocs.flatMap((a) => [tsLocal(a.periodo_inicio), tsLocal(a.periodo_fim)]).filter(Boolean);
    if (!tempos.length) { const h = Date.now(); return { min: h - 7 * DIA, max: h + 14 * DIA }; }
    const min = Math.min(...tempos), max = Math.max(...tempos) + DIA;
    const folga = Math.max((max - min) * 0.04, 2 * DIA);
    return { min: min - folga, max: max + folga };
  }, [todasAlocs]);

  const span = escala.max - escala.min || 1;
  const spanDias = span / DIA;
  const larguraVisivel = Math.max(300, (larguraContainer || 900) - LABEL_W);
  const pxPorDia = janelaDias ? larguraVisivel / janelaDias : larguraVisivel / spanDias;
  const largura = Math.max(larguraVisivel, spanDias * pxPorDia);
  const x = (t) => ((t - escala.min) / span) * largura;
  const hojeX = x(Date.now());
  const rolagemMax = Math.max(0, largura - larguraVisivel);
  const inicioVisivel = escala.min + (rolagem / pxPorDia) * DIA;
  const fimVisivel = inicioVisivel + (larguraVisivel / pxPorDia) * DIA;

  const temGrafico = recursosFiltrados.length > 0;
  useEffect(() => {
    const el = rolagemRef.current;
    if (!el) return;
    const medir = () => setLarguraContainer(el.clientWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [temGrafico]);
  useLayoutEffect(() => {
    const w = rolagemRef.current?.clientWidth;
    if (w && w !== larguraContainer) setLarguraContainer(w);
  });

  const rolarPara = (pos, suave = true) => rolagemRef.current?.scrollTo({ left: Math.max(0, Math.min(rolagemMax, pos)), behavior: suave ? "smooth" : "auto" });
  const irParaHoje = (suave = true) => rolarPara(hojeX - larguraVisivel / 2, suave);
  // ao abrir (ou trocar o período), centraliza no dia de hoje
  const centralizouRef = useRef("");
  useEffect(() => {
    const chave = `${janelaDias}|${Math.round(largura)}`;
    if (!temGrafico || !larguraContainer || centralizouRef.current === chave) return;
    centralizouRef.current = chave;
    setTimeout(() => irParaHoje(false), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [janelaDias, largura, larguraContainer, temGrafico]);

  const idxJanela = OPCOES_JANELA.findIndex(([v]) => v === janelaDias);
  const marcas = useMemo(() => {
    const passo = [1, 2, 3, 7, 14, 30, 60].find((p) => p * pxPorDia >= 56) || 90;
    const arr = [];
    for (let t = proximaMeiaNoite(escala.min); t <= escala.max; ) { arr.push(t); const d = new Date(t); d.setDate(d.getDate() + passo); t = d.getTime(); }
    return arr;
  }, [escala, pxPorDia]);

  const toggleTipo = (t) => setFiltroTipos((p) => p.includes(t) ? p.filter((v) => v !== t) : [...p, t]);

  // alocações de um recurso agrupadas por cliente → ordenadas por PI e data
  const gruposPorCliente = (alocs) => {
    const g = new Map();
    [...alocs].sort((a, b) => compararPis(piDe(a.pi_id) || {}, piDe(b.pi_id) || {}) || String(a.periodo_inicio).localeCompare(String(b.periodo_inicio)))
      .forEach((a) => {
        const cliente = piDe(a.pi_id)?.cliente || "SEM CLIENTE";
        if (!g.has(cliente)) g.set(cliente, []);
        g.get(cliente).push(a);
      });
    return [...g.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
  };

  const larguraFaixa = larguraContainer || LABEL_W + larguraVisivel;

  return (
    <div>
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-3">
        <p className="text-sm text-muted flex-1">Uso de cada recurso por cliente, PI e etapa planejada — barras vermelhas indicam recurso acima de 100%. Clique no nome de um recurso para ver e editar as alocações.</p>
        <div className="relative w-full sm:w-56">
          <Icone nome="buscar" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muteddim" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar recurso..." className="input pl-9" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button onClick={() => setSoSobrealocados((v) => !v)} className={`chip ${soSobrealocados ? "!bg-red !text-white !border-red" : qtdSobrealocados ? "!border-red/40 !text-red" : ""}`}>
          ⚠ Acima de 100% ({qtdSobrealocados})
        </button>
        <span className="w-px h-5 bg-line mx-1" />
        {TIPOS_RECURSO.map(([v, l]) => (
          <button key={v} onClick={() => toggleTipo(v)} className={`chip ${filtroTipos.includes(v) ? "chip-ativo" : ""}`}>{l}</button>
        ))}
        {filtroTipos.length > 0 && <button onClick={() => setFiltroTipos([])} className="text-sm text-muted hover:underline ml-1">Limpar</button>}
      </div>

      {carregando && <Esqueleto linhas={4} altura={48} />}
      {!carregando && !temGrafico && <EstadoVazio icone="recursos" titulo="Nenhum recurso" texto="Cadastre recursos na aba Recursos e alocações ou ajuste os filtros." />}

      {temGrafico && (
        <>
          {/* período visível + barra de rolagem (igual à Linha do Tempo) */}
          <div className="cartao px-3 py-2.5 mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 sticky top-0 z-30">
            <div className="flex items-center gap-1" role="group" aria-label="Período visível">
              <button onClick={() => idxJanela < OPCOES_JANELA.length - 1 && setJanelaDias(OPCOES_JANELA[idxJanela + 1][0])} disabled={idxJanela === OPCOES_JANELA.length - 1} className="btn btn-contorno btn-sm !px-2.5" aria-label="Diminuir zoom">−</button>
              <select value={janelaDias ?? ""} onChange={(e) => setJanelaDias(e.target.value ? Number(e.target.value) : null)} className="input !w-auto !py-1.5 !text-sm font-semibold" aria-label="Período visível">
                {OPCOES_JANELA.map(([v, l]) => <option key={l} value={v ?? ""}>{l}</option>)}
              </select>
              <button onClick={() => idxJanela > 0 && setJanelaDias(OPCOES_JANELA[idxJanela - 1][0])} disabled={idxJanela === 0} className="btn btn-contorno btn-sm !px-2.5" aria-label="Aumentar zoom">+</button>
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-[260px]">
              <button onClick={() => rolarPara(rolagem - larguraVisivel * 0.8)} disabled={rolagem <= 0} className="btn btn-contorno btn-sm !px-2" aria-label="Período anterior"><Icone nome="voltar" className="w-4 h-4" /></button>
              <input type="range" min="0" max={Math.max(1, Math.round(rolagemMax))} step="1" value={Math.round(rolagem)} disabled={rolagemMax <= 0}
                onChange={(e) => rolarPara(Number(e.target.value), false)} className="flex-1 accent-cyan h-2 cursor-pointer disabled:opacity-40" aria-label="Deslocar o período visível" />
              <button onClick={() => rolarPara(rolagem + larguraVisivel * 0.8)} disabled={rolagem >= rolagemMax - 1} className="btn btn-contorno btn-sm !px-2" aria-label="Próximo período"><Icone nome="seta" className="w-4 h-4" /></button>
              <button onClick={() => irParaHoje()} className="btn btn-contorno btn-sm !border-red/40 !text-red hover:!bg-red/5">Hoje</button>
            </div>
            <div className="text-xs text-muted whitespace-nowrap">
              <span className="font-semibold text-textmain">{new Date(inicioVisivel).toLocaleDateString("pt-BR")}</span> a <span className="font-semibold text-textmain">{new Date(fimVisivel).toLocaleDateString("pt-BR")}</span>
            </div>
          </div>

          <div ref={rolagemRef} onScroll={(e) => setRolagem(e.currentTarget.scrollLeft)}
            className="cartao overflow-auto rolagem-linha-tempo overscroll-contain" style={{ maxHeight: "max(360px, calc(100dvh - 300px))" }}>
            <div style={{ minWidth: LABEL_W + largura }}>
              {/* régua de datas */}
              <div className="flex sticky top-0 bg-white z-20 border-b border-line">
                <div className="shrink-0 sticky left-0 bg-white z-30" style={{ width: LABEL_W }} />
                <div className="relative h-7" style={{ width: largura }}>
                  {marcas.map((t) => (
                    <div key={t} className="absolute top-0 h-full text-[11px] text-muteddim border-l border-line pl-1 pt-1.5 tabular-nums" style={{ left: x(t) }}>{dataCurta(t)}</div>
                  ))}
                </div>
              </div>

              {recursosFiltrados.map((r) => {
                const alocs = alocacoes.filter((a) => a.recurso_id === r.id);
                const pico = calcularPico(alocs.filter((a) => a.modo === "periodo_percentual"));
                const sobrealocado = pico > 100;
                return (
                  <div key={r.id}>
                    {/* faixa cinza do recurso: parada, na largura visível inteira */}
                    <div className="bg-panel border-y border-line" style={{ width: LABEL_W + largura }}>
                      <div className="sticky left-0 z-10 px-3 py-2 flex items-center gap-3 text-sm" style={{ width: larguraFaixa }}>
                        <button onClick={() => onSelecionarRecurso?.(r.id)} className="font-semibold truncate text-left hover:text-cyan hover:underline" title="Ver alocações deste recurso">{r.nome}</button>
                        {(r.equipes || []).length > 0 && <span className="texto-apoio truncate">{r.equipes.join(", ")}</span>}
                        <span className={`ml-auto shrink-0 text-xs font-semibold ${sobrealocado ? "text-red" : "text-muted"}`}>Pico: {pico}% {sobrealocado ? "⚠" : ""}</span>
                      </div>
                    </div>

                    {alocs.length === 0 && (
                      <div className="flex border-b border-line/60">
                        <div className="shrink-0 sticky left-0 bg-white z-10 px-3 py-1.5 text-xs text-muteddim border-r border-line" style={{ width: LABEL_W }}>Sem alocações</div>
                        <div style={{ width: largura }} />
                      </div>
                    )}

                    {gruposPorCliente(alocs).map(([cliente, doCliente]) => (
                      <div key={cliente}>
                        <div className="flex border-b border-line/60">
                          <div className="shrink-0 sticky left-0 bg-white z-10 px-3 pt-2 pb-1 text-xs font-semibold text-cyan border-r border-line truncate" style={{ width: LABEL_W }}>{cliente}</div>
                          <div style={{ width: largura }} />
                        </div>
                        {doCliente.map((a) => {
                          const pi = piDe(a.pi_id);
                          const etapa = a.etapa_id ? nomeEtapa(a.etapa_id) : null;
                          const ini = tsLocal(a.periodo_inicio), fim = tsLocal(a.periodo_fim) + DIA;
                          const left = x(ini), width = Math.max(6, x(fim) - x(ini));
                          const cadencia = a.modo !== "periodo_percentual";
                          const cor = PALETA[piIndex(a.pi_id) % PALETA.length] || "#0B84A5";
                          const titulo = `${pi?.codigo || "?"}${pi?.projeto ? ` — ${pi.projeto}` : ""} · ${etapa || "período (sem etapa)"} · ${cadencia ? "cadência" : `${a.percentual}%`} · ${formatarDataIso(a.periodo_inicio)} → ${formatarDataIso(a.periodo_fim)}`;
                          return (
                            <div key={a.id} className="flex items-center border-b border-line/60">
                              <div className="shrink-0 sticky left-0 bg-white z-10 pl-6 pr-2 py-1.5 border-r border-line" style={{ width: LABEL_W }} title={titulo}>
                                <div className="text-xs truncate">
                                  <span className="font-semibold text-cyan">{pi?.codigo || "?"}</span>
                                  {pi?.projeto && <span className="text-muted"> — {pi.projeto}</span>}
                                </div>
                                <div className="text-xs truncate text-muted">
                                  {etapa || <span className="text-muteddim">período (sem etapa)</span>} · <strong className="text-textmain">{cadencia ? "cadência" : `${a.percentual}%`}</strong>
                                </div>
                              </div>
                              <div className="relative h-10" style={{ width: largura }}>
                                <div className="absolute inset-y-0" style={{ left: hojeX, width: 1, background: "#D64545", opacity: 0.5 }} />
                                {/* mesmo padrão da alocação pelo Cronograma: barra cheia, preenchida
                                    (a cadência só se diferencia pelo texto "cadência" na coluna da esquerda) */}
                                <div className="absolute top-3.5 h-3 rounded" style={{ left, width, background: sobrealocado && !cadencia ? "#D64545" : cor, opacity: sobrealocado && !cadencia ? 0.9 : 0.8 }} title={titulo} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
