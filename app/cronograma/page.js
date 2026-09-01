"use client";

import { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { useTabela, registrarLog } from "../../lib/dados";
import { useAuth, podeEditar } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import PainelShell from "../../components/PainelShell";

const STATUS = [
  ["nao_iniciada", "Não iniciada"],
  ["em_andamento", "Em andamento"],
  ["concluida", "Concluída"],
  ["parada", "Parada"],
];
const AREAS = [
  "Engenharia Mecânica", "Engenharia Elétrica", "Vendas", "Cliente",
  "Suprimentos", "Produção", "Líder de Obra", "Coordenador de Obra", "Financeiro",
];

function todayISO() { return new Date().toISOString().slice(0, 10); }
function addDias(iso, d) {
  const dt = new Date(iso + "T00:00:00");
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().slice(0, 10);
}

// ---------- dias corridos / dias úteis / feriados ----------
function calcularPascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}
function addDiasDate(date, d) { const nd = new Date(date); nd.setDate(nd.getDate() + d); return nd; }
function isoDeDate(d) { return d.toISOString().slice(0, 10); }
function feriadosDoAno(ano) {
  const pascoa = calcularPascoa(ano);
  const nacionais = [
    [`${ano}-01-01`, "Confraternização Universal"], [`${ano}-04-21`, "Tiradentes"],
    [`${ano}-05-01`, "Dia do Trabalho"], [`${ano}-09-07`, "Independência do Brasil"],
    [`${ano}-10-12`, "Nossa Senhora Aparecida"], [`${ano}-11-02`, "Finados"],
    [`${ano}-11-15`, "Proclamação da República"], [`${ano}-11-20`, "Consciência Negra"],
    [`${ano}-12-25`, "Natal"],
    [isoDeDate(addDiasDate(pascoa, -47)), "Carnaval (segunda)"], [isoDeDate(addDiasDate(pascoa, -46)), "Carnaval (terça)"],
    [isoDeDate(addDiasDate(pascoa, -2)), "Sexta-feira Santa"], [isoDeDate(addDiasDate(pascoa, 60)), "Corpus Christi"],
  ];
  const sp = [[`${ano}-07-09`, "Revolução Constitucionalista (SP)"]];
  return { nacionais, sp };
}
function calcularDiasEFeriados(dataInicioStr, dataFimStr) {
  if (!dataInicioStr || !dataFimStr) return null;
  const di = new Date(dataInicioStr + "T00:00:00");
  const df = new Date(dataFimStr + "T00:00:00");
  if (isNaN(di) || isNaN(df) || df < di) return null;
  const anos = new Set();
  for (let a = di.getFullYear(); a <= df.getFullYear(); a++) anos.add(a);
  const nacMap = new Map(), spMap = new Map();
  anos.forEach((a) => {
    const { nacionais, sp } = feriadosDoAno(a);
    nacionais.forEach(([data, nome]) => nacMap.set(data, nome));
    sp.forEach(([data, nome]) => spMap.set(data, nome));
  });
  let totalDias = 0, diasUteis = 0, feriadosNac = 0, feriadosSp = 0;
  const cur = new Date(di);
  while (cur <= df) {
    totalDias++;
    const iso = isoDeDate(cur);
    const diaSemana = cur.getDay();
    const ehNac = nacMap.has(iso), ehSp = spMap.has(iso);
    if (ehNac) feriadosNac++;
    if (ehSp) feriadosSp++;
    if (diaSemana !== 0 && diaSemana !== 6 && !ehNac && !ehSp) diasUteis++;
    cur.setDate(cur.getDate() + 1);
  }
  return { totalDias, diasUteis, feriadosNac, feriadosSp };
}
function ResumoDiasPeriodo({ dataInicio, dataFim }) {
  const info = calcularDiasEFeriados(dataInicio, dataFim);
  if (!info) return null;
  return (
    <div className="text-[9.5px] text-muteddim font-mono whitespace-nowrap">
      {info.totalDias}d · {info.diasUteis}d úteis
      {info.feriadosNac > 0 && <> · {info.feriadosNac} fer. nac.</>}
      {info.feriadosSp > 0 && <> · {info.feriadosSp} fer. SP</>}
    </div>
  );
}

