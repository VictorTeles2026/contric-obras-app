"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTabela } from "../../lib/dados";
import { useAuth } from "../../lib/AuthContext";
import { useMinhasPis, agruparPorCliente } from "../../lib/minhasPis";
import { NAV_LIDER } from "../../lib/nav";
import { hojeISO, saudacao } from "../../lib/datas";
import MobileShell from "../../components/MobileShell";
import { Esqueleto, EstadoVazio } from "../../components/ui";
import Icone from "../../components/Icone";
import { EditorRdo } from "../../components/Editores";
import CartaoOcorrencia from "../../components/CartaoOcorrencia";
import { supabase } from "../../lib/supabase";
import { linkTemporario } from "../../lib/pdfRdo";
import { formatarData } from "../../lib/datas";
import { useToast } from "../../lib/Toast";

const STATUS_ABERTOS = ["pendente_coordenador", "pendente_gerente"];

export default function LiderHomePage() {
  const { usuario } = useAuth();
  const { meusPis, carregando } = useMinhasPis(usuario);
  const { dados: etapas } = useTabela("etapas");
  const { dados: meusRdos, recarregar: recarregarRdos } = useTabela("rdos", { filtro: [["lider_id", usuario?.id]] });
  const { avisar } = useToast();
  // ocorrências da equipe (fora de RDO) nas minhas obras, aguardando a minha aprovação
  const { dados: ocorrenciasPendentes, recarregar: recarregarOcorrencias } = useTabela("ocorrencias", { filtro: [["status", "pendente"]], order: { coluna: "created_at" } });
  const { dados: pessoas } = useTabela("usuarios");
  const paraAprovar = ocorrenciasPendentes.filter((o) => !o.rdo_id && o.registrado_por !== usuario?.id && meusPis.some((p) => p.id === o.pi_id));
  const [editando, setEditando] = useState(null); // { rdo, ocorrencias }
  const abrirEdicao = async (rdo) => {
    const { data } = await supabase.from("ocorrencias").select("*").eq("rdo_id", rdo.id);
    setEditando({ rdo, ocorrencias: data || [] });
  };
  const abrirPdf = async (rdo) => {
    // abre a aba antes do "await" — senão o navegador do celular bloqueia como pop-up
    const aba = window.open("", "_blank");
    try {
      const url = await linkTemporario(rdo.pdf_path);
      if (aba) aba.location.href = url; else window.location.href = url;
    } catch (e) {
      aba?.close();
      avisar(`Não foi possível abrir o PDF: ${e.message}`, "erro");
    }
  };
  const rdosRecentes = [...meusRdos].sort((a, b) => (b.data || "").localeCompare(a.data || "") || (b.created_at || "").localeCompare(a.created_at || "")).slice(0, 8);
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

            {/* ocorrências da equipe para aprovar */}
            {paraAprovar.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="titulo-secao flex items-center gap-2">Ocorrências para aprovar <span className="selo bg-amber text-white">{paraAprovar.length}</span></div>
                {paraAprovar.map((o) => (
                  <CartaoOcorrencia key={`${o.id}-${o.editado_em || ""}`} oc={o} pi={meusPis.find((p) => p.id === o.pi_id)} pis={meusPis}
                    pessoa={pessoas.find((u) => u.id === o.registrado_por)} compacto onMudou={recarregarOcorrencias} />
                ))}
              </div>
            )}

            {/* meus RDOs */}
            {rdosRecentes.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="titulo-secao">Meus RDOs</div>
                {rdosRecentes.map((r) => {
                  const pi = meusPis.find((p) => p.id === r.pi_id);
                  const cor = { pendente: "bg-amber/10 text-amber", aprovado: "bg-green/10 text-green", rejeitado: "bg-red/10 text-red" }[r.status] || "bg-panel text-muted";
                  const rotulo = { pendente: "Aguardando aprovação", aprovado: "Aprovado", rejeitado: "Reprovado" }[r.status] || r.status;
                  return (
                    <div key={r.id} className="cartao p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold">{pi?.codigo || "Obra"} <span className="text-muted font-normal">· {formatarData(r.data)}</span></div>
                          <div className="text-xs text-muted truncate">{pi?.cliente}</div>
                        </div>
                        <span className={`selo shrink-0 ${cor}`}>{rotulo}</span>
                      </div>
                      {r.status === "rejeitado" && r.motivo_rejeicao && (
                        <div className="text-sm text-red bg-red/5 rounded-lg px-3 py-2 mt-2">Motivo: {r.motivo_rejeicao}</div>
                      )}
                      {(r.status === "pendente" || r.pdf_path) && (
                        <div className="flex gap-2 mt-3">
                          {r.status === "pendente" && (
                            <button onClick={() => abrirEdicao(r)} className="btn btn-contorno btn-sm flex-1"><Icone nome="editar" className="w-4 h-4" /> Editar</button>
                          )}
                          {r.pdf_path && (
                            <button onClick={() => abrirPdf(r)} className="btn btn-contorno btn-sm flex-1"><Icone nome="pdf" className="w-4 h-4" /> Ver PDF</button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

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
      {editando && (
        <EditorRdo rdo={editando.rdo} pi={meusPis.find((p) => p.id === editando.rdo.pi_id)} pis={meusPis}
          ocorrenciasOriginais={editando.ocorrencias} comoAprovador={false}
          onFechar={() => setEditando(null)} onSalvo={recarregarRdos} />
      )}
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
