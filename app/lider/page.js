"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useTabela } from "../../lib/dados";
import { useAuth } from "../../lib/AuthContext";
import { useMinhasPis, agruparPorCliente } from "../../lib/minhasPis";
import { NAV_LIDER } from "../../lib/nav";
import { hojeISO, saudacao } from "../../lib/datas";
import MobileShell from "../../components/MobileShell";
import { Esqueleto, EstadoVazio } from "../../components/ui";
import Icone from "../../components/Icone";

const STATUS_ABERTOS = ["pendente_coordenador", "pendente_gerente"];

export default function LiderHomePage() {
  const { usuario } = useAuth();
  const { meusPis, carregando } = useMinhasPis(usuario);
  const { dados: etapas } = useTabela("etapas");
  const { dados: meusRdos } = useTabela("rdos", { filtro: [["lider_id", usuario?.id]] });
  const { dados: solicitacoes } = useTabela("solicitacoes_alteracao_cronograma", { filtro: [["solicitado_por", usuario?.id]] });

  const hoje = hojeISO();
  const solicitacoesAbertas = solicitacoes.filter((s) => STATUS_ABERTOS.includes(s.status)).length;
  const rdosRejeitados = meusRdos.filter((r) => r.status === "rejeitado" && r.data === hoje);
  const porCliente = useMemo(() => agruparPorCliente(meusPis), [meusPis]);
  const pisSemRdoHoje = meusPis.filter((pi) => !meusRdos.some((r) => r.pi_id === pi.id && r.data === hoje && r.status !== "rejeitado"));
  const dataBruta = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const dataExtenso = dataBruta.charAt(0).toUpperCase() + dataBruta.slice(1); // "Quinta-feira, 24 de setembro"

  return (
    <MobileShell nav={NAV_LIDER} perfis={["lider"]}>
      <div className="p-4 flex flex-col gap-5">
        <div className="pt-1">
          <div className="text-sm text-muted">{dataExtenso}</div>
          <div className="font-head font-bold text-2xl leading-tight">{saudacao()}, {usuario?.nome?.split(" ")[0]}!</div>
        </div>

        {carregando && <Esqueleto linhas={3} altura={84} />}

        {!carregando && meusPis.length === 0 && (
          <div className="cartao">
            <EstadoVazio icone="obra" titulo="Nenhuma obra ainda" texto="Você ainda não está alocado em nenhuma obra. Fale com o Coordenador ou Gerente." />
          </div>
        )}

        {!carregando && meusPis.length > 0 && (
          <>
            {/* status do dia */}
            {pisSemRdoHoje.length > 0 ? (
              <Link href="/lider/rdo" className="block rounded-2xl bg-gradient-to-br from-cyan to-[#0a6a86] text-white p-5 shadow-md active:scale-[0.99] transition-transform">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0"><Icone nome="rdo" className="w-6 h-6" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="font-head font-bold text-lg leading-tight">Fazer RDO de hoje</div>
                    <div className="text-sm text-white/80 mt-0.5 truncate">Pendente em: {pisSemRdoHoje.map((p) => p.codigo).join(", ")}</div>
                  </div>
                  <Icone nome="seta" className="w-5 h-5 mt-3 shrink-0" />
                </div>
              </Link>
            ) : (
              <div className="rounded-2xl bg-green/10 border border-green/25 p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green text-white flex items-center justify-center shrink-0"><Icone nome="aprovar" className="w-5 h-5" strokeWidth={2.4} /></div>
                <div>
                  <div className="font-semibold text-[#23793a]">RDO de hoje enviado</div>
                  <div className="text-sm text-muted">Todas as suas obras estão em dia.</div>
                </div>
              </div>
            )}

            {rdosRejeitados.length > 0 && (
              <Link href="/lider/rdo" className="rounded-xl bg-red/10 border border-red/30 p-4 text-sm text-red leading-relaxed">
                <strong>RDO rejeitado hoje</strong> — {rdosRejeitados[0].motivo_rejeicao || "veja o motivo com o coordenador"}. Toque para refazer.
              </Link>
            )}

            {/* ações rápidas */}
            <div className="grid grid-cols-2 gap-3">
              <AcaoRapida href="/lider/horas" icone="relogio" titulo="Lançar horas" cor="text-amber bg-amber/10" />
              <AcaoRapida href="/lider/cronograma" icone="calendario" titulo="Cronograma" cor="text-cyan bg-cyan/10" />
              <AcaoRapida href="/lider/solicitar" icone="editar" titulo="Solicitar alteração" cor="text-[#8E5CD9] bg-[#8E5CD9]/10"
                extra={solicitacoesAbertas > 0 ? `${solicitacoesAbertas} em análise` : null} />
              <AcaoRapida href="/lider/rdo" icone="rdo" titulo="Novo RDO" cor="text-green bg-green/10" />
            </div>

            {/* obras */}
            <div className="flex flex-col gap-4">
              <div className="titulo-secao">Minhas obras ({meusPis.length})</div>
              {porCliente.map(([cliente, pisDoCliente]) => (
                <div key={cliente} className="flex flex-col gap-2">
                  {porCliente.length > 1 && <div className="text-xs font-semibold text-muted">{cliente}</div>}
                  {pisDoCliente.map((pi) => {
                    const macros = etapas.filter((e) => e.pi_id === pi.id && !e.parent_etapa_id);
                    const concluidas = macros.filter((e) => e.status === "concluida").length;
                    const progresso = macros.length ? Math.round((concluidas / macros.length) * 100) : 0;
                    const temRdo = !pisSemRdoHoje.some((p) => p.id === pi.id);
                    return (
                      <Link key={pi.id} href="/lider/cronograma" className="cartao cartao-interativo p-4 block">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-mono text-cyan font-bold tracking-wide">{pi.codigo}</div>
                            <div className="font-head font-bold text-base mt-0.5 truncate">{pi.projeto || pi.cliente}</div>
                            {pi.projeto && <div className="text-sm text-muted truncate">{pi.cliente}</div>}
                          </div>
                          <span className={`selo shrink-0 ${temRdo ? "bg-green/10 text-green" : "bg-amber/10 text-amber"}`}>{temRdo ? "RDO ok" : "RDO pendente"}</span>
                        </div>
                        <div className="mt-3">
                          <div className="flex justify-between text-xs text-muted mb-1">
                            <span>{macros.length - concluidas} etapa(s) em aberto</span>
                            <span>{progresso}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-line overflow-hidden">
                            <div className="h-full bg-cyan rounded-full transition-all" style={{ width: `${progresso}%` }} />
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </MobileShell>
  );
}

function AcaoRapida({ href, icone, titulo, cor, extra }) {
  return (
    <Link href={href} className="cartao cartao-interativo p-4 flex flex-col gap-3 min-h-[104px]">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cor}`}><Icone nome={icone} className="w-5 h-5" /></div>
      <div>
        <div className="font-semibold text-[15px] leading-tight">{titulo}</div>
        {extra && <div className="text-xs text-amber font-semibold mt-0.5">{extra}</div>}
      </div>
    </Link>
  );
}