export default function CronogramaPage() {
  const { usuario } = useAuth();
  const editavel = podeEditar(usuario);
  const { dados: pis, recarregar: recarregarPis } = useTabela("pis", { order: { coluna: "created_at" } });
  const { dados: categorias } = useTabela("categorias_orcamento");
  const { dados: orcamentos, recarregar: recarregarOrcamentos } = useTabela("orcamento_pi_item");
  const { dados: recursos } = useTabela("recursos");
  const [piSelecionadoId, setPiSelecionadoId] = useState(null);
  const piAtual = pis.find((p) => p.id === piSelecionadoId) || pis[0];

  const { dados: etapas, recarregar: recarregarEtapas } = useTabela("etapas", { order: { coluna: "created_at" } });
  const { dados: dependencias, recarregar: recarregarDependencias } = useTabela("etapa_dependencias");
  const { dados: alocacoesRecurso, recarregar: recarregarAlocacoesRecurso } = useTabela("alocacoes_recurso");

  const etapasDoPi = useMemo(() => etapas.filter((e) => e.pi_id === (piAtual && piAtual.id)), [etapas, piAtual]);
  const macroEtapas = etapasDoPi.filter((e) => !e.parent_etapa_id);
  const subDe = (macroId) => etapasDoPi.filter((e) => e.parent_etapa_id === macroId);
  const depsDe = (etapaId) => dependencias.filter((d) => d.etapa_id === etapaId).map((d) => etapasDoPi.find((e) => e.id === d.depende_de_etapa_id)).filter(Boolean);
  const alocsDaEtapa = (etapaId) => alocacoesRecurso.filter((a) => a.etapa_id === etapaId);

  const [pisModalAberto, setPisModalAberto] = useState(false);
  const [pisModalModo, setPisModalModo] = useState("create");

  const salvarPi = async (dadosPi, valoresOrcamento) => {
    let piId = piAtual?.id;
    if (pisModalModo === "create") {
      const { data, error } = await supabase.from("pis").insert(dadosPi).select().single();
      if (error) return;
      piId = data.id;
      await registrarLog(usuario, "Criou PI", data.codigo);
    } else {
      await supabase.from("pis").update(dadosPi).eq("id", piId);
      await registrarLog(usuario, "Editou PI", dadosPi.codigo);
    }
    for (const [categoriaId, valor] of Object.entries(valoresOrcamento)) {
      if (valor === "" || valor === undefined) continue;
      await supabase.from("orcamento_pi_item").upsert(
        { pi_id: piId, categoria_id: categoriaId, valor_orcado: Number(valor) },
        { onConflict: "pi_id,categoria_id" }
      );
    }
    setPisModalAberto(false);
    setPiSelecionadoId(piId);
    recarregarPis(); recarregarOrcamentos();
  };

  const salvarCronogramaBase = async () => {
    if (!piAtual) return;
    await supabase.from("pis").update({ baseline_definida_em: new Date().toISOString(), baseline_definida_por: usuario.id }).eq("id", piAtual.id);
    await registrarLog(usuario, "Salvou Cronograma Base", piAtual.codigo);
    recarregarPis();
  };

  const addMacroEtapa = async () => {
    if (!piAtual) return;
    const t0 = todayISO();
    await supabase.from("etapas").insert({
      pi_id: piAtual.id, nome: "Nova macro-etapa", tipo: "campo",
      data_prevista_inicio: t0, data_prevista_fim: addDias(t0, 7), status: "nao_iniciada", percentual: 0,
    });
    await registrarLog(usuario, "Criou macro-etapa", piAtual.codigo);
    recarregarEtapas();
  };
  const addSubEtapa = async (macroId) => {
    const macro = etapasDoPi.find((e) => e.id === macroId);
    const base = macro?.data_prevista_inicio || todayISO();
    await supabase.from("etapas").insert({
      pi_id: piAtual.id, parent_etapa_id: macroId, nome: "Nova sub-etapa", tipo: "campo",
      data_prevista_inicio: base, data_prevista_fim: addDias(base, 3), status: "nao_iniciada", percentual: 0,
    });
    recarregarEtapas();
  };
  const atualizarEtapa = async (id, patch) => {
    const atual = etapasDoPi.find((e) => e.id === id);
    if (atual && patch.status && patch.status !== atual.status) {
      await registrarLog(usuario, "Alterou status de etapa", `"${atual.nome}" → ${patch.status}`);
    }
    await supabase.from("etapas").update(patch).eq("id", id);
    recarregarEtapas();
  };
  const excluirEtapa = async (id) => { await supabase.from("etapas").delete().eq("id", id); recarregarEtapas(); };

  const criarDependencia = async (origemId, destinoId) => {
    if (origemId === destinoId) return;
    if (dependencias.some((d) => d.etapa_id === destinoId && d.depende_de_etapa_id === origemId)) return;
    const destino = etapasDoPi.find((e) => e.id === destinoId);
    const origem = etapasDoPi.find((e) => e.id === origemId);
    await supabase.from("etapa_dependencias").insert({ etapa_id: destinoId, depende_de_etapa_id: origemId });
    await registrarLog(usuario, "Criou dependência", `"${destino?.nome}" passa a depender de "${origem?.nome}"`);
    recarregarDependencias();
  };
  const removerDependencia = async (origemId, destinoId) => {
    await supabase.from("etapa_dependencias").delete().eq("etapa_id", destinoId).eq("depende_de_etapa_id", origemId);
    recarregarDependencias();
  };

  const reordenarEtapa = async (dragId, targetId) => {
    if (dragId === targetId) return;
    const targetEtapa = etapasDoPi.find((e) => e.id === targetId);
    if (!targetEtapa) return;
    const novoParentId = targetEtapa.parent_etapa_id || null;
    if (novoParentId === dragId) return;
    const filhas = etapasDoPi.filter((e) => e.parent_etapa_id === dragId);
    if (novoParentId) {
      for (const filha of filhas) await supabase.from("etapas").update({ parent_etapa_id: novoParentId }).eq("id", filha.id);
    }
    await supabase.from("etapas").update({ parent_etapa_id: novoParentId }).eq("id", dragId);
    recarregarEtapas();
  };
  const tornarSubDe = async (dragId, macroId) => {
    if (dragId === macroId) return;
    const filhas = etapasDoPi.filter((e) => e.parent_etapa_id === dragId);
    for (const filha of filhas) await supabase.from("etapas").update({ parent_etapa_id: macroId }).eq("id", filha.id);
    await supabase.from("etapas").update({ parent_etapa_id: macroId }).eq("id", dragId);
    recarregarEtapas();
  };

  // ---- Equipe (áreas) ----
  const toggleArea = async (etapa, area) => {
    const atuais = etapa.areas || [];
    const novas = atuais.includes(area) ? atuais.filter((a) => a !== area) : [...atuais, area];
    await supabase.from("etapas").update({ areas: novas }).eq("id", etapa.id);
    recarregarEtapas();
  };

  // ---- Alocação de recursos na etapa ----
  const toggleRecursoNaEtapa = async (etapa, recursoId) => {
    const existente = alocacoesRecurso.find((a) => a.etapa_id === etapa.id && a.recurso_id === recursoId);
    if (existente) {
      await supabase.from("alocacoes_recurso").delete().eq("id", existente.id);
    } else {
      await supabase.from("alocacoes_recurso").insert({
        recurso_id: recursoId, pi_id: etapa.pi_id, etapa_id: etapa.id,
        modo: "periodo_percentual", periodo_inicio: etapa.data_prevista_inicio || todayISO(),
        periodo_fim: etapa.data_prevista_fim || todayISO(), percentual: 100,
      });
    }
    recarregarAlocacoesRecurso();
  };

  const containerRef = useRef(null);
  const anchorRefs = useRef({});
  const [lines, setLines] = useState([]);
  const [dragOverId, setDragOverId] = useState(null);
  const [dragOverRowId, setDragOverRowId] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null);
  const GUTTER_X = 14;

  const recalcularLinhas = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    const next = [];
    dependencias.forEach((d) => {
      if (!etapasDoPi.some((e) => e.id === d.etapa_id)) return;
      const fromEl = anchorRefs.current[d.depende_de_etapa_id];
      const toEl = anchorRefs.current[d.etapa_id];
      if (!fromEl || !toEl) return;
      const fr = fromEl.getBoundingClientRect();
      const tr = toEl.getBoundingClientRect();
      next.push({
        key: d.depende_de_etapa_id + "-" + d.etapa_id, origemId: d.depende_de_etapa_id, destinoId: d.etapa_id,
        x1: fr.left - cRect.left + 4, y1: fr.top - cRect.top + 4,
        x2: tr.left - cRect.left + 4, y2: tr.top - cRect.top + 4,
      });
    });
    setLines(next);
  }, [dependencias, etapasDoPi]);

  useLayoutEffect(() => { recalcularLinhas(); }, [recalcularLinhas]);
  useEffect(() => {
    const tentar = () => recalcularLinhas();
    if (typeof document !== "undefined" && document.fonts?.ready) document.fonts.ready.then(tentar).catch(() => {});
    const t1 = setTimeout(tentar, 150);
    const t2 = setTimeout(tentar, 500);
    window.addEventListener("resize", tentar);
    const el = containerRef.current;
    el?.addEventListener("scroll", tentar);
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener("resize", tentar); el?.removeEventListener("scroll", tentar); };
  }, [recalcularLinhas]);

  const valoresOrcamentoAtuais = Object.fromEntries((orcamentos.filter((o) => o.pi_id === piAtual?.id)).map((o) => [o.categoria_id, o.valor_orcado]));

  return (
    <PainelShell>
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-3 p-3 bg-panel border-b border-line">
        <span className="text-[10px] font-mono text-muteddim">PI</span>
        <select value={piAtual?.id || ""} onChange={(e) => setPiSelecionadoId(e.target.value)} className="px-2 py-1.5 rounded-lg border border-line text-sm bg-white">
          {pis.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.cliente}</option>)}
        </select>
        {editavel && (
          <button onClick={() => { setPisModalModo("create"); setPisModalAberto(true); }} className="px-3 py-1.5 rounded-lg bg-cyan text-white text-xs font-semibold">
            + Novo PI
          </button>
        )}
        {editavel && piAtual && (
          <button onClick={() => { setPisModalModo("edit"); setPisModalAberto(true); }} className="px-3 py-1.5 rounded-lg border border-line text-muted text-xs font-semibold">
            Editar PI
          </button>
        )}
        {editavel && piAtual && (
          <button onClick={salvarCronogramaBase} className="px-3 py-1.5 rounded-lg border border-amber text-amber text-xs font-semibold ml-auto">
            {piAtual.baseline_definida_em ? "✓ Cronograma Base salvo" : "⚠ Salvar Cronograma Base"}
          </button>
        )}
      </div>

      {pisModalAberto && (
        <PiModal
          modo={pisModalModo} piInicial={pisModalModo === "edit" ? piAtual : null}
          categorias={categorias} valoresIniciais={pisModalModo === "edit" ? valoresOrcamentoAtuais : {}}
          onSalvar={salvarPi} onCancelar={() => setPisModalAberto(false)}
        />
      )}

      <div ref={containerRef} className="flex-1 overflow-auto p-4 relative" onClick={() => ctxMenu && setCtxMenu(null)}>
        {!piAtual && <div className="text-sm text-muteddim">Nenhum PI cadastrado ainda.</div>}

        {piAtual && (
          <>
            {editavel && (
              <button onClick={addMacroEtapa} className="mb-3 px-3 py-1.5 rounded-lg border border-cyan text-cyan text-xs font-semibold">
                + Macro-etapa
              </button>
            )}

            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 5 }}>
              <defs>
                <marker id="seta" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 Z" fill="#0B84A5" />
                </marker>
              </defs>
              {lines.map((l) => {
                const path = `M ${l.x1} ${l.y1} H ${GUTTER_X} V ${l.y2} H ${l.x2}`;
                return (
                  <g key={l.key}>
                    <path d={path} stroke="#0B84A5" strokeWidth="1.4" strokeDasharray="4 3" fill="none" opacity="0.75" markerEnd="url(#seta)" pointerEvents="none" />
                    <path d={path} stroke="transparent" strokeWidth="12" fill="none" style={{ pointerEvents: "stroke", cursor: "context-menu" }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        const rect = containerRef.current.getBoundingClientRect();
                        setCtxMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, origemId: l.origemId, destinoId: l.destinoId });
                      }} />
                  </g>
                );
              })}
            </svg>

            {ctxMenu && (
              <div onClick={(e) => e.stopPropagation()} className="absolute bg-white border border-line rounded-lg shadow-lg z-30" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
                <button onClick={() => { removerDependencia(ctxMenu.origemId, ctxMenu.destinoId); setCtxMenu(null); }}
                  className="block w-full text-left px-3 py-2 text-xs text-red hover:bg-red/10">✕ Excluir dependência</button>
              </div>
            )}

            {!piAtual.baseline_definida_em && (
              <div className="text-xs text-amber bg-amber/10 rounded-lg px-3 py-2 mb-3">
                ⚠ Este PI ainda não tem um Cronograma Base salvo — nenhuma alteração está sendo comparada a uma referência.
              </div>
            )}

            <div className="flex flex-col gap-2 relative pl-6" style={{ zIndex: 2 }}>
              {macroEtapas.map((macro) => (
                <div key={macro.id}>
                  <EtapaRow
                    etapa={macro} editavel={editavel} onChange={atualizarEtapa} onDelete={excluirEtapa}
                    deps={depsDe(macro.id)} onRemoverDep={(origemId) => removerDependencia(origemId, macro.id)}
                    anchorRef={(el) => { anchorRefs.current[macro.id] = el; }}
                    onCreateDependency={criarDependencia} dragOverId={dragOverId} setDragOverId={setDragOverId}
                    onReordenar={reordenarEtapa} dragOverRowId={dragOverRowId} setDragOverRowId={setDragOverRowId}
                    onToggleArea={toggleArea} recursos={recursos} alocs={alocsDaEtapa(macro.id)} onToggleRecurso={toggleRecursoNaEtapa}
                  />
                  <SubEtapasDropzone macroId={macro.id} editavel={editavel} onDropTornarSub={tornarSubDe}>
                    {subDe(macro.id).map((sub) => (
                      <EtapaRow
                        key={sub.id} etapa={sub} editavel={editavel} onChange={atualizarEtapa} onDelete={excluirEtapa}
                        deps={depsDe(sub.id)} onRemoverDep={(origemId) => removerDependencia(origemId, sub.id)}
                        anchorRef={(el) => { anchorRefs.current[sub.id] = el; }}
                        onCreateDependency={criarDependencia} dragOverId={dragOverId} setDragOverId={setDragOverId}
                        onReordenar={reordenarEtapa} dragOverRowId={dragOverRowId} setDragOverRowId={setDragOverRowId}
                        onToggleArea={toggleArea} recursos={recursos} alocs={alocsDaEtapa(sub.id)} onToggleRecurso={toggleRecursoNaEtapa}
                      />
                    ))}
                    {editavel && (
                      <button onClick={() => addSubEtapa(macro.id)} className="text-left text-[11px] text-muteddim hover:text-cyan py-1">
                        + sub-etapa em "{macro.nome}"
                      </button>
                    )}
                  </SubEtapasDropzone>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
    </PainelShell>
  );
}

function SubEtapasDropzone({ macroId, editavel, onDropTornarSub, children }) {
  const [emCima, setEmCima] = useState(false);
  return (
    <div
      onDragOver={(e) => { if (editavel && e.dataTransfer.types.includes("text/x-reorder-etapa")) { e.preventDefault(); setEmCima(true); } }}
      onDragLeave={() => setEmCima(false)}
      onDrop={(e) => {
        if (!editavel || !e.dataTransfer.types.includes("text/x-reorder-etapa")) return;
        e.preventDefault(); setEmCima(false);
        const dragId = e.dataTransfer.getData("text/x-reorder-etapa");
        if (dragId && dragId !== macroId) onDropTornarSub(dragId, macroId);
      }}
      className={`ml-5 border-l-2 pl-2 mt-1 flex flex-col gap-1 rounded-r-lg ${emCima ? "border-cyan bg-cyan/5" : "border-line"}`}
    >
      {children}
      {emCima && <div className="text-[10px] text-cyan font-mono py-0.5">solte para virar sub-etapa aqui</div>}
    </div>
  );
}

function EtapaRow({ etapa, editavel, onChange, onDelete, deps, onRemoverDep, anchorRef, onCreateDependency, dragOverId, setDragOverId, onReordenar, dragOverRowId, setDragOverRowId, onToggleArea, recursos, alocs, onToggleRecurso }) {
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [equipeAberta, setEquipeAberta] = useState(false);
  const [alocAberta, setAlocAberta] = useState(false);
  const isDragOver = dragOverId === etapa.id;
  const isDragOverRow = dragOverRowId === etapa.id;
  const depsComSobreposicao = deps.filter((d) => d.data_prevista_fim && etapa.data_prevista_inicio && d.data_prevista_fim > etapa.data_prevista_inicio);
  const areas = etapa.areas || [];

  return (
    <div
      onDragOver={(e) => { if (e.dataTransfer.types.includes("text/x-reorder-etapa")) { e.preventDefault(); setDragOverRowId(etapa.id); } }}
      onDragLeave={() => setDragOverRowId((p) => (p === etapa.id ? null : p))}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("text/x-reorder-etapa")) return;
        e.preventDefault();
        const origemId = e.dataTransfer.getData("text/x-reorder-etapa");
        setDragOverRowId(null);
        if (origemId && origemId !== etapa.id && editavel) onReordenar(origemId, etapa.id);
      }}
      className={`flex flex-wrap items-center gap-2 p-2 rounded-lg relative ${isDragOverRow ? "bg-cyan/10 outline outline-2 outline-cyan" : "bg-panel"}`}
    >
      {editavel && (
        <div draggable onDragStart={(e) => { e.dataTransfer.setData("text/x-reorder-etapa", etapa.id); e.dataTransfer.effectAllowed = "move"; }}
          title="Arraste para reordenar" className="w-5 h-5 flex items-center justify-center text-muteddim hover:text-textmain cursor-grab text-sm select-none">⋮⋮</div>
      )}
      <div
        ref={anchorRef} draggable={editavel}
        onDragStart={(e) => { e.dataTransfer.setData("text/x-dependency-origin", etapa.id); e.dataTransfer.effectAllowed = "link"; }}
        onDragOver={(e) => { if (e.dataTransfer.types.includes("text/x-dependency-origin")) { e.preventDefault(); setDragOverId(etapa.id); } }}
        onDragLeave={() => setDragOverId((p) => (p === etapa.id ? null : p))}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes("text/x-dependency-origin")) return;
          e.preventDefault();
          const origemId = e.dataTransfer.getData("text/x-dependency-origin");
          setDragOverId(null);
          if (origemId && origemId !== etapa.id) onCreateDependency(origemId, etapa.id);
        }}
        title="Arraste até outra etapa para criar dependência"
        style={{ width: isDragOver ? 14 : 10, height: isDragOver ? 14 : 10, transition: "width .1s, height .1s" }}
        className={`rounded-full shrink-0 cursor-grab ${isDragOver ? "bg-green" : "bg-cyan"}`}
      />
      <input value={etapa.nome} disabled={!editavel} onChange={(e) => onChange(etapa.id, { nome: e.target.value })}
        className="flex-1 min-w-[140px] px-2 py-1.5 rounded-lg border border-line text-sm font-head font-semibold bg-white disabled:bg-transparent disabled:border-transparent" />

      <div className="flex flex-col gap-0.5">
        <div className="flex gap-1">
          <input type="date" value={etapa.data_prevista_inicio || ""} disabled={!editavel}
            onChange={(e) => onChange(etapa.id, { data_prevista_inicio: e.target.value })}
            className="px-2 py-1.5 rounded-lg border border-line text-xs bg-white" />
          <input type="date" value={etapa.data_prevista_fim || ""} disabled={!editavel}
            onChange={(e) => onChange(etapa.id, { data_prevista_fim: e.target.value })}
            className="px-2 py-1.5 rounded-lg border border-line text-xs bg-white" />
        </div>
        <ResumoDiasPeriodo dataInicio={etapa.data_prevista_inicio} dataFim={etapa.data_prevista_fim} />
        {depsComSobreposicao.length > 0 && <div className="text-[10px] text-red">⚠ sobreposição de datas com dependência</div>}
      </div>

      <select value={etapa.status} disabled={!editavel} onChange={(e) => onChange(etapa.id, { status: e.target.value })}
        className="px-2 py-1.5 rounded-lg border border-line text-xs bg-white">
        {STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {etapa.status === "em_andamento" && (
        <input type="number" min="0" max="100" value={etapa.percentual || 0} disabled={!editavel}
          onChange={(e) => onChange(etapa.id, { percentual: Number(e.target.value) })}
          className="w-16 px-2 py-1.5 rounded-lg border border-line text-xs bg-white" />
      )}

      <div className="relative">
        <button onClick={() => { setEquipeAberta((v) => !v); setAlocAberta(false); }} className="px-2 py-1.5 rounded-lg border border-line text-xs bg-white">
          Equipe {areas.length > 0 ? `(${areas.length})` : ""} ▾
        </button>
        {equipeAberta && (
          <div className="absolute z-20 mt-1 bg-white border border-line rounded-lg shadow-lg p-2 w-56 max-h-56 overflow-auto">
            {AREAS.map((a) => (
              <label key={a} className="flex items-center gap-2 py-1 text-xs cursor-pointer">
                <input type="checkbox" checked={areas.includes(a)} disabled={!editavel} onChange={() => onToggleArea(etapa, a)} />
                {a}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <button onClick={() => { setAlocAberta((v) => !v); setEquipeAberta(false); }} className="px-2 py-1.5 rounded-lg border border-line text-xs bg-white">
          Alocação {alocs.length > 0 ? `(${alocs.length})` : ""} ▾
        </button>
        {alocAberta && (
          <div className="absolute z-20 mt-1 bg-white border border-line rounded-lg shadow-lg p-2 w-56 max-h-56 overflow-auto">
            {recursos.length === 0 && <div className="text-xs text-muteddim px-1 py-1">Nenhum recurso cadastrado.</div>}
            {recursos.map((r) => (
              <label key={r.id} className="flex items-center gap-2 py-1 text-xs cursor-pointer">
                <input type="checkbox" checked={alocs.some((a) => a.recurso_id === r.id)} disabled={!editavel} onChange={() => onToggleRecurso(etapa, r.id)} />
                {r.nome}
              </label>
            ))}
          </div>
        )}
      </div>

      {deps.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {deps.map((d) => (
            <span key={d.id} className="inline-flex items-center gap-1 text-[10px] font-mono bg-white border border-line rounded-full pl-2 pr-1 py-0.5">
              {d.nome}
              {editavel && <button onClick={() => onRemoverDep(d.id)} className="text-muteddim hover:text-red">✕</button>}
            </span>
          ))}
        </div>
      )}

      {editavel && (
        confirmarExclusao ? (
          <div className="flex gap-1">
            <button onClick={() => onDelete(etapa.id)} className="text-xs text-white bg-red px-2 py-1 rounded">Confirmar</button>
            <button onClick={() => setConfirmarExclusao(false)} className="text-xs text-muted px-2 py-1">Cancelar</button>
          </div>
        ) : (
          <button onClick={() => setConfirmarExclusao(true)} className="text-muteddim hover:text-red text-sm px-1">✕</button>
        )
      )}
    </div>
  );
}

function PiModal({ modo, piInicial, categorias, valoresIniciais, onSalvar, onCancelar }) {
  const [codigo, setCodigo] = useState(piInicial?.codigo || "");
  const [cliente, setCliente] = useState(piInicial?.cliente || "");
  const [projeto, setProjeto] = useState(piInicial?.projeto || "");
  const [prazo, setPrazo] = useState(piInicial?.prazo || addDias(todayISO(), 45));
  const [status, setStatus] = useState(piInicial?.status || "ativo");
  const [valores, setValores] = useState(valoresIniciais || {});

  const compraCats = categorias.filter((c) => c.grupo === "compra_reais");
  const moiCats = categorias.filter((c) => c.grupo === "moi_horas");
  const setValor = (catId, v) => setValores((prev) => ({ ...prev, [catId]: v === "" ? "" : Number(v) }));
  const podeSalvar = codigo.trim().length > 0;

  return (
    <div className="fixed inset-0 bg-navy/50 flex items-start justify-center p-4 pt-8 z-50 overflow-auto">
      <div className="bg-white rounded-xl w-full max-w-3xl p-5">
        <div className="flex justify-between items-center mb-4">
          <div className="font-head font-bold text-lg">{modo === "create" ? "Abertura de PI" : `Editar PI — ${piInicial?.codigo}`}</div>
          <div className="text-[10px] font-mono text-muteddim">CUSTOS (EXTERNOS E INTERNOS)</div>
        </div>

        <div className="flex flex-wrap gap-3 mb-5">
          <Campo label="Nº DO PI"><input value={codigo} onChange={(e) => setCodigo(e.target.value)} className="input w-32" /></Campo>
          <Campo label="CLIENTE"><input value={cliente} onChange={(e) => setCliente(e.target.value)} className="input w-48" /></Campo>
          <Campo label="PROJETO"><input value={projeto} onChange={(e) => setProjeto(e.target.value)} className="input w-48" /></Campo>
          <Campo label="PRAZO"><input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className="input" /></Campo>
          <Campo label="STATUS">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="input">
              <option value="ativo">Ativo</option><option value="pausado">Pausado</option>
              <option value="concluido">Concluído</option><option value="cancelado">Cancelado</option>
            </select>
          </Campo>
        </div>

        <div className="mb-5">
          <div className="font-head font-bold text-xs text-cyan uppercase tracking-wide mb-2">Compra — Produto ou Serviço</div>
          <div className="grid grid-cols-[70px_1fr_130px] gap-2 text-[10px] font-mono text-muteddim mb-1">
            <span>CÓD.</span><span>DESCRIÇÃO</span><span className="text-right">VALOR (R$)</span>
          </div>
          <div className="flex flex-col max-h-40 overflow-auto">
            {compraCats.map((c) => (
              <div key={c.id} className="grid grid-cols-[70px_1fr_130px] gap-2 items-center py-1">
                <span className="font-mono text-xs text-muted">{c.codigo}</span>
                <span className="text-sm">{c.nome}</span>
                <input type="number" step="0.01" value={valores[c.id] ?? ""} placeholder="0,00" onChange={(e) => setValor(c.id, e.target.value)}
                  className="input text-right" />
              </div>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <div className="font-head font-bold text-xs text-cyan uppercase tracking-wide mb-2">Mão de obra interna (horas)</div>
          <div className="grid grid-cols-[70px_1fr_130px] gap-2 text-[10px] font-mono text-muteddim mb-1">
            <span>CÓD.</span><span>DESCRIÇÃO</span><span className="text-right">HORAS</span>
          </div>
          <div className="flex flex-col max-h-40 overflow-auto">
            {moiCats.map((c) => (
              <div key={c.id} className="grid grid-cols-[70px_1fr_130px] gap-2 items-center py-1">
                <span className="font-mono text-xs text-muted">{c.codigo}</span>
                <span className="text-sm">{c.nome}</span>
                <input type="number" step="0.5" value={valores[c.id] ?? ""} placeholder="0" onChange={(e) => setValor(c.id, e.target.value)}
                  className="input text-right" />
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onCancelar} className="px-3 py-2 text-sm text-muted">Cancelar</button>
          <button onClick={() => onSalvar({ codigo: codigo.trim(), cliente: cliente.trim() || null, projeto: projeto.trim() || null, prazo, status }, valores)}
            disabled={!podeSalvar} className="px-4 py-2 rounded-lg bg-cyan text-white text-sm font-semibold disabled:opacity-50">
            {modo === "create" ? "Criar PI" : "Salvar alterações"}
          </button>
        </div>
      </div>
      <style jsx global>{`
        .input { width: 100%; padding: 7px 9px; border-radius: 8px; border: 1px solid #D7E0EC; font-size: 12.5px; background: white; }
      `}</style>
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div>
      <div className="text-[10px] font-mono text-muteddim mb-1">{label}</div>
      {children}
    </div>
  );
}
