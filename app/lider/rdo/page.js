"use client";

import { useState } from "react";
import { useTabela, registrarLog } from "../../../lib/dados";
import { useAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import MobileShell from "../../../components/MobileShell";
import { useMinhasPis } from "../page";

const NAV = [
  { href: "/lider", label: "Início", icone: "🏠" },
  { href: "/lider/rdo", label: "RDO", icone: "📋" },
  { href: "/lider/horas", label: "Horas", icone: "⏱" },
  { href: "/lider/cronograma", label: "Obras", icone: "📅" },
  { href: "/lider/solicitar", label: "Solicitar", icone: "✎" },
];
const STATUS = [["nao_iniciada", "Não iniciada"], ["em_andamento", "Em andamento"], ["concluida", "Concluída"], ["parada", "Parada"]];
const CATEGORIAS = ["Atraso", "Retrabalho", "Reclamação do cliente", "Prejuízo", "Outro"];

export default function LiderRdoPage() {
  const { usuario } = useAuth();
  const meusPis = useMinhasPis(usuario);
  const piAtivo = meusPis[0];
  const { dados: etapas } = useTabela("etapas");
  const etapasDoPi = piAtivo ? etapas.filter((e) => e.pi_id === piAtivo.id && !e.parent_etapa_id) : [];

  const [passo, setPasso] = useState(1);
  const [statusPorEtapa, setStatusPorEtapa] = useState({});
  const [ocorrencias, setOcorrencias] = useState([]);
  const [novaCategoria, setNovaCategoria] = useState(null);
  const [novaDesc, setNovaDesc] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const adicionarOcorrencia = () => {
    if (!novaCategoria) return;
    setOcorrencias((p) => [...p, { categoria: novaCategoria, descricao: novaDesc }]);
    setNovaCategoria(null); setNovaDesc("");
  };

  const enviar = async () => {
    if (!piAtivo) return;
    setEnviando(true);
    const atividades = etapasDoPi.map((e) => ({
      etapa_id: e.id, nome: e.nome,
      status: statusPorEtapa[e.id]?.status ?? e.status,
      percentual: statusPorEtapa[e.id]?.percentual ?? e.percentual ?? 0,
    }));
    const { data: rdo, error } = await supabase.from("rdos").insert({ pi_id: piAtivo.id, lider_id: usuario.id, atividades, status: "pendente" }).select().single();
    if (!error) {
      if (ocorrencias.length > 0) {
        await supabase.from("ocorrencias").insert(ocorrencias.map((o) => ({ pi_id: piAtivo.id, rdo_id: rdo.id, categoria: o.categoria, descricao: o.descricao, registrado_por: usuario.id })));
      }
      await registrarLog(usuario, "Registrou RDO", `${usuario.nome} — ${piAtivo.codigo}`);
      setEnviado(true);
    }
    setEnviando(false);
  };

  if (!piAtivo) {
    return <MobileShell nav={NAV}><div className="p-4 text-sm text-muteddim">Você não está alocado em nenhuma obra.</div></MobileShell>;
  }

  if (enviado) {
    return (
      <MobileShell nav={NAV}>
        <div className="p-6 flex flex-col items-center text-center gap-3 mt-10">
          <div className="text-4xl">✓</div>
          <div className="font-head font-bold text-lg">RDO enviado</div>
          <p className="text-sm text-muted">Pendente de validação pelo Coordenador ou Gerente.</p>
          <a href="/lider" className="mt-4 px-5 py-2.5 rounded-lg bg-cyan text-white text-sm font-semibold">Voltar ao início</a>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell nav={NAV}>
      <div className="p-4">
        <div className="text-[10px] font-mono text-cyan font-bold">{piAtivo.codigo}</div>
        <div className="font-head font-bold text-lg mb-3">{piAtivo.cliente}</div>

        <div className="flex gap-1 mb-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`flex-1 h-1.5 rounded-full ${passo >= n ? "bg-cyan" : "bg-line"}`} />
          ))}
        </div>

        {passo === 1 && (
          <div className="flex flex-col gap-3">
            <div className="text-xs font-mono text-muteddim">PASSO 1 — ATIVIDADES</div>
            {etapasDoPi.map((e) => (
              <div key={e.id} className="bg-white rounded-xl border border-line p-3">
                <div className="font-semibold text-sm mb-2">{e.nome}</div>
                <select value={statusPorEtapa[e.id]?.status ?? e.status}
                  onChange={(ev) => setStatusPorEtapa((p) => ({ ...p, [e.id]: { ...p[e.id], status: ev.target.value } }))}
                  className="w-full px-2 py-2 rounded-lg border border-line text-sm mb-2">
                  {STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                {(statusPorEtapa[e.id]?.status ?? e.status) === "em_andamento" && (
                  <input type="number" min="0" max="100" value={statusPorEtapa[e.id]?.percentual ?? e.percentual ?? 0}
                    onChange={(ev) => setStatusPorEtapa((p) => ({ ...p, [e.id]: { ...p[e.id], percentual: Number(ev.target.value) } }))}
                    className="w-full px-2 py-2 rounded-lg border border-line text-sm" placeholder="% concluído" />
                )}
              </div>
            ))}
            {etapasDoPi.length === 0 && <div className="text-xs text-muteddim">Nenhuma macro-etapa cadastrada neste PI.</div>}
            <button onClick={() => setPasso(2)} className="mt-2 py-3 rounded-xl bg-cyan text-white font-semibold text-sm">Próximo</button>
          </div>
        )}

        {passo === 2 && (
          <div className="flex flex-col gap-3">
            <div className="text-xs font-mono text-muteddim">PASSO 2 — OCORRÊNCIAS</div>
            {ocorrencias.map((o, i) => (
              <div key={i} className="bg-white rounded-xl border border-line p-3 text-sm">
                <span className="text-amber font-semibold">{o.categoria}</span>{o.descricao ? ` — ${o.descricao}` : ""}
              </div>
            ))}
            <div className="bg-white rounded-xl border border-line p-3">
              <div className="flex flex-wrap gap-2 mb-2">
                {CATEGORIAS.map((c) => (
                  <button key={c} type="button" onClick={() => setNovaCategoria(c)}
                    className={`px-3 py-1.5 rounded-full text-xs border ${novaCategoria === c ? "bg-amber text-white border-amber" : "border-line text-muted"}`}>{c}</button>
                ))}
              </div>
              <input placeholder="Descrição (opcional)" value={novaDesc} onChange={(e) => setNovaDesc(e.target.value)}
                className="w-full px-2 py-2 rounded-lg border border-line text-sm mb-2" />
              <button onClick={adicionarOcorrencia} disabled={!novaCategoria} className="w-full py-2 rounded-lg bg-amber text-white text-xs font-semibold disabled:opacity-50">+ Adicionar ocorrência</button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPasso(1)} className="flex-1 py-3 rounded-xl border border-line text-muted font-semibold text-sm">Voltar</button>
              <button onClick={() => setPasso(3)} className="flex-1 py-3 rounded-xl bg-cyan text-white font-semibold text-sm">Próximo</button>
            </div>
          </div>
        )}

        {passo === 3 && (
          <div className="flex flex-col gap-3">
            <div className="text-xs font-mono text-muteddim">PASSO 3 — CONFERIR E ENVIAR</div>
            <div className="bg-white rounded-xl border border-line p-3 text-sm">
              <div className="font-semibold mb-1">{etapasDoPi.length} atividade(s)</div>
              <div className="text-muteddim text-xs">{ocorrencias.length} ocorrência(s) registrada(s)</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPasso(2)} className="flex-1 py-3 rounded-xl border border-line text-muted font-semibold text-sm">Voltar</button>
              <button onClick={enviar} disabled={enviando} className="flex-1 py-3 rounded-xl bg-green text-white font-semibold text-sm disabled:opacity-60">
                {enviando ? "Enviando..." : "✓ Enviar RDO"}
              </button>
            </div>
          </div>
        )}
      </div>
    </MobileShell>
  );
}
