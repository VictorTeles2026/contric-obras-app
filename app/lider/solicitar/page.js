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
const CAMPOS = [["data_prevista_inicio", "Data de início"], ["data_prevista_fim", "Data de fim"], ["nome", "Nome da etapa"], ["outro", "Outro"]];
const STATUS_LABEL = {
  pendente_coordenador: "Aguardando Coordenador", rejeitada_coordenador: "Rejeitada (Coordenador)",
  pendente_gerente: "Aguardando Gerente", rejeitada_gerente: "Rejeitada (Gerente)", aprovada: "Aprovada",
};

export default function LiderSolicitarPage() {
  const { usuario } = useAuth();
  const meusPis = useMinhasPis(usuario);
  const { dados: etapas } = useTabela("etapas");
  const { dados: minhasSolicitacoes, recarregar } = useTabela("solicitacoes_alteracao_cronograma", {
    order: { coluna: "id" }, filtro: (q) => q.eq("solicitado_por", usuario?.id),
  });

  const [etapaId, setEtapaId] = useState("");
  const [campo, setCampo] = useState("data_prevista_fim");
  const [valorProposto, setValorProposto] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);

  const minhasEtapas = etapas.filter((e) => meusPis.some((p) => p.id === e.pi_id));
  const etapaSelecionada = etapas.find((e) => e.id === etapaId);
  const podeEnviar = etapaId && valorProposto.trim() && justificativa.trim();

  const enviar = async () => {
    if (!podeEnviar) return;
    setEnviando(true);
    await supabase.from("solicitacoes_alteracao_cronograma").insert({
      etapa_id: etapaId, solicitado_por: usuario.id, campo_alterado: campo,
      valor_atual: etapaSelecionada?.[campo] || null, valor_proposto: valorProposto.trim(),
      justificativa: justificativa.trim(), status: "pendente_coordenador",
    });
    await registrarLog(usuario, "Solicitou alteração de cronograma", `${etapaSelecionada?.nome} — ${campo}`);
    setEtapaId(""); setValorProposto(""); setJustificativa("");
    setEnviando(false); setOk(true); recarregar();
    setTimeout(() => setOk(false), 3000);
  };

  return (
    <MobileShell nav={NAV}>
      <div className="p-4 flex flex-col gap-4">
        <div className="font-head font-bold text-lg">Solicitar alteração</div>

        {ok && <div className="text-xs text-green bg-green/10 rounded-lg px-3 py-2 font-semibold">✓ Solicitação enviada para o Coordenador.</div>}

        <div className="bg-white rounded-xl border border-line p-3 flex flex-col gap-3">
          <div>
            <div className="text-xs text-muteddim mb-1">Etapa</div>
            <select value={etapaId} onChange={(e) => setEtapaId(e.target.value)} className="w-full px-2 py-2 rounded-lg border border-line text-sm">
              <option value="">Selecione...</option>
              {minhasEtapas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </div>
          <div>
            <div className="text-xs text-muteddim mb-1">O que quer mudar</div>
            <select value={campo} onChange={(e) => setCampo(e.target.value)} className="w-full px-2 py-2 rounded-lg border border-line text-sm">
              {CAMPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <div className="text-xs text-muteddim mb-1">Novo valor proposto</div>
            <input value={valorProposto} onChange={(e) => setValorProposto(e.target.value)} className="w-full px-2 py-2 rounded-lg border border-line text-sm" />
          </div>
          <div>
            <div className="text-xs text-muteddim mb-1">Justificativa</div>
            <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} rows={3} className="w-full px-2 py-2 rounded-lg border border-line text-sm" />
          </div>
          <button onClick={enviar} disabled={!podeEnviar || enviando} className="py-2.5 rounded-lg bg-cyan text-white text-sm font-semibold disabled:opacity-50">
            {enviando ? "Enviando..." : "Enviar solicitação"}
          </button>
        </div>

        <div className="text-xs font-mono text-muteddim mt-2">MINHAS SOLICITAÇÕES</div>
        <div className="flex flex-col gap-2">
          {minhasSolicitacoes.map((s) => (
            <div key={s.id} className="bg-white rounded-xl border border-line p-3 text-xs">
              <div className="font-semibold">{s.campo_alterado}: {s.valor_atual || "—"} → {s.valor_proposto}</div>
              <div className="text-muteddim mt-1">{STATUS_LABEL[s.status] || s.status}</div>
            </div>
          ))}
          {minhasSolicitacoes.length === 0 && <div className="text-xs text-muteddim">Nenhuma solicitação ainda.</div>}
        </div>
      </div>
    </MobileShell>
  );
}
