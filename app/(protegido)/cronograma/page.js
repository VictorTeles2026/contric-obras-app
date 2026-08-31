"use client";

import { useState, useMemo } from "react";
import { useTabela, registrarLog } from "../../../lib/dados";
import { useAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import { podeEditar } from "../../../lib/AuthContext";

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

  const { dados: etapas, recarregar: recarregarEtapas } = useTabela("etapas", {
    order: { coluna: "created_at" },
  });

  const etapasDoPi = useMemo(
    () => etapas.filter((e) => e.pi_id === (piAtual && piAtual.id)),
    [etapas, piAtual]
  );
  const macroEtapas = etapasDoPi.filter((e) => !e.parent_etapa_id);
  const subDe = (macroId) => etapasDoPi.filter((e) => e.parent_etapa_id === macroId);

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

  return (
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

      <div className="flex-1 overflow-auto p-4">
        {!piAtual && <div className="text-sm text-muteddim">Nenhum PI cadastrado ainda.</div>}

        {piAtual && (
          <>
            {editavel && (
              <button onClick={addMacroEtapa} className="mb-3 px-3 py-1.5 rounded-lg border border-cyan text-cyan text-xs font-semibold">
                + Macro-etapa
              </button>
            )}
            <div className="flex flex-col gap-2">
              {macroEtapas.map((macro) => (
                <div key={macro.id}>
                  <EtapaRow etapa={macro} editavel={editavel} onChange={atualizarEtapa} onDelete={excluirEtapa} />
                  <div className="ml-5 border-l-2 border-line pl-2 mt-1 flex flex-col gap-1">
                    {subDe(macro.id).map((sub) => (
                      <EtapaRow key={sub.id} etapa={sub} editavel={editavel} onChange={atualizarEtapa} onDelete={excluirEtapa} />
                    ))}
                    {editavel && (
                      <button onClick={() => addSubEtapa(macro.id)} className="text-left text-[11px] text-muteddim hover:text-cyan py-1">
                        + sub-etapa em "{macro.nome}"
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EtapaRow({ etapa, editavel, onChange, onDelete }) {
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-panel">
      <input
        value={etapa.nome}
        disabled={!editavel}
        onChange={(e) => onChange(etapa.id, { nome: e.target.value })}
        className="flex-1 min-w-[140px] px-2 py-1.5 rounded-lg border border-line text-sm font-head font-semibold bg-white disabled:bg-transparent disabled:border-transparent"
      />
      <input type="date" value={etapa.data_prevista_inicio || ""} disabled={!editavel}
        onChange={(e) => onChange(etapa.id, { data_prevista_inicio: e.target.value })}
        className="px-2 py-1.5 rounded-lg border border-line text-xs bg-white" />
      <input type="date" value={etapa.data_prevista_fim || ""} disabled={!editavel}
        onChange={(e) => onChange(etapa.id, { data_prevista_fim: e.target.value })}
        className="px-2 py-1.5 rounded-lg border border-line text-xs bg-white" />
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
