"use client";

import { useState, useMemo } from "react";
import { useTabela } from "../../lib/dados";
import PainelShell from "../../components/PainelShell";

const PALETA = ["#0B84A5", "#2E9E44", "#C97A21", "#8E5CD9", "#D64545", "#3D8FB5"];
const TIPOS_RECURSO = [
  ["mao_obra_propria", "Mão de obra própria"], ["mao_obra_terceira", "Mão de obra terceira"],
  ["ferramenta", "Ferramenta"], ["veiculo", "Veículo"], ["equipamento", "Equipamento"],
  ["canteiro", "Canteiro"], ["conteiner", "Contêiner"],
];

function calcularPico(alocs) {
  const eventos = [];
  alocs.forEach((a) => {
    eventos.push([new Date(a.periodo_inicio).getTime(), Number(a.percentual)]);
    eventos.push([new Date(a.periodo_fim).getTime() + 86400000, -Number(a.percentual)]);
  });
  eventos.sort((a, b) => a[0] - b[0]);
  let atual = 0, pico = 0;
  eventos.forEach(([, d]) => { atual += d; pico = Math.max(pico, atual); });
  return pico;
}
function formatarData(ts) {
  return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function EixoDatas({ escala, largura }) {
  const span = escala.max - escala.min || 1;
  const diasTotais = span / 86400000;
  const passoDias = diasTotais > 120 ? 14 : diasTotais > 45 ? 7 : diasTotais > 20 ? 3 : 1;
  const marcas = [];
  for (let t = escala.min; t <= escala.max; t += passoDias * 86400000) marcas.push(t);
  return (
    <div className="flex items-center mb-1">
      <span className="w-52 shrink-0" />
      <div className="relative h-5" style={{ width: largura }}>
        {marcas.map((t) => (
          <div key={t} className="absolute top-0 text-[9px] font-mono text-muteddim border-l border-line pl-1" style={{ left: ((t - escala.min) / span) * largura }}>
            {formatarData(t)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function UtilizacaoRecursosPage() {
  const { dados: recursos } = useTabela("recursos");
  const { dados: alocacoes } = useTabela("alocacoes_recurso");
  const { dados: pis } = useTabela("pis");
  const [filtroTipos, setFiltroTipos] = useState([]);
  const [zoom, setZoom] = useState(1);

  const piNome = (id) => pis.find((p) => p.id === id)?.codigo || "?";
  const piIndex = (id) => pis.findIndex((p) => p.id === id);
  const recursosFiltrados = filtroTipos.length ? recursos.filter((r) => filtroTipos.includes(r.tipo)) : recursos;

  const todasAlocs = useMemo(() =>
    recursosFiltrados.flatMap((r) => alocacoes.filter((a) => a.recurso_id === r.id)),
    [recursosFiltrados, alocacoes]
  );
  const escala = useMemo(() => {
    if (todasAlocs.length === 0) {
      const hoje = new Date();
      return { min: hoje.getTime(), max: hoje.getTime() + 14 * 86400000 };
    }
    const tempos = todasAlocs.flatMap((a) => [new Date(a.periodo_inicio).getTime(), new Date(a.periodo_fim).getTime()]);
    const min = Math.min(...tempos), max = Math.max(...tempos);
    const folga = (max - min) * 0.04;
    return { min: min - folga, max: max + folga };
  }, [todasAlocs]);

  const largura = 560 * zoom;
  const span = escala.max - escala.min || 1;

  const toggleTipo = (t) => setFiltroTipos((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t]);

  return (
    <PainelShell>
      <div className="p-6">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h1 className="font-head font-bold text-xl">Utilização de Recursos</h1>
          <div className="flex items-center gap-1 border border-line rounded-lg px-2 py-1">
            <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.5))} className="px-2 text-sm text-muted">−</button>
            <span className="text-[10px] font-mono text-muteddim w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(4, z + 0.5))} className="px-2 text-sm text-muted">+</button>
          </div>
        </div>
        <p className="text-sm text-muted mb-4">Nível de utilização e sobreposições — barras vermelhas indicam recurso acima de 100%.</p>

        <div className="flex flex-wrap gap-2 mb-5">
          {TIPOS_RECURSO.map(([v, l]) => (
            <button key={v} onClick={() => toggleTipo(v)} className={`px-3 py-1 rounded-full text-xs border ${filtroTipos.includes(v) ? "bg-cyan text-white border-cyan" : "border-line text-muted"}`}>{l}</button>
          ))}
        </div>

        <div className="overflow-x-auto flex flex-col gap-5">
          {recursosFiltrados.length > 0 && <EixoDatas escala={escala} largura={largura} />}
          {recursosFiltrados.map((r) => {
            const alocs = alocacoes.filter((a) => a.recurso_id === r.id);
            const percentuais = alocs.filter((a) => a.modo === "periodo_percentual");
            const cadencias = alocs.filter((a) => a.modo === "cadencia");
            const pico = calcularPico(percentuais);
            const sobrealocado = pico > 100;

            return (
              <div key={r.id} style={{ minWidth: largura + 220 }}>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-sm font-semibold w-52 shrink-0">{r.nome}</span>
                  <span className={`text-xs font-mono font-bold ${sobrealocado ? "text-red" : "text-muted"}`}>
                    Pico: {pico}% {sobrealocado ? "⚠ Sobrealocado" : ""}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  {alocs.length === 0 && <div className="text-xs text-muteddim ml-52">Sem alocações</div>}
                  {percentuais.map((a) => {
                    const left = ((new Date(a.periodo_inicio).getTime() - escala.min) / span) * largura;
                    const width = Math.max(6, ((new Date(a.periodo_fim).getTime() - new Date(a.periodo_inicio).getTime()) / span) * largura);
                    const cor = PALETA[piIndex(a.pi_id) % PALETA.length] || "#0B84A5";
                    return (
                      <div key={a.id} className="flex items-center">
                        <span className="w-52 shrink-0 text-right pr-2 text-[10px] font-mono text-muteddim">{piNome(a.pi_id)} · {a.percentual}%</span>
                        <div className="relative h-3.5" style={{ width: largura }}>
                          <div className="absolute top-0.5 h-2.5 rounded" style={{
                            left, width, background: sobrealocado ? "#D64545" : cor, opacity: sobrealocado ? 0.9 : 0.75,
                          }} />
                        </div>
                      </div>
                    );
                  })}
                  {cadencias.map((a) => {
                    const left = ((new Date(a.periodo_inicio).getTime() - escala.min) / span) * largura;
                    const width = Math.max(6, ((new Date(a.periodo_fim).getTime() - new Date(a.periodo_inicio).getTime()) / span) * largura);
                    return (
                      <div key={a.id} className="flex items-center">
                        <span className="w-52 shrink-0 text-right pr-2 text-[10px] font-mono text-muteddim">{piNome(a.pi_id)} · cadência</span>
                        <div className="relative h-3.5" style={{ width: largura }}>
                          <div className="absolute top-1 h-1.5 rounded border border-dashed border-muteddim" style={{ left, width }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {recursosFiltrados.length === 0 && <div className="text-sm text-muteddim">Nenhum recurso encontrado.</div>}
        </div>
      </div>
    </PainelShell>
  );
}
