"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import { rotaInicialPara } from "../../lib/nav";
import { tsLocal, formatarData, formatarDataHora, diasAte } from "../../lib/datas";
import { STATUS_ETAPA, etapasEmArvore, consolidarMacros } from "../../lib/constantes";
import AlterarSenha from "../../components/AlterarSenha";
import { Spinner } from "../../components/ui";
import Icone from "../../components/Icone";

const STATUS_PI = { nao_iniciado: "Não iniciada", ativo: "Em andamento", pausado: "Pausada", concluido: "Concluída", cancelado: "Cancelada" };

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
  // acesso liberado com o portal já aberto: antes só aparecia saindo e entrando de novo.
  // Agora recarrega ao voltar para a aba/app e a cada 2 minutos.
  useEffect(() => {
    if (usuario?.perfil !== "cliente") return;
    const aoVoltar = () => { if (document.visibilityState === "visible") carregar(); };
    document.addEventListener("visibilitychange", aoVoltar);
    const t = setInterval(aoVoltar, 120000);
    return () => { document.removeEventListener("visibilitychange", aoVoltar); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.perfil]);

  const obra = dados?.obras?.find((o) => o.pi.id === obraId);

  if (carregando || !usuario || usuario.perfil !== "cliente") {
    return <div className="min-h-[100dvh] bg-zinc-900 flex items-center justify-center text-zinc-400"><Spinner className="w-6 h-6" /></div>;
  }

  return (
    <div className="min-h-[100dvh] bg-zinc-100 text-zinc-900">
      <header className="sticky top-0 z-30 bg-zinc-900 text-zinc-100 shadow-lg" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="max-w-[1500px] mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/logo-claro.png" alt="Contric" className="h-11 w-auto shrink-0" />
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

      <main className="max-w-[1500px] mx-auto p-4 md:p-6" style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}>
        {erro && <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 p-4 text-sm mb-4">{erro}</div>}
        {!dados && !erro && <div className="flex justify-center py-16"><Spinner className="w-7 h-7 text-zinc-500" /></div>}
        {dados && dados.obras.length === 0 && (
          <div className="rounded-2xl bg-white border border-zinc-200 p-8 text-center">
            <div className="titulo-destaque">Nenhuma obra liberada ainda</div>
            <p className="text-sm text-zinc-500 mt-1">Quando a Contric liberar o acesso a uma obra, ela aparecerá aqui e você receberá um e-mail.</p>
            <button onClick={carregar} className="mt-4 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold hover:bg-zinc-50">Atualizar</button>
          </div>
        )}

        {dados && dados.obras.length > 0 && (
          // computador: obras numa coluna lateral fixa · celular: obras em faixa rolável no topo
          <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-6 lg:items-start">
            <aside className="lg:sticky lg:top-[88px]">
              <div className="hidden lg:block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-2 px-1">Minhas obras ({dados.obras.length})</div>
              <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 mb-4 lg:mb-0 -mx-4 px-4 lg:mx-0 lg:px-0">
                {dados.obras.map((o) => {
                  const sel = o.pi.id === obraId;
                  return (
                    <button key={o.pi.id} onClick={() => setObraId(o.pi.id)}
                      className={`shrink-0 lg:shrink text-left rounded-xl border px-4 py-3 transition-colors w-[230px] lg:w-full ${o.pi.pi_pai_id ? "lg:ml-4 lg:w-[calc(100%-1rem)]" : ""} ${sel ? "bg-zinc-900 text-white border-zinc-900 shadow-md" : "bg-white border-zinc-200 hover:border-zinc-400"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-bold text-sm">{o.pi.pi_pai_id ? "↳ " : ""}{o.pi.codigo}{o.filhos?.length ? <span className={`ml-1.5 text-[10px] font-sans font-semibold ${sel ? "text-zinc-300" : "text-zinc-500"}`}>CONTRATO</span> : null}</span>
                        <span className={`text-[10px] font-semibold uppercase tracking-wide ${sel ? "text-zinc-400" : "text-zinc-400"}`}>{STATUS_PI[o.pi.status] || ""}</span>
                      </div>
                      <div className={`text-xs leading-snug mt-0.5 line-clamp-2 ${sel ? "text-zinc-300" : "text-zinc-500"}`}>{o.pi.projeto || o.pi.cliente}</div>
                    </button>
                  );
                })}
              </div>
            </aside>

            {obra && (
              <div className="flex flex-col gap-4 min-w-0">
                <CabecalhoObra obra={obra} />
                {obra.consolidado && <ContratoConsolidado obra={obra} onAbrir={setObraId} />}

                {obra.acessos.linhaTempo && <LinhaTempoCliente etapas={obra.etapas} pi={obra.pi} />}

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                {obra.acessos.atas && (
                  <ListaArquivos titulo="Atas de reuniões" icone="usuarios" vazio="Nenhuma ata disponível ainda."
                    itens={obra.atas.map((a) => ({ chave: a.nome, nome: a.nome, detalhe: formatarDataHora(a.data), url: a.url }))} />
                )}
                {obra.acessos.rdos && (
                  <ListaArquivos titulo="RDOs assinados" icone="pdf" vazio="Nenhum RDO assinado disponível ainda."
                    itens={obra.rdos.map((r) => ({ chave: r.nome, nome: `RDO de ${formatarData(r.data)}`, detalhe: `${r.assinadoPor ? `Assinado por ${r.assinadoPor}` : "Assinado"} · ${r.status === "aprovado" ? "aprovado" : "em validação"}`, url: r.url }))} />
                )}
                {obra.acessos.ocorrencias && (
                  <ListaArquivos titulo="Ocorrências assinadas" icone="alerta" vazio="Nenhuma ocorrência assinada disponível ainda."
                    itens={(obra.ocorrencias || []).map((o) => ({ chave: o.id, nome: `${o.categoria || "Ocorrência"} — ${formatarData(o.data)}`, detalhe: `${o.assinadoPor ? `Assinada por ${o.assinadoPor}` : "Assinada"}${o.descricao ? ` · ${o.descricao}` : ""}`, url: o.url }))} />
                )}
                <EnviarTransfer pi={obra.pi} onEnviado={carregar} />
                {(obra.documentos || []).length > 0 && (
                  <ListaArquivos titulo="Documentos" icone="pasta" vazio=""
                    itens={obra.documentos.map((d) => {
                      // Contric Transfer: arquivo temporário, apagado 10 dias corridos após o envio
                      const transfer = String(d.nome).startsWith("TRANSFER_");
                      const exp = transfer ? new Date(new Date(d.data).setHours(0, 0, 0, 0) + 10 * 86400000) : null;
                      const faltam = exp ? Math.round((exp - new Date().setHours(0, 0, 0, 0)) / 86400000) : null;
                      return { chave: d.nome, nome: d.nome, url: d.url,
                        detalhe: transfer ? `⏳ Contric Transfer${String(d.nome).startsWith("TRANSFER_CLIENTE_") ? " · enviado por você" : ""} · disponível até ${exp.toLocaleDateString("pt-BR")}${faltam <= 0 ? " (apaga hoje)" : ` (${faltam} dia${faltam > 1 ? "s" : ""})`} — baixe uma cópia` : `Disponibilizado em ${formatarDataHora(d.data)}` };
                    })} />
                )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
      {trocandoSenha && <AlterarSenha onFechar={() => setTrocandoSenha(false)} />}
    </div>
  );
}

// Contric Transfer: o cliente envia arquivos para a Contric (apagados 10 dias depois do envio).
// O arquivo vai direto ao armazenamento por uma URL assinada pelo servidor, que antes confere o acesso.
function EnviarTransfer({ pi, onEnviado }) {
  const inputRef = useRef(null);
  const [enviando, setEnviando] = useState(null); // nome do arquivo em envio
  const [msg, setMsg] = useState(null); // { tipo, texto }
  const api = async (corpo) => {
    const { data: s } = await supabase.auth.getSession();
    const r = await fetch("/api/cliente", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token}` }, body: JSON.stringify({ piId: pi.id, ...corpo }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `erro ${r.status}`);
    return j;
  };
  const enviar = async (arquivos) => {
    setMsg(null);
    let ok = 0; const falhas = [];
    for (const arq of arquivos) {
      if (arq.size > 50 * 1024 * 1024) { falhas.push(`${arq.name}: passa de 50 MB`); continue; }
      setEnviando(arq.name);
      try {
        const { caminho, token } = await api({ acao: "transfer_url", nome: arq.name, tamanho: arq.size });
        const { error } = await supabase.storage.from("documentos").uploadToSignedUrl(caminho, token, arq, { contentType: arq.type || undefined });
        if (error) throw new Error(error.message);
        await api({ acao: "transfer_ok", caminho });
        ok++;
      } catch (e) { falhas.push(`${arq.name}: ${e.message}`); }
    }
    setEnviando(null);
    const ate = new Date(new Date().setHours(0, 0, 0, 0) + 10 * 86400000).toLocaleDateString("pt-BR");
    setMsg(falhas.length ? { tipo: "erro", texto: `${ok ? `${ok} enviado(s). ` : ""}Falhou: ${falhas.join(" · ")}` }
      : { tipo: "ok", texto: `${ok} arquivo(s) enviado(s) à Contric. Ficam disponíveis até ${ate}. Uma cópia do aviso foi enviada para o seu e-mail.` });
    if (ok) onEnviado?.();
  };
  return (
    <section className="rounded-2xl bg-white border border-amber-300 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-zinc-200 flex flex-wrap items-center gap-2">
        <span>⏳</span>
        <h2 className="titulo-quadro">Contric Transfer — enviar arquivos</h2>
        <button onClick={() => inputRef.current?.click()} disabled={!!enviando}
          className="ml-auto rounded-lg bg-zinc-900 text-white px-4 py-2 text-sm font-semibold hover:bg-zinc-700 disabled:opacity-60 flex items-center gap-2">
          {enviando ? <><Spinner className="w-4 h-4" /> Enviando...</> : <><Icone nome="upload" className="w-4 h-4" /> Enviar arquivo</>}
        </button>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => { const l = Array.from(e.target.files || []); e.target.value = ""; if (l.length) enviar(l); }} />
      </div>
      <div className="px-5 py-3 text-xs text-zinc-500">
        Envie arquivos para a equipe Contric desta obra ({pi.codigo}), até 50 MB cada. Eles ficam disponíveis por <strong>10 dias</strong> e depois são apagados automaticamente.
        {enviando && <div className="mt-1 text-zinc-700">Enviando "{enviando}"...</div>}
        {msg && <div className={`mt-2 rounded-lg px-3 py-2 text-sm ${msg.tipo === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{msg.texto}</div>}
      </div>
    </section>
  );
}

function ListaArquivos({ titulo, icone, itens, vazio }) {
  return (
    <section className="rounded-2xl bg-white border border-zinc-200 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-zinc-200 flex items-center gap-2">
        <Icone nome={icone} className="w-5 h-5 text-zinc-500" />
        <h2 className="titulo-quadro">{titulo}</h2>
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
// mesmo PDF do cronograma que a equipe Contric gera (A3 paisagem, Gantt, EAP, status) — gerado no
// próprio navegador com os dados que o servidor já liberou para este cliente
function BotaoPdfCronograma({ pi, etapas }) {
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");
  const baixar = async () => {
    setGerando(true); setErro("");
    try {
      const { gerarPdfCronograma, baseNomeCronograma } = await import("../../lib/pdfRdo");
      const blob = await gerarPdfCronograma({ pi, etapas });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${baseNomeCronograma(pi)}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { setErro("Não foi possível gerar o PDF. Tente de novo."); }
    setGerando(false);
  };
  return (
    <div className="flex items-center gap-2">
      {erro && <span className="text-xs text-red-600">{erro}</span>}
      <button onClick={baixar} disabled={gerando || !etapas.length}
        className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 text-white px-3.5 py-2 text-sm font-semibold hover:bg-zinc-700 disabled:opacity-50">
        {gerando ? <Spinner className="w-4 h-4" /> : <Icone nome="pdf" className="w-4 h-4" />}
        {gerando ? "Gerando..." : "Baixar PDF"}
      </button>
    </div>
  );
}

// ---------- contrato (PI Pai): avanço consolidado e as obras ----------
function ContratoConsolidado({ obra, onAbrir }) {
  const c = obra.consolidado;
  return (
    <section className="rounded-2xl bg-white border border-zinc-200 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-zinc-200 flex flex-wrap items-center gap-3">
        <h2 className="titulo-quadro">Consolidado do contrato</h2>
        <div className="flex items-center gap-2 text-sm ml-auto">
          <span className="text-zinc-500">Avanço do contrato</span>
          <span className="w-28 h-2 rounded-full bg-zinc-200 overflow-hidden inline-block"><span className="block h-full bg-zinc-800" style={{ width: `${c.avanco}%` }} /></span>
          <strong className="tabular-nums">{c.avanco}%</strong>
        </div>
        {c.termino && <span className="text-sm text-zinc-500">Término previsto: <strong className="text-zinc-900">{formatarData(c.termino)}</strong></span>}
      </div>
      <div className="divide-y divide-zinc-100">
        {c.obras.map((o) => (
          <button key={o.id} onClick={() => onAbrir(o.id)} className="w-full text-left flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-zinc-50">
            <span className="font-mono font-bold text-sm w-28">{o.codigo}</span>
            <span className="flex-1 min-w-[140px] text-sm text-zinc-600">{o.projeto}{!o.comCronograma ? " · cronograma em elaboração" : ""}</span>
            <span className="flex items-center gap-2"><span className="w-24 h-1.5 rounded-full bg-zinc-200 overflow-hidden"><span className="block h-full bg-zinc-800" style={{ width: `${o.avanco}%` }} /></span><span className="text-sm tabular-nums font-semibold w-10 text-right">{o.avanco}%</span></span>
            <span className="text-xs text-zinc-500 w-28 text-right">{o.termino ? `até ${formatarData(o.termino)}` : "—"}</span>
            <span className="text-sm font-semibold text-zinc-700">Abrir →</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ---------- resumo da obra: nome + indicadores ----------
const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const pctEtapa = (e) => (e.status === "concluida" ? 100 : Math.max(0, Math.min(100, Number(e.percentual) || 0)));
function CabecalhoObra({ obra }) {
  const { pi } = obra;
  const ets = useMemo(() => consolidarMacros(obra.etapas || []), [obra.etapas]);
  const comCrono = obra.acessos.linhaTempo && ets.length > 0;
  const macros = ets.filter((e) => !e.parent_etapa_id);
  const trabalho = ets.filter((e) => !e.calculada); // etapas de trabalho (sem repetir a macro)
  const avanco = macros.length ? Math.round(macros.reduce((s, e) => s + pctEtapa(e), 0) / macros.length) : 0;
  const concluidas = trabalho.filter((e) => e.status === "concluida").length;
  const atrasadas = trabalho.filter((e) => e.status !== "concluida" && (diasAte(e.data_prevista_fim) ?? 0) < 0).length;
  const termino = ets.map((e) => e.data_prevista_fim).filter(Boolean).sort().pop();
  const Ind = ({ rotulo, valor, detalhe, cor = "text-zinc-900" }) => (
    <div className="rounded-xl bg-zinc-50 border border-zinc-200 px-4 py-3 min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{rotulo}</div>
      <div className={`font-head font-bold text-lg sm:text-2xl tabular-nums leading-tight mt-0.5 truncate ${cor}`}>{valor}</div>
      {detalhe && <div className="text-xs text-zinc-500 mt-0.5 truncate">{detalhe}</div>}
    </div>
  );
  return (
    <section className="rounded-2xl bg-white border border-zinc-200 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-mono font-bold text-zinc-500">PI {pi.codigo}</div>
          <h1 className="font-head text-xl md:text-2xl font-bold leading-tight mt-0.5">{pi.projeto || pi.cliente}</h1>
          <div className="text-sm text-zinc-500 mt-1">{pi.cliente}</div>
        </div>
        <span className="rounded-full bg-zinc-900 text-white text-xs font-semibold px-3 py-1">{STATUS_PI[pi.status] || pi.status}</span>
      </div>
      {comCrono && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <Ind rotulo="Avanço geral" valor={`${avanco}%`} detalhe={`${macros.length} fase(s)`} />
          <Ind rotulo="Etapas concluídas" valor={`${concluidas}/${trabalho.length}`} />
          <Ind rotulo="Em atraso" valor={atrasadas} cor={atrasadas ? "text-red-600" : "text-green-700"} detalhe={atrasadas ? "etapas além do previsto" : "nenhuma etapa atrasada"} />
          <Ind rotulo="Término previsto" valor={termino ? formatarData(termino) : "—"} detalhe={pi.prazo ? `prazo contratual ${formatarData(pi.prazo)}` : ""} />
        </div>
      )}
      {!comCrono && pi.prazo && <div className="text-sm text-zinc-500 mt-2">Prazo {formatarData(pi.prazo)}</div>}
    </section>
  );
}

// ---------- cronograma (somente leitura) ----------
// Computador: coluna de etapas larga (nome completo + início, término e %), Gantt ocupando toda a
// largura disponível, régua de meses e semanas, linha de hoje. Celular: coluna estreita e rolagem.
function LinhaTempoCliente({ etapas, pi }) {
  const itens = useMemo(() => etapasEmArvore(consolidarMacros(etapas || [])), [etapas]);
  const caixaRef = useRef(null);
  const [larguraCaixa, setLarguraCaixa] = useState(0);
  useEffect(() => {
    const el = caixaRef.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setLarguraCaixa(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const largo = larguraCaixa >= 900;
  const LW = largo ? 470 : larguraCaixa >= 640 ? 260 : 150; // coluna da esquerda (nome + colunas no computador)
  const tempos = itens.flatMap((e) => [tsLocal(e.data_prevista_inicio), tsLocal(e.data_prevista_fim)]).filter(Boolean);
  const vazio = !itens.length || !tempos.length;
  const DIA = 86400000;
  const min = vazio ? 0 : Math.min(...tempos) - 3 * DIA, max = vazio ? 1 : Math.max(...tempos) + 4 * DIA;
  const dias = Math.max(1, (max - min) / DIA);
  // ocupa a largura toda; só rola na horizontal se cada dia ficar com menos de 4px (ou 10px no celular)
  const disponivel = Math.max(0, larguraCaixa - LW - 2);
  const largura = Math.max(disponivel, dias * (largo ? 4 : 10), 320);
  const x = (t) => ((t - min) / (max - min)) * largura;
  // régua: meses (faixa de cima) e marcas a cada 1/2/4 semanas conforme o espaço
  const meses = [];
  if (!vazio) {
    const d = new Date(min); d.setDate(1);
    while (d.getTime() <= max) { const ini = Math.max(d.getTime(), min); const prox = new Date(d.getFullYear(), d.getMonth() + 1, 1); meses.push({ ini, fim: Math.min(prox.getTime(), max), rot: `${MESES_CURTOS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}` }); d.setTime(prox.getTime()); }
  }
  const pxSemana = (largura / dias) * 7;
  const passoSem = pxSemana >= 60 ? 1 : pxSemana >= 30 ? 2 : 4;
  const marcas = [];
  if (!vazio) { const s = new Date(min); s.setDate(s.getDate() + ((8 - s.getDay()) % 7)); for (let t = s.getTime(); t <= max; t += passoSem * 7 * DIA) marcas.push(t); }
  const hoje = Date.now();
  const macros = itens.filter((e) => !e.nivel);
  const progresso = macros.length ? Math.round(macros.reduce((s, e) => s + pctEtapa(e), 0) / macros.length) : 0;
  const colunas = largo ? `minmax(0,1fr) 62px 62px 44px` : "minmax(0,1fr)";
  const ddmm = (iso) => (iso ? formatarData(iso).slice(0, 5) : "—");

  return (
    <section className="rounded-2xl bg-white border border-zinc-200 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-zinc-200 flex flex-wrap items-center gap-3">
        <Icone nome="linhaTempo" className="w-5 h-5 text-zinc-500" />
        <h2 className="titulo-quadro">Cronograma</h2>
        {!vazio && (
          <div className="flex items-center gap-2 text-sm ml-auto">
            <span className="text-zinc-500 hidden sm:inline">Avanço</span>
            <span className="w-28 h-2 rounded-full bg-zinc-200 overflow-hidden inline-block"><span className="block h-full bg-zinc-800" style={{ width: `${progresso}%` }} /></span>
            <strong className="tabular-nums">{progresso}%</strong>
          </div>
        )}
        {pi && !vazio && <BotaoPdfCronograma pi={pi} etapas={etapas} />}
      </div>
      <div ref={caixaRef}>
        {vazio ? <div className="p-5 text-sm text-zinc-500">Cronograma ainda sem etapas planejadas.</div> : larguraCaixa > 0 && (
          <div className="overflow-auto" style={{ maxHeight: "72vh" }}>
            <div style={{ width: LW + largura }}>
              {/* régua */}
              <div className="flex sticky top-0 z-20 bg-white border-b border-zinc-200">
                <div className="shrink-0 sticky left-0 bg-zinc-50 z-30 border-r border-zinc-200 grid items-end gap-2 px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500" style={{ width: LW, gridTemplateColumns: colunas }}>
                  <span>Etapa</span>{largo && <><span className="text-center">Início</span><span className="text-center">Término</span><span className="text-right">%</span></>}
                </div>
                <div className="relative h-11" style={{ width: largura }}>
                  {meses.map((m) => (
                    <div key={m.ini} className="absolute top-0 h-5 border-l border-zinc-300 pl-1.5 pt-0.5 text-[11px] font-semibold text-zinc-600 overflow-hidden whitespace-nowrap" style={{ left: x(m.ini), width: x(m.fim) - x(m.ini) }}>{x(m.fim) - x(m.ini) >= 40 ? m.rot : ""}</div>
                  ))}
                  {marcas.map((t) => (
                    <div key={t} className="absolute top-5 h-6 border-l border-zinc-200 pl-1 pt-1 text-[10px] font-mono text-zinc-400" style={{ left: x(t) }}>
                      {`${String(new Date(t).getDate()).padStart(2, "0")}/${String(new Date(t).getMonth() + 1).padStart(2, "0")}`}
                    </div>
                  ))}
                  {hoje >= min && hoje <= max && <div className="absolute bottom-0 -translate-x-1/2 rounded bg-red-500 text-white text-[9px] font-bold px-1 leading-[14px]" style={{ left: x(hoje) }}>HOJE</div>}
                </div>
              </div>
              {itens.map((e) => {
                const ini = tsLocal(e.data_prevista_inicio), fim = tsLocal(e.data_prevista_fim);
                const cor = STATUS_ETAPA[e.status]?.barra || "#a1a1aa";
                const atrasada = e.status !== "concluida" && (diasAte(e.data_prevista_fim) ?? 0) < 0;
                const p = pctEtapa(e);
                const macro = !e.nivel;
                return (
                  <div key={e.id} className={`flex items-stretch border-b border-zinc-100 ${macro ? "bg-zinc-50/70" : ""}`}>
                    <div className={`shrink-0 sticky left-0 z-10 border-r border-zinc-200 grid items-center gap-2 py-2 ${macro ? "bg-zinc-50 px-3" : "bg-white pl-6 pr-3"}`} style={{ width: LW, gridTemplateColumns: colunas }}>
                      <span className={`min-w-0 leading-snug break-words ${macro ? "text-sm font-semibold text-zinc-900" : "text-[13px] text-zinc-600"}`} title={e.nome}>
                        {e.nome}
                        {atrasada && <span className="ml-1.5 align-middle rounded bg-red-50 text-red-600 text-[10px] font-semibold px-1 py-px">atrasada</span>}
                      </span>
                      {largo && <>
                        <span className="text-center text-xs tabular-nums text-zinc-500">{ddmm(e.data_prevista_inicio)}</span>
                        <span className={`text-center text-xs tabular-nums ${atrasada ? "text-red-600 font-semibold" : "text-zinc-500"}`}>{ddmm(e.data_prevista_fim)}</span>
                        <span className="text-right text-xs tabular-nums font-semibold">{p}%</span>
                      </>}
                    </div>
                    <div className="relative min-h-[36px]" style={{ width: largura }}>
                      {marcas.map((t) => <div key={t} className="absolute top-0 bottom-0 border-l border-zinc-100" style={{ left: x(t) }} />)}
                      {hoje >= min && hoje <= max && <div className="absolute top-0 bottom-0 w-0.5 bg-red-500/60 z-[1]" style={{ left: x(hoje) }} />}
                      {ini && fim && (
                        <div className={`absolute top-1/2 -translate-y-1/2 rounded-full overflow-hidden ${macro ? "h-3.5" : "h-2.5"}`}
                          style={{ left: x(ini), width: Math.max(6, x(fim + DIA) - x(ini)), background: `${atrasada ? "#D64545" : cor}40` }}
                          title={`${e.nome} · ${formatarData(e.data_prevista_inicio)} → ${formatarData(e.data_prevista_fim)} · ${p}% · ${STATUS_ETAPA[e.status]?.rotulo || ""}`}>
                          <div className="h-full rounded-full" style={{ width: `${p}%`, background: atrasada ? "#D64545" : cor }} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {!vazio && (
        <div className="px-5 py-3 border-t border-zinc-200 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-zinc-500">
          {Object.entries(STATUS_ETAPA).map(([k, v]) => <span key={k} className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ background: v.barra }} />{v.rotulo}</span>)}
          <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-[#D64545]" />Atrasada</span>
          <span className="flex items-center gap-1.5"><span className="w-0.5 h-3 bg-red-500" />Hoje</span>
          <span className="sm:ml-auto">Parte escura da barra = percentual concluído</span>
        </div>
      )}
    </section>
  );
}
