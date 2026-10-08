"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTabela } from "../../lib/dados";
import { useAuth, pode } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import { BUCKET_DOCUMENTOS, linkTemporario } from "../../lib/pdfRdo";
import { formatarData, formatarDataHora, diasAte } from "../../lib/datas";
import { STATUS_ETAPA, STATUS_PI, COR_STATUS_PI, PRAZOS, TIPOS_RECURSO, etapasEmArvore } from "../../lib/constantes";
import { useToast } from "../../lib/Toast";
import PainelShell from "../../components/PainelShell";
import { CabecalhoPagina, EstadoVazio, Esqueleto, Aviso } from "../../components/ui";
import Icone from "../../components/Icone";
import { ModalQrPi } from "../../components/LeitorQR";

// Página do PI: tudo de uma obra num só lugar (Resumo, Cronograma, Equipe, Campo,
// Documentos, Financeiro, Cliente). Sem ?id=... mostra a lista de PIs para escolher.
const ABAS = [
  ["resumo", "Resumo", null],
  ["cronograma", "Cronograma", "pi.ver"],
  ["equipe", "Equipe e recursos", "recurso.ver"],
  ["campo", "Campo", "rdo.ver"],
  ["documentos", "Documentos", "doc.ver"],
  ["financeiro", "Financeiro", "relatorio.ver"],
  ["cliente", "Cliente", "cliente.acessos"],
];
const ROT_DECISAO = { pendente: "Pendente", aprovado: "Aprovado", aprovada: "Aprovada", rejeitado: "Reprovado", rejeitada: "Reprovada" };
const COR_DECISAO = { pendente: "bg-amber/10 text-amber", aprovado: "bg-green/10 text-green", aprovada: "bg-green/10 text-green", rejeitado: "bg-red/10 text-red", rejeitada: "bg-red/10 text-red" };
const reais = (v) => `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const horas = (v) => `${Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;

export default function PaginaPi({ searchParams }) {
  const id = searchParams?.id || "";
  // layout "Workspace": com um PI aberto, a lista de obras fica fixa à esquerda (telas largas)
  return (
    <PainelShell>
      {id ? (
        <div className="flex min-h-full">
          <ListaLateral idAtual={id} />
          <div className="flex-1 min-w-0"><DetalhePi key={id} id={id} abaInicial={searchParams?.aba} /></div>
        </div>
      ) : <ListaPis />}
    </PainelShell>
  );
}

// lista compacta de PIs ao lado do detalhe (troca de obra sem voltar)
function ListaLateral({ idAtual }) {
  const { dados: pis } = useTabela("pis", { order: { coluna: "codigo" } });
  const { dados: etapas } = useTabela("etapas", { select: "id,pi_id,parent_etapa_id,status,percentual,data_prevista_fim" });
  const [busca, setBusca] = useState("");
  const [soAtivos, setSoAtivos] = useState(true);
  const termo = busca.trim().toLowerCase();
  const lista = pis.filter((p) => (!soAtivos || p.status === "ativo" || p.id === idAtual) && (!termo || [p.codigo, p.cliente, p.projeto].some((c) => (c || "").toLowerCase().includes(termo))));
  const progresso = (piId) => {
    const macros = etapas.filter((e) => e.pi_id === piId && !e.parent_etapa_id);
    return macros.length ? Math.round(macros.reduce((s, e) => s + (e.status === "concluida" ? 100 : Number(e.percentual) || 0), 0) / macros.length) : null;
  };
  const atrasado = (piId) => etapas.some((e) => e.pi_id === piId && e.status !== "concluida" && (diasAte(e.data_prevista_fim) ?? 0) < 0);
  return (
    <aside className="hidden xl:flex flex-col w-80 shrink-0 bg-superficie border-r border-line sticky top-0 h-screen">
      <div className="p-3 flex flex-col gap-2 border-b border-line">
        <div className="flex items-center justify-between"><span className="titulo-quadro">PIs</span>
          <button onClick={() => setSoAtivos((v) => !v)} className={`chip !py-1 ${soAtivos ? "chip-ativo" : ""}`}>{soAtivos ? "Só ativos" : "Todos"}</button></div>
        <div className="relative">
          <Icone nome="buscar" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muteddim" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar obra..." className="input pl-9 !py-1.5" aria-label="Buscar obra" />
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto rolagem-fina">
        {lista.map((p) => {
          const ativo = p.id === idAtual, prog = progresso(p.id);
          return (
            <Link key={p.id} href={`/pi?id=${p.id}`}
              className={`block px-4 py-3 border-b border-line/60 ${ativo ? "bg-cyan/10 shadow-[inset_3px_0_0_rgb(var(--cor-cyan))]" : "hover:bg-panel"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[13px] font-semibold text-cyan">{p.codigo}</span>
                {prog !== null && <span className={`font-mono text-[11px] tabular-nums ${atrasado(p.id) ? "text-red" : "text-muted"}`}>{atrasado(p.id) ? "● " : ""}{prog}%</span>}
              </div>
              <div className="text-[13px] font-semibold truncate">{p.cliente}</div>
              {p.projeto && <div className="text-xs text-muted truncate">{p.projeto}</div>}
            </Link>
          );
        })}
        {!lista.length && <div className="p-4 text-sm text-muteddim">Nenhum PI encontrado.</div>}
      </nav>
    </aside>
  );
}

// ---------------- lista de PIs ----------------
function ListaPis() {
  const { dados: pis, carregando } = useTabela("pis", { order: { coluna: "codigo" } });
  const { dados: etapas } = useTabela("etapas", { select: "id,pi_id,parent_etapa_id,status,percentual,data_prevista_fim" });
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("ativo");
  const termo = busca.trim().toLowerCase();
  const lista = pis.filter((p) => (!status || p.status === status) && (!termo || [p.codigo, p.cliente, p.projeto].some((c) => (c || "").toLowerCase().includes(termo))));
  const progresso = (piId) => {
    const macros = etapas.filter((e) => e.pi_id === piId && !e.parent_etapa_id);
    return macros.length ? Math.round(macros.reduce((s, e) => s + (e.status === "concluida" ? 100 : Number(e.percentual) || 0), 0) / macros.length) : null;
  };
  const atrasadas = (piId) => etapas.filter((e) => e.pi_id === piId && e.status !== "concluida" && (diasAte(e.data_prevista_fim) ?? 0) < 0).length;

  return (
    <div className="p-4 md:p-8">
      <CabecalhoPagina titulo="PIs" subtitulo="Escolha uma obra para ver tudo dela num só lugar." />
      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Icone nome="buscar" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muteddim" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nº, cliente ou projeto" className="input pl-9" autoFocus />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[["", "Todos"], ...Object.entries(STATUS_PI)].map(([v, l]) => (
            <button key={v} onClick={() => setStatus(v)} className={`chip ${status === v ? "chip-ativo" : ""}`}>{l}</button>
          ))}
        </div>
      </div>
      {carregando && <Esqueleto linhas={4} altura={72} />}
      {!carregando && lista.length === 0 && <EstadoVazio icone="obra" titulo="Nenhum PI encontrado" texto="Ajuste a busca ou o filtro de status." />}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {lista.map((p) => {
          const prog = progresso(p.id), atr = atrasadas(p.id);
          return (
            <Link key={p.id} href={`/pi?id=${p.id}`} className="cartao cartao-interativo p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-cyan">{p.codigo}</div>
                  <div className="font-semibold leading-snug">{p.cliente}</div>
                  {p.projeto && <div className="text-sm text-muted leading-snug">{p.projeto}</div>}
                </div>
                <span className={`selo shrink-0 ${COR_STATUS_PI[p.status] || "bg-panel text-muted"}`}>{STATUS_PI[p.status] || p.status}</span>
              </div>
              <div className="flex items-center gap-2 mt-auto">
                {prog !== null && <>
                  <div className="flex-1 h-1.5 rounded-full bg-line overflow-hidden"><div className="h-full bg-cyan rounded-full" style={{ width: `${prog}%` }} /></div>
                  <span className="text-xs text-muted tabular-nums w-9 text-right">{prog}%</span>
                </>}
                {atr > 0 && <span className="selo bg-red/10 text-red">{atr} atrasada(s)</span>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- detalhe do PI ----------------
function DetalhePi({ id, abaInicial }) {
  const { usuario } = useAuth();
  const router = useRouter();
  const { dados: pis, carregando } = useTabela("pis");
  const pi = pis.find((p) => p.id === id);
  const abas = ABAS.filter(([, , perm]) => !perm || pode(usuario, perm) || (perm === "relatorio.ver" && pode(usuario, "dashboard.valores")));
  const [aba, setAbaEstado] = useState(abas.some(([k]) => k === abaInicial) ? abaInicial : "resumo");
  const [qr, setQr] = useState(false);
  const setAba = (k) => { setAbaEstado(k); router.replace(`/pi?id=${id}${k !== "resumo" ? `&aba=${k}` : ""}`, { scroll: false }); };

  if (carregando) return <div className="p-8"><Esqueleto linhas={4} /></div>;
  if (!pi) return <div className="p-8"><EstadoVazio icone="obra" titulo="PI não encontrado" texto="Ele pode ter sido excluído ou você não tem acesso a esta obra." acao={<Link href="/pi" className="btn btn-primario">Ver todos os PIs</Link>} /></div>;

  return (
    <div className="p-4 md:p-8">
      <Link href="/pi" className="text-sm text-muted hover:text-cyan inline-flex items-center gap-1 mb-2"><Icone nome="voltar" className="w-4 h-4" /> Todos os PIs</Link>
      <div className="flex flex-wrap items-start gap-3 mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="titulo-pagina text-cyan">PI {pi.codigo}</span>
            <span className={`selo ${COR_STATUS_PI[pi.status] || "bg-panel text-muted"}`}>{STATUS_PI[pi.status] || pi.status}</span>
          </div>
          <div className="titulo-destaque mt-1">{pi.cliente}</div>
          {pi.projeto && <div className="text-muted">{pi.projeto}</div>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setQr(true)} className="btn btn-contorno"><Icone nome="qr" className="w-4 h-4" /> QR Code</button>
          <Link href={`/cronograma?pi=${pi.id}`} className="btn btn-primario"><Icone nome="cronograma" className="w-4 h-4" /> Abrir no Cronograma</Link>
        </div>
      </div>

      <div className="flex gap-1 border-b border-line mb-5 overflow-x-auto" role="tablist">
        {abas.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={aba === k} onClick={() => setAba(k)}
            className={`relative px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors ${aba === k ? "text-cyan" : "text-muted hover:text-textmain"}`}>
            {l}{aba === k && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-cyan rounded-full" />}
          </button>
        ))}
      </div>

      {aba === "resumo" && <AbaResumo pi={pi} usuario={usuario} irPara={setAba} />}
      {aba === "cronograma" && <AbaCronograma pi={pi} />}
      {aba === "equipe" && <AbaEquipe pi={pi} usuario={usuario} />}
      {aba === "campo" && <AbaCampo pi={pi} />}
      {aba === "documentos" && <AbaDocumentos pi={pi} />}
      {aba === "financeiro" && <AbaFinanceiro pi={pi} usuario={usuario} />}
      {aba === "cliente" && <AbaCliente pi={pi} />}

      {qr && <ModalQrPi pi={pi} comPdf onFechar={() => setQr(false)} />}
    </div>
  );
}

const Secao = ({ titulo, acao, children, className = "" }) => (
  <section className={`cartao p-4 md:p-5 ${className}`}>
    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
      <h2 className="titulo-quadro">{titulo}</h2>
      {acao}
    </div>
    {children}
  </section>
);
const Dado = ({ rotulo, children }) => (
  <div className="min-w-0"><div className="titulo-secao mb-0.5">{rotulo}</div><div className="text-sm break-words">{children || "—"}</div></div>
);
const Indicador = ({ titulo, valor, detalhe, cor = "text-textmain", onClick }) => {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={`cartao p-4 text-left ${onClick ? "cartao-interativo" : ""}`}>
      <div className="text-xs text-muted">{titulo}</div>
      <div className={`font-head font-bold text-2xl tabular-nums ${cor}`}>{valor}</div>
      {detalhe && <div className="texto-apoio">{detalhe}</div>}
    </Tag>
  );
};

// ---------------- Resumo ----------------
function AbaResumo({ pi, usuario, irPara }) {
  const { dados: etapas } = useTabela("etapas", { filtro: [["pi_id", pi.id]] });
  const { dados: rdos } = useTabela("rdos", { select: "id,status", filtro: [["pi_id", pi.id]] });
  const { dados: horasPi } = useTabela("apontamentos_horas", { select: "id,status", filtro: [["pi_id", pi.id]] });
  const { dados: ocs } = useTabela("ocorrencias", { select: "id,status,rdo_id", filtro: [["pi_id", pi.id]] });
  const { dados: solic } = useTabela("solicitacoes_alteracao_cronograma", { select: "id,etapa_id,status" });
  const verValores = pode(usuario, "dashboard.valores") || pode(usuario, "relatorio.ver");

  const macros = etapas.filter((e) => !e.parent_etapa_id);
  const avanco = macros.length ? Math.round(macros.reduce((s, e) => s + (e.status === "concluida" ? 100 : Number(e.percentual) || 0), 0) / macros.length) : 0;
  const abertas = etapas.filter((e) => e.status !== "concluida");
  const atrasadas = abertas.filter((e) => (diasAte(e.data_prevista_fim) ?? 0) < 0);
  const medicoes = abertas.filter((e) => e.medicao).sort((a, b) => String(a.data_prevista_fim || "9").localeCompare(String(b.data_prevista_fim || "9")));
  const medProximas = medicoes.filter((e) => { const d = diasAte(e.data_prevista_fim); return d !== null && d <= PRAZOS.medicoes; });
  const idsEtapas = new Set(etapas.map((e) => e.id));
  const pend = {
    rdos: rdos.filter((r) => r.status === "pendente").length,
    horas: horasPi.filter((h) => h.status === "pendente").length,
    ocorrencias: ocs.filter((o) => o.status === "pendente" && !o.rdo_id).length,
    solicitacoes: solic.filter((s) => idsEtapas.has(s.etapa_id) && String(s.status || "").startsWith("pendente")).length,
  };
  const totalPend = Object.values(pend).reduce((a, b) => a + b, 0);
  const proximas = abertas.filter((e) => e.data_prevista_fim).sort((a, b) => a.data_prevista_fim.localeCompare(b.data_prevista_fim)).slice(0, 6);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Indicador titulo="Avanço" valor={`${avanco}%`} detalhe={`${macros.length} macro-etapa(s)`} cor="text-cyan" onClick={() => irPara("cronograma")} />
        <Indicador titulo="Etapas atrasadas" valor={atrasadas.length} detalhe={`${abertas.length} em aberto`} cor={atrasadas.length ? "text-red" : "text-green"} onClick={() => irPara("cronograma")} />
        <Indicador titulo={`Medições em ${PRAZOS.medicoes} dias`} valor={medProximas.length}
          detalhe={verValores && medProximas.length ? reais(medProximas.reduce((s, e) => s + Number(e.medicao_valor || 0), 0)) : `${medicoes.length} em aberto`} cor="text-[#8E5CD9]" />
        <Indicador titulo="Pendências de aprovação" valor={totalPend}
          detalhe={`${pend.rdos} RDO · ${pend.horas} horas · ${pend.ocorrencias} ocorr. · ${pend.solicitacoes} solic.`} cor={totalPend ? "text-amber" : "text-green"} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Secao titulo="Dados do PI">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Dado rotulo="Cliente">{pi.cliente}</Dado>
            <Dado rotulo="Prazo">{pi.prazo ? formatarData(pi.prazo) : null}</Dado>
            <Dado rotulo="Projeto">{pi.projeto}</Dado>
            <Dado rotulo="Cronograma Base">{pi.baseline_definida_em ? `Salvo em ${formatarDataHora(pi.baseline_definida_em)}` : "Ainda não salvo"}</Dado>
            <Dado rotulo="Responsável no cliente">{pi.responsavel_cliente_nome}</Dado>
            <Dado rotulo="Contato">{[pi.responsavel_cliente_email, pi.responsavel_cliente_telefone].filter(Boolean).join(" · ")}</Dado>
          </div>
        </Secao>
        <Secao titulo="Próximos vencimentos" acao={<button onClick={() => irPara("cronograma")} className="text-sm text-cyan hover:underline">Ver cronograma</button>}>
          {proximas.length === 0 && <div className="text-sm text-muteddim">Nenhuma etapa em aberto com data.</div>}
          <div className="flex flex-col divide-y divide-line/70">
            {proximas.map((e) => {
              const d = diasAte(e.data_prevista_fim);
              return (
                <div key={e.id} className="py-2 flex items-center gap-2 text-sm">
                  <span className="flex-1 min-w-0 truncate">{e.parent_etapa_id ? "› " : ""}{e.nome}{e.medicao && <span className="ml-1.5 selo bg-[#8E5CD9]/10 text-[#8E5CD9]">M-R$</span>}</span>
                  <span className="text-muted tabular-nums">{formatarData(e.data_prevista_fim)}</span>
                  <span className={`selo w-24 justify-center ${d < 0 ? "bg-red/10 text-red" : d <= PRAZOS.atencao ? "bg-amber/10 text-amber" : "bg-panel text-muted"}`}>{d < 0 ? `${Math.abs(d)}d atraso` : d === 0 ? "hoje" : `em ${d}d`}</span>
                </div>
              );
            })}
          </div>
        </Secao>
      </div>
      {totalPend > 0 && <Aviso tipo="alerta">Há {totalPend} item(ns) deste PI aguardando aprovação. <Link href="/aprovacoes" className="underline font-semibold">Abrir Aprovações</Link></Aviso>}
    </div>
  );
}

// ---------------- Cronograma (consulta) ----------------
function AbaCronograma({ pi }) {
  const { dados: etapas, carregando } = useTabela("etapas", { filtro: [["pi_id", pi.id]], order: { coluna: "created_at" } });
  const itens = useMemo(() => etapasEmArvore(etapas), [etapas]);
  return (
    <Secao titulo={`Etapas (${etapas.length})`} acao={<Link href={`/cronograma?pi=${pi.id}`} className="btn btn-contorno btn-sm"><Icone nome="editar" className="w-4 h-4" /> Editar no Cronograma</Link>}>
      {carregando && <Esqueleto linhas={4} altura={36} />}
      {!carregando && !itens.length && <EstadoVazio icone="cronograma" titulo="Sem etapas" texto="Monte o cronograma deste PI na tela Cronograma." />}
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          {itens.length > 0 && <thead><tr className="text-left border-b border-line">
            <th className="py-2 titulo-secao">Etapa</th><th className="py-2 titulo-secao">Status</th><th className="py-2 titulo-secao">Início</th>
            <th className="py-2 titulo-secao">Fim</th><th className="py-2 titulo-secao text-right">Avanço</th><th className="py-2 titulo-secao">Equipes</th></tr></thead>}
          <tbody>
            {itens.map((e) => {
              const st = STATUS_ETAPA[e.status] || STATUS_ETAPA.nao_iniciada;
              const d = diasAte(e.data_prevista_fim);
              const atrasada = e.status !== "concluida" && d !== null && d < 0;
              return (
                <tr key={e.id} className="border-b border-line/60">
                  <td className={`py-2 pr-2 ${e.nivel ? "pl-5 text-muted" : "font-semibold"}`}>{e.nivel ? "› " : ""}{e.nome}{e.medicao && <span className="ml-1.5 selo bg-[#8E5CD9]/10 text-[#8E5CD9]">M-R$</span>}</td>
                  <td className="py-2"><span className={`selo ${atrasada ? "bg-red/10 text-red" : st.classe}`}>{atrasada ? "Atrasada" : st.rotulo}</span></td>
                  <td className="py-2 tabular-nums">{formatarData(e.data_prevista_inicio)}</td>
                  <td className="py-2 tabular-nums">{formatarData(e.data_prevista_fim)}</td>
                  <td className="py-2 text-right tabular-nums">{e.status === "concluida" ? 100 : Number(e.percentual) || 0}%</td>
                  <td className="py-2 text-xs text-muted">{(e.areas || []).join(", ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Secao>
  );
}

// ---------------- Equipe e recursos ----------------
function AbaEquipe({ pi, usuario }) {
  const { dados: alocs, carregando } = useTabela("alocacoes_recurso", { filtro: [["pi_id", pi.id]] });
  const { dados: recursos } = useTabela("recursos");
  const { dados: etapas } = useTabela("etapas", { select: "id,nome,parent_etapa_id", filtro: [["pi_id", pi.id]] });
  const nomeEtapa = (eid) => {
    const e = etapas.find((x) => x.id === eid); if (!e) return null;
    const pai = e.parent_etapa_id && etapas.find((x) => x.id === e.parent_etapa_id);
    return pai ? `${pai.nome} › ${e.nome}` : e.nome;
  };
  const porRecurso = useMemo(() => {
    const g = new Map();
    alocs.forEach((a) => { if (!g.has(a.recurso_id)) g.set(a.recurso_id, []); g.get(a.recurso_id).push(a); });
    return [...g.entries()].map(([rid, l]) => ({ recurso: recursos.find((r) => r.id === rid), alocs: l.sort((x, y) => String(x.periodo_inicio).localeCompare(String(y.periodo_inicio))) }))
      .sort((a, b) => (a.recurso?.nome || "").localeCompare(b.recurso?.nome || "", "pt-BR"));
  }, [alocs, recursos]);
  const rotuloTipo = (t) => TIPOS_RECURSO.find(([v]) => v === t)?.[1] || t;

  return (
    <Secao titulo={`Recursos alocados (${porRecurso.length})`}
      acao={pode(usuario, "recurso.alocar") && <Link href="/recursos" className="btn btn-contorno btn-sm"><Icone nome="mais2" className="w-4 h-4" /> Alocar recursos</Link>}>
      {carregando && <Esqueleto linhas={3} altura={48} />}
      {!carregando && !porRecurso.length && <EstadoVazio icone="recursos" titulo="Ninguém alocado" texto="Aloque pessoas e equipamentos nas etapas pelo Cronograma ou pela página Recursos." />}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {porRecurso.map(({ recurso, alocs: l }) => (
          <div key={recurso?.id || Math.random()} className="rounded-xl border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold">{recurso?.nome || "Recurso removido"}</div>
              <span className="texto-apoio">{rotuloTipo(recurso?.tipo)}{recurso?.atributos?.funcao ? ` · ${recurso.atributos.funcao}` : ""}</span>
            </div>
            <div className="mt-2 flex flex-col gap-1">
              {l.map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 min-w-0 truncate text-muted">{a.etapa_id ? nomeEtapa(a.etapa_id) || "etapa" : "Período no PI (sem etapa)"}</span>
                  <span className="tabular-nums text-xs text-muted whitespace-nowrap">{formatarData(a.periodo_inicio)} → {formatarData(a.periodo_fim)}</span>
                  <span className={`selo ${a.modo === "periodo_percentual" ? "bg-cyan/10 text-cyan" : "bg-amber/10 text-amber"}`}>{a.modo === "periodo_percentual" ? `${a.percentual}%` : "cadência"}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Secao>
  );
}

// ---------------- Campo: RDOs, ocorrências, horas ----------------
function AbaCampo({ pi }) {
  const { avisar } = useToast();
  const { dados: rdos, carregando } = useTabela("rdos", { filtro: [["pi_id", pi.id]], order: { coluna: "data", asc: false } });
  const { dados: ocs } = useTabela("ocorrencias", { filtro: [["pi_id", pi.id]], order: { coluna: "created_at", asc: false } });
  const { dados: horasPi } = useTabela("apontamentos_horas", { filtro: [["pi_id", pi.id]] });
  const { dados: usuarios } = useTabela("usuarios", { select: "id,nome" });
  const nome = (uid) => usuarios.find((u) => u.id === uid)?.nome || "—";
  const abrir = async (caminho) => {
    const janela = window.open("", "_blank");
    try { const url = await linkTemporario(caminho); if (janela) janela.location.href = url; else window.location.href = url; }
    catch (e) { janela?.close(); avisar(`Não foi possível abrir: ${e.message}`, "erro"); }
  };
  const porPessoa = useMemo(() => {
    const g = {};
    horasPi.filter((h) => h.status !== "rejeitado").forEach((h) => {
      g[h.usuario_id] = g[h.usuario_id] || { aprovadas: 0, pendentes: 0 };
      g[h.usuario_id][h.status === "aprovado" ? "aprovadas" : "pendentes"] += Number(h.horas_totais || 0);
    });
    return Object.entries(g).sort((a, b) => (b[1].aprovadas + b[1].pendentes) - (a[1].aprovadas + a[1].pendentes));
  }, [horasPi]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <Secao titulo={`RDOs (${rdos.length})`} acao={<Link href="/rdo" className="text-sm text-cyan hover:underline">Ir para RDO</Link>}>
        {carregando && <Esqueleto linhas={3} altura={36} />}
        {!carregando && !rdos.length && <div className="text-sm text-muteddim">Nenhum RDO registrado.</div>}
        <div className="flex flex-col divide-y divide-line/70 max-h-[420px] overflow-y-auto rolagem-fina">
          {rdos.map((r) => (
            <div key={r.id} className="py-2 flex items-center gap-2 text-sm">
              <span className="tabular-nums w-24">{formatarData(r.data)}</span>
              <span className="flex-1 min-w-0 truncate text-muted">{nome(r.lider_id)}</span>
              <span className={`selo ${COR_DECISAO[r.status] || "bg-panel text-muted"}`}>{ROT_DECISAO[r.status] || r.status}</span>
              {r.pdf_path && <button onClick={() => abrir(r.pdf_path)} className="text-cyan hover:underline text-xs">PDF</button>}
            </div>
          ))}
        </div>
      </Secao>
      <Secao titulo={`Ocorrências (${ocs.length})`}>
        {!ocs.length && <div className="text-sm text-muteddim">Nenhuma ocorrência registrada.</div>}
        <div className="flex flex-col divide-y divide-line/70 max-h-[420px] overflow-y-auto rolagem-fina">
          {ocs.map((o) => (
            <div key={o.id} className="py-2 flex items-start gap-2 text-sm">
              <span className="tabular-nums w-24 shrink-0">{formatarData(o.created_at?.slice(0, 10))}</span>
              <span className="flex-1 min-w-0"><strong className="font-semibold">{o.categoria}</strong>{o.descricao && <span className="text-muted"> — {o.descricao}</span>}
                <span className="block texto-apoio">{nome(o.registrado_por)}{o.rdo_id ? " · no RDO" : ""}{o.assinatura_cliente ? " · assinada pelo cliente" : ""}</span></span>
              <span className={`selo shrink-0 ${COR_DECISAO[o.status] || "bg-panel text-muted"}`}>{ROT_DECISAO[o.status] || o.status || "—"}</span>
              {o.pdf_path && <button onClick={() => abrir(o.pdf_path)} className="text-cyan hover:underline text-xs shrink-0">PDF</button>}
            </div>
          ))}
        </div>
      </Secao>
      <Secao titulo="Horas por pessoa" className="xl:col-span-2">
        {!porPessoa.length && <div className="text-sm text-muteddim">Nenhuma hora lançada neste PI.</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {porPessoa.map(([uid, h]) => (
            <div key={uid} className="rounded-lg bg-panel px-3 py-2 flex items-center gap-2 text-sm">
              <span className="flex-1 min-w-0 truncate">{nome(uid)}</span>
              <span className="tabular-nums font-semibold">{horas(h.aprovadas)}</span>
              {h.pendentes > 0 && <span className="selo bg-amber/10 text-amber">+{horas(h.pendentes)} pend.</span>}
            </div>
          ))}
        </div>
      </Secao>
    </div>
  );
}

// ---------------- Documentos ----------------
function AbaDocumentos({ pi }) {
  const { avisar } = useToast();
  const [arquivos, setArquivos] = useState(null);
  useEffect(() => {
    let vivo = true;
    supabase.storage.from(BUCKET_DOCUMENTOS).list(pi.id, { limit: 1000, sortBy: { column: "created_at", order: "desc" } })
      .then(({ data }) => vivo && setArquivos((data || []).filter((f) => f.id && !f.name.startsWith("."))));
    return () => { vivo = false; };
  }, [pi.id]);
  const tipo = (n) => n.startsWith("RDO_") ? "RDO" : n.startsWith("OCORRENCIA_") ? "Ocorrência" : n.startsWith("ATA_") ? "Ata" : "Documento";
  const abrir = async (nome) => {
    const janela = window.open("", "_blank");
    try { const url = await linkTemporario(`${pi.id}/${nome}`); if (janela) janela.location.href = url; else window.location.href = url; }
    catch (e) { janela?.close(); avisar(`Não foi possível abrir: ${e.message}`, "erro"); }
  };
  return (
    <Secao titulo={`Arquivos (${arquivos?.length ?? "…"})`} acao={<Link href={`/documentos?pi=${pi.id}`} className="btn btn-contorno btn-sm"><Icone nome="upload" className="w-4 h-4" /> Enviar e gerenciar</Link>}>
      {arquivos === null && <Esqueleto linhas={3} altura={36} />}
      {arquivos?.length === 0 && <EstadoVazio icone="pasta" titulo="Nenhum arquivo" texto="Envie atas, contratos e outros documentos pela tela Documentos." />}
      <div className="flex flex-col divide-y divide-line/70">
        {(arquivos || []).map((f) => (
          <button key={f.name} onClick={() => abrir(f.name)} className="py-2 flex items-center gap-3 text-sm text-left hover:bg-panel/60 px-1 rounded">
            <span className="selo bg-panel text-muted w-24 justify-center">{tipo(f.name)}</span>
            <span className="flex-1 min-w-0 truncate font-medium hover:text-cyan">{f.name}</span>
            <span className="texto-apoio whitespace-nowrap">{f.created_at ? formatarDataHora(f.created_at) : ""}</span>
          </button>
        ))}
      </div>
    </Secao>
  );
}

// ---------------- Financeiro ----------------
function AbaFinanceiro({ pi, usuario }) {
  const { dados: itens, carregando } = useTabela("orcamento_pi_item", { filtro: [["pi_id", pi.id]] });
  const { dados: categorias } = useTabela("categorias_orcamento", { order: { coluna: "ordem" } });
  const { dados: etapas } = useTabela("etapas", { select: "id,nome,medicao,medicao_valor,medicao_percentual,status,data_prevista_fim", filtro: [["pi_id", pi.id]] });
  const grupo = (g) => categorias.filter((c) => c.grupo === g).map((c) => ({ c, it: itens.find((i) => i.categoria_id === c.id) })).filter(({ it }) => it && (Number(it.valor_orcado) || Number(it.valor_realizado)));
  const soma = (l, campo) => l.reduce((s, { it }) => s + Number(it[campo] || 0), 0);
  const compra = grupo("compra_reais"), moi = grupo("moi_horas");
  const medicoes = etapas.filter((e) => e.medicao);
  const tabela = (titulo, l, fmt) => (
    <Secao titulo={titulo}>
      {!l.length && <div className="text-sm text-muteddim">Sem valores lançados.</div>}
      {l.length > 0 && (
        <table className="w-full text-sm">
          <thead><tr className="text-left border-b border-line"><th className="py-2 titulo-secao">Categoria</th><th className="py-2 titulo-secao text-right">Orçado</th><th className="py-2 titulo-secao text-right">Realizado</th></tr></thead>
          <tbody>
            {l.map(({ c, it }) => (
              <tr key={c.id} className="border-b border-line/60"><td className="py-1.5"><span className="text-muted text-xs mr-1.5">{c.codigo}</span>{c.nome}</td>
                <td className="py-1.5 text-right tabular-nums">{fmt(it.valor_orcado)}</td><td className="py-1.5 text-right tabular-nums">{it.valor_realizado != null ? fmt(it.valor_realizado) : "—"}</td></tr>
            ))}
            <tr className="font-semibold"><td className="py-2">Total</td><td className="py-2 text-right tabular-nums">{fmt(soma(l, "valor_orcado"))}</td><td className="py-2 text-right tabular-nums">{fmt(soma(l, "valor_realizado"))}</td></tr>
          </tbody>
        </table>
      )}
    </Secao>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        {pode(usuario, "relatorio.ver") && <Link href={`/relatorios?pi=${pi.id}`} className="btn btn-contorno btn-sm"><Icone nome="relatorio" className="w-4 h-4" /> Relatório completo</Link>}
      </div>
      {carregando && <Esqueleto linhas={3} />}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {tabela("Compra — Produto ou Serviço", compra, reais)}
        {tabela("MOI + Contric (horas)", moi, horas)}
      </div>
      <Secao titulo={`Medições (${medicoes.length})`}>
        {!medicoes.length && <div className="text-sm text-muteddim">Nenhuma etapa com medição marcada.</div>}
        <div className="flex flex-col divide-y divide-line/70">
          {medicoes.sort((a, b) => String(a.data_prevista_fim || "9").localeCompare(String(b.data_prevista_fim || "9"))).map((e) => (
            <div key={e.id} className="py-2 flex items-center gap-2 text-sm">
              <span className="flex-1 min-w-0 truncate">{e.nome}</span>
              <span className="tabular-nums text-muted">{formatarData(e.data_prevista_fim)}</span>
              <span className="tabular-nums w-16 text-right">{e.medicao_percentual != null ? `${e.medicao_percentual}%` : "—"}</span>
              <span className="tabular-nums w-32 text-right font-semibold">{e.medicao_valor != null ? reais(e.medicao_valor) : "—"}</span>
              <span className={`selo w-24 justify-center ${e.status === "concluida" ? "bg-green/10 text-green" : "bg-panel text-muted"}`}>{e.status === "concluida" ? "Concluída" : "Em aberto"}</span>
            </div>
          ))}
        </div>
      </Secao>
    </div>
  );
}

// ---------------- Cliente ----------------
const ACESSOS = [["ver_linha_tempo", "Linha do tempo"], ["ver_atas", "Atas"], ["ver_rdos_assinados", "RDOs assinados"], ["ver_ocorrencias_assinadas", "Ocorrências assinadas"]];
function AbaCliente({ pi }) {
  const { dados: acessos, carregando } = useTabela("cliente_acessos", { filtro: [["pi_id", pi.id]] });
  const { dados: clientes } = useTabela("clientes");
  const { dados: docs } = useTabela("cliente_documentos", { filtro: [["pi_id", pi.id]] });
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Secao titulo="Responsável no cliente">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Dado rotulo="Nome">{pi.responsavel_cliente_nome}</Dado>
          <Dado rotulo="E-mail">{pi.responsavel_cliente_email}</Dado>
          <Dado rotulo="Telefone">{pi.responsavel_cliente_telefone}</Dado>
        </div>
      </Secao>
      <Secao titulo={`Acesso ao portal (${acessos.length})`} acao={<Link href="/clientes" className="btn btn-contorno btn-sm"><Icone nome="obra" className="w-4 h-4" /> Gerenciar acessos</Link>}>
        {carregando && <Esqueleto linhas={2} altura={40} />}
        {!carregando && !acessos.length && <div className="text-sm text-muteddim">Nenhum cliente com acesso a este PI no portal.</div>}
        <div className="flex flex-col gap-2">
          {acessos.map((a) => {
            const c = clientes.find((x) => x.id === a.cliente_id);
            const qtdDocs = docs.filter((d) => d.cliente_id === a.cliente_id).length;
            return (
              <div key={a.id} className="rounded-xl border border-line p-3">
                <div className="font-semibold">{c?.nome || "Cliente"}{c?.empresa && <span className="font-normal text-muted"> · {c.empresa}</span>}</div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {ACESSOS.filter(([k]) => a[k]).map(([, l]) => <span key={l} className="selo bg-cyan/10 text-cyan">{l}</span>)}
                  {qtdDocs > 0 && <span className="selo bg-panel text-muted">{qtdDocs} documento(s) liberado(s)</span>}
                </div>
              </div>
            );
          })}
        </div>
      </Secao>
    </div>
  );
}
