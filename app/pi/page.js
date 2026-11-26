"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTabela, registrarLog, chamarApi, compararPis, useFinanceiroPi, consumo } from "../../lib/dados";
import { useAuth, pode } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import { BUCKET_DOCUMENTOS, linkTemporario, gerarPdfCronograma, gerarExcelCronograma, baseNomeCronograma } from "../../lib/pdfRdo";
import { formatarData, formatarDataHora, diasAte } from "../../lib/datas";
import { STATUS_PI, COR_STATUS_PI, PRAZOS, TIPOS_RECURSO, etapasEmArvore, consolidarMacros } from "../../lib/constantes";
import { useToast } from "../../lib/Toast";
import PainelShell from "../../components/PainelShell";
import { CabecalhoPagina, EstadoVazio, Esqueleto, Aviso, Modal, Spinner } from "../../components/ui";
import Icone from "../../components/Icone";
import { ModalQrPi } from "../../components/LeitorQR";
import CronogramaVisao from "../../components/CronogramaVisao";
import { horasDoLancamento } from "../../lib/horas";

// Página do PI: tudo de uma obra num só lugar (Resumo, Cronograma, Equipe, Campo,
// Documentos, Financeiro, Cliente). Sem ?id=... mostra a lista de PIs para escolher.
const ABAS = [
  ["contrato", "Obras do contrato", null], // só no PI Pai (ver DetalhePi)
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
          <div className="flex-1 min-w-0"><DetalhePi key={id} id={id} abaInicial={searchParams?.aba} obraInicial={searchParams?.obra} /></div>
        </div>
      ) : <ListaPis />}
    </PainelShell>
  );
}

