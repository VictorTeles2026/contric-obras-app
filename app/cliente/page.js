"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import { rotaInicialPara } from "../../lib/rotas";
import { tsLocal, formatarData, formatarDataHora, diasAte } from "../../lib/datas";
import { STATUS_ETAPA, etapasEmArvore } from "../../lib/constantes";
import AlterarSenha from "../../components/AlterarSenha";
import { Spinner } from "../../components/ui";
import Icone from "../../components/Icone";

const STATUS_PI = { ativo: "Em andamento", pausado: "Pausada", concluido: "Concluída", cancelado: "Cancelada" };

// Portal "Acesso Clientes Contric": só mostra o que foi liberado (dados vêm do servidor).
export default function PortalCliente() {
  const { sessao, usuario, carregando, sair } = useAuth();
  const router = useRouter();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [obraId, setObraId] = useState(null);

  useEffect(() => {
    if (carregando) return;
    if (!sessao) { router.replace("/acesso-clientes"); return; }
    if (usuario && usuario.perfil !== "cliente") router.replace(rotaInicialPara(usuario));
  }, [carregando, sessao, usuario, router]);

  const carregar = async () => {
    const { data: s } = await supabase.auth.getSession();
    const r = await fetch("/api/cliente", { headers: { Authorization: `Bearer ${s.session?.access_token}` } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErro(j.error || "Não foi possível carregar."); return; }
    setDados(j);
    setObraId((atual) => atual || j.obras?.[0]?.pi.id || null);
  };
  useEffect(() => { if (usuario?.perfil === "cliente") carregar(); }, [usuario?.perfil]);

  const obra = dados?.obras?.find((o) => o.pi.id === obraId);

  if (carregando || !usuario || usuario.perfil !== "cliente") {
    return <div className="min-h-[100dvh] bg-zinc-900 flex items-center justify-center text-zinc-400"><Spinner className="w-6 h-6" /></div>;
  }

  return (
    <div className="min-h-[100dvh] bg-zinc-100 text-zinc-900">
      <header className="sticky top-0 z-30 bg-zinc-900 text-zinc-100 shadow-lg" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-zinc-100 text-zinc-900 flex items-center justify-center font-head font-bold shrink-0">C</div>
            <div className="min-w-0">
              <div className="font-head font-bold leading-tight truncate">Acesso Clientes Contric</div>
              <div className="text-xs text-zinc-400 truncate">{usuario.nome}{usuario.empresa ? ` · ${usuario.empresa}` : ""}</div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setTrocandoSenha(true)} className="p-2.5 rounded-lg text-zinc-300 hover:bg-white/10" title="Minha senha" aria-label="Minha senha"><Icone nome="chave" className="w-5 h-5" /></button>
            <button onClick={sair} className="p-2.5 rounded-lg text-zinc-300 hover:bg-white/10" title="Sair" aria-label="Sair"><Icone nome="sair" className="w-5 h-5" /></button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 md:p-6" style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}>
        {erro && <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 p-4 text-sm mb-4">{erro}</div>}
        {!dados && !erro && <div className="flex justify-center py-16"><Spinner className="w-7 h-7 text-zinc-500" /></div>}
        {dados && dados.obras.length === 0 && (
          <div className="rounded-2xl bg-white border border-zinc-200 p-8 text-center">
            <div className="font-head font-bold text-lg">Nenhuma obra liberada ainda</div>
            <p className="text-sm text-zinc-500 mt-1">Quando a Contric liberar o acesso a uma obra, ela aparecerá aqui e você receberá um e-mail.</p>
          </div>
        )}

        {dados && dados.obras.length > 0 && (
          <>
            {/* seleção da obra */}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-4 px-4">
              {dados.obras.map((o) => (
                <button key={o.pi.id} onClick={() => setObraId(o.pi.id)}
                  className={`shrink-0 text-left rounded-xl border px-4 py-3 transition-colors ${o.pi.id === obraId ? "bg-zinc-900 text-white border-zinc-900" : "bg-white border-zinc-200 hover:border-zinc-400"}`}>
                  <div className="font-mono font-bold text-sm">{o.pi.codigo}</div>
                  <div className={`text-xs truncate max-w-[220px] ${o.pi.id === obraId ? "text-zinc-300" : "text-zinc-500"}`}>{o.pi.projeto || o.pi.cliente}</div>
                </button>
              ))}
            </div>

            {obra && (
              <div className="flex flex-col gap-4">
                <section className="rounded-2xl bg-white border border-zinc-200 p-5">
                  <div className="text-xs font-mono font-bold text-zinc-500">{obra.pi.codigo}</div>
                  <h1 className="font-head font-bold text-xl">{obra.pi.projeto || obra.pi.cliente}</h1>
                  <div className="text-sm text-zinc-500">{obra.pi.cliente}{obra.pi.prazo ? ` · prazo ${formatarData(obra.pi.prazo)}` : ""} · {STATUS_PI[obra.pi.status] || obra.pi.status}</div>
                </section>

                {obra.acessos.linhaTempo && <LinhaTempoCliente etapas={obra.etapas} />}

                {obra.acessos.atas && (
                  <ListaArquivos titulo="Atas de reuniões" icone="usuarios" vazio="Nenhuma ata disponível ainda."
                    itens={obra.atas.map((a) => ({ chave: a.nome, nome: a.nome, detalhe: formatarDataHora(a.data), url: a.url }))} />
                )}
                {obra.acessos.rdos && (
                  <ListaArquivos titulo="RDOs assinados" icone="pdf" vazio="Nenhum RDO assinado disponível ainda."
                    itens={obra.rdos.map((r) => ({ chave: r.nome, nome: `RDO de ${formatarData(r.data)}`, detalhe: `${r.assinadoPor ? `Assinado por ${r.assinadoPor}` : "Assinado"} · ${r.status === "aprovado" ? "aprovado" : "em validação"}`, url: r.url }))} />
                )}
              </div>
            )}
          </>
        )}
      </main>
      {trocandoSenha && <AlterarSenha onFechar={() => setTrocandoSenha(false)} />}
    </div>
  );
}

function ListaArquivos({ titulo, icone, itens, vazio }) {
  return (
    <section className="rounded-2xl bg-white border border-zinc-200 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-zinc-200 flex items-center gap-2">
        <Icone nome={icone} className="w-5 h-5 text-zinc-500" />
        <h2 className="font-head font-bold">{titulo}</h2>
        <span className="text-xs text-zinc-500 ml-auto">{itens.length}</span>
      </div>
      {itens.length === 0 && <div className="px-5 py-6 text-sm text-zinc-500">{vazio}</div>}
      <div className="divide-y divide-zinc-100">
        {itens.map((i) => (
          <a key={i.chave} href={i.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-5 py-3.5 hover:bg-zinc-50 active:bg-zinc-100">
            <div className="w-10 h-10 rounded-lg bg-zinc-900 text-white flex items-center justify-center shrink-0"><Icone nome="pdf" className="w-5 h-5" /></div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm truncate">{i.nome}</div>
              <div className="text-xs text-zinc-500 truncate">{i.detalhe}</div>
            </div>
            <span className="text-sm font-semibold text-zinc-700 shrink-0">Abrir →</span>
          </a>
        ))}
      </div>
    </section>
  );
}

// Linha do tempo somente leitura (etapas e sub-etapas), com rolagem horizontal no celular
function LinhaTempoCliente({ etapas }) {
  const itens = useMemo(() => etapasEmArvore(etapas), [etapas]);
  // coluna dos nomes mais estreita no celular (sobra espaço para as barras)
  const [LW, setLW] = useState(200);
  useEffect(() => { const m = () => setLW(window.innerWidth < 640 ? 128 : 200); m(); window.addEventListener("resize", m); return () => window.removeEventListener("resize", m); }, []);
  const tempos = itens.flatMap((e) => [tsLocal(e.data_prevista_inicio), tsLocal(e.data_prevista_fim)]).filter(Boolean);
  if (!itens.length || !tempos.length) {
    return <section className="rounded-2xl bg-white border border-zinc-200 p-5 text-sm text-zinc-500">Linha do tempo ainda sem etapas planejadas.</section>;
  }
  const DIA = 86400000;
  const min = Math.min(...tempos) - 2 * DIA, max = Math.max(...tempos) + 3 * DIA;
  const dias = (max - min) / DIA;
  const largura = Math.max(560, dias * 18);
  const x = (t) => ((t - min) / (max - min)) * largura;
  const marcas = [];
  for (let t = min; t <= max; t += DIA * (dias > 120 ? 14 : dias > 45 ? 7 : 3)) marcas.push(t);
  const macros = itens.filter((e) => !e.nivel);
  const progresso = macros.length ? Math.round(macros.reduce((s, e) => s + (e.status === "concluida" ? 100 : Number(e.percentual) || 0), 0) / macros.length) : 0;

  return (
    <section className="rounded-2xl bg-white border border-zinc-200 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-zinc-200 flex flex-wrap items-center gap-3">
        <Icone nome="linhaTempo" className="w-5 h-5 text-zinc-500" />
        <h2 className="font-head font-bold">Linha do tempo</h2>
        <div className="flex items-center gap-2 text-sm ml-auto">
          <span className="w-28 h-2 rounded-full bg-zinc-200 overflow-hidden inline-block"><span className="block h-full bg-zinc-800" style={{ width: `${progresso}%` }} /></span>
          <strong>{progresso}%</strong>
        </div>
      </div>
      <div className="overflow-auto" style={{ maxHeight: "65vh" }}>
        <div style={{ minWidth: LW + largura }}>
          <div className="flex sticky top-0 z-20 bg-white border-b border-zinc-200">
            <div className="shrink-0 sticky left-0 bg-white z-30" style={{ width: LW }} />
            <div className="relative h-7" style={{ width: largura }}>
              {marcas.map((t) => (
                <div key={t} className="absolute top-0 h-full border-l border-zinc-200 pl-1 pt-1.5 text-[11px] font-mono text-zinc-400" style={{ left: x(t) }}>
                  {new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                </div>
              ))}
            </div>
          </div>
          {itens.map((e) => {
            const ini = tsLocal(e.data_prevista_inicio), fim = tsLocal(e.data_prevista_fim);
            const cor = STATUS_ETAPA[e.status]?.barra || "#a1a1aa";
            const atrasada = e.status !== "concluida" && diasAte(e.data_prevista_fim) < 0;
            return (
              <div key={e.id} className="flex items-center border-b border-zinc-100">
                <div className={`shrink-0 sticky left-0 z-10 bg-white py-2 border-r border-zinc-200 truncate ${e.nivel ? "pl-5 pr-2 text-xs text-zinc-500" : "px-3 text-sm font-medium"}`} style={{ width: LW }} title={e.nome}>{e.nome}</div>
                <div className="relative h-8" style={{ width: largura }}>
                  <div className="absolute top-0 bottom-0 w-px bg-red-500/50" style={{ left: x(Date.now()) }} />
                  {ini && fim && (
                    <div className={`absolute rounded ${e.nivel ? "top-3 h-2 opacity-70" : "top-2.5 h-3"}`} style={{ left: x(ini), width: Math.max(4, x(fim + DIA) - x(ini)), background: atrasada ? "#D64545" : cor }}
                      title={`${e.nome} · ${formatarData(e.data_prevista_inicio)} → ${formatarData(e.data_prevista_fim)} · ${STATUS_ETAPA[e.status]?.rotulo || ""}`} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="px-5 py-3 border-t border-zinc-200 flex flex-wrap gap-3 text-xs text-zinc-500">
        {Object.entries(STATUS_ETAPA).map(([k, v]) => <span key={k} className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ background: v.barra }} />{v.rotulo}</span>)}
        <span className="flex items-center gap-1.5"><span className="w-px h-3 bg-red-500" />Hoje</span>
      </div>
    </section>
  );
}
