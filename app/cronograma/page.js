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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function addDias(iso, d) {
  const dt = new Date(iso + "T00:00:00");
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().slice(0, 10);
}

export default function CronogramaPage() {
  const { usuario } = useAuth();
  const editavel = podeEditar(usuario);
  const { dados: pis, recarregar: recarregarPis } = useTabela("pis", { order: { coluna: "created_at" } });
  const [piSelecionadoId, setPiSelecionadoId] = useState(null);
  const piAtual = pis.find((p) => p.id === piSelecionadoId) || pis[0];

  const { dados: etapas, recarregar: recarregarEtapas } = useTabela("etapas", { order: { coluna: "created_at" } });
  const { dados: dependencias, recarregar: recarregarDependencias } = useTabela("etapa_dependencias");

  const etapasDoPi = useMemo(
    () => etapas.filter((e) => e.pi_id === (piAtual && piAtual.id)),
    [etapas, piAtual]
  );
  const macroEtapas = etapasDoPi.filter((e) => !e.parent_etapa_id);
  const subDe = (macroId) => etapasDoPi.filter((e) => e.parent_etapa_id === macroId);
  const depsDe = (etapaId) => dependencias.filter((d) => d.etapa_id === etapaId).map((d) => etapasDoPi.find((e) => e.id === d.depende_de_etapa_id)).filter(Boolean);

  const [novoPiAberto, setNovoPiAberto] = useState(false);
  const [novoCodigo, setNovoCodigo] = useState("");
  const [novoCliente, setNovoCliente] = useState("");

  const criarPi = async () => {
    if (!novoCodigo.trim()) return;
    const { data, error } = await supabase
      .from("pis")
      .insert({ codigo: novoCodigo.trim(), cliente: novoCliente.trim() || null, status: "ativo" })
      .select()
      .single();
    if (!error) {
      await registrarLog(usuario, "Criou PI", data.codigo);
      setNovoCodigo(""); setNovoCliente(""); setNovoPiAberto(false);
      setPiSelecionadoId(data.id);
      recarregarPis();
    }
  };

  const addMacroEtapa = async () => {
    if (!piAtual) return;
    const t0 = todayISO();
    await supabase.from("etapas").insert({
      pi_id: piAtual.id, nome: "Nova macro-etapa", tipo: "campo",
      data_prevista_inicio: t0, data_prevista_fim: addDias(t0, 7),
      status: "nao_iniciada", percentual: 0,
    });
    await registrarLog(usuario, "Criou macro-etapa", piAtual.codigo);
    recarregarEtapas();
  };

  const addSubEtapa = async (macroId) => {
    const macro = etapasDoPi.find((e) => e.id === macroId);
    const base = macro?.data_prevista_inicio || todayISO();
    await supabase.from("etapas").insert({
      pi_id: piAtual.id, parent_etapa_id: macroId, nome: "Nova sub-etapa", tipo: "campo",
      data_prevista_inicio: base, data_prevista_fim: addDias(base, 3),
      status: "nao_iniciada", percentual: 0,
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

  const excluirEtapa = async (id) => {
    await supabase.from("etapas").delete().eq("id", id);
    recarregarEtapas();
  };

  const criarDependencia = async (origemId, destinoId) => {
    if (origemId === destinoId) return;
    const jaExiste = dependencias.some((d) => d.etapa_id === destinoId && d.depende_de_etapa_id === origemId);
    if (jaExiste) return;
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
      for (const filha of filhas) {
        await supabase.from("etapas").update({ parent_etapa_id: novoParentId }).eq("id", filha.id);
      }
    }
    await supabase.from("etapas").update({ parent_etapa_id: novoParentId }).eq("id", dragId);
    recarregarEtapas();
  };

  const tornarSubDe = async (dragId, macroId) => {
    if (dragId === macroId) return;
    const filhas = etapasDoPi.filter((e) => e.parent_etapa_id === dragId);
    for (const filha of filhas) {
      await supabase.from("etapas").update({ parent_etapa_id: macroId }).eq("id", filha.id);
    }
    await supabase.from("etapas").update({ parent_etapa_id: macroId }).eq("id", dragId);
    recarregarEtapas();
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
        key: d.depende_de_etapa_id + "-" + d.etapa_id,
        origemId: d.depende_de_etapa_id, destinoId: d.etapa_id,
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

  return (
    <PainelShell>
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-3 p-3 bg-panel border-b border-line">
        <span className="text-[10px] font-mono text-muteddim">PI</span>
        <select
          value={piAtual?.id || ""}
          onChange={(e) => setPiSelecionadoId(e.target.value)}
          className="px-2 py-1.5 rounded-lg border border-line text-sm bg-white"
        >
          {pis.map((p) => (
            <option key={p.id} value={p.id}>{p.codigo} — {p.cliente}</option>
          ))}
        </select>
        {editavel && (
          <button onClick={() => setNovoPiAberto(true)} className="px-3 py-1.5 rounded-lg bg-cyan text-white text-xs font-semibold">
            + Novo PI
          </button>
        )}
      </div>

      {novoPiAberto && (
        <div className="fixed inset-0 bg-navy/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-sm p-5">
            <div className="font-head font-bold mb-3">Novo PI</div>
            <input placeholder="Código (ex: PI-001)" value={novoCodigo} onChange={(e) => setNovoCodigo(e.target.value)}
              className="w-full mb-2 px-3 py-2 rounded-lg border border-line text-sm" />
            <input placeholder="Cliente" value={novoCliente} onChange={(e) => setNovoCliente(e.target.value)}
              className="w-full mb-4 px-3 py-2 rounded-lg border border-line text-sm" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setNovoPiAberto(false)} className="px-3 py-2 text-sm text-muted">Cancelar</button>
              <button onClick={criarPi} disabled={!novoCodigo.trim()} className="px-3 py-2 rounded-lg bg-cyan text-white text-sm font-semibold disabled:opacity-50">
                Criar PI
              </button>
            </div>
          </div>
        </div>
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

            <div className="flex flex-col gap-2 relative pl-6" style={{ zIndex: 2 }}>
              {macroEtapas.map((macro) => (
                <div key={macro.id}>
                  <EtapaRow
                    etapa={macro} editavel={editavel} onChange={atualizarEtapa} onDelete={excluirEtapa}
                    deps={depsDe(macro.id)} onRemoverDep={(origemId) => removerDependencia(origemId, macro.id)}
                    anchorRef={(el) => { anchorRefs.current[macro.id] = el; }}
                    onCreateDependency={criarDependencia} dragOverId={dragOverId} setDragOverId={setDragOverId}
                    onReordenar={reordenarEtapa} dragOverRowId={dragOverRowId} setDragOverRowId={setDragOverRowId}
                  />
                  <SubEtapasDropzone macroId={macro.id} editavel={editavel} onDropTornarSub={tornarSubDe}>
                    {subDe(macro.id).map((sub) => (
                      <EtapaRow
                        key={sub.id} etapa={sub} editavel={editavel} onChange={atualizarEtapa} onDelete={excluirEtapa}
                        deps={depsDe(sub.id)} onRemoverDep={(origemId) => removerDependencia(origemId, sub.id)}
                        anchorRef={(el) => { anchorRefs.current[sub.id] = el; }}
                        onCreateDependency={criarDependencia} dragOverId={dragOverId} setDragOverId={setDragOverId}
                        onReordenar={reordenarEtapa} dragOverRowId={dragOverRowId} setDragOverRowId={setDragOverRowId}
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
        e.preventDefault();
        setEmCima(false);
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

function EtapaRow({ etapa, editavel, onChange, onDelete, deps, onRemoverDep, anchorRef, onCreateDependency, dragOverId, setDragOverId, onReordenar, dragOverRowId, setDragOverRowId }) {
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const isDragOver = dragOverId === etapa.id;
  const isDragOverRow = dragOverRowId === etapa.id;
  const depsComSobreposicao = deps.filter((d) => d.data_prevista_fim && etapa.data_prevista_inicio && d.data_prevista_fim > etapa.data_prevista_inicio);

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
      className={`flex flex-wrap items-center gap-2 p-2 rounded-lg ${isDragOverRow ? "bg-cyan/10 outline outline-2 outline-cyan" : "bg-panel"}`}
    >
      {editavel && (
        <div
          draggable
          onDragStart={(e) => { e.dataTransfer.setData("text/x-reorder-etapa", etapa.id); e.dataTransfer.effectAllowed = "move"; }}
          title="Arraste para reordenar"
          className="w-5 h-5 flex items-center justify-center text-muteddim hover:text-textmain cursor-grab text-sm select-none"
        >⋮⋮</div>
      )}
      <div
        ref={anchorRef}
        draggable={editavel}
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
      <input
        value={etapa.nome}
        disabled={!editavel}
        onChange={(e) => onChange(etapa.id, { nome: e.target.value })}
        className="flex-1 min-w-[140px] px-2 py-1.5 rounded-lg border border-line text-sm font-head font-semibold bg-white disabled:bg-transparent disabled:border-transparent"
      />
      <div className="flex flex-col gap-0.5">
        <div className="flex gap-1">
          <input type="date" value={etapa.data_prevista_inicio || ""} disabled={!editavel}
            onChange={(e) => onChange(etapa.id, { data_prevista_inicio: e.target.value })}
            className="px-2 py-1.5 rounded-lg border border-line text-xs bg-white" />
          <input type="date" value={etapa.data_prevista_fim || ""} disabled={!editavel}
            onChange={(e) => onChange(etapa.id, { data_prevista_fim: e.target.value })}
            className="px-2 py-1.5 rounded-lg border border-line text-xs bg-white" />
        </div>
        {depsComSobreposicao.length > 0 && (
          <div className="text-[10px] text-red">⚠ sobreposição de datas com dependência</div>
        )}
      </div>
      <select value={etapa.status} disabled={!editavel}
        onChange={(e) => onChange(etapa.id, { status: e.target.value })}
        className="px-2 py-1.5 rounded-lg border border-line text-xs bg-white">
        {STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {etapa.status === "em_andamento" && (
        <input type="number" min="0" max="100" value={etapa.percentual || 0} disabled={!editavel}
          onChange={(e) => onChange(etapa.id, { percentual: Number(e.target.value) })}
          className="w-16 px-2 py-1.5 rounded-lg border border-line text-xs bg-white" />
      )}
      {deps.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {deps.map((d) => (
            <span key={d.id} className="inline-flex items-center gap-1 text-[10px] font-mono bg-white border border-line rounded-full pl-2 pr-1 py-0.5">
              {d.nome}
              {editavel && (
                <button onClick={() => onRemoverDep(d.id)} className="text-muteddim hover:text-red">✕</button>
              )}
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