// lista de PIs ao lado do detalhe (troca de obra sem voltar). Fica RECOLHIDA numa aba fina à
// esquerda; clicar na aba abre a lista por cima do conteúdo (a área do PI continua larga).
function ListaLateral({ idAtual }) {
  const [aberta, setAberta] = useState(false);
  const painelRef = useRef(null);
  useEffect(() => {
    if (!aberta) return;
    const fora = (e) => { if (painelRef.current && !painelRef.current.contains(e.target)) setAberta(false); };
    const esc = (e) => { if (e.key === "Escape") setAberta(false); };
    document.addEventListener("mousedown", fora); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [aberta]);
  const { dados: pis } = useTabela("pis", { order: { coluna: "codigo" } });
  const { dados: etapasBrutas } = useTabela("etapas", { select: "id,pi_id,parent_etapa_id,status,percentual,data_prevista_inicio,data_prevista_fim" });
  const etapas = useMemo(() => consolidarMacros(etapasBrutas), [etapasBrutas]);
  const [busca, setBusca] = useState("");
  const [soAtivos, setSoAtivos] = useState(true);
  const termo = busca.trim().toLowerCase();
  // contrato: só o PI Pai na lista (as obras ficam dentro dele)
  const visiveis = new Set(pis.map((p) => p.id));
  const obrasDe = (id) => pis.filter((x) => x.pi_pai_id === id);
  const bate = (p) => [p.codigo, p.cliente, p.projeto].some((c) => (c || "").toLowerCase().includes(termo));
  const lista = pis.filter((p) => !(p.pi_pai_id && visiveis.has(p.pi_pai_id)) && (!soAtivos || p.status === "ativo" || p.id === idAtual)
    && (!termo || bate(p) || obrasDe(p.id).some(bate)));
  const idsDe = (piId) => { const o = obrasDe(piId).map((x) => x.id); return o.length ? o : [piId]; };
  const progresso = (piId) => {
    const ids = idsDe(piId);
    const macros = etapas.filter((e) => ids.includes(e.pi_id) && !e.parent_etapa_id);
    return macros.length ? Math.round(macros.reduce((s, e) => s + (e.status === "concluida" ? 100 : Number(e.percentual) || 0), 0) / macros.length) : null;
  };
  const atrasado = (piId) => { const ids = idsDe(piId); return etapas.some((e) => ids.includes(e.pi_id) && e.status !== "concluida" && (diasAte(e.data_prevista_fim) ?? 0) < 0); };
  return (
    // no celular a aba lateral roubava espaço e cobria o logo: lá a troca de obra é por "Todos os PIs"
    <div ref={painelRef} className="relative shrink-0 z-40 hidden md:block">
      {/* aba recolhida */}
      <button onClick={() => setAberta((v) => !v)} aria-expanded={aberta} title={aberta ? "Recolher a lista de PIs" : "Trocar de PI"}
        className={`sticky top-0 h-screen w-9 flex flex-col items-center gap-3 pt-4 border-r border-line transition-colors ${aberta ? "bg-cyan/10 text-cyan" : "bg-superficie text-muted hover:text-cyan hover:bg-cyan/5"}`}>
        <Icone nome="obra" className="w-4 h-4" />
        <span className="text-xs font-semibold tracking-wider" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>Lista de PIs</span>
        <span className="text-xs">{aberta ? "‹" : "›"}</span>
      </button>
      {aberta && (
    <aside className="absolute left-9 top-0 bottom-0 w-[min(20rem,85vw)] shadow-2xl animar-fade">
      <div className="sticky top-0 h-screen flex flex-col bg-superficie border-r border-line">
      <div className="p-3 flex flex-col gap-2 border-b border-line">
        <div className="flex items-center justify-between"><span className="titulo-quadro">PIs</span>
          <button onClick={() => setAberta(false)} className="p-1 rounded text-muted hover:text-textmain" aria-label="Recolher lista de PIs">‹</button>
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
            <Link key={p.id} href={`/pi?id=${p.id}`} onClick={() => setAberta(false)}
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
      </div>
    </aside>
      )}
    </div>
  );
}

// ---------------- lista de PIs ----------------
function ListaPis() {
  const { dados: pis, carregando } = useTabela("pis", { order: { coluna: "codigo" } });
  const { dados: etapasBrutas } = useTabela("etapas", { select: "id,pi_id,parent_etapa_id,status,percentual,data_prevista_inicio,data_prevista_fim" });
  const etapas = useMemo(() => consolidarMacros(etapasBrutas), [etapasBrutas]);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("ativo");
  const [porCliente, setPorCliente] = useState(false); // padrão: nº do PI crescente; opção: separado por cliente
  const termo = busca.trim().toLowerCase();
  // contrato: só o PI Pai aparece (as obras ficam dentro da página dele); a busca também acha pelo nº da obra
  const visiveis = new Set(pis.map((p) => p.id));
  const obrasDe = (id) => pis.filter((x) => x.pi_pai_id === id);
  const bate = (p) => [p.codigo, p.cliente, p.projeto].some((c) => (c || "").toLowerCase().includes(termo));
  const lista = pis.filter((p) => !(p.pi_pai_id && visiveis.has(p.pi_pai_id)) && (!status || p.status === status)
    && (!termo || bate(p) || obrasDe(p.id).some(bate))).sort(compararPis);
  // grupos por cliente (sem diferenciar maiúsculas), em ordem alfabética; dentro de cada um, nº do PI crescente
  const grupos = useMemo(() => {
    if (!porCliente) return [{ titulo: null, itens: lista }];
    const m = new Map();
    lista.forEach((p) => {
      const nome = (p.cliente || "").trim() || "Sem cliente", k = nome.toLocaleLowerCase("pt-BR");
      if (!m.has(k)) m.set(k, { titulo: nome, itens: [] });
      m.get(k).itens.push(p);
    });
    return [...m.values()].sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR", { sensitivity: "base" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [porCliente, pis, status, termo]);
  // PI Pai: progresso e atrasos somam as obras
  const idsDe = (piId) => { const o = obrasDe(piId).map((x) => x.id); return o.length ? o : [piId]; };
  const progresso = (piId) => {
    const ids = idsDe(piId);
    const macros = etapas.filter((e) => ids.includes(e.pi_id) && !e.parent_etapa_id);
    return macros.length ? Math.round(macros.reduce((s, e) => s + (e.status === "concluida" ? 100 : Number(e.percentual) || 0), 0) / macros.length) : null;
  };
  const atrasadas = (piId) => { const ids = idsDe(piId); return etapas.filter((e) => ids.includes(e.pi_id) && !e.calculada && e.status !== "concluida" && (diasAte(e.data_prevista_fim) ?? 0) < 0).length; }; // sem contar a macro junto com as subs

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
          <button onClick={() => setPorCliente((v) => !v)} aria-pressed={porCliente} className={`chip md:ml-2 ${porCliente ? "chip-ativo" : ""}`} title="Separar os PIs por cliente">
            <Icone nome="usuarios" className="w-3.5 h-3.5" /> Por cliente
          </button>
        </div>
      </div>
      {carregando && <Esqueleto linhas={4} altura={72} />}
      {!carregando && lista.length === 0 && <EstadoVazio icone="obra" titulo="Nenhum PI encontrado" texto="Ajuste a busca ou o filtro de status." />}
      {grupos.map((g) => (
      <div key={g.titulo || "todos"} className="mb-5">
      {g.titulo && <div className="titulo-quadro mb-2">{g.titulo} <span className="text-muted font-normal">({g.itens.length})</span></div>}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {g.itens.map((p) => {
          const prog = progresso(p.id), atr = atrasadas(p.id);
          return (
            <Link key={p.id} href={`/pi?id=${p.id}`} className="cartao cartao-interativo p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-cyan">{p.codigo}</div>
                  <div className="font-semibold leading-snug">{p.cliente}</div>
                  {p.projeto && <div className="text-sm text-muted leading-snug">{p.projeto}</div>}
                  {obrasDe(p.id).length > 0 && <div className="selo bg-navy/10 text-navy mt-1">Contrato · {obrasDe(p.id).length} obras</div>}
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
      ))}
    </div>
  );
}

// ---------------- detalhe do PI ----------------
function DetalhePi({ id, abaInicial, obraInicial }) {
  const { usuario } = useAuth();
  const router = useRouter();
  const { dados: pis, carregando } = useTabela("pis");
  const piBase = pis.find((p) => p.id === id);
  // contrato: PI Pai (consolida as obras) ou obra (filho) de um contrato
  const filhos = pis.filter((p) => p.pi_pai_id === id).sort(compararPis);
  const ehContrato = filhos.length > 0;
  const paiBase = piBase?.pi_pai_id ? pis.find((p) => p.id === piBase.pi_pai_id) : null;
  // obra aberta direto (link antigo, QR Code): vai para a página do contrato com a obra selecionada
  useEffect(() => {
    if (paiBase) router.replace(`/pi?id=${paiBase.id}&obra=${piBase.id}${abaInicial ? `&aba=${abaInicial}` : ""}`, { scroll: false });
  }, [paiBase?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [obraSel, setObraSel] = useState(obraInicial || "");
  const obra = ehContrato ? filhos.find((f) => f.id === obraSel) : null;
  const pi = obra || piBase; // o que as abas mostram: a obra escolhida ou o contrato
  const ehPai = ehContrato && !obra; // visão consolidada
  const pai = obra ? piBase : null;
  // Financeiro: completo (relatório/valores) ou só de horas (permissão financeiro.horas — ex: líder de campo)
  const abas = ABAS.filter(([k, , perm]) => (k !== "contrato" || ehPai) && (!perm || pode(usuario, perm) || (perm === "relatorio.ver" && (pode(usuario, "dashboard.valores") || pode(usuario, "financeiro.horas")))));
  const [aba, setAbaEstado] = useState(abaInicial || null);
  // aba pedida (se o usuário puder vê-la); sem pedido, o PI Pai abre direto na consolidação
  const abaAtiva = aba && abas.some(([k]) => k === aba) ? aba : ehPai ? "contrato" : "resumo";
  const [qr, setQr] = useState(false);
  const url = (k, o) => `/pi?id=${id}${o ? `&obra=${o}` : ""}${k && k !== "resumo" ? `&aba=${k}` : ""}`;
  const setAba = (k) => { setAbaEstado(k); router.replace(url(k, obraSel), { scroll: false }); };
  const escolherObra = (o) => {
    setObraSel(o);
    const k = abaAtiva === "contrato" && o ? "resumo" : abaAtiva; // aba "Obras do contrato" só existe no consolidado
    setAbaEstado(k); router.replace(url(k, o), { scroll: false });
  };

  if (carregando || paiBase) return <div className="p-4 md:p-8"><Esqueleto linhas={4} /></div>;
  if (!pi) return <div className="p-4 md:p-8"><EstadoVazio icone="obra" titulo="PI não encontrado" texto="Ele pode ter sido excluído ou você não tem acesso a esta obra." acao={<Link href="/pi" className="btn btn-primario">Ver todos os PIs</Link>} /></div>;

  return (
    <div className="p-4 md:p-8">
      <Link href="/pi" className="text-sm text-muted hover:text-cyan inline-flex items-center gap-1 mb-2"><Icone nome="voltar" className="w-4 h-4" /> Todos os PIs</Link>
      {/* celular: nome em cima (largura toda) e botões embaixo — antes os botões espremiam o nome */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="titulo-pagina text-cyan">PI {pi.codigo}</span>
            <span className={`selo ${COR_STATUS_PI[pi.status] || "bg-panel text-muted"}`}>{STATUS_PI[pi.status] || pi.status}</span>
          </div>
          <div className="titulo-destaque mt-1">{pi.cliente}</div>
          {pi.projeto && <div className="text-muted">{pi.projeto}</div>}
          {ehPai && <div className="selo bg-navy/10 text-navy mt-1.5">PI Pai · contrato com {filhos.length} obras</div>}
          {pai && <button onClick={() => escolherObra("")} className="selo bg-navy/10 text-navy mt-1.5 hover:underline">Obra do contrato {pai.codigo} · ver consolidado</button>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setQr(true)} className="btn btn-contorno"><Icone nome="qr" className="w-4 h-4" /> QR Code</button>
          <Link href={`/cronograma?pi=${pi.id}`} className="btn btn-primario"><Icone nome="cronograma" className="w-4 h-4" /> Configurar Cronograma</Link>
        </div>
      </div>

      {/* contrato: consolidado ou uma obra específica (todas as abas passam a mostrar a escolha) */}
      {ehContrato && (
        <div className="cartao p-2.5 mb-4 flex items-center gap-2 overflow-x-auto rolagem-fina">
          <span className="titulo-secao shrink-0 px-1">Visão</span>
          <button onClick={() => escolherObra("")} className={`chip shrink-0 ${!obra ? "chip-ativo" : ""}`}>Consolidado do contrato</button>
          <span className="w-px h-5 bg-line shrink-0" />
          {filhos.map((f) => (
            <button key={f.id} onClick={() => escolherObra(f.id)} title={f.projeto || ""} className={`chip shrink-0 ${obra?.id === f.id ? "chip-ativo" : ""}`}>
              <span className="font-mono">{f.codigo}</span>{f.projeto && <span className="hidden lg:inline text-muted font-normal max-w-[140px] truncate">· {f.projeto}</span>}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-1 border-b border-line mb-5 overflow-x-auto" role="tablist">
        {abas.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={abaAtiva === k} onClick={() => setAba(k)}
            className={`relative shrink-0 px-3 sm:px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors ${abaAtiva === k ? "text-cyan" : "text-muted hover:text-textmain"}`}>
            {l}{abaAtiva === k && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-cyan rounded-full" />}
          </button>
        ))}
      </div>

      <div key={pi.id}>
      {abaAtiva === "contrato" && <AbaContrato pai={pi} filhos={filhos} usuario={usuario} />}
      {abaAtiva === "resumo" && <AbaResumo pi={pi} usuario={usuario} irPara={setAba} obras={ehPai ? filhos : null} />}
      {abaAtiva === "cronograma" && <AbaCronograma pi={pi} obras={ehPai ? filhos : null} />}
      {abaAtiva === "equipe" && <AbaEquipe pi={pi} usuario={usuario} />}
      {abaAtiva === "campo" && <AbaCampo pi={pi} />}
      {abaAtiva === "documentos" && <AbaDocumentos pi={pi} />}
      {abaAtiva === "financeiro" && <AbaFinanceiro pi={pi} usuario={usuario} obras={ehPai ? filhos : null} />}
      {abaAtiva === "cliente" && <AbaCliente pi={pi} />}
      </div>

      {qr && <ModalQrPi pi={pi} comPdf onFechar={() => setQr(false)} />}
    </div>
  );
}

// ---------------- Obras do contrato (PI Pai): consolidação das obras (PIs filhos) ----------------
// Avanço ponderado pelo VALOR de cada obra (sem valor: pelo orçamento de compra; sem nada: peso igual).
// Horas: orçado × consumo (lançamentos classificados e ajustes) × resultado, por obra e total.
function AbaContrato({ pai, filhos, usuario }) {
  const verValores = pode(usuario, "dashboard.valores") || pode(usuario, "relatorio.ver");
  const ids = new Set(filhos.map((f) => f.id));
  const { dados: etapasBrutas } = useTabela("etapas", { select: "id,pi_id,parent_etapa_id,status,percentual,data_prevista_inicio,data_prevista_fim" });
  const { dados: itens } = useTabela("orcamento_pi_item");
  const { dados: categorias } = useTabela("categorias_orcamento");
  const { dados: apontamentos } = useTabela("apontamentos_horas");
  const etapas = useMemo(() => consolidarMacros(etapasBrutas.filter((e) => ids.has(e.pi_id))), [etapasBrutas, filhos]); // eslint-disable-line react-hooks/exhaustive-deps
  const grupoDe = Object.fromEntries(categorias.map((c) => [c.id, c.grupo]));
  const linhas = filhos.map((f) => {
    const ets = etapas.filter((e) => e.pi_id === f.id);
    const macros = ets.filter((e) => !e.parent_etapa_id);
    const avanco = macros.length ? macros.reduce((s, e) => s + (e.status === "concluida" ? 100 : Math.min(100, Number(e.percentual) || 0)), 0) / macros.length : 0;
    const atrasadas = ets.filter((e) => !e.calculada && e.status !== "concluida" && (diasAte(e.data_prevista_fim) ?? 0) < 0).length;
    const termino = ets.map((e) => e.data_prevista_fim).filter(Boolean).sort().pop();
    const doPi = itens.filter((i) => i.pi_id === f.id);
    const soma = (g, campo) => doPi.filter((i) => grupoDe[i.categoria_id] === g).reduce((s, i) => s + (Number(i[campo]) || 0), 0);
    const hOrc = soma("moi_horas", "valor_orcado");
    const hLanc = apontamentos.filter((a) => a.pi_id === f.id && a.status !== "rejeitado").reduce((s, a) => { const h = horasDoLancamento(a); return s + (a.categoria_normal_id ? h.normais : 0) + (a.categoria_extra_id ? h.extras : 0); }, 0);
    const hReal = soma("moi_horas", "valor_realizado") + hLanc;
    const rOrc = soma("compra_reais", "valor_orcado"), rReal = soma("compra_reais", "valor_realizado");
    const valor = Number(f.valor_contrato) || 0;
    return { f, avanco, atrasadas, termino, hOrc, hReal, rOrc, rReal, valor, etapas: ets.length };
  });
  const pesoDe = (l) => (linhas.some((x) => x.valor > 0) ? l.valor : linhas.some((x) => x.rOrc > 0) ? l.rOrc : 1);
  const pesoTotal = linhas.reduce((s, l) => s + pesoDe(l), 0) || 1;
  const avancoContrato = Math.round(linhas.reduce((s, l) => s + l.avanco * pesoDe(l), 0) / pesoTotal);
  const criterio = linhas.some((x) => x.valor > 0) ? "ponderado pelo valor de cada obra" : linhas.some((x) => x.rOrc > 0) ? "ponderado pelo orçamento de compra" : "média simples (informe o valor de cada obra)";
  const tot = (k) => linhas.reduce((s, l) => s + l[k], 0);
  const consumoH = tot("hOrc") ? Math.round((tot("hReal") / tot("hOrc")) * 100) : null;
  const termino = linhas.map((l) => l.termino).filter(Boolean).sort().pop();
  const h = (v) => `${Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
  const cor = (orc, real) => (real <= orc ? "text-green" : "text-red");
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Indicador titulo="Avanço do contrato" valor={`${avancoContrato}%`} detalhe={criterio} cor="text-cyan" />
        <Indicador titulo="Obras" valor={filhos.length} detalhe={`${linhas.filter((l) => l.avanco >= 100).length} concluída(s)`} />
        <Indicador titulo="Etapas atrasadas" valor={tot("atrasadas")} detalhe="somando as obras" cor={tot("atrasadas") ? "text-red" : "text-green"} />
        <Indicador titulo="Consumo de horas" valor={consumoH === null ? "—" : `${consumoH}%`} detalhe={`${h(tot("hReal"))} de ${h(tot("hOrc"))}`} cor={consumoH === null ? "text-muteddim" : consumoH <= avancoContrato ? "text-green" : "text-red"} />
        <Indicador titulo="Término previsto" valor={termino ? formatarData(termino) : "—"} detalhe={pai.prazo ? `prazo ${formatarData(pai.prazo)}` : ""} cor={termino && pai.prazo && termino > pai.prazo ? "text-red" : "text-textmain"} />
      </div>
      <Secao titulo={`Obras do contrato ${pai.codigo}`} acao={<Link href={`/linha-do-tempo`} className="text-sm text-cyan hover:underline">Ver no Cronograma</Link>}>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[900px]">
            <thead><tr className="text-left border-b border-line">
              <th className="py-2 px-1 titulo-secao">Obra</th><th className="py-2 px-1 titulo-secao text-right">Avanço</th><th className="py-2 px-1 titulo-secao text-right">Peso</th>
              <th className="py-2 px-1 titulo-secao text-right">Atrasadas</th><th className="py-2 px-1 titulo-secao text-right">Término</th>
              <th className="py-2 px-1 titulo-secao text-right">Horas orç.</th><th className="py-2 px-1 titulo-secao text-right">Consumo</th><th className="py-2 px-1 titulo-secao text-right">Resultado</th>
              {verValores && <><th className="py-2 px-1 titulo-secao text-right">Valor da obra</th><th className="py-2 px-1 titulo-secao text-right">Compra orç. × real.</th></>}
            </tr></thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.f.id} className="border-b border-line/60 hover:bg-panel/50">
                  <td className="py-2 px-1"><Link href={`/pi?id=${l.f.id}`} className="font-mono font-semibold text-cyan hover:underline">{l.f.codigo}</Link><div className="texto-apoio">{l.f.projeto}{!l.etapas ? " · sem cronograma" : ""}</div></td>
                  <td className="py-2 px-1 text-right"><div className="flex items-center justify-end gap-2"><span className="w-16 h-1.5 rounded-full bg-line overflow-hidden"><span className="block h-full bg-cyan" style={{ width: `${l.avanco}%` }} /></span><span className="tabular-nums font-semibold w-10">{Math.round(l.avanco)}%</span></div></td>
                  <td className="py-2 px-1 text-right tabular-nums text-muted">{Math.round((pesoDe(l) / pesoTotal) * 100)}%</td>
                  <td className={`py-2 px-1 text-right tabular-nums ${l.atrasadas ? "text-red font-semibold" : "text-muted"}`}>{l.atrasadas}</td>
                  <td className="py-2 px-1 text-right tabular-nums">{l.termino ? formatarData(l.termino) : "—"}</td>
                  <td className="py-2 px-1 text-right tabular-nums">{h(l.hOrc)}</td>
                  <td className="py-2 px-1 text-right tabular-nums">{h(l.hReal)}</td>
                  <td className={`py-2 px-1 text-right tabular-nums ${cor(l.hOrc, l.hReal)}`}>{l.hOrc - l.hReal > 0 ? "+" : ""}{h(l.hOrc - l.hReal)}</td>
                  {verValores && <><td className="py-2 px-1 text-right tabular-nums">{l.valor ? reais(l.valor) : <span className="text-muteddim">—</span>}</td>
                    <td className={`py-2 px-1 text-right tabular-nums ${cor(l.rOrc, l.rReal)}`}>{reais(l.rOrc)} × {reais(l.rReal)}</td></>}
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-2 px-1">Total do contrato</td><td className="py-2 px-1 text-right tabular-nums text-cyan">{avancoContrato}%</td><td className="py-2 px-1 text-right">100%</td>
                <td className="py-2 px-1 text-right tabular-nums">{tot("atrasadas")}</td><td className="py-2 px-1 text-right tabular-nums">{termino ? formatarData(termino) : "—"}</td>
                <td className="py-2 px-1 text-right tabular-nums">{h(tot("hOrc"))}</td><td className="py-2 px-1 text-right tabular-nums">{h(tot("hReal"))}</td>
                <td className={`py-2 px-1 text-right tabular-nums ${cor(tot("hOrc"), tot("hReal"))}`}>{h(tot("hOrc") - tot("hReal"))}</td>
                {verValores && <><td className="py-2 px-1 text-right tabular-nums">{reais(tot("valor"))}</td><td className="py-2 px-1 text-right tabular-nums">{reais(tot("rOrc"))} × {reais(tot("rReal"))}</td></>}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="texto-apoio mt-2">Avanço do contrato {criterio}. Resultado = horas orçadas − consumo (verde: dentro do orçado). Horas são lançadas sempre nas obras.</div>
      </Secao>
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
// Avanço do cronograma + % de consumo de material (R$) e de horas (do Relatório):
// consumo abaixo/igual ao avanço = verde; acima = vermelho
function IndicadorAvanco({ avanco, macros, material, horas, irPara }) {
  const Consumo = ({ rotulo, v, aba }) => (
    <button onClick={() => irPara(aba)} className="text-left min-w-0 hover:opacity-80" title={v === null ? "Sem valor orçado" : v <= avanco ? "Consumo abaixo do avanço" : "Consumo acima do avanço"}>
      <div className="text-xs text-muted">{rotulo}</div>
      <div className={`font-head font-bold text-2xl tabular-nums ${v === null ? "text-muteddim" : v <= avanco ? "text-green" : "text-red"}`}>{v === null ? "—" : `${v}%`}</div>
    </button>
  );
  return (
    <div className={`cartao p-4 flex items-start gap-4 ${material !== undefined || horas !== undefined ? "col-span-2" : ""}`}>
      <button onClick={() => irPara("cronograma")} className="text-left min-w-0 hover:opacity-80">
        <div className="text-xs text-muted">Avanço</div>
        <div className="font-head font-bold text-2xl tabular-nums text-cyan">{avanco}%</div>
        <div className="texto-apoio">{macros} macro-etapa(s)</div>
      </button>
      {(material !== undefined || horas !== undefined) && <>
        <div className="w-px self-stretch bg-line" />
        {material !== undefined && <Consumo rotulo="Consumo material" v={material} aba="financeiro" />}
        {horas !== undefined && <Consumo rotulo="Consumo horas" v={horas} aba="financeiro" />}
      </>}
    </div>
  );
}

// ---- medidores em semicírculo (animação sincronizada: todos usam o mesmo relógio t de 0 → 1) ----
function useAnimacao(chave, duracao = 1400) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setT(1); return; }
    let raf, inicio = null;
    setT(0);
    const passo = (agora) => {
      if (inicio === null) inicio = agora;
      const p = Math.min(1, (agora - inicio) / duracao);
      setT(1 - Math.pow(1 - p, 3)); // desacelera no final
      if (p < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [chave, duracao]);
  return t;
}
const COR_MEDIDOR = { cyan: ["#22B8D6", "#0B84A5"], verde: ["#5CD67A", "#2E9E47"], vermelho: ["#F27A7A", "#D64545"], ambar: ["#F2B45C", "#C97A21"], cinza: ["#C9CED6", "#9AA3B2"] };
function Medidor({ titulo, valor, max = 100, t, cor = "cyan", detalhe, onClick, marcador = null, sufixo = "%" }) {
  const id = useMemo(() => `g${Math.random().toString(36).slice(2, 8)}`, []);
  const vazio = valor === null || valor === undefined;
  const atual = vazio ? 0 : valor * t;
  const frac = Math.max(0, Math.min(1, atual / max));
  const R = 80, C = Math.PI * R; // comprimento do semicírculo
  const [c1, c2] = COR_MEDIDOR[vazio ? "cinza" : cor];
  const ang = (f) => Math.PI * (1 - f); // 0 → esquerda, 1 → direita
  const ponta = { x: 100 + R * Math.cos(ang(frac)), y: 100 - R * Math.sin(ang(frac)) };
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={`cartao p-4 flex flex-col items-center text-center min-w-0 ${onClick ? "hover:shadow-md hover:-translate-y-0.5 transition-all" : ""}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted self-stretch text-left">{titulo}</div>
      <div className="relative w-full max-w-[220px] mt-1">
        <svg viewBox="0 0 200 116" className="w-full overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id={id} x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stopColor={c1} /><stop offset="100%" stopColor={c2} /></linearGradient>
            <filter id={`${id}s`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" /></filter>
          </defs>
          <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="currentColor" className="text-line" strokeWidth="14" strokeLinecap="round" />
          {/* brilho suave atrás do arco */}
          <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke={`url(#${id})`} strokeWidth="14" strokeLinecap="round" opacity="0.35" filter={`url(#${id}s)`}
            strokeDasharray={`${C * frac} ${C}`} />
          <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke={`url(#${id})`} strokeWidth="14" strokeLinecap="round" strokeDasharray={`${C * frac} ${C}`} />
          {marcador !== null && marcador !== undefined && (() => { // referência (ex: avanço, para comparar consumo)
            const f = Math.max(0, Math.min(1, marcador / max)), a = ang(f);
            return <line x1={100 + 66 * Math.cos(a)} y1={100 - 66 * Math.sin(a)} x2={100 + 94 * Math.cos(a)} y2={100 - 94 * Math.sin(a)} stroke="currentColor" className="text-textmain" strokeWidth="2.5" strokeLinecap="round" opacity={t} />;
          })()}
          {!vazio && frac > 0.005 && <circle cx={ponta.x} cy={ponta.y} r="5" fill="#fff" stroke={c2} strokeWidth="3" />}
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
          <span className="font-head font-bold text-3xl tabular-nums leading-none" style={{ color: c2 }}>{vazio ? "—" : `${Math.round(atual)}${sufixo}`}</span>
        </div>
      </div>
      {detalhe && <div className="texto-apoio mt-1.5 leading-snug">{detalhe}</div>}
    </Tag>
  );
}
// ritmo: avanço real ÷ avanço que deveria haver hoje pelo cronograma (100% = no ritmo)
function calcRitmo(macros, avanco) {
  const hoje = new Date(); hoje.setHours(12, 0, 0, 0);
  const comDatas = macros.filter((e) => e.data_prevista_inicio && e.data_prevista_fim);
  if (!comDatas.length) return { ritmo: null, planejado: null };
  const plan = comDatas.reduce((s, e) => {
    const i = new Date(`${e.data_prevista_inicio}T00:00:00`), f = new Date(`${e.data_prevista_fim}T23:59:59`);
    return s + Math.max(0, Math.min(1, (hoje - i) / Math.max(1, f - i))) * 100;
  }, 0) / comDatas.length;
  if (plan < 0.5) return { ritmo: null, planejado: 0 }; // ainda não era para ter começado
  return { ritmo: Math.round((avanco / plan) * 100), planejado: Math.round(plan) };
}

function AbaResumo({ pi, usuario, irPara, obras = null }) {
  // contrato (PI Pai): o resumo é o CONSOLIDADO das obras
  const ids = obras ? obras.map((o) => o.id) : null;
  const doPi = (l) => (ids ? l.filter((x) => ids.includes(x.pi_id)) : l);
  const filtroPi = ids ? null : [["pi_id", pi.id]];
  const { dados: etapasTodas } = useTabela("etapas", { filtro: filtroPi });
  const etapasBrutas = useMemo(() => doPi(etapasTodas), [etapasTodas, ids?.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const etapas = useMemo(() => consolidarMacros(etapasBrutas), [etapasBrutas]); // macro = resultado das subs
  const { dados: rdosT } = useTabela("rdos", { select: "id,status,pi_id", filtro: filtroPi });
  const { dados: horasT } = useTabela("apontamentos_horas", { select: "id,status,pi_id", filtro: filtroPi });
  const { dados: ocsT } = useTabela("ocorrencias", { select: "id,status,rdo_id,pi_id", filtro: filtroPi });
  const rdos = doPi(rdosT), horasPi = doPi(horasT), ocs = doPi(ocsT);
  const { dados: solic } = useTabela("solicitacoes_alteracao_cronograma", { select: "id,etapa_id,status" });
  const verValores = pode(usuario, "dashboard.valores") || pode(usuario, "relatorio.ver");
  const verHoras = verValores || pode(usuario, "financeiro.horas"); // líder: só o consumo de horas
  const fin = useFinanceiroPi(pi, ids);

  const macros = etapas.filter((e) => !e.parent_etapa_id);
  const avanco = macros.length ? Math.round(macros.reduce((s, e) => s + (e.status === "concluida" ? 100 : Number(e.percentual) || 0), 0) / macros.length) : 0;
  const abertas = etapas.filter((e) => e.status !== "concluida" && !e.calculada); // etapas de trabalho, sem repetir a macro
  const atrasadas = abertas.filter((e) => (diasAte(e.data_prevista_fim) ?? 0) < 0);
  const medicoes = etapas.filter((e) => e.status !== "concluida" && e.medicao).sort((a, b) => String(a.data_prevista_fim || "9").localeCompare(String(b.data_prevista_fim || "9")));
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

  // medidores: avanço, ritmo, consumo material e horas — todos animam juntos até o valor
  const material = verValores ? consumo(fin, "compra_reais") : undefined;
  const horasC = verHoras ? consumo(fin, "moi_horas") : undefined;
  const { ritmo, planejado } = calcRitmo(macros, avanco);
  const finalizacao = etapas.map((e) => e.data_prevista_fim).filter(Boolean).sort().pop() || null;
  const diasFinal = finalizacao ? diasAte(finalizacao) : null;
  const folgaPrazo = finalizacao && pi.prazo ? Math.round((new Date(`${pi.prazo}T12:00:00`) - new Date(`${finalizacao}T12:00:00`)) / 86400000) : null;
  const t = useAnimacao(`${pi.id}|${etapasBrutas.length}|${material}|${horasC}`);
  const corConsumo = (v) => (v === null ? "cinza" : v <= avanco ? "verde" : "vermelho");
  const corRitmo = ritmo === null ? "cinza" : ritmo >= 95 ? "verde" : ritmo >= 80 ? "ambar" : "vermelho";

  return (
    <div className="flex flex-col gap-4">
      <div className={`grid grid-cols-2 md:grid-cols-3 ${[material, horasC].filter((v) => v !== undefined).length === 2 ? "xl:grid-cols-5" : material !== undefined || horasC !== undefined ? "xl:grid-cols-4" : "xl:grid-cols-3"} gap-3`}>
        <Medidor titulo="Avanço" valor={avanco} t={t} cor="cyan" detalhe={`${macros.length} macro-etapa(s)`} onClick={() => irPara("cronograma")} />
        <Medidor titulo="Ritmo da execução" valor={ritmo} max={150} t={t} cor={corRitmo} marcador={ritmo === null ? null : 100}
          detalhe={ritmo === null ? (planejado === 0 ? "Execução ainda não começou pelo cronograma" : "Cronograma sem datas") : `${ritmo >= 100 ? "Adiantado / no ritmo" : ritmo >= 95 ? "No ritmo" : ritmo >= 80 ? "Um pouco atrasado" : "Atrasado"} · previsto hoje ${planejado}%`} onClick={() => irPara("cronograma")} />
        {material !== undefined && <Medidor titulo="Consumo material" valor={material} t={t} cor={corConsumo(material)} marcador={material === null ? null : avanco}
          detalhe={material === null ? "Sem valor orçado" : material <= avanco ? "Abaixo do avanço ✓" : "Acima do avanço"} onClick={() => irPara("financeiro")} />}
        {horasC !== undefined && <Medidor titulo="Consumo horas" valor={horasC} t={t} cor={corConsumo(horasC)} marcador={horasC === null ? null : avanco}
          detalhe={horasC === null ? "Sem horas orçadas" : horasC <= avanco ? "Abaixo do avanço ✓" : "Acima do avanço"} onClick={() => irPara("financeiro")} />}
        <button onClick={() => irPara("cronograma")} className="cartao p-4 flex flex-col text-left min-w-0 hover:shadow-md hover:-translate-y-0.5 transition-all">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Finalização prevista</div>
          <div className="flex-1 flex flex-col justify-center py-2" style={{ opacity: 0.25 + 0.75 * t, transform: `translateY(${(1 - t) * 8}px)` }}>
            <div className="font-head font-bold text-3xl tabular-nums text-navy">{finalizacao ? formatarData(finalizacao) : "—"}</div>
            {finalizacao && <div className="text-sm text-muted mt-1">{diasFinal < 0 ? `há ${Math.abs(diasFinal)} dia(s)` : diasFinal === 0 ? "hoje" : `em ${diasFinal} dia(s)`}</div>}
          </div>
          <div className="texto-apoio leading-snug">
            {!finalizacao ? "Última data do cronograma" : folgaPrazo === null ? "Última data do cronograma"
              : <span className={folgaPrazo >= 0 ? "text-green" : "text-red"}>{folgaPrazo >= 0 ? `${folgaPrazo} dia(s) antes do prazo (${formatarData(pi.prazo)})` : `${Math.abs(folgaPrazo)} dia(s) após o prazo (${formatarData(pi.prazo)})`}</span>}
          </div>
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

// ---------------- Cronograma: a mesma visão da página Cronograma, só deste PI ----------------
function AbaCronograma({ pi, obras = null }) {
  const { usuario } = useAuth();
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const acoes = <>
    <button onClick={() => setGerandoPdf(true)} className="btn btn-primario btn-sm"><Icone nome="pdf" className="w-4 h-4" /> Gerar PDF / Excel{obras ? " do contrato" : ""}</button>
    {!obras && pode(usuario, "etapa.editar") && <Link href={`/cronograma?pi=${pi.id}`} className="btn btn-contorno btn-sm"><Icone nome="editar" className="w-4 h-4" /> Configurar Cronograma</Link>}
  </>;
  return (
    <>
      {obras ? <CronogramaVisao pisFixos={obras.map((f) => f.id)} acoes={acoes} /> : <CronogramaVisao piFixo={pi.id} acoes={acoes} />}
      {gerandoPdf && <ModalPdfCronograma pi={pi} obras={obras} usuario={usuario} onFechar={() => setGerandoPdf(false)} />}
    </>
  );
}
// contrato: cronograma consolidado = cada obra vira uma macro-etapa e as macro-etapas da obra viram sub-etapas
function etapasDoContrato(obras, todas) {
  const linhas = [];
  obras.forEach((o, i) => {
    const doObra = consolidarMacros(todas.filter((e) => e.pi_id === o.id)).filter((e) => !e.parent_etapa_id)
      .sort((a, b) => (a.ordem ?? 999999) - (b.ordem ?? 999999) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
    if (!doObra.length) return;
    const id = `obra-${o.id}`;
    linhas.push({ id, nome: `OBRA ${o.codigo}${o.projeto ? ` — ${o.projeto}` : ""}`, parent_etapa_id: null, ordem: i, pi_id: o.id, responsavel_texto: "" });
    doObra.forEach((m, k) => linhas.push({ ...m, parent_etapa_id: id, ordem: k, calculada: false }));
  });
  return linhas;
}

// Gerar PDF do cronograma: salvar no computador, salvar no SGO (Documentos do PI),
// enviar pelo e-mail de quem está usando (baixa o PDF e abre o e-mail) e enviar via SGO
// (para contatos do cliente, com o PDF anexado)
function ModalPdfCronograma({ pi, usuario, onFechar, obras = null }) {
  const { avisar } = useToast();
  const { dados: etapasT } = useTabela("etapas", { filtro: obras ? null : [["pi_id", pi.id]] });
  const etapas = useMemo(() => (obras ? etapasDoContrato(obras, etapasT) : etapasT), [etapasT, obras]);
  const { dados: clientes } = useTabela("clientes", { order: { coluna: "nome" } });
  const { dados: acessos } = useTabela("cliente_acessos", { filtro: [["pi_id", pi.id]] });
  const [op, setOp] = useState({ computador: true, sgo: false, meuEmail: false, viaSgo: false });
  const [formato, setFormato] = useState("pdf"); // pdf | excel | ambos
  const [porObra, setPorObra] = useState(false); // contrato: também um arquivo por obra
  const [destinos, setDestinos] = useState([]);
  const [mensagem, setMensagem] = useState("");
  const [processando, setProcessando] = useState("");
  // contatos do cliente: mesma empresa do PI ou com acesso a este PI no portal
  const chave = (s) => String(s || "").trim().toLocaleLowerCase("pt-BR");
  const contatos = clientes.filter((c) => c.ativo !== false && c.email && (chave(c.empresa) === chave(pi.cliente) || acessos.some((a) => a.cliente_id === c.id)));
  const marcar = (k) => setOp((p) => ({ ...p, [k]: !p[k] }));
  const algumaOpcao = Object.values(op).some(Boolean);
  const pronto = algumaOpcao && (!op.viaSgo || destinos.length > 0) && etapas.length > 0;

  const gerar = async () => {
    if (!pronto) return;
    try {
      // arquivos no formato escolhido (PDF, Excel ou os dois)
      setProcessando("Gerando arquivo(s)...");
      const base = baseNomeCronograma(pi);
      const arquivos = [];
      if (formato !== "excel") arquivos.push({ blob: await gerarPdfCronograma({ pi, etapas }), nome: `${base}.pdf`, tipo: "application/pdf" });
      if (formato !== "pdf") arquivos.push({ blob: await gerarExcelCronograma({ pi, etapas }), nome: `${base}.xlsx`, tipo: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      // contrato: também um arquivo separado por obra (salvos no SGO na pasta de cada obra)
      if (obras && porObra) {
        for (const o of obras) {
          const eo = etapasT.filter((e) => e.pi_id === o.id);
          if (!eo.length) continue;
          const bo = baseNomeCronograma(o);
          if (formato !== "excel") arquivos.push({ blob: await gerarPdfCronograma({ pi: o, etapas: eo }), nome: `${bo}.pdf`, tipo: "application/pdf", piId: o.id });
          if (formato !== "pdf") arquivos.push({ blob: await gerarExcelCronograma({ pi: o, etapas: eo }), nome: `${bo}.xlsx`, tipo: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", piId: o.id });
        }
      }
      const nome = arquivos.map((a) => a.nome).join(" e ");
      if (op.computador || op.meuEmail) {
        for (const arq of arquivos) {
          const url = URL.createObjectURL(arq.blob);
          const a = document.createElement("a"); a.href = url; a.download = arq.nome; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        }
      }
      const caminhos = [];
      if (op.sgo || op.viaSgo) {
        setProcessando("Salvando no SGO...");
        for (const arq of arquivos) {
          const caminho = `${arq.piId || pi.id}/${arq.nome}`;
          const { error } = await supabase.storage.from(BUCKET_DOCUMENTOS).upload(caminho, arq.blob, { upsert: true, contentType: arq.tipo });
          if (error) throw new Error(`não foi possível salvar no SGO (${error.message})`);
          if (!arq.piId) caminhos.push(caminho); // o envio por e-mail leva o consolidado (arquivos da pasta do PI Pai)
        }
        await registrarLog(usuario, "Gerou cronograma (arquivo)", `${pi.codigo} — ${nome}`);
      }
      if (op.viaSgo) {
        setProcessando("Enviando...");
        const { ok, json } = await chamarApi("/api/alertas", { acao: "enviar_pdf", piId: pi.id, caminhos, clienteIds: destinos, mensagem, assunto: `Cronograma ${pi.codigo} - ${pi.cliente || ""}` });
        if (!ok) throw new Error(json.error || "falha no envio");
        avisar(`Cronograma enviado para ${json.enviados} contato(s).`);
      }
      if (op.meuEmail) {
        const corpo = `Olá,\n\nSegue em anexo o cronograma atualizado do ${pi.codigo} - ${pi.cliente || ""}${pi.projeto ? ` (${pi.projeto})` : ""}.\n\n(O arquivo ${nome} foi baixado no seu computador: anexe-o a este e-mail.)\n\nAtenciosamente,\n${usuario?.nome || ""}`;
        window.location.href = `mailto:?subject=${encodeURIComponent(`Cronograma ${pi.codigo} - ${pi.cliente || ""}`)}&body=${encodeURIComponent(corpo)}`;
      }
      if (op.sgo && !op.viaSgo) avisar("Arquivo(s) salvo(s) em Documentos do PI.");
      else if (op.computador && !op.sgo && !op.viaSgo && !op.meuEmail) avisar("Arquivo(s) baixado(s).");
      onFechar();
    } catch (e) {
      avisar(`Não foi possível concluir: ${e.message}`, "erro", 8000);
    } finally { setProcessando(""); }
  };

  const opcao = (k, titulo, dica) => (
    <label className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${op[k] ? "border-cyan bg-cyan/5" : "border-line"}`}>
      <input type="checkbox" checked={op[k]} onChange={() => marcar(k)} className="mt-0.5 w-4 h-4 accent-cyan" />
      <span className="text-sm"><strong>{titulo}</strong><span className="texto-apoio block">{dica}</span></span>
    </label>
  );
  return (
    <Modal titulo={`Cronograma em arquivo — ${pi.codigo}`} onFechar={() => !processando && onFechar()} largura="max-w-lg" confirmarAoFechar={false}
      rodape={<>
        <button onClick={onFechar} disabled={!!processando} className="btn btn-fantasma">Cancelar</button>
        <button onClick={gerar} disabled={!pronto || !!processando} className="btn btn-primario">{processando ? <><Spinner /> {processando}</> : "Gerar"}</button>
      </>}>
      <div className="flex flex-col gap-2.5">
        <div>
          <span className="rotulo">Formato</span>
          <div className="flex p-1 rounded-xl bg-panel border border-line" role="radiogroup" aria-label="Formato">
            {[["pdf", "PDF"], ["excel", "Excel"], ["ambos", "PDF + Excel"]].map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={formato === v} onClick={() => setFormato(v)}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold ${formato === v ? "bg-white text-cyan shadow-sm" : "text-muted"}`}>{l}</button>
            ))}
          </div>
          <div className="texto-apoio mt-1.5">Layout do cronograma padrão: placar de status, EAP, responsável, duração, dias úteis, evolução e Gantt.{formato !== "pdf" ? " No Excel, as fórmulas e o Gantt se atualizam ao mudar datas ou %." : ""}</div>
        </div>
        {obras && (
          <label className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${porObra ? "border-cyan bg-cyan/5" : "border-line"}`}>
            <input type="checkbox" checked={porObra} onChange={(e) => setPorObra(e.target.checked)} className="mt-0.5 w-4 h-4 accent-cyan" />
            <span className="text-sm"><strong>Também um arquivo por obra</strong><span className="texto-apoio block">O consolidado mostra cada obra com as macro-etapas dela. Marcando aqui, gera também o cronograma completo de cada uma das {obras.length} obras (no SGO, cada um vai para a pasta da sua obra).</span></span>
          </label>
        )}
        <div className="text-sm text-muted">Escolha uma ou mais opções:</div>
        {opcao("computador", "Salvar no computador", "Baixa o(s) arquivo(s).")}
        {opcao("sgo", "Salvar no SGO", "Guarda o(s) arquivo(s) em Documentos deste PI.")}
        {opcao("meuEmail", "Enviar por e-mail", "Baixa o(s) arquivo(s) e abre um e-mail novo no seu programa de e-mail, pronto para anexar e enviar.")}
        {opcao("viaSgo", "Enviar via SGO", "O SGO envia o e-mail com o(s) arquivo(s) anexado(s) para os contatos do cliente que você escolher.")}
        {op.viaSgo && (
          <div className="rounded-xl border border-line p-3 flex flex-col gap-2">
            <div className="text-xs font-semibold text-muted">Contatos de {pi.cliente || "cliente"} ({contatos.length})</div>
            {contatos.length === 0 && <Aviso tipo="info">Nenhum contato cadastrado para este cliente. Cadastre em <strong>Clientes</strong> (mesma empresa do PI) ou dê acesso a este PI.</Aviso>}
            {contatos.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="accent-cyan w-4 h-4" checked={destinos.includes(c.id)} onChange={() => setDestinos((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id]))} />
                <span className="flex-1 min-w-0 truncate">{c.nome}{c.funcao ? <span className="text-muted"> · {c.funcao}</span> : ""}</span>
                <span className="text-xs text-muted truncate">{c.email}</span>
              </label>
            ))}
            <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={2} className="input" placeholder="Mensagem (opcional)" />
          </div>
        )}
        {!etapas.length && <Aviso tipo="info">Este PI ainda não tem etapas no cronograma.</Aviso>}
      </div>
    </Modal>
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
      {!carregando && !porRecurso.length && <EstadoVazio icone="recursos" titulo="Ninguém alocado" texto="Aloque pessoas e equipamentos nas etapas em Configurar Cronograma ou em Alocação de recursos." />}
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
      <AgoraEmCampo pi={pi} horasPi={horasPi} nome={nome} />
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

// quadro "Agora em campo": quem está com check-in aberto neste PI e as etapas em andamento
// (status "Em andamento" ou, sem status, dentro do período previsto hoje)
function AgoraEmCampo({ pi, horasPi, nome }) {
  const { dados: etapas } = useTabela("etapas", { filtro: [["pi_id", pi.id]], order: { coluna: "ordem" } });
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 30000); return () => clearInterval(t); }, []);
  const hoje = new Date().toLocaleDateString("sv-SE");
  const abertos = horasPi.filter((h) => h.entrada && !h.saida).sort((a, b) => a.entrada.localeCompare(b.entrada));
  const desde = (iso) => {
    const min = Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 60000));
    return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}min`;
  };
  const andamento = etapasEmArvore(etapas)
    .filter((e) => e.status === "em_andamento" || (e.status !== "concluida" && e.status !== "parada" && e.data_prevista_inicio && e.data_prevista_inicio <= hoje && (!e.data_prevista_fim || e.data_prevista_fim >= hoje)));
  const macro = (e) => (e.parent_etapa_id ? etapas.find((m) => m.id === e.parent_etapa_id)?.nome : null);

  return (
    <Secao titulo="Agora em campo" className="xl:col-span-2">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Check-in em aberto ({abertos.length})</div>
          {!abertos.length && <div className="text-sm text-muteddim">Ninguém com check-in aberto neste PI agora.</div>}
          <div className="flex flex-col gap-1.5">
            {abertos.map((h) => {
              const antigo = h.data && h.data !== hoje;
              return (
                <div key={h.id} className="rounded-lg bg-panel px-3 py-2 flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-green animate-pulse shrink-0" />
                  <span className="flex-1 min-w-0 truncate font-medium">{nome(h.usuario_id)}</span>
                  <span className="texto-apoio tabular-nums">desde {formatarDataHora(h.entrada)}</span>
                  <span className={`selo ${antigo ? "bg-red/10 text-red" : "bg-green/10 text-green"}`}>{antigo ? "esquecido?" : desde(h.entrada)}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Etapas em andamento ({andamento.length})</div>
          {!andamento.length && <div className="text-sm text-muteddim">Nenhuma etapa em andamento hoje.</div>}
          <div className="flex flex-col gap-1.5">
            {andamento.map((e) => {
              const atrasada = e.data_prevista_fim && e.data_prevista_fim < hoje;
              const pct = Number(e.percentual) || 0;
              return (
                <div key={e.id} className="rounded-lg bg-panel px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 min-w-0 truncate"><strong className="font-semibold">{e.nome}</strong>{macro(e) && <span className="texto-apoio"> · {macro(e)}</span>}</span>
                    <span className="texto-apoio tabular-nums shrink-0">{formatarData(e.data_prevista_inicio)} – {formatarData(e.data_prevista_fim)}</span>
                    {atrasada && <span className="selo bg-red/10 text-red">atrasada</span>}
                    {e.status !== "em_andamento" && <span className="selo bg-amber/10 text-amber" title="Dentro do período previsto, mas o status ainda não foi marcado como Em andamento">pelo prazo</span>}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-line overflow-hidden"><div className="h-full bg-cyan" style={{ width: `${Math.min(100, pct)}%` }} /></div>
                    <span className="text-xs tabular-nums w-9 text-right">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Secao>
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
// orçado × realizado do PI por grupo ("compra_reais" | "moi_horas"), com as mesmas regras do Relatório
// useFinanceiroPi e consumo moram em lib/dados.js (usados também no app do líder)

// contrato (PI Pai): escolhe Consolidado (soma das obras) ou uma obra
function AbaFinanceiro({ pi, usuario, obras = null }) {
  const [sel, setSel] = useState("");
  if (!obras) return <FinanceiroPi pi={pi} usuario={usuario} />;
  const obra = obras.find((o) => o.id === sel);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setSel("")} className={`chip ${!sel ? "chip-ativo" : ""}`}>Consolidado do contrato</button>
        {obras.map((o) => <button key={o.id} onClick={() => setSel(o.id)} className={`chip ${sel === o.id ? "chip-ativo" : ""}`}>{o.codigo}</button>)}
      </div>
      {obra ? <FinanceiroPi key={obra.id} pi={obra} usuario={usuario} titulo={`Obra ${obra.codigo}${obra.projeto ? ` — ${obra.projeto}` : ""}`} />
        : <FinanceiroPi key="consolidado" pi={pi} usuario={usuario} obras={obras} titulo={`Consolidado — ${obras.length} obras`} />}
    </div>
  );
}
function FinanceiroPi({ pi, usuario, obras = null, titulo = "" }) {
  const ids = obras ? obras.map((o) => o.id) : null;
  const { grupo, soma, carregando } = useFinanceiroPi(pi, ids);
  // só horas (ex: líder de campo): sem valores em R$ (compra e medições ficam ocultas)
  const soHoras = !(pode(usuario, "relatorio.ver") || pode(usuario, "dashboard.valores"));
  const { dados: etapasT } = useTabela("etapas", { select: "id,pi_id,nome,medicao,medicao_valor,medicao_percentual,status,data_prevista_fim", filtro: ids ? null : [["pi_id", pi.id]] });
  const etapas = ids ? etapasT.filter((e) => ids.includes(e.pi_id)) : etapasT;
  const compra = grupo("compra_reais"), moi = grupo("moi_horas");
  const medicoes = etapas.filter((e) => e.medicao);
  // diferença = Orçado − Realizado (positivo = dentro do orçado, negativo = acima), igual ao Relatório
  const difCelulas = (orc, real, fmt) => {
    const o = Number(orc) || 0, r = Number(real) || 0, dif = o - r;
    const perc = o ? (dif / o) * 100 : null;
    const cor = dif >= 0 ? "text-green" : "text-red";
    return (<>
      <td className={`py-1.5 text-right tabular-nums ${cor}`}>{dif > 0 ? "+" : ""}{fmt(dif)}</td>
      <td className={`py-1.5 text-right tabular-nums ${perc === null ? "text-muteddim" : cor}`}>{perc === null ? "—" : `${perc > 0 ? "+" : ""}${perc.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}</td>
    </>);
  };
  const [rReal, rDif] = soHoras ? ["Consumo", "Resultado"] : ["Realizado", "Diferença"];
  const tabela = (titulo, l, fmt) => (
    <Secao titulo={titulo}>
      {!l.length && <div className="text-sm text-muteddim">Sem valores lançados.</div>}
      {l.length > 0 && (
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left border-b border-line"><th className="py-2 titulo-secao">{soHoras ? "Classificação" : "Categoria"}</th><th className="py-2 titulo-secao text-right">Orçado</th><th className="py-2 titulo-secao text-right">{rReal}</th><th className="py-2 titulo-secao text-right">{rDif}</th><th className="py-2 titulo-secao text-right">%</th></tr></thead>
          <tbody>
            {l.map(({ c, it }) => (
              <tr key={c.id} className="border-b border-line/60"><td className="py-1.5"><span className="text-muted text-xs mr-1.5">{c.codigo}</span>{c.nome}</td>
                <td className="py-1.5 text-right tabular-nums">{fmt(it.valor_orcado)}</td><td className="py-1.5 text-right tabular-nums">{it.valor_realizado != null ? fmt(it.valor_realizado) : "—"}</td>
                {difCelulas(it.valor_orcado, it.valor_realizado, fmt)}</tr>
            ))}
            <tr className="font-semibold"><td className="py-2">Total</td><td className="py-2 text-right tabular-nums">{fmt(soma(l, "valor_orcado"))}</td><td className="py-2 text-right tabular-nums">{fmt(soma(l, "valor_realizado"))}</td>
              {difCelulas(soma(l, "valor_orcado"), soma(l, "valor_realizado"), fmt)}</tr>
          </tbody>
        </table>
        </div>
      )}
      {l.length > 0 && <div className="texto-apoio mt-2">{rDif} = Orçado − {rReal}. Verde: dentro do orçado · vermelho: acima do orçado.</div>}
    </Secao>
  );
  if (soHoras) {
    return (
      <div className="flex flex-col gap-4">
        {carregando && <Esqueleto linhas={3} />}
        {tabela("Horas — orçado × consumo × resultado", moi, horas)}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="titulo-quadro">{titulo}</div>
        {pode(usuario, "relatorio.ver") && <Link href={`/relatorios?pi=${pi.id}`} className="btn btn-contorno btn-sm"><Icone nome="relatorio" className="w-4 h-4" /> Relatório completo</Link>}
      </div>
      {carregando && <Esqueleto linhas={3} />}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {tabela("Compra — Produto ou Serviço", compra, reais)}
        {tabela("Relatório de Horas", moi, horas)}
      </div>
      <Secao titulo={`Medições (${medicoes.length})`}>
        {!medicoes.length && <div className="text-sm text-muteddim">Nenhuma etapa com medição marcada.</div>}
        <div className="flex flex-col divide-y divide-line/70">
          {medicoes.sort((a, b) => String(a.data_prevista_fim || "9").localeCompare(String(b.data_prevista_fim || "9"))).map((e) => (
            <div key={e.id} className="py-2 flex items-center gap-2 text-sm">
              <span className="flex-1 min-w-0 truncate">{obras && <span className="font-mono text-xs text-cyan mr-1.5">{obras.find((o) => o.id === e.pi_id)?.codigo}</span>}{e.nome}</span>
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
const ACESSOS = [["ver_linha_tempo", "Cronograma"], ["ver_atas", "Atas"], ["ver_rdos_assinados", "RDOs assinados"], ["ver_ocorrencias_assinadas", "Ocorrências assinadas"]];
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
