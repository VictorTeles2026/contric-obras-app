"use client";

import { useState, useMemo } from "react";
import { tsLocal, formatarData as formatarDataIso } from "../lib/datas";
import { TIPOS_RECURSO } from "../lib/constantes";
import { EstadoVazio, Esqueleto } from "./ui";
import Icone from "./Icone";

const PALETA = ["#0B84A5", "#2E9E44", "#C97A21", "#8E5CD9", "#D64545", "#3D8FB5"];
const LABEL_W = 240;
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
    eventos.push([tsLocal(a.periodo_fim) + 86400000, -Number(a.percentual)]);
  });
  // no mesmo instante, processa saídas antes de entradas: uma alocação que termina no dia 10 e outra que começa no 11 não se somam
  eventos.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let atual = 0, pico = 0;
  eventos.forEach(([, d]) => { atual += d; pico = Math.max(pico, atual); });
  return pico;
}
function formatarData(ts) {
  return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function passoDiasPara(span) {
  const diasTotais = span / 86400000;
  return diasTotais > 120 ? 14 : diasTotais > 45 ? 7 : diasTotais > 20 ? 3 : 1;
}

// Gráfico de utilização (antes era a página "Utilização"; agora é uma aba da página Recursos).
// Recebe os dados já carregados pela página e avisa quando um recurso é clicado.
export default function GraficoUtilizacao({ recursos, alocacoes, pis, carregando, onSelecionarRecurso }) {
  const [filtroTipos, setFiltroTipos] = useState([]);
  const [zoom, setZoom] = useState(1);
  const [busca, setBusca] = useState("");
  const [soSobrealocados, setSoSobrealocados] = useState(false);

  const piNome = (id) => pis.find((p) => p.id === id)?.codigo || "?";
  const piIndex = (id) => pis.findIndex((p) => p.id === id);
  const termo = busca.trim().toLowerCase();
  const picoDe = (r) => calcularPico(alocacoes.filter((a) => a.recurso_id === r.id && a.modo === "periodo_percentual"));
  const recursosFiltrados = recursos.filter((r) =>
    (!filtroTipos.length || filtroTipos.includes(r.tipo)) &&
    (!termo || r.nome.toLowerCase().includes(termo)) &&
    (!soSobrealocados || picoDe(r) > 100));
  const qtdSobrealocados = recursos.filter((r) => picoDe(r) > 100).length;

  const todasAlocs = useMemo(() =>
    recursosFiltrados.flatMap((r) => alocacoes.filter((a) => a.recurso_id === r.id)),
    [recursosFiltrados, alocacoes]
  );
  const escala = useMemo(() => {
    if (todasAlocs.length === 0) {
      const hoje = new Date();
      return { min: hoje.getTime(), max: hoje.getTime() + 14 * 86400000 };
    }
    const tempos = todasAlocs.flatMap((a) => [tsLocal(a.periodo_inicio), tsLocal(a.periodo_fim)]);
    const min = Math.min(...tempos), max = Math.max(...tempos) + 86400000;
    const folga = Math.max((max - min) * 0.04, 2 * 86400000);
    return { min: min - folga, max: max + folga };
  }, [todasAlocs]);

  const largura = 560 * zoom;
  const span = escala.max - escala.min || 1;
  const hojeX = ((Date.now() - escala.min) / span) * largura;
  const marcas = useMemo(() => {
    const passo = passoDiasPara(span);
    const arr = [];
    for (let t = proximaMeiaNoite(escala.min); t <= escala.max; ) { arr.push(t); const d = new Date(t); d.setDate(d.getDate() + passo); t = d.getTime(); }
    return arr;
  }, [escala, span]);

  const toggleTipo = (t) => setFiltroTipos((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t]);

  return (
      <div>
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
          <p className="text-sm text-muted flex-1">Nível de uso e sobreposições — barras vermelhas indicam recurso acima de 100%. Clique no nome de um recurso para ver e editar as alocações.</p>
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-56">
              <Icone nome="buscar" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muteddim" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar recurso..." className="input pl-9" />
            </div>
            <div className="flex items-center border border-line rounded-lg bg-white overflow-hidden shrink-0" role="group" aria-label="Zoom">
              <button onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.5).toFixed(1))))} className="px-3 py-2 text-muted hover:bg-panel" aria-label="Diminuir zoom">−</button>
              <span className="text-xs font-mono text-muted w-12 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(4, Number((z + 0.5).toFixed(1))))} className="px-3 py-2 text-muted hover:bg-panel" aria-label="Aumentar zoom">+</button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-5">
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
        {!carregando && recursosFiltrados.length === 0 && <EstadoVazio icone="recursos" titulo="Nenhum recurso" texto="Cadastre recursos na aba Recursos e alocações ou ajuste os filtros." />}

        {recursosFiltrados.length > 0 && (
          <div className="cartao overflow-x-auto rolagem-fina">
            <div style={{ minWidth: LABEL_W + largura }}>
              <div className="flex sticky top-0 bg-white z-20 border-b border-line">
                <div className="shrink-0 sticky left-0 bg-white z-30" style={{ width: LABEL_W }} />
                <div className="relative h-7" style={{ width: largura }}>
                  {marcas.map((t) => (
                    <div key={t} className="absolute top-0 h-full text-[11px] font-mono text-muteddim border-l border-line pl-1 pt-1.5" style={{ left: ((t - escala.min) / span) * largura }}>
                      {formatarData(t)}
                    </div>
                  ))}
                </div>
              </div>

              {recursosFiltrados.map((r) => {
                const alocs = alocacoes.filter((a) => a.recurso_id === r.id);
                const percentuais = alocs.filter((a) => a.modo === "periodo_percentual");
                const cadencias = alocs.filter((a) => a.modo === "cadencia");
                const pico = calcularPico(percentuais);
                const sobrealocado = pico > 100;

                return (
                  <div key={r.id}>
                    <div className="flex bg-panel">
                      <div className="shrink-0 sticky left-0 bg-panel z-10 px-3 py-1.5 border-r border-line" style={{ width: LABEL_W }}>
                        <button onClick={() => onSelecionarRecurso?.(r.id)} className="text-sm font-semibold truncate max-w-full text-left hover:text-cyan hover:underline" title="Ver alocações deste recurso">{r.nome}</button>
                        <div className={`text-[11px] font-mono font-bold ${sobrealocado ? "text-red" : "text-muted"}`}>
                          Pico: {pico}% {sobrealocado ? "⚠" : ""}
                        </div>
                      </div>
                      <div style={{ width: largura }} />
                    </div>

                    {alocs.length === 0 && (
                      <div className="flex">
                        <div className="shrink-0 sticky left-0 bg-white z-10 px-3 py-1.5 text-xs text-muteddim border-r border-line" style={{ width: LABEL_W }}>Sem alocações</div>
                        <div style={{ width: largura }} />
                      </div>
                    )}
                    {percentuais.map((a) => {
                      const left = ((tsLocal(a.periodo_inicio) - escala.min) / span) * largura;
                      const width = Math.max(6, ((tsLocal(a.periodo_fim) + 86400000 - tsLocal(a.periodo_inicio)) / span) * largura);
                      const cor = PALETA[piIndex(a.pi_id) % PALETA.length] || "#0B84A5";
                      return (
                        <div key={a.id} className="flex items-center border-b border-line/60">
                          <div className="shrink-0 sticky left-0 bg-white z-10 pl-6 pr-2 py-1.5 text-xs font-mono text-muted truncate border-r border-line" style={{ width: LABEL_W }}>
                            {piNome(a.pi_id)} · {a.percentual}%
                          </div>
                          <div className="relative h-6" style={{ width: largura }}>
                            <div className="absolute inset-0" style={{ left: hojeX, width: 1, background: "#D64545", opacity: 0.5 }} />
                            <div className="absolute top-1.5 h-3 rounded" style={{ left, width, background: sobrealocado ? "#D64545" : cor, opacity: sobrealocado ? 0.9 : 0.75 }}
                              title={`${piNome(a.pi_id)} · ${a.percentual}% · ${formatarDataIso(a.periodo_inicio)} → ${formatarDataIso(a.periodo_fim)}`} />
                          </div>
                        </div>
                      );
                    })}
                    {cadencias.map((a) => {
                      const left = ((tsLocal(a.periodo_inicio) - escala.min) / span) * largura;
                      const width = Math.max(6, ((tsLocal(a.periodo_fim) + 86400000 - tsLocal(a.periodo_inicio)) / span) * largura);
                      return (
                        <div key={a.id} className="flex items-center border-b border-line/60">
                          <div className="shrink-0 sticky left-0 bg-white z-10 pl-6 pr-2 py-1.5 text-xs font-mono text-muted truncate border-r border-line" style={{ width: LABEL_W }}>
                            {piNome(a.pi_id)} · cadência
                          </div>
                          <div className="relative h-6" style={{ width: largura }}>
                            <div className="absolute top-2 h-1.5 rounded border border-dashed border-muteddim" style={{ left, width }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
  );
}
