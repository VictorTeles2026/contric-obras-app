"use client";

import { useState, useMemo } from "react";
import { useTabela } from "../../lib/dados";
import PainelShell from "../../components/PainelShell";

const STATUS_COR = {
  nao_iniciada: "#93A2B8",
  em_andamento: "#0B84A5",
  concluida: "#2E9E44",
  parada: "#D64545",
};
const LABEL_W = 220;
const AREAS = [
  "Engenharia Mecânica", "Engenharia Elétrica", "Vendas", "Cliente",
  "Suprimentos", "Produção", "Líder de Obra", "Coordenador de Obra", "Financeiro",
];
const PALETA_FILTRO = ["#0B84A5", "#2E9E44", "#C97A21", "#8E5CD9", "#D64545", "#3D8FB5", "#B5752E", "#5C8E5C"];

function diffDias(iso) {
  return Math.ceil((new Date(iso + "T00:00:00") - new Date(new Date().toISOString().slice(0, 10) + "T00:00:00")) / 86400000);
}
function formatarData(ts) {
  return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function passoDiasPara(span) {
  const diasTotais = span / 86400000;
  return diasTotais > 120 ? 14 : diasTotais > 45 ? 7 : diasTotais > 20 ? 3 : 1;
}

export default function LinhaDoTempoPage() {
  const { dados: pis } = useTabela("pis", { order: { coluna: "codigo" } });
  const { dados: etapas } = useTabela("etapas");
  const { dados: recursos } = useTabela("recursos");
  const { dados: alocacoesRecurso } = useTabela("alocacoes_recurso");
  const [selecionarAberto, setSelecionarAberto] = useState(false);
  const [piIds, setPiIds] = useState([]);
  const [zoom, setZoom] = useState(1);
  const [nivelPorPi, setNivelPorPi] = useState({}); // "tudo" (padrão) | "macro" | "pi"
  const nivelDe = (piId) => nivelPorPi[piId] || "tudo";
  const proximoNivel = { tudo: "macro", macro: "pi", pi: "tudo" };
  const ciclarNivel = (piId) => setNivelPorPi((p) => ({ ...p, [piId]: proximoNivel[nivelDe(piId)] }));

  // ---- filtro por equipe/recurso ----
  const [equipesDropdownAberto, setEquipesDropdownAberto] = useState(false);
  const [recursosDropdownAberto, setRecursosDropdownAberto] = useState(false);
  const [equipesDraft, setEquipesDraft] = useState([]);
  const [recursosDraft, setRecursosDraft] = useState([]);
  const [filtroAtivo, setFiltroAtivo] = useState({ equipes: [], recursos: [] });
  const toggleEquipeDraft = (a) => setEquipesDraft((p) => p.includes(a) ? p.filter((x) => x !== a) : [...p, a]);
  const toggleRecursoDraft = (id) => setRecursosDraft((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const aplicarFiltro = () => { setFiltroAtivo({ equipes: equipesDraft, recursos: recursosDraft }); setEquipesDropdownAberto(false); setRecursosDropdownAberto(false); };
  const limparFiltro = () => { setEquipesDraft([]); setRecursosDraft([]); setFiltroAtivo({ equipes: [], recursos: [] }); };

  // cada equipe/recurso selecionado no filtro ganha uma cor fixa (mesma ordem: equipes depois recursos)
  const itensFiltro = useMemo(() => {
    const nomeRecurso = (id) => recursos.find((r) => r.id === id)?.nome || "?";
    const lista = [
      ...filtroAtivo.equipes.map((a) => ({ tipo: "equipe", valor: a, rotulo: a })),
      ...filtroAtivo.recursos.map((id) => ({ tipo: "recurso", valor: id, rotulo: nomeRecurso(id) })),
    ];
    return lista.map((it, i) => ({ ...it, cor: PALETA_FILTRO[i % PALETA_FILTRO.length] }));
  }, [filtroAtivo, recursos]);

  const sobrepoePeriodo = (iniA, fimA, iniB, fimB) => iniA && fimA && iniB && fimB && iniA <= fimB && iniB <= fimA;
  const recursoBateNaEtapa = (recursoId, etapa) => alocacoesRecurso.some((al) => {
    if (al.recurso_id !== recursoId) return false;
    if (al.etapa_id) return al.etapa_id === etapa.id; // alocação feita direto na etapa (Cronograma)
    // alocação feita por PI + período (tela Recursos, sem etapa específica) — vale se o período cruza com a etapa
    return al.pi_id === etapa.pi_id && sobrepoePeriodo(al.periodo_inicio, al.periodo_fim, etapa.data_prevista_inicio, etapa.data_prevista_fim);
  });

  const itensQueBatemNaEtapa = (etapa) => itensFiltro.filter((it) =>
    it.tipo === "equipe"
      ? (etapa.areas || []).includes(it.valor)
      : recursoBateNaEtapa(it.valor, etapa)
  );

  const pisSelecionados = pis.filter((p) => piIds.includes(p.id));
  const etapasDosPis = etapas.filter((e) => piIds.includes(e.pi_id));
  // monta a lista na mesma ordem de criação do Cronograma: cada macro-etapa
  // seguida imediatamente das suas sub-etapas (também na ordem em que foram criadas)
  const porOrdem = (a, b) => (a.ordem ?? 999999) - (b.ordem ?? 999999);
  const itensOrdenados = (piId) => {
    const doPi = etapasDosPis.filter((e) => e.pi_id === piId);
    const macros = doPi.filter((e) => !e.parent_etapa_id).sort(porOrdem);
    return macros.flatMap((m) => [
      { ...m, nivel: 0 },
      ...doPi.filter((e) => e.parent_etapa_id === m.id).sort(porOrdem).map((s) => ({ ...s, nivel: 1 })),
    ]);
  };

  const periodoTotalDoPi = (piId) => {
    const doPi = etapasDosPis.filter((e) => e.pi_id === piId);
    const tempos = doPi.flatMap((e) => [
      e.data_prevista_inicio ? new Date(e.data_prevista_inicio).getTime() : null,
      e.data_prevista_fim ? new Date(e.data_prevista_fim).getTime() : null,
    ]).filter(Boolean);
    if (tempos.length === 0) return null;
    return { inicio: Math.min(...tempos), fim: Math.max(...tempos) };
  };

  const escala = useMemo(() => {
    if (etapasDosPis.length === 0) {
      const hoje = new Date();
      return { min: hoje.getTime(), max: hoje.getTime() + 14 * 86400000 };
    }
    const tempos = etapasDosPis.flatMap((e) => [
      e.data_prevista_inicio ? new Date(e.data_prevista_inicio).getTime() : null,
      e.data_prevista_fim ? new Date(e.data_prevista_fim).getTime() : null,
    ]).filter(Boolean);
    const min = Math.min(...tempos), max = Math.max(...tempos);
    const folga = Math.max((max - min) * 0.04, 2 * 86400000);
    return { min: min - folga, max: max + folga };
  }, [etapasDosPis]);

  const largura = 640 * zoom;
  const span = escala.max - escala.min || 1;
  const hojeX = ((Date.now() - escala.min) / span) * largura;
  const marcas = useMemo(() => {
    const passo = passoDiasPara(span);
    const arr = [];
    for (let t = escala.min; t <= escala.max; t += passo * 86400000) arr.push(t);
    return arr;
  }, [escala, span]);

  return (
    <PainelShell>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h1 className="font-head font-bold text-xl">Linha do Tempo</h1>
            <p className="text-sm text-muted">Visão multi-PI, para apresentação.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 border border-line rounded-lg px-2 py-1">
              <button onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.5).toFixed(1))))} className="px-2 text-sm text-muted">−</button>
              <span className="text-[10px] font-mono text-muteddim w-10 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(4, Number((z + 0.5).toFixed(1))))} className="px-2 text-sm text-muted">+</button>
            </div>
            <button onClick={() => setSelecionarAberto(true)} className="px-4 py-2 rounded-lg border border-cyan text-cyan text-sm font-semibold">
              🔍 Selecionar PIs ({piIds.length} de {pis.length})
            </button>
          </div>
        </div>

        {/* ---- filtro por equipe / recurso ---- */}
        <div className="flex flex-wrap items-center gap-2 mb-4 bg-panel border border-line rounded-lg p-3">
          <div className="relative">
            <button onClick={() => { setEquipesDropdownAberto((o) => !o); setRecursosDropdownAberto(false); }} className="px-3 py-1.5 rounded-lg border border-line bg-white text-sm">
              Equipes {equipesDraft.length > 0 ? `(${equipesDraft.length})` : ""} ▾
            </button>
            {equipesDropdownAberto && (
              <div className="absolute z-20 mt-1 bg-white border border-line rounded-lg shadow-lg p-2 w-64 max-h-64 overflow-auto">
                {AREAS.map((a) => (
                  <label key={a} className="flex items-center gap-2 py-1 text-sm cursor-pointer">
                    <input type="checkbox" checked={equipesDraft.includes(a)} onChange={() => toggleEquipeDraft(a)} />
                    {a}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button onClick={() => { setRecursosDropdownAberto((o) => !o); setEquipesDropdownAberto(false); }} className="px-3 py-1.5 rounded-lg border border-line bg-white text-sm">
              Recursos {recursosDraft.length > 0 ? `(${recursosDraft.length})` : ""} ▾
            </button>
            {recursosDropdownAberto && (
              <div className="absolute z-20 mt-1 bg-white border border-line rounded-lg shadow-lg p-2 w-64 max-h-64 overflow-auto">
                {recursos.length === 0 && <div className="text-xs text-muteddim px-1 py-1">Nenhum recurso cadastrado.</div>}
                {recursos.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 py-1 text-sm cursor-pointer">
                    <input type="checkbox" checked={recursosDraft.includes(r.id)} onChange={() => toggleRecursoDraft(r.id)} />
                    {r.nome}
                  </label>
                ))}
              </div>
            )}
          </div>

          <button onClick={aplicarFiltro} className="px-4 py-1.5 rounded-lg bg-cyan text-white text-sm font-semibold">Filtrar</button>
          <button onClick={limparFiltro} className="px-4 py-1.5 rounded-lg border border-line text-muted text-sm">Limpar Filtro</button>

          {itensFiltro.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 ml-2">
              {itensFiltro.map((it) => (
                <span key={it.tipo + it.valor} className="text-xs font-semibold px-2 py-1 rounded-full text-white" style={{ background: it.cor }}>
                  {it.rotulo}
                </span>
              ))}
            </div>
          )}
        </div>

        {pisSelecionados.length === 0 && <div className="text-sm text-muteddim">Nenhum PI selecionado — clique em "Selecionar PIs" acima.</div>}
        {pisSelecionados.length > 0 && (
          <div className="text-[11px] text-muteddim mb-2">Clique no nome de um PI para alternar entre: tudo (macro + sub-etapas) → só macro-etapas → contraído.</div>
        )}

        {pisSelecionados.length > 0 && (
          <div className="border border-line rounded-lg overflow-x-auto">
            <div style={{ minWidth: LABEL_W + largura }}>
              {/* cabeçalho: rótulo vazio (fixo) + régua de datas */}
              <div className="flex sticky top-0 bg-white z-20 border-b border-line">
                <div className="shrink-0 sticky left-0 bg-white z-30" style={{ width: LABEL_W }} />
                <div className="relative h-6" style={{ width: largura }}>
                  {marcas.map((t) => (
                    <div key={t} className="absolute top-0 h-full text-[9px] font-mono text-muteddim border-l border-line pl-1 pt-1" style={{ left: ((t - escala.min) / span) * largura }}>
                      {formatarData(t)}
                    </div>
                  ))}
                </div>
              </div>

              {pisSelecionados.map((pi) => {
                const itens = itensOrdenados(pi.id);
                const nivel = nivelDe(pi.id);
                const periodo = periodoTotalDoPi(pi.id);
                const icone = { tudo: "▾▾", macro: "▾", pi: "▸" }[nivel];
                const dicaProximo = { tudo: "mostrar só macro-etapas", macro: "contrair para o PI inteiro", pi: "expandir tudo" }[nivel];
                const itensVisiveis = nivel === "macro" ? itens.filter((e) => !e.nivel) : itens;
                return (
                  <div key={pi.id}>
                    <div className="flex bg-panel">
                      <button onClick={() => ciclarNivel(pi.id)} title={`Clique para ${dicaProximo}`}
                        className="shrink-0 sticky left-0 bg-panel z-10 px-2 py-1 text-xs font-mono text-cyan font-bold border-r border-line flex items-center gap-1.5 text-left"
                        style={{ width: LABEL_W }}>
                        <span className="text-[9px] w-3 shrink-0">{icone}</span>
                        <span className="truncate">{pi.codigo} — {pi.cliente}</span>
                      </button>
                      <div className="relative" style={{ width: largura }}>
                        {nivel === "pi" && (
                          <div className="absolute top-0 bottom-0" style={{ left: hojeX, width: 1, background: "#D64545", opacity: 0.5 }} />
                        )}
                        {nivel === "pi" && periodo && (() => {
                          const left = ((periodo.inicio - escala.min) / span) * largura;
                          const width = Math.max(4, ((periodo.fim - periodo.inicio) / span) * largura);
                          return (
                            <div className="absolute top-1.5 h-3 rounded" style={{ left, width, background: "#0B84A5" }}
                              title={`${pi.codigo} — do início até a última etapa planejada`} />
                          );
                        })()}
                      </div>
                    </div>

                    {nivel !== "pi" && itensVisiveis.map((e) => {
                      const inicio = e.data_prevista_inicio ? new Date(e.data_prevista_inicio).getTime() : escala.min;
                      const fim = e.data_prevista_fim ? new Date(e.data_prevista_fim).getTime() : inicio;
                      const left = ((inicio - escala.min) / span) * largura;
                      const width = Math.max(4, ((fim - inicio) / span) * largura);
                      const dias = e.data_prevista_fim ? diffDias(e.data_prevista_fim) : null;
                      const vencido = e.status !== "concluida" && dias !== null && dias < 0;
                      const urgente = e.status !== "concluida" && dias !== null && dias >= 0 && dias <= 1;
                      const atencao = e.status !== "concluida" && dias !== null && dias > 1 && dias <= 3;
                      const marcas2 = itensQueBatemNaEtapa(e);
                      return (
                        <div key={e.id} className="flex items-center border-b border-line/60">
                          <div className={`shrink-0 sticky left-0 bg-white z-10 py-1.5 text-xs truncate border-r border-line ${e.nivel ? "pl-6 pr-2 text-muted" : "px-2"}`} style={{ width: LABEL_W }} title={e.nome}>
                            {e.nivel ? "· " : ""}{e.nome}
                          </div>
                          <div className={e.nivel ? "relative h-6" : "relative h-7"} style={{ width: largura }}>
                            <div className="absolute inset-0" style={{ left: hojeX, width: 1, background: "#D64545", opacity: 0.5 }} />
                            <div
                              className={e.nivel ? "absolute top-1.5 h-2 rounded" : "absolute top-2 h-3 rounded"}
                              style={{
                                left, width,
                                background: vencido ? "#D64545" : STATUS_COR[e.status],
                                outline: urgente ? "2px solid #D64545" : atencao ? "2px solid #C97A21" : "none",
                                opacity: e.nivel ? 0.6 : (vencido ? 1 : 0.85),
                              }}
                              title={`${e.nome} · ${e.status}${e.status === "em_andamento" ? ` · ${e.percentual || 0}%` : ""}`}
                            />
                            {marcas2.length > 0 && (
                              <div className="absolute flex gap-0.5" style={{ left, top: e.nivel ? -1 : -2 }}>
                                {marcas2.map((m) => (
                                  <span key={m.tipo + m.valor} className="block rounded-full" style={{ width: 6, height: 6, background: m.cor }} title={m.rotulo} />
                                ))}
                              </div>
                            )}
                            {(vencido || e.status === "em_andamento") && (
                              <span className="absolute top-2 text-[9px] font-mono text-muteddim" style={{ left: left + width + 4 }}>
                                {vencido ? "VENCIDO" : `${e.percentual || 0}%`}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {nivel !== "pi" && itensVisiveis.length === 0 && (
                      <div className="flex">
                        <div className="shrink-0 sticky left-0 bg-white z-10 px-2 py-1.5 text-xs text-muteddim border-r border-line" style={{ width: LABEL_W }}>Sem macro-etapas</div>
                        <div style={{ width: largura }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ---- tabelas de detalhe por equipe/recurso selecionado no filtro ---- */}
        {itensFiltro.length > 0 && (
          <div className="mt-6 flex flex-col gap-5">
            {itensFiltro.map((it) => {
              const linhas = pisSelecionados.flatMap((pi) =>
                itensOrdenados(pi.id)
                  .filter((e) => (it.tipo === "equipe" ? (e.areas || []).includes(it.valor) : recursoBateNaEtapa(it.valor, e)))
                  .map((e) => ({ pi, etapa: e }))
              );
              return (
                <div key={it.tipo + it.valor}>
                  <div className="font-head font-bold text-sm mb-2 px-2 py-1 rounded inline-block text-white" style={{ background: it.cor }}>
                    {it.rotulo}
                  </div>
                  <div className="border border-line rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-panel text-left">
                          <th className="px-3 py-2 font-mono text-muteddim">PI</th>
                          <th className="px-3 py-2 font-mono text-muteddim">Macro/sub etapa</th>
                          <th className="px-3 py-2 font-mono text-muteddim">Início</th>
                          <th className="px-3 py-2 font-mono text-muteddim">Fim</th>
                        </tr>
                      </thead>
                      <tbody>
                        {linhas.map(({ pi, etapa: e }) => (
                          <tr key={pi.id + e.id} className="border-t border-line">
                            <td className="px-3 py-2 font-mono text-cyan font-bold">{pi.codigo}</td>
                            <td className="px-3 py-2">{e.nivel ? "· " : ""}{e.nome}</td>
                            <td className="px-3 py-2">{e.data_prevista_inicio || "—"}</td>
                            <td className="px-3 py-2">{e.data_prevista_fim || "—"}</td>
                          </tr>
                        ))}
                        {linhas.length === 0 && (
                          <tr><td colSpan={4} className="px-3 py-3 text-muteddim text-center">Nenhuma etapa encontrada nos PIs selecionados.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selecionarAberto && (
        <SelecionarPisModal pis={pis} selecionados={piIds} onConfirmar={(ids) => { setPiIds(ids); setSelecionarAberto(false); }} onCancelar={() => setSelecionarAberto(false)} />
      )}
    </PainelShell>
  );
}

function SelecionarPisModal({ pis, selecionados, onConfirmar, onCancelar }) {
  const [numero, setNumero] = useState("");
  const [cliente, setCliente] = useState("");
  const [statusFiltro, setStatusFiltro] = useState([]);
  const [resultados, setResultados] = useState(pis);
  const [locais, setLocais] = useState(selecionados);

  const ehAberto = (p) => p.status === "ativo" || p.status === "pausado";
  const toggleStatus = (v) => setStatusFiltro((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);

  const pesquisar = () => {
    setResultados(pis.filter((p) =>
      (!numero || p.codigo.toLowerCase().includes(numero.toLowerCase())) &&
      (!cliente || (p.cliente || "").toLowerCase().includes(cliente.toLowerCase())) &&
      (statusFiltro.length === 0 ||
        (statusFiltro.includes("abertos") && ehAberto(p)) ||
        (statusFiltro.includes("encerrados") && !ehAberto(p)))
    ));
  };
  const limpar = () => { setNumero(""); setCliente(""); setStatusFiltro([]); setResultados(pis); };
  const toggleLocal = (id) => setLocais((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const marcarTodos = () => setLocais((p) => [...new Set([...p, ...resultados.map((r) => r.id)])]);
  const desmarcarTodos = () => setLocais((p) => p.filter((id) => !resultados.some((r) => r.id === id)));

  return (
    <div className="fixed inset-0 bg-navy/50 flex items-start justify-center p-4 pt-10 z-50 overflow-auto">
      <div className="bg-white rounded-xl w-full max-w-lg p-5">
        <div className="font-head font-bold mb-3">Selecionar PIs</div>
        <div className="flex gap-2 mb-2">
          <input placeholder="Nº do PI" value={numero} onChange={(e) => setNumero(e.target.value)} className="flex-1 px-2 py-1.5 rounded-lg border border-line text-sm" />
          <input placeholder="Cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} className="flex-1 px-2 py-1.5 rounded-lg border border-line text-sm" />
        </div>
        <div className="flex gap-2 mb-3">
          <button type="button" onClick={() => toggleStatus("abertos")} className={`px-3 py-1 rounded-full text-xs border ${statusFiltro.includes("abertos") ? "bg-green text-white border-green" : "border-line text-muted"}`}>Abertos</button>
          <button type="button" onClick={() => toggleStatus("encerrados")} className={`px-3 py-1 rounded-full text-xs border ${statusFiltro.includes("encerrados") ? "bg-muteddim text-white border-muteddim" : "border-line text-muted"}`}>Encerrados</button>
        </div>
        <div className="flex gap-2 mb-3">
          <button onClick={limpar} className="px-3 py-1.5 rounded-lg border border-line text-muted text-xs">Limpar Pesquisa</button>
          <button onClick={pesquisar} className="px-3 py-1.5 rounded-lg bg-cyan text-white text-xs font-semibold">Pesquisar</button>
        </div>

        <div className="border-t border-line pt-2">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[11px] font-mono text-muteddim">{resultados.length} resultado(s)</span>
            <div className="flex gap-3">
              <button onClick={marcarTodos} className="text-xs text-cyan underline">Marcar Todos</button>
              <button onClick={desmarcarTodos} className="text-xs text-muteddim underline">Desmarcar Todos</button>
            </div>
          </div>
          <div className="max-h-56 overflow-auto flex flex-col gap-1">
            {resultados.map((p) => (
              <label key={p.id} className="flex items-center gap-2 p-2 rounded-lg bg-panel text-xs cursor-pointer">
                <input type="checkbox" checked={locais.includes(p.id)} onChange={() => toggleLocal(p.id)} />
                <span className="font-mono text-cyan font-bold w-24">{p.codigo}</span>
                <span className="flex-1">{p.cliente}</span>
                <span className={ehAberto(p) ? "text-green" : "text-muteddim"}>{ehAberto(p) ? "ABERTO" : "ENCERRADO"}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-between items-center mt-4">
          <span className="text-xs text-muteddim">{locais.length} selecionado(s)</span>
          <div className="flex gap-2">
            <button onClick={onCancelar} className="px-3 py-2 text-sm text-muted">Cancelar</button>
            <button onClick={() => onConfirmar(locais)} className="px-4 py-2 rounded-lg bg-cyan text-white text-sm font-semibold">Confirmar seleção</button>
          </div>
        </div>
      </div>
    </div>
  );
}
