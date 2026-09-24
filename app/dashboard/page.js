"use client";

import { useTabela } from "../../lib/dados";
import { useAuth } from "../../lib/AuthContext";
import PainelShell from "../../components/PainelShell";

function hojeISO() { return new Date().toISOString().slice(0, 10); }
function diasAte(iso) {
  if (!iso) return null;
  return Math.ceil((new Date(iso + "T00:00:00") - new Date(hojeISO() + "T00:00:00")) / 86400000);
}
function formatarValor(v) { return v === null || v === undefined ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`; }
function formatarPercentual(v) { return v === null || v === undefined ? "—" : `${v}%`; }
function formatarData(iso) { return iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "—"; }

export default function DashboardPage() {
  const { usuario } = useAuth();
  const { dados: pis, carregando: carregandoPis } = useTabela("pis", { order: { coluna: "created_at" } });
  const { dados: usuarios } = useTabela("usuarios");
  const { dados: logs } = useTabela("logs_auditoria");
  const { dados: etapas } = useTabela("etapas");

  // agrupa por PI: cada macro/sub-etapa com Medição marcada, exceto as já concluídas,
  // ordenada dentro do PI pela previsão de término mais próxima
  const gruposMedicoes = pis
    .map((pi) => {
      const itens = etapas
        .filter((e) => e.pi_id === pi.id && e.medicao && e.status !== "concluida")
        .sort((a, b) => (a.data_prevista_fim || "").localeCompare(b.data_prevista_fim || ""));
      return { pi, itens };
    })
    .filter((g) => g.itens.length > 0)
    .sort((a, b) => (a.itens[0].data_prevista_fim || "").localeCompare(b.itens[0].data_prevista_fim || ""));

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
        <div className="font-head font-bold text-sm mb-3">Medições</div>
        {gruposMedicoes.length === 0 && (
          <div className="text-sm text-muteddim">Nenhuma etapa marcada com Medição em aberto — isso é feito no Cronograma, em cada macro ou sub-etapa.</div>
        )}
        {gruposMedicoes.length > 0 && (
          <div className="flex flex-col gap-4">
            {gruposMedicoes.map(({ pi, itens }) => (
              <div key={pi.id}>
                <div className="text-xs font-mono text-cyan font-bold mb-1">{pi.codigo} — {pi.cliente}{pi.projeto ? ` — ${pi.projeto}` : ""}</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left border-b border-line">
                        <th className="py-2 pr-3 font-mono text-muteddim">Etapa</th>
                        <th className="py-2 pr-3 font-mono text-muteddim">% avanço</th>
                        <th className="py-2 pr-3 font-mono text-muteddim">% medição</th>
                        <th className="py-2 pr-3 font-mono text-muteddim">R$</th>
                        <th className="py-2 pr-3 font-mono text-muteddim">Previsão de término</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map((etapa) => {
                        const dias = diasAte(etapa.data_prevista_fim);
                        const vencida = dias !== null && dias < 0;
                        const proxima = dias !== null && dias >= 0 && dias <= 20;
                        const corTexto = vencida ? "text-red font-semibold" : proxima ? "text-amber font-semibold" : "";
                        return (
                          <tr key={etapa.id} className={`border-b border-line/60 ${corTexto}`}>
                            <td className="py-2 pr-3">{etapa.parent_etapa_id ? "· " : ""}{etapa.nome}</td>
                            <td className="py-2 pr-3">{formatarPercentual(etapa.percentual)}</td>
                            <td className="py-2 pr-3">{formatarPercentual(etapa.medicao_percentual)}</td>
                            <td className="py-2 pr-3">{formatarValor(etapa.medicao_valor)}</td>
                            <td className="py-2 pr-3">{formatarData(etapa.data_prevista_fim)}{vencida ? " — VENCIDA" : proxima ? ` — em ${dias}d` : ""}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-line p-4 mt-4">
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
