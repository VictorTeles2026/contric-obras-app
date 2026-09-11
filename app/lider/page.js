"use client";

import { useTabela } from "../../lib/dados";
import { useAuth } from "../../lib/AuthContext";
import MobileShell from "../../components/MobileShell";

const NAV = [
  { href: "/lider", label: "Início", icone: "🏠" },
  { href: "/lider/rdo", label: "RDO", icone: "📋" },
  { href: "/lider/horas", label: "Horas", icone: "⏱" },
  { href: "/lider/cronograma", label: "Obras", icone: "📅" },
  { href: "/lider/solicitar", label: "Solicitar", icone: "✎" },
];

export function useMinhasPis(usuario) {
  const { dados: recursos } = useTabela("recursos");
  const { dados: alocacoes } = useTabela("alocacoes_recurso");
  const { dados: pis } = useTabela("pis");
  const meuRecurso = recursos.find((r) => r.usuario_id === usuario?.id);
  const idsPis = meuRecurso ? [...new Set(alocacoes.filter((a) => a.recurso_id === meuRecurso.id).map((a) => a.pi_id))] : [];
  const meusPis = pis.filter((p) => idsPis.includes(p.id));
  return meusPis;
}

export default function LiderHomePage() {
  const { usuario } = useAuth();
  const meusPis = useMinhasPis(usuario);
  const { dados: etapas } = useTabela("etapas");
  const { dados: rdosTodos } = useTabela("rdos");
  const { dados: solicitacoes } = useTabela("solicitacoes_alteracao_cronograma");

  const piAtivo = meusPis[0];
  const etapasDoPiAtivo = piAtivo ? etapas.filter((e) => e.pi_id === piAtivo.id && !e.parent_etapa_id) : [];
  const pendentes = etapasDoPiAtivo.filter((e) => e.status !== "concluida").length;

  const hoje = new Date().toISOString().slice(0, 10);
  const jaEnviouRdoHoje = piAtivo && rdosTodos.some((r) => r.pi_id === piAtivo.id && r.lider_id === usuario?.id && r.data === hoje);
  const minhasSolicitacoesAbertas = solicitacoes.filter((s) => s.solicitado_por === usuario?.id && !["aprovada", "rejeitada_coordenador", "rejeitada_gerente"].includes(s.status)).length;

  return (
    <MobileShell nav={NAV}>
      <div className="p-5 flex flex-col gap-4">
        {!piAtivo && (
          <div className="bg-white rounded-xl border border-line p-5 text-base text-muteddim leading-relaxed">
            Você ainda não está alocado em nenhuma obra. Fale com o Coordenador ou Gerente.
          </div>
        )}

        {piAtivo && (
          <>
            <div className="bg-white rounded-xl border border-line p-5">
              <div className="text-xs font-mono text-cyan font-bold tracking-wide">{piAtivo.codigo}</div>
              <div className="font-head font-bold text-xl mt-0.5">{piAtivo.cliente}</div>
              <div className="text-sm text-muted mt-0.5">{piAtivo.projeto}</div>
              <div className="text-sm text-muteddim mt-2">{pendentes} atividade(s) em aberto</div>
            </div>

            {!jaEnviouRdoHoje && (
              <div className="bg-amber/10 border border-amber/30 rounded-xl p-4 text-sm text-amber font-semibold leading-relaxed">
                ⚠ Você ainda não enviou o RDO de hoje.
              </div>
            )}

            <a href="/lider/rdo" className="bg-cyan text-white rounded-xl p-5 font-head font-bold text-base flex items-center gap-4 active:opacity-80">
              <span className="text-2xl">📋</span> Fazer RDO de hoje
            </a>
            <a href="/lider/horas" className="bg-white border border-line rounded-xl p-5 font-head font-bold text-base flex items-center gap-4 active:opacity-70">
              <span className="text-2xl">⏱</span> Lançar minhas horas
            </a>
            <a href="/lider/cronograma" className="bg-white border border-line rounded-xl p-5 font-head font-bold text-base flex items-center gap-4 active:opacity-70">
              <span className="text-2xl">📅</span> Ver cronograma
            </a>
            <a href="/lider/solicitar" className="bg-white border border-line rounded-xl p-5 font-head font-bold text-base flex items-center gap-4 active:opacity-70">
              <span className="text-2xl">✎</span>
              <span className="flex-1">Solicitar alteração</span>
              {minhasSolicitacoesAbertas > 0 && <span className="text-xs font-mono text-amber shrink-0">{minhasSolicitacoesAbertas} em análise</span>}
            </a>
          </>
        )}
      </div>
    </MobileShell>
  );
}
