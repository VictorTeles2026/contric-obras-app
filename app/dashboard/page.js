"use client";

import { useTabela } from "../../lib/dados";
import { useAuth } from "../../lib/AuthContext";
import PainelShell from "../../components/PainelShell";

export default function DashboardPage() {
  const { usuario } = useAuth();
  const { dados: pis, carregando: carregandoPis } = useTabela("pis", { order: { coluna: "created_at" } });
  const { dados: usuarios } = useTabela("usuarios");
  const { dados: logs } = useTabela("logs_auditoria", { order: { coluna: "created_at" } });
  const { dados: etapas } = useTabela("etapas");

  const medicoes = etapas
    .filter((e) => e.medicao)
    .map((e) => ({ etapa: e, pi: pis.find((p) => p.id === e.pi_id) }))
    .filter((m) => m.pi)
    .sort((a, b) => (a.etapa.data_prevista_fim || "").localeCompare(b.etapa.data_prevista_fim || ""));

  const formatarValor = (v) => v === null || v === undefined ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  const formatarPercentual = (v) => v === null || v === undefined ? "—" : `${v}%`;
  const formatarData = (iso) => iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "—";

  return (
    <PainelShell>
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-head font-bold text-xl">Visão Geral</h1>
          <p className="text-sm text-muted">Olá, {usuario?.nome?.split(" ")[0]}.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Card titulo="PIs ativos" valor={pis.length} />
        <Card titulo="Equipe" valor={usuarios.length} />
        <Card titulo="Eventos recentes" valor={logs.length} />
      </div>

      <div className="bg-white rounded-xl border border-line p-4">
        <div className="font-head font-bold text-sm mb-3">PIs</div>
        {carregandoPis && <div className="text-sm text-muted">Carregando...</div>}
        {!carregandoPis && pis.length === 0 && (
          <div className="text-sm text-muteddim">Nenhum PI cadastrado ainda. Vá em Cronograma para criar o primeiro.</div>
        )}
        <div className="flex flex-col gap-2">
          {pis.map((pi) => (
            <a key={pi.id} href={`/cronograma?pi=${pi.id}`} className="flex items-center justify-between p-3 rounded-lg bg-panel hover:bg-line/50">
              <div>
                <div className="font-semibold text-sm">{pi.codigo} — {pi.cliente}</div>
                <div className="text-xs text-muted">{pi.projeto}</div>
              </div>
              <span className="text-xs font-mono text-cyan">{pi.status}</span>
            </a>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-line p-4 mt-4">
        <div className="font-head font-bold text-sm mb-3">Medições</div>
        {medicoes.length === 0 && (
          <div className="text-sm text-muteddim">Nenhuma etapa marcada com Medição ainda — isso é feito no Cronograma, em cada macro ou sub-etapa.</div>
        )}
        {medicoes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left border-b border-line">
                  <th className="py-2 pr-3 font-mono text-muteddim">PI</th>
                  <th className="py-2 pr-3 font-mono text-muteddim">Etapa</th>
                  <th className="py-2 pr-3 font-mono text-muteddim">%</th>
                  <th className="py-2 pr-3 font-mono text-muteddim">R$</th>
                  <th className="py-2 pr-3 font-mono text-muteddim">Previsão de término</th>
                </tr>
              </thead>
              <tbody>
                {medicoes.map(({ etapa, pi }) => (
                  <tr key={etapa.id} className="border-b border-line/60">
                    <td className="py-2 pr-3 font-mono text-cyan font-bold">{pi.codigo}</td>
                    <td className="py-2 pr-3">{etapa.parent_etapa_id ? "· " : ""}{etapa.nome}</td>
                    <td className="py-2 pr-3">{formatarPercentual(etapa.medicao_percentual)}</td>
                    <td className="py-2 pr-3">{formatarValor(etapa.medicao_valor)}</td>
                    <td className="py-2 pr-3">{formatarData(etapa.data_prevista_fim)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-line p-4 mt-4">
        <div className="font-head font-bold text-sm mb-3">Atividade recente</div>
        <div className="flex flex-col gap-2">
          {logs.slice(0, 8).map((l) => (
            <div key={l.id} className="text-xs flex gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan mt-1.5 shrink-0" />
              <span><strong>{l.usuario_nome}</strong> — {l.acao} <span className="text-muteddim">{l.detalhe}</span></span>
            </div>
          ))}
          {logs.length === 0 && <div className="text-xs text-muteddim">Nenhuma atividade ainda.</div>}
        </div>
      </div>
    </div>
    </PainelShell>
  );
}

function Card({ titulo, valor }) {
  return (
    <div className="bg-white rounded-xl border border-line p-4">
      <div className="text-[11px] font-mono text-muteddim mb-1">{titulo.toUpperCase()}</div>
      <div className="text-2xl font-bold font-head">{valor}</div>
    </div>
  );
}
