"use client";

import { useTabela } from "../../lib/dados";
import { useAuth } from "../../lib/AuthContext";
import PainelShell from "../../components/PainelShell";

export default function DashboardPage() {
  const { usuario } = useAuth();
  const { dados: pis, carregando: carregandoPis } = useTabela("pis", { order: { coluna: "created_at" } });
  const { dados: usuarios } = useTabela("usuarios");
  const { dados: logs } = useTabela("logs_auditoria", { order: { coluna: "created_at" } });

  return (
    <PainelShell>
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-head font-bold text-xl">Visão Geral</h1>
          <p className="text-sm text-muted">Olá, {usuario?.nome?.split(" ")[0]}.</p>
        </div>
        <a href="/cronograma" className="px-4 py-2 rounded-lg bg-navy text-white text-sm font-semibold">
          + Novo PI
        </a>
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
