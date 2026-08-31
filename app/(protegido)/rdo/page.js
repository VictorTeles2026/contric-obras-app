"use client";

import { useState, useMemo } from "react";
import { useTabela, registrarLog } from "../../../lib/dados";
import { useAuth, podeEditar } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";

const STATUS = [
  ["nao_iniciada", "Não iniciada"], ["em_andamento", "Em andamento"],
  ["concluida", "Concluída"], ["parada", "Parada"],
];
const CATEGORIAS_OCORRENCIA = ["Atraso", "Retrabalho", "Reclamação do cliente", "Prejuízo", "Outro"];

export default function RdoPage() {
  const { usuario } = useAuth();
  const editavel = podeEditar(usuario);
  const { dados: pis } = useTabela("pis", { order: { coluna: "codigo" } });
  const { dados: etapas } = useTabela("etapas");
  const { dados: usuarios } = useTabela("usuarios");
  const { dados: recursos } = useTabela("recursos");
  const { dados: alocacoes } = useTabela("alocacoes_recurso");

  const [piId, setPiId] = useState("");
  const piAtual = pis.find((p) => p.id === piId) || pis[0];
  const etapasDoPi = etapas.filter((e) => e.pi_id === (piAtual && piAtual.id) && !e.parent_etapa_id);

  const liderResponsavel = useMemo(() => {
    if (!piAtual) return null;
    for (const lider of usuarios.filter((u) => u.perfil === "lider")) {
      const recurso = recursos.find((r) => r.usuario_id === lider.id);
      if (!recurso) continue;
      if (alocacoes.some((a) => a.recurso_id === recurso.id && a.pi_id === piAtual.id)) return lider;
    }
    return null;
  }, [piAtual, usuarios, recursos, alocacoes]);
  const naoSouOResponsavel = liderResponsavel && usuario && liderResponsavel.id !== usuario.id;

  const [statusPorEtapa, setStatusPorEtapa] = useState({});
  const [ocorrencias, setOcorrencias] = useState([]);
  const [novaCategoria, setNovaCategoria] = useState(null);
  const [novaDesc, setNovaDesc] = useState("");
  const [enviado, setEnviado] = useState(false);

  // ---- Minhas Horas de Hoje ----
  const meuRecurso = recursos.find((r) => r.usuario_id === usuario?.id);
  const idsPisDoUsuario = meuRecurso ? alocacoes.filter((a) => a.recurso_id === meuRecurso.id).map((a) => a.pi_id) : [];
  const meusPis = pis.filter((p) => [...new Set(idsPisDoUsuario)].includes(p.id));
  const [pisTrabalhados, setPisTrabalhados] = useState([]);
  const [horaInicio, setHoraInicio] = useState("07:00");
  const [horaFim, setHoraFim] = useState("");
  const [horasEnviadas, setHorasEnviadas] = useState(false);

  const togglePiTrabalhado = (id) => setPisTrabalhados((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const horasTotaisDia = horaInicio && horaFim
    ? Math.max(0, (new Date(`2000-01-01T${horaFim}`) - new Date(`2000-01-01T${horaInicio}`)) / 3600000)
    : 0;

  const enviarHoras = async () => {
    if (pisTrabalhados.length === 0 || horasTotaisDia <= 0) return;
    const horasPorPi = horasTotaisDia / pisTrabalhados.length;
    await supabase.from("apontamentos_horas").insert(
      pisTrabalhados.map((pid) => ({
        usuario_id: usuario.id, pi_id: pid, horas_totais: horasPorPi, status: "pendente",
      }))
    );
    await registrarLog(usuario, "Enviou horas do dia", `${pisTrabalhados.length} PI(s) — ${horasTotaisDia.toFixed(1)}h total`);
    setHorasEnviadas(true);
  };

  const adicionarOcorrencia = () => {
    if (!novaCategoria) return;
    setOcorrencias((p) => [...p, { categoria: novaCategoria, descricao: novaDesc }]);
    setNovaCategoria(null); setNovaDesc("");
  };

  const enviarRdo = async () => {
    if (!piAtual) return;
    const atividades = etapasDoPi.map((e) => ({
      etapa_id: e.id, nome: e.nome,
      status: statusPorEtapa[e.id]?.status ?? e.status,
      percentual: statusPorEtapa[e.id]?.percentual ?? e.percentual ?? 0,
    }));
    const { data: rdo, error } = await supabase.from("rdos").insert({
      pi_id: piAtual.id, lider_id: usuario.id, atividades, status: "pendente",
    }).select().single();
    if (error) return;

    if (ocorrencias.length > 0) {
      await supabase.from("ocorrencias").insert(
        ocorrencias.map((o) => ({ pi_id: piAtual.id, rdo_id: rdo.id, categoria: o.categoria, descricao: o.descricao, registrado_por: usuario.id }))
      );
    }

    await registrarLog(usuario, "Registrou RDO (desktop)", `${usuario.nome} — ${piAtual.codigo}${naoSouOResponsavel ? ` · aviso a ${liderResponsavel.nome}` : ""}`);
    if (naoSouOResponsavel) {
      await registrarLog(usuario, "Aviso ao líder responsável", `${liderResponsavel.nome} — RDO de ${piAtual.codigo} preenchido por ${usuario.nome}`);
    }
    setEnviado(true); setStatusPorEtapa({}); setOcorrencias([]);
  };

  return (
    <div className="p-6">
      <h1 className="font-head font-bold text-xl mb-1">RDO</h1>
      <p className="text-sm text-muted mb-4">Preencha o RDO de qualquer PI.</p>

      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <select value={piAtual?.id || ""} onChange={(e) => { setPiId(e.target.value); setEnviado(false); }} className="px-3 py-2 rounded-lg border border-line text-sm">
          {pis.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.cliente}</option>)}
        </select>
        <span className="text-xs font-mono text-muteddim">
          Líder responsável: {liderResponsavel ? liderResponsavel.nome : "não identificado"}
        </span>
      </div>

      {naoSouOResponsavel && (
        <div className="text-xs text-amber bg-amber/10 rounded-lg px-3 py-2 mb-4">
          ⚠ Você não é o líder responsável por este PI. <strong>{liderResponsavel.nome}</strong> receberá um aviso deste preenchimento.
        </div>
      )}
      {enviado && (
        <div className="text-xs text-green bg-green/10 rounded-lg px-3 py-2 mb-4 font-semibold">
          ✓ RDO enviado — pendente de validação em Aprovações.
        </div>
      )}

      <div className="mb-6">
        <div className="text-[11px] font-mono text-muteddim mb-2">ATIVIDADES</div>
        <div className="flex flex-col gap-2">
          {etapasDoPi.map((e) => (
            <div key={e.id} className="flex items-center gap-2 p-2 bg-panel rounded-lg text-sm">
              <span className="flex-1">{e.nome}</span>
              <select
                value={statusPorEtapa[e.id]?.status ?? e.status}
                onChange={(ev) => setStatusPorEtapa((p) => ({ ...p, [e.id]: { ...p[e.id], status: ev.target.value } }))}
                className="px-2 py-1 rounded-lg border border-line text-xs">
                {STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {(statusPorEtapa[e.id]?.status ?? e.status) === "em_andamento" && (
                <input type="number" min="0" max="100"
                  value={statusPorEtapa[e.id]?.percentual ?? e.percentual ?? 0}
                  onChange={(ev) => setStatusPorEtapa((p) => ({ ...p, [e.id]: { ...p[e.id], percentual: Number(ev.target.value) } }))}
                  className="w-16 px-2 py-1 rounded-lg border border-line text-xs" />
              )}
            </div>
          ))}
          {etapasDoPi.length === 0 && <div className="text-xs text-muteddim">Este PI não tem macro-etapas cadastradas.</div>}
        </div>
      </div>

      <div className="mb-6">
        <div className="text-[11px] font-mono text-muteddim mb-2">OCORRÊNCIAS</div>
        {ocorrencias.map((o, i) => (
          <div key={i} className="text-xs p-2 bg-panel rounded-lg mb-1">
            <span className="text-amber font-semibold">{o.categoria}</span>{o.descricao ? ` — ${o.descricao}` : ""}
          </div>
        ))}
        <div className="flex gap-2 flex-wrap items-center">
          {CATEGORIAS_OCORRENCIA.map((c) => (
            <button key={c} type="button" onClick={() => setNovaCategoria(c)}
              className={`px-2.5 py-1 rounded-full text-xs border ${novaCategoria === c ? "bg-amber text-white border-amber" : "border-line text-muted"}`}>{c}</button>
          ))}
          <input placeholder="Descrição (opcional)" value={novaDesc} onChange={(e) => setNovaDesc(e.target.value)}
            className="flex-1 min-w-[160px] px-2 py-1.5 rounded-lg border border-line text-xs" />
          <button onClick={adicionarOcorrencia} disabled={!novaCategoria} className="px-3 py-1.5 rounded-lg bg-amber text-white text-xs font-semibold disabled:opacity-50">+ Adicionar</button>
        </div>
      </div>

      {editavel ? (
        <button onClick={enviarRdo} disabled={!piAtual} className="px-5 py-2.5 rounded-lg bg-green text-white text-sm font-semibold">✓ Enviar RDO</button>
      ) : (
        <div className="text-xs text-muteddim font-mono">👁 Modo visualização — sem permissão para preencher RDO</div>
      )}

      {editavel && meusPis.length > 0 && (
        <div className="mt-10 pt-6 border-t border-line">
          <div className="text-[11px] font-mono text-muteddim mb-2">MINHAS HORAS DE HOJE</div>
          {!horasEnviadas ? (
            <div className="bg-panel rounded-lg p-3 flex flex-col gap-3 max-w-md">
              <div>
                <div className="text-[10px] text-muteddim mb-1">EM QUAIS PIS VOCÊ TRABALHOU HOJE?</div>
                <div className="flex flex-wrap gap-2">
                  {meusPis.map((p) => (
                    <button key={p.id} type="button" onClick={() => togglePiTrabalhado(p.id)}
                      className={`px-2.5 py-1 rounded-full text-xs border ${pisTrabalhados.includes(p.id) ? "bg-cyan text-white border-cyan" : "border-line text-muted"}`}>
                      {p.codigo}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <div className="text-[10px] text-muteddim mb-1">INÍCIO</div>
                  <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-line text-xs" />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] text-muteddim mb-1">FIM</div>
                  <input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-line text-xs" />
                </div>
              </div>
              {horasTotaisDia > 0 && pisTrabalhados.length > 0 && (
                <div className="text-xs text-muted">{horasTotaisDia.toFixed(1)}h ÷ {pisTrabalhados.length} PI(s) = {(horasTotaisDia / pisTrabalhados.length).toFixed(1)}h cada</div>
              )}
              <button onClick={enviarHoras} disabled={pisTrabalhados.length === 0 || horasTotaisDia <= 0}
                className="py-1.5 rounded-lg bg-amber text-white text-xs font-semibold disabled:opacity-50">
                Enviar horas do dia
              </button>
            </div>
          ) : (
            <div className="bg-amber/10 rounded-lg p-3 text-xs text-amber font-semibold max-w-md">
              Enviado — pendente de validação.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
