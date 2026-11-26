"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Responsive, WidthProvider } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { useTabela } from "../../lib/dados";
import { useAuth, pode } from "../../lib/AuthContext";
import { diasAte, formatarData, saudacao } from "../../lib/datas";
import { STATUS_PI, COR_STATUS_PI, PRAZOS, consolidarMacros } from "../../lib/constantes";
import { horasDoLancamento } from "../../lib/horas";
import PainelShell from "../../components/PainelShell";
import { CabecalhoPagina, Esqueleto, EstadoVazio, BotaoLimpar } from "../../components/ui";
import Icone from "../../components/Icone";
import DocumentosNaoAbertos from "../../components/DocumentosNaoAbertos";

const GradeResponsiva = WidthProvider(Responsive);

function formatarValor(v) { return v === null || v === undefined ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`; }
function formatarPercentual(v) { return v === null || v === undefined ? "—" : `${v}%`; }

// disposição padrão dos quadros (12 colunas; cada linha tem 56px)
const LAYOUT_PADRAO = {
  lg: [
    { i: "pis-ativos", x: 0, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
    { i: "aprovacoes", x: 3, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
    { i: "atrasadas", x: 6, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
    { i: "medicoes-20", x: 9, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
    { i: "lista-pis", x: 0, y: 2, w: 5, h: 9, minW: 3, minH: 4 },
    { i: "medicoes", x: 5, y: 2, w: 7, h: 9, minW: 4, minH: 4 },
    { i: "docs-nao-abertos", x: 0, y: 11, w: 12, h: 8, minW: 4, minH: 4 },
    { i: "nao-iniciados", x: 0, y: 19, w: 12, h: 7, minW: 4, minH: 4 },
  ],
  md: [
    { i: "pis-ativos", x: 0, y: 0, w: 6, h: 2, minW: 3, minH: 2 },
    { i: "aprovacoes", x: 6, y: 0, w: 6, h: 2, minW: 3, minH: 2 },
    { i: "atrasadas", x: 0, y: 2, w: 6, h: 2, minW: 3, minH: 2 },
    { i: "medicoes-20", x: 6, y: 2, w: 6, h: 2, minW: 3, minH: 2 },
    { i: "lista-pis", x: 0, y: 4, w: 12, h: 8, minW: 4, minH: 4 },
    { i: "medicoes", x: 0, y: 12, w: 12, h: 8, minW: 4, minH: 4 },
    { i: "docs-nao-abertos", x: 0, y: 20, w: 12, h: 8, minW: 4, minH: 4 },
    { i: "nao-iniciados", x: 0, y: 28, w: 12, h: 7, minW: 4, minH: 4 },
  ],
  sm: [
    { i: "pis-ativos", x: 0, y: 0, w: 1, h: 2 },
    { i: "aprovacoes", x: 0, y: 2, w: 1, h: 2 },
    { i: "atrasadas", x: 0, y: 4, w: 1, h: 2 },
    { i: "medicoes-20", x: 0, y: 6, w: 1, h: 2 },
    { i: "lista-pis", x: 0, y: 8, w: 1, h: 9 },
    { i: "medicoes", x: 0, y: 17, w: 1, h: 9 },
    { i: "docs-nao-abertos", x: 0, y: 26, w: 1, h: 9 },
    { i: "nao-iniciados", x: 0, y: 35, w: 1, h: 9 },
  ],
};
const IDS = LAYOUT_PADRAO.lg.map((l) => l.i);

// garante que um layout salvo tem todos os quadros atuais (e nenhum que não exista mais)
function completarLayouts(salvos) {
  const r = {};
  for (const bp of Object.keys(LAYOUT_PADRAO)) {
    const s = (salvos?.[bp] || []).filter((l) => IDS.includes(l.i));
    const faltando = LAYOUT_PADRAO[bp].filter((p) => !s.some((l) => l.i === p.i));
    // mantém os limites mínimos atuais mesmo em layouts salvos antes
    r[bp] = [...s.map((l) => ({ ...LAYOUT_PADRAO[bp].find((p) => p.i === l.i), ...l, minW: LAYOUT_PADRAO[bp].find((p) => p.i === l.i)?.minW, minH: LAYOUT_PADRAO[bp].find((p) => p.i === l.i)?.minH })), ...faltando];
  }
  return r;
}

export default function DashboardPage() {
  const { usuario } = useAuth();
  const { dados: pis, carregando: carregandoPis } = useTabela("pis", { order: { coluna: "created_at", asc: false } });
  const { dados: etapas } = useTabela("etapas");
  const { dados: rdosPendentes } = useTabela("rdos", { select: "id", filtro: [["status", "pendente"]] });
  const { dados: horasPendentes } = useTabela("apontamentos_horas", { select: "id", filtro: [["status", "pendente"]] });
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("ativo");
  const [jarvis, setJarvis] = useState(false);
  useEffect(() => { if (new URLSearchParams(window.location.search).get("jarvis")) setJarvis(true); }, []);

  // ---- layout dos quadros (salvo por usuário neste navegador) ----
  const chave = usuario ? `contric:dashboard:${usuario.id}` : null;
  const [layouts, setLayouts] = useState(LAYOUT_PADRAO);
  const [pronto, setPronto] = useState(false);
  const [breakpoint, setBreakpoint] = useState("lg");
  useEffect(() => {
    if (!chave) return;
    try {
      const salvo = JSON.parse(localStorage.getItem(chave) || "null");
      if (salvo) setLayouts(completarLayouts(salvo));
    } catch { /* sem armazenamento local: usa o padrão */ }
    setPronto(true);
  }, [chave]);
  const aoMudarLayout = (_atual, todos) => {
    const completos = completarLayouts(todos);
    setLayouts(completos);
    try { if (chave) localStorage.setItem(chave, JSON.stringify(completos)); } catch { /* ignora */ }
  };
  const restaurar = () => {
    setLayouts(LAYOUT_PADRAO);
    try { if (chave) localStorage.removeItem(chave); } catch { /* ignora */ }
  };
  const podeMover = breakpoint !== "sm";

  // ---- dados ----
  const pisAtivos = pis.filter((p) => p.status === "ativo");
  const etapasAtrasadas = etapas.filter((e) => e.status !== "concluida" && diasAte(e.data_prevista_fim) !== null && diasAte(e.data_prevista_fim) < 0
    && pisAtivos.some((p) => p.id === e.pi_id));
  const pendencias = rdosPendentes.length + horasPendentes.length;

  // agrupa por PI: cada macro/sub-etapa com Medição marcada, exceto as já concluídas,
  // ordenada dentro do PI pela previsão de término mais próxima
  const gruposMedicoes = useMemo(() => pis
    .map((pi) => {
      const itens = etapas
        .filter((e) => e.pi_id === pi.id && e.medicao && e.status !== "concluida")
        .sort((a, b) => (a.data_prevista_fim || "9999").localeCompare(b.data_prevista_fim || "9999"));
      return { pi, itens };
    })
    .filter((g) => g.itens.length > 0)
    .sort((a, b) => (a.itens[0].data_prevista_fim || "9999").localeCompare(b.itens[0].data_prevista_fim || "9999")), [pis, etapas]);
  const medicoesProximas = gruposMedicoes.flatMap((g) => g.itens).filter((e) => { const d = diasAte(e.data_prevista_fim); return d !== null && d <= PRAZOS.medicoes; }).length;

  const progressoDoPi = (piId) => {
    const macros = etapas.filter((e) => e.pi_id === piId && !e.parent_etapa_id);
    if (!macros.length) return null;
    const soma = macros.reduce((s, e) => s + (e.status === "concluida" ? 100 : Number(e.percentual) || 0), 0);
    return Math.round(soma / macros.length);
  };

  const termo = busca.trim().toLowerCase();
  const pisFiltrados = pis.filter((p) =>
    (!filtroStatus || p.status === filtroStatus) &&
    (!termo || [p.codigo, p.cliente, p.projeto].some((c) => (c || "").toLowerCase().includes(termo))));

  const quadros = {
    "docs-nao-abertos": <DocumentosNaoAbertos usuario={usuario} pis={pis} />,
    "nao-iniciados": <PisNaoIniciados pis={pisAtivos} etapas={etapas} />,
    "pis-ativos": <Indicador titulo="PIs ativos" valor={pisAtivos.length} detalhe={`${pis.length} no total`} icone="obra" cor="text-cyan bg-cyan/10" href="/cronograma" />,
    aprovacoes: <Indicador titulo="Aprovações pendentes" valor={pendencias} detalhe={`${rdosPendentes.length} RDO · ${horasPendentes.length} horas`} icone="aprovar"
      cor={pendencias ? "text-amber bg-amber/10" : "text-green bg-green/10"} href="/aprovacoes" destaque={pendencias > 0} />,
    atrasadas: <Indicador titulo="Etapas atrasadas" valor={etapasAtrasadas.length} detalhe="em PIs ativos" icone="alerta"
      cor={etapasAtrasadas.length ? "text-red bg-red/10" : "text-green bg-green/10"} href="/linha-do-tempo" />,
    "medicoes-20": <Indicador titulo={`Medições em ${PRAZOS.medicoes} dias`} valor={medicoesProximas} detalhe="vencidas ou próximas" icone="calendario" cor="text-[#8E5CD9] bg-[#8E5CD9]/10" />,

    "lista-pis": (
      <section className="cartao p-4 md:p-5 h-full flex flex-col min-h-0">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="titulo-quadro">PIs</h2>
          <span className="text-xs text-muted">{pisFiltrados.length} de {pis.length}</span>
        </div>
        <div className="relative mb-2">
          <Icone nome="buscar" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muteddim" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nº, cliente ou projeto" className="input pl-9" />
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {[["", "Todos"], ...Object.entries(STATUS_PI)].map(([v, l]) => (
            <button key={v} onClick={() => setFiltroStatus(v)} className={`chip ${filtroStatus === v ? "chip-ativo" : ""}`}>{l}</button>
          ))}
          <BotaoLimpar qtd={(busca ? 1 : 0) + (filtroStatus !== "ativo" ? 1 : 0)} onClick={() => { setBusca(""); setFiltroStatus("ativo"); }} />
        </div>
        {carregandoPis && <Esqueleto linhas={4} altura={56} />}
        {!carregandoPis && pis.length === 0 && (
          <EstadoVazio icone="obra" titulo="Nenhum PI ainda" texto="Crie o primeiro PI em Cadastro de PIs."
            acao={<Link href="/pis" className="btn btn-primario btn-sm">Ir para Cadastro de PIs</Link>} />
        )}
        {!carregandoPis && pis.length > 0 && pisFiltrados.length === 0 && <div className="text-sm text-muteddim py-6 text-center">Nenhum PI encontrado.</div>}
        <div className="flex flex-col gap-2 overflow-y-auto rolagem-fina flex-1 min-h-0 -mx-1 px-1">
          {pisFiltrados.map((pi) => {
            const prog = progressoDoPi(pi.id);
            return (
              <Link key={pi.id} href={`/pi?id=${pi.id}`} draggable={false} className="group block p-3 rounded-xl border border-transparent bg-panel hover:bg-white hover:border-line hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate"><span className="font-mono text-cyan">{pi.codigo}</span> · {pi.cliente || "—"}</div>
                    {pi.projeto && <div className="text-xs text-muted truncate">{pi.projeto}</div>}
                  </div>
                  <span className={`selo shrink-0 ${COR_STATUS_PI[pi.status] || "bg-panel text-muted"}`}>{STATUS_PI[pi.status] || pi.status}</span>
                </div>
                {prog !== null && (
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 h-1.5 rounded-full bg-line overflow-hidden"><div className="h-full bg-cyan rounded-full" style={{ width: `${prog}%` }} /></div>
                    <span className="text-[11px] font-mono text-muted w-8 text-right">{prog}%</span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </section>
    ),

    medicoes: (
      <section className="cartao p-4 md:p-5 h-full flex flex-col min-h-0">
        <h2 className="titulo-quadro mb-3">Medições em aberto</h2>
        {gruposMedicoes.length === 0 && (
          <EstadoVazio icone="calendario" titulo="Nada a medir" texto="Marque “Medição” em macro ou sub-etapas em Configurar Cronograma para acompanhar aqui." />
        )}
        {gruposMedicoes.length > 0 && (
          <div className="overflow-auto rolagem-fina flex-1 min-h-0 -mx-4 md:mx-0">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="text-left border-b border-line">
                  <th className="py-2 px-4 md:pl-0 titulo-secao">Etapa</th>
                  <th className="py-2 pr-3 titulo-secao text-right">Avanço</th>
                  <th className="py-2 pr-3 titulo-secao text-right">Medição</th>
                  <th className="py-2 pr-3 titulo-secao text-right">Valor</th>
                  <th className="py-2 pr-4 md:pr-0 titulo-secao">Término previsto</th>
                </tr>
              </thead>
              <tbody>
                {gruposMedicoes.map(({ pi, itens }) => (
                  <Fragment key={pi.id}>
                    <tr>
                      <td colSpan={5} className="pt-4 pb-1.5 px-4 md:pl-0 text-sm text-cyan font-semibold">
                        {pi.codigo} — {pi.cliente}{pi.projeto ? ` — ${pi.projeto}` : ""}
                      </td>
                    </tr>
                    {itens.map((etapa) => {
                      const dias = diasAte(etapa.data_prevista_fim);
                      const vencida = dias !== null && dias < 0;
                      const proxima = dias !== null && dias >= 0 && dias <= PRAZOS.medicoes;
                      return (
                        <tr key={etapa.id} className="border-b border-line/60 hover:bg-panel/60">
                          <td className="py-2 px-4 md:pl-0">{etapa.parent_etapa_id ? <span className="text-muteddim">· </span> : ""}{etapa.nome}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{formatarPercentual(etapa.percentual)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{formatarPercentual(etapa.medicao_percentual)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{formatarValor(etapa.medicao_valor)}</td>
                          <td className="py-2 pr-4 md:pr-0 whitespace-nowrap tabular-nums">
                            {formatarData(etapa.data_prevista_fim)}
                            {vencida && <span className="selo bg-red/10 text-red ml-2">vencida</span>}
                            {proxima && <span className="selo bg-amber/10 text-amber ml-2">{dias === 0 ? "hoje" : `em ${dias}d`}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    ),
  };

  return (
    <PainelShell>
      <div className="p-4 md:p-8">
        <CabecalhoPagina
          titulo={`${saudacao()}, ${usuario?.nome?.split(" ")[0] || ""}`}
          subtitulo={podeMover ? "Arraste os quadros para reorganizar e puxe as bordas para mudar o tamanho." : "Visão geral das obras"}
          acoes={<>
            <button onClick={() => setJarvis(true)} className="btn btn-escuro" title="Cockpit de controle geral das obras">
              <span className="w-2 h-2 rounded-full bg-[#29d3ff] shadow-[0_0_8px_#29d3ff] animate-pulse" /> Ativar Jarvis
            </button>
            {podeMover && <button onClick={restaurar} className="btn btn-contorno">Restaurar layout</button>}
            <Link href="/cronograma" className="btn btn-primario"><Icone nome="cronograma" className="w-4 h-4" /> Abrir cronograma</Link>
          </>}
        />

        {pronto && (
          <GradeResponsiva
            className="dashboard-grade -mx-2"
            layouts={layouts}
            breakpoints={{ lg: 1100, md: 700, sm: 0 }}
            cols={{ lg: 12, md: 12, sm: 1 }}
            rowHeight={56}
            margin={[16, 16]}
            containerPadding={[8, 0]}
            isDraggable={podeMover}
            isResizable={podeMover}
            resizeHandles={["n", "s", "e", "w", "ne", "nw", "se", "sw"]}
            draggableCancel="input, textarea, select, button, a, .nao-arrastar"
            compactType="vertical"
            onBreakpointChange={setBreakpoint}
            onLayoutChange={aoMudarLayout}
          >
            {IDS.map((id) => (
              <div key={id} className={podeMover ? "quadro-movel" : ""}>{quadros[id]}</div>
            ))}
          </GradeResponsiva>
        )}
      </div>
      {jarvis && <Jarvis pis={pis} etapasBrutas={etapas} usuario={usuario} onFechar={() => setJarvis(false)} />}
    </PainelShell>
  );
}

// ======================= JARVIS: cockpit de controle geral das obras =======================
const JV = { ok: "#29d3ff", bom: "#3ee08f", at: "#ffb547", ru: "#ff4d5e", off: "#2a4a63" };
const POR_PAGINA = 20;
const ehAbertoPi = (p) => !["concluido", "cancelado"].includes(p.status || "ativo");

function useRelogio() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setAgora(new Date()), 1000); return () => clearInterval(t); }, []);
  return agora;
}
// um relógio de animação para todos os medidores (sobem juntos até o valor)
function useAnimacaoJarvis(chave) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setT(1); return; }
    let raf, ini = null; setT(0);
    const passo = (a) => { if (ini === null) ini = a; const p = Math.min(1, (a - ini) / 1400); setT(1 - Math.pow(1 - p, 3)); if (p < 1) raf = requestAnimationFrame(passo); };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [chave]);
  return t;
}
function MiniMedidor({ rotulo, valor, max = 100, cor, sufixo = "%", perigo, t, dica }) {
  const vazio = valor === null || valor === undefined;
  const f = vazio ? 0 : Math.max(0, Math.min(1, (valor * t) / max));
  const L = Math.PI * 15;
  const c = vazio ? JV.off : cor;
  return (
    <div className={`text-center py-0.5 ${perigo ? "jv-pisca" : ""}`} title={dica}>
      <svg viewBox="0 0 40 23" className="w-full block">
        <path d="M5 20 A15 15 0 0 1 35 20" fill="none" stroke="#0e3550" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M5 20 A15 15 0 0 1 35 20" fill="none" stroke={c} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${L * f} ${L}`} style={{ filter: `drop-shadow(0 0 2px ${c})` }} />
      </svg>
      <div className="text-[12px] font-semibold leading-none -mt-[11px] tabular-nums" style={{ color: c }}>{vazio ? "—" : `${Math.round(valor * t)}${sufixo}`}</div>
      <div className="text-[8.5px] tracking-wide text-[#4f9cc4] mt-0.5 leading-none">{rotulo}</div>
    </div>
  );
}

function Jarvis({ pis, etapasBrutas, usuario, onFechar }) {
  const agora = useRelogio();
  const verValores = pode(usuario, "dashboard.valores") || pode(usuario, "relatorio.ver");
  const verHoras = verValores || pode(usuario, "financeiro.horas");
  const { dados: categorias } = useTabela("categorias_orcamento");
  const { dados: orc } = useTabela("orcamento_pi_item");
  const { dados: apont } = useTabela("apontamentos_horas", { select: "id,pi_id,status,entrada,saida,horas_totais,horas_normais,horas_extras,categoria_normal_id,categoria_extra_id" });
  const { dados: rdos } = useTabela("rdos", { select: "id,pi_id,status,pdf_path,data,created_at" });
  const { dados: ocs } = useTabela("ocorrencias", { select: "id,pi_id,status,pdf_path,rdo_id,created_at" });
  const { dados: solic } = useTabela("solicitacoes_alteracao_cronograma", { select: "id,etapa_id,status" });
  const { dados: lidos } = useTabela("documentos_lidos", { select: "caminho", filtro: [["usuario_id", usuario?.id]] });
  const { dados: cfgFoto } = useTabela("configuracoes", { filtro: [["chave", "avanco_diario"]] });

  // ---- seleção de PIs (guardada por usuário neste navegador) ----
  const chave = `contric:jarvis:${usuario?.id}`;
  const [sel, setSel] = useState(null); // null = todos os abertos
  useEffect(() => { try { const s = JSON.parse(localStorage.getItem(chave) || "null"); if (Array.isArray(s)) setSel(s); } catch { /* sem armazenamento */ } }, [chave]);
  const salvarSel = (s) => { setSel(s); try { if (s === null) localStorage.removeItem(chave); else localStorage.setItem(chave, JSON.stringify(s)); } catch { /* ignora */ } };
  const [filtroAberto, setFiltroAberto] = useState(false);
  const [buscaF, setBuscaF] = useState("");
  const [pagina, setPagina] = useState(0);
  useEffect(() => { const esc = (e) => e.key === "Escape" && (filtroAberto ? setFiltroAberto(false) : onFechar()); document.addEventListener("keydown", esc); return () => document.removeEventListener("keydown", esc); }, [filtroAberto, onFechar]);

  // contrato: só o PI Pai (consolidado das obras)
  const visiveis = new Set(pis.map((p) => p.id));
  const principais = pis.filter((p) => !(p.pi_pai_id && visiveis.has(p.pi_pai_id))).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), "pt-BR", { numeric: true }));
  const candidatos = sel === null ? principais.filter(ehAbertoPi) : principais.filter((p) => sel.includes(p.id));

  // ---- indicadores de cada PI ----
  const etapas = useMemo(() => consolidarMacros(etapasBrutas), [etapasBrutas]);
  const lidosSet = useMemo(() => new Set(lidos.map((l) => l.caminho)), [lidos]);
  const fotos = cfgFoto[0]?.valor || {};
  const hojeIso = new Date().toLocaleDateString("sv-SE");
  const diaFoto = Object.keys(fotos).filter((d) => d <= hojeIso).sort().pop(); // foto das 7h = fim do dia anterior
  const grupoCat = useMemo(() => Object.fromEntries(categorias.map((c) => [c.id, c.grupo])), [categorias]);
  const recente = (iso) => iso && Date.now() - new Date(iso).getTime() < 30 * 86400000;

  const cartoes = useMemo(() => candidatos.map((p) => {
    const filhos = pis.filter((x) => x.pi_pai_id === p.id).map((x) => x.id);
    const ids = filhos.length ? filhos : [p.id];
    const doPi = (l) => l.filter((x) => ids.includes(x.pi_id));
    const ets = doPi(etapas);
    const macros = ets.filter((e) => !e.parent_etapa_id);
    const pct = (e) => (e.status === "concluida" ? 100 : Math.min(100, Number(e.percentual) || 0));
    const avanco = macros.length ? Math.round(macros.reduce((s, e) => s + pct(e), 0) / macros.length) : null;
    // ritmo: avanço real ÷ previsto para hoje
    const hoje = new Date(); hoje.setHours(12, 0, 0, 0);
    const comDatas = macros.filter((e) => e.data_prevista_inicio && e.data_prevista_fim);
    const plan = comDatas.length ? comDatas.reduce((s, e) => { const i = new Date(`${e.data_prevista_inicio}T00:00:00`), f = new Date(`${e.data_prevista_fim}T23:59:59`); return s + Math.max(0, Math.min(1, (hoje - i) / Math.max(1, f - i))) * 100; }, 0) / comDatas.length : null;
    const ritmo = plan !== null && plan >= 0.5 && avanco !== null ? Math.round((avanco / plan) * 100) : null;
    // consumo (realizado ÷ orçado) — horas somam os lançamentos
    const itens = doPi(orc);
    const somaG = (g, campo) => itens.filter((i) => grupoCat[i.categoria_id] === g).reduce((s, i) => s + (Number(i[campo]) || 0), 0);
    const apontado = doPi(apont).filter((a) => a.status !== "rejeitado").reduce((s, a) => {
      const h = horasDoLancamento(a);
      return s + (grupoCat[a.categoria_normal_id] === "moi_horas" ? h.normais : 0) + (grupoCat[a.categoria_extra_id] === "moi_horas" ? h.extras : 0);
    }, 0);
    const orcM = somaG("compra_reais", "valor_orcado"), orcH = somaG("moi_horas", "valor_orcado");
    const material = orcM ? Math.round((somaG("compra_reais", "valor_realizado") / orcM) * 100) : null;
    const horas = orcH ? Math.round(((somaG("moi_horas", "valor_realizado") + apontado) / orcH) * 100) : null;
    const atrasadas = ets.filter((e) => !e.calculada && e.status !== "concluida" && (diasAte(e.data_prevista_fim) ?? 0) < 0).length;
    const finalizacao = ets.map((e) => e.data_prevista_fim).filter(Boolean).sort().pop() || null;
    const prazo = p.prazo || null;
    const fimAposPrazo = !!(finalizacao && prazo && finalizacao > prazo);
    const meds = ets.filter((e) => e.medicao && e.status !== "concluida" && e.data_prevista_fim);
    const med20 = meds.filter((e) => diasAte(e.data_prevista_fim) <= PRAZOS.medicoes);
    const medVencida = meds.some((e) => diasAte(e.data_prevista_fim) < 0);
    const idsEt = new Set(ets.map((e) => e.id));
    const rd = doPi(rdos), oc = doPi(ocs).filter((o) => !o.rdo_id);
    const pend = rd.filter((r) => r.status === "pendente").length + doPi(apont).filter((a) => a.status === "pendente" && !(a.entrada && !a.saida)).length
      + oc.filter((o) => o.status === "pendente").length + solic.filter((s) => idsEt.has(s.etapa_id) && String(s.status || "").startsWith("pendente")).length;
    // alerta (triângulo): RDO/ocorrência em aprovação ou com PDF não aberto por mim (últimos 30 dias)
    const rdoAprov = rd.filter((r) => r.status === "pendente").length, ocAprov = oc.filter((o) => o.status === "pendente").length;
    const naoLidos = [...rd, ...oc].filter((x) => x.pdf_path && !lidosSet.has(x.pdf_path) && recente(x.created_at || x.data) && !["rejeitado", "rejeitada"].includes(x.status)).length;
    const ontemV = diaFoto ? fotos[diaFoto]?.[p.id] ?? null : null;
    const perigo = { ritmo: ritmo !== null && ritmo < 80, material: material !== null && avanco !== null && material > avanco,
      horas: horas !== null && avanco !== null && horas > avanco, atrasadas: atrasadas > 0, fim: fimAposPrazo, pend: pend > 0, med: medVencida };
    const qtdPerigo = Object.values(perigo).filter(Boolean).length;
    return { p, obras: filhos.length, avanco, ritmo, plan: plan === null ? null : Math.round(plan), ontem: ontemV, material, horas, atrasadas, prazo, finalizacao, fimAposPrazo,
      med20: med20.length, medValor: med20.reduce((s, e) => s + Number(e.medicao_valor || 0), 0), pend, perigo, qtdPerigo, rdoAprov, ocAprov, naoLidos };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }).sort((a, b) => b.qtdPerigo - a.qtdPerigo || String(a.p.codigo).localeCompare(String(b.p.codigo), "pt-BR", { numeric: true })), [candidatos.map((p) => p.id).join(","), etapas, orc, apont, rdos, ocs, solic, lidosSet, categorias, diaFoto]);

  const paginas = Math.max(1, Math.ceil(cartoes.length / POR_PAGINA));
  const pag = Math.min(pagina, paginas - 1);
  const daPagina = cartoes.slice(pag * POR_PAGINA, pag * POR_PAGINA + POR_PAGINA);
  const t = useAnimacaoJarvis(`${pag}|${daPagina.map((c) => c.p.id).join(",")}|${etapasBrutas.length}|${orc.length}`);
  const totalAlertas = cartoes.filter((c) => c.qtdPerigo > 0).length;
  const ritmos = cartoes.map((c) => c.ritmo).filter((r) => r !== null);
  const ritmoMedio = ritmos.length ? Math.round(ritmos.reduce((s, r) => s + r, 0) / ritmos.length) : null;
  const dataBR = (iso) => (iso ? iso.slice(2, 10).split("-").reverse().join("/") : "—");
  const termoF = buscaF.trim().toLowerCase();
  const listaFiltro = principais.filter((p) => !termoF || [p.codigo, p.cliente, p.projeto].some((c) => (c || "").toLowerCase().includes(termoF)));
  const marcado = (id) => (sel === null ? ehAbertoPi(principais.find((p) => p.id === id) || {}) : sel.includes(id));
  const alternar = (id) => { const base = sel === null ? principais.filter(ehAbertoPi).map((p) => p.id) : sel; salvarSel(base.includes(id) ? base.filter((x) => x !== id) : [...base, id]); setPagina(0); };

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto text-[#bfefff] font-mono jarvis"
      style={{ background: "radial-gradient(ellipse at top, #06243a 0%, #020b14 55%, #01060c 100%)" }}>
      <style>{`
        .jarvis{background-image:repeating-linear-gradient(0deg,rgba(41,211,255,.035) 0 1px,transparent 1px 3px)}
        .jv-c{position:relative;border:1px solid #0c3550;background:rgba(6,30,48,.55)}
        .jv-c:before,.jv-c:after{content:"";position:absolute;width:9px;height:9px;border-color:#29d3ff;border-style:solid}
        .jv-c:before{top:-1px;left:-1px;border-width:1px 0 0 1px}.jv-c:after{bottom:-1px;right:-1px;border-width:0 1px 1px 0}
        .jv-pisca{animation:jvp 1s steps(2,start) infinite}
        @keyframes jvp{50%{background:rgba(255,40,60,.28);box-shadow:inset 0 0 0 1px #ff4d5e}}
        .jv-gira{transform-origin:26px 26px;animation:jvg 8s linear infinite}.jv-gira2{transform-origin:26px 26px;animation:jvg 5s linear infinite reverse}
        @keyframes jvg{to{transform:rotate(360deg)}}
        .jv-k{clip-path:polygon(7px 0,100% 0,calc(100% - 7px) 100%,0 100%)}
        @media (prefers-reduced-motion: reduce){.jv-pisca,.jv-gira,.jv-gira2{animation:none}}
      `}</style>
      <div className="max-w-[1900px] mx-auto p-3 md:p-5">
        {/* cabeçalho HUD */}
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <svg viewBox="0 0 52 52" className="w-12 h-12 shrink-0" aria-hidden="true">
            <circle cx="26" cy="26" r="24" fill="none" stroke="#0f4a6b" strokeWidth="1" />
            <g className="jv-gira"><circle cx="26" cy="26" r="20" fill="none" stroke="#29d3ff" strokeWidth="2" strokeDasharray="18 8" /></g>
            <g className="jv-gira2"><circle cx="26" cy="26" r="14" fill="none" stroke="#7fe6ff" strokeWidth="1.5" strokeDasharray="4 4" /></g>
            <circle cx="26" cy="26" r="6" fill="#29d3ff" opacity=".85" style={{ filter: "drop-shadow(0 0 6px #29d3ff)" }} />
          </svg>
          <div className="min-w-0">
            <div className="text-[15px] tracking-[0.35em] text-[#e8fbff]">J.A.R.V.I.S.</div>
            <div className="text-[10px] tracking-[0.2em] text-[#3fb6e0]">COCKPIT DE OBRAS · {agora.toLocaleDateString("pt-BR")} {agora.toLocaleTimeString("pt-BR")}</div>
          </div>
          <div className="flex flex-wrap gap-1.5 ml-auto">
            <div className="jv-k border border-[#0f4a6b] px-3 py-1 text-[10px] tracking-wider text-[#7fd8ff]">PIs <b className="text-[13px] text-[#e8fbff] font-semibold">{cartoes.length}</b></div>
            <div className={`jv-k border border-[#0f4a6b] px-3 py-1 text-[10px] tracking-wider text-[#7fd8ff] ${totalAlertas ? "jv-pisca" : ""}`}>EM ALERTA <b className="text-[13px] font-semibold" style={{ color: totalAlertas ? JV.ru : JV.bom }}>{totalAlertas}</b></div>
            <div className="jv-k border border-[#0f4a6b] px-3 py-1 text-[10px] tracking-wider text-[#7fd8ff]">RITMO MÉDIO <b className="text-[13px] text-[#e8fbff] font-semibold">{ritmoMedio === null ? "—" : `${ritmoMedio}%`}</b></div>
            <button onClick={onFechar} className="jv-k border border-[#29d3ff] px-3 py-1 text-[10px] tracking-wider text-[#e8fbff] hover:bg-[#0a3650]">DESATIVAR ✕</button>
          </div>
        </div>
        {/* filtro + paginação */}
        <div className="flex flex-wrap items-center gap-2 mb-3 text-[10px] tracking-wider text-[#3fb6e0]">
          <div className="relative">
            <button onClick={() => setFiltroAberto((v) => !v)} className="border border-[#0f4a6b] px-2.5 py-1 hover:border-[#29d3ff] text-[#7fd8ff]">
              FILTRO: {sel === null ? `ABERTOS (${cartoes.length})` : `${cartoes.length} PI(s) SELECIONADO(S)`} ▾
            </button>
            {filtroAberto && (
              <div className="absolute left-0 top-full mt-1 z-10 w-[min(360px,90vw)] border border-[#29d3ff] bg-[#031421] p-2 shadow-[0_0_24px_rgba(41,211,255,.25)]">
                <input value={buscaF} onChange={(e) => setBuscaF(e.target.value)} autoFocus placeholder="BUSCAR Nº, CLIENTE OU PROJETO" className="w-full bg-transparent border border-[#0f4a6b] px-2 py-1.5 text-[11px] text-[#e8fbff] placeholder:text-[#2f6f92] outline-none focus:border-[#29d3ff]" />
                <div className="flex gap-1.5 my-2">
                  <button onClick={() => { salvarSel(null); setPagina(0); }} className="border border-[#0f4a6b] px-2 py-0.5 hover:border-[#29d3ff]">ABERTOS</button>
                  <button onClick={() => { salvarSel(principais.map((p) => p.id)); setPagina(0); }} className="border border-[#0f4a6b] px-2 py-0.5 hover:border-[#29d3ff]">TODOS</button>
                  <button onClick={() => { salvarSel([]); setPagina(0); }} className="border border-[#0f4a6b] px-2 py-0.5 hover:border-[#29d3ff]">NENHUM</button>
                </div>
                <div className="max-h-[50vh] overflow-y-auto rolagem-fina">
                  {listaFiltro.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 px-1 py-1 text-[11px] cursor-pointer hover:bg-[#0a3650]">
                      <input type="checkbox" checked={marcado(p.id)} onChange={() => alternar(p.id)} className="accent-[#29d3ff]" />
                      <span className="text-[#29d3ff]">{p.codigo}</span>
                      <span className="truncate text-[#9fdcf5]">{p.cliente}</span>
                      <span className="ml-auto text-[9px] text-[#3f8fb3]">{(STATUS_PI[p.status] || p.status || "").toUpperCase()}</span>
                    </label>
                  ))}
                </div>
                <button onClick={() => setFiltroAberto(false)} className="w-full mt-2 border border-[#29d3ff] py-1 text-[#e8fbff] hover:bg-[#0a3650]">APLICAR</button>
              </div>
            )}
          </div>
          <span className="hidden sm:inline"><span style={{color:"#ff4d5e"}}>●</span> EM ALERTA</span><span className="hidden sm:inline text-[#ffb547]">▲ RDO/OCORRÊNCIA NÃO LIDO OU EM APROVAÇÃO</span>
          <div className="flex items-center gap-1 ml-auto">
            <span>PÁG</span>
            <button onClick={() => setPagina(Math.max(0, pag - 1))} disabled={pag === 0} className="border border-[#0f4a6b] px-2 py-0.5 disabled:opacity-30">‹</button>
            {Array.from({ length: paginas }, (_, i) => (
              <button key={i} onClick={() => setPagina(i)} className={`border px-2 py-0.5 ${i === pag ? "border-[#29d3ff] bg-[#0a3650] text-[#e8fbff]" : "border-[#0f4a6b]"}`}>{i + 1}</button>
            ))}
            <button onClick={() => setPagina(Math.min(paginas - 1, pag + 1))} disabled={pag >= paginas - 1} className="border border-[#0f4a6b] px-2 py-0.5 disabled:opacity-30">›</button>
            <span className="ml-1">· {POR_PAGINA}/PÁG</span>
          </div>
        </div>

        {cartoes.length === 0 && <div className="jv-c p-8 text-center text-[12px] tracking-widest text-[#3fb6e0]">NENHUM PI NO FILTRO · ABRA O FILTRO E SELECIONE AS OBRAS</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2">
          {daPagina.map((c) => {
            const triangulo = c.rdoAprov + c.ocAprov + c.naoLidos > 0;
            const dicaTri = [c.rdoAprov && `${c.rdoAprov} RDO em aprovação`, c.ocAprov && `${c.ocAprov} ocorrência(s) em aprovação`, c.naoLidos && `${c.naoLidos} RDO/ocorrência não lido(s) (30 dias)`].filter(Boolean).join(" · ");
            return (
              <Link key={c.p.id} href={`/pi?id=${c.p.id}`} onClick={onFechar} className="jv-c block px-2 pt-1.5 pb-1.5 hover:bg-[rgba(10,54,80,.7)] transition-colors">
                <div className="flex items-center gap-1.5 text-[11px] mb-0.5 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.qtdPerigo ? JV.ru : JV.bom, boxShadow: `0 0 6px ${c.qtdPerigo ? JV.ru : JV.bom}` }} />
                  <span className="text-[#29d3ff] font-semibold shrink-0">{c.p.codigo}</span>
                  <span className="truncate text-[10px] text-[#9fdcf5]">{c.p.cliente}{c.obras ? ` · ${c.obras} OBRAS` : c.p.projeto ? ` · ${c.p.projeto}` : ""}</span>
                  {triangulo && (
                    <span className="ml-auto shrink-0 jv-pisca rounded px-0.5" title={dicaTri} aria-label={dicaTri}>
                      <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true"><path d="M12 3 L22 20 H2 Z" fill="#ffb547" stroke="#ffb547" strokeWidth="1.5" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 4px #ffb547)" }} /><rect x="11" y="9" width="2" height="6" fill="#020b14" /><rect x="11" y="16.5" width="2" height="2" fill="#020b14" /></svg>
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-6 gap-0.5">
                  <MiniMedidor rotulo="AVANÇO" valor={c.avanco} cor={JV.ok} t={t} dica="Avanço físico (média das macro-etapas)" />
                  <MiniMedidor rotulo="RITMO" valor={c.ritmo} max={150} t={t} perigo={c.perigo.ritmo}
                    cor={c.ritmo === null ? JV.off : c.ritmo >= 95 ? JV.bom : c.ritmo >= 80 ? JV.at : JV.ru} dica={c.plan === null ? "Cronograma sem datas" : `Previsto hoje ${c.plan}%`} />
                  <MiniMedidor rotulo="ONTEM" valor={c.ontem} cor={JV.ok} t={t}
                    dica={c.ontem === null ? "A foto diária do avanço começa no próximo dia (rotina das 7h)" : `Avanço no fim do dia anterior · variação ${(c.avanco ?? 0) - c.ontem >= 0 ? "+" : ""}${(c.avanco ?? 0) - c.ontem} pts`} />
                  <MiniMedidor rotulo="MATER." valor={verValores ? c.material : null} t={t} perigo={verValores && c.perigo.material}
                    cor={c.material !== null && c.avanco !== null && c.material > c.avanco ? JV.ru : JV.bom} dica={verValores ? "Consumo de material (realizado ÷ orçado)" : "Sem permissão para valores"} />
                  <MiniMedidor rotulo="HORAS" valor={verHoras ? c.horas : null} t={t} perigo={verHoras && c.perigo.horas}
                    cor={c.horas !== null && c.avanco !== null && c.horas > c.avanco ? JV.ru : JV.bom} dica="Consumo de horas (realizado ÷ orçado)" />
                  <MiniMedidor rotulo="ATRAS." valor={c.atrasadas} max={Math.max(5, c.atrasadas)} sufixo="" t={t} perigo={c.perigo.atrasadas} cor={c.atrasadas ? JV.ru : JV.bom} dica="Etapas atrasadas" />
                </div>
                <div className="grid grid-cols-4 gap-0.5 mt-1 text-[8.5px] tracking-wide text-[#3f8fb3] leading-tight">
                  <div className="px-0.5">PRAZO<span className="block text-[10px] text-[#d8f6ff]">{dataBR(c.prazo)}</span></div>
                  <div className={`px-0.5 ${c.perigo.fim ? "jv-pisca" : ""}`}>FIM PREV<span className="block text-[10px]" style={{ color: c.perigo.fim ? "#ff6b78" : "#d8f6ff" }}>{dataBR(c.finalizacao)}</span></div>
                  <div className={`px-0.5 ${c.perigo.med ? "jv-pisca" : ""}`} title={verValores && c.medValor ? `R$ ${c.medValor.toLocaleString("pt-BR")}` : undefined}>MED {PRAZOS.medicoes}D<span className="block text-[10px] text-[#d8f6ff]">{c.med20}</span></div>
                  <div className={`px-0.5 ${c.perigo.pend ? "jv-pisca" : ""}`}>PEND<span className="block text-[10px]" style={{ color: c.pend ? "#ff6b78" : "#d8f6ff" }}>{c.pend}</span></div>
                </div>
              </Link>
            );
          })}
        </div>
        <div className="mt-3 text-[9px] tracking-wider text-[#2f6f92]">CLIQUE NUM PI PARA ABRIR A PÁGINA DELE · ESC PARA SAIR · PISCANDO = FORA DO NORMAL (RITMO &lt; 80%, CONSUMO ACIMA DO AVANÇO, ETAPA ATRASADA, FIM APÓS O PRAZO, MEDIÇÃO VENCIDA, PENDÊNCIA)</div>
      </div>
    </div>
  );
}

// PIs ativos sem cronograma ou sem nenhuma etapa iniciada (avanço > 0%, em andamento ou concluída)
function PisNaoIniciados({ pis, etapas }) {
  const [filtro, setFiltro] = useState(""); // "" | sem | nada
  const iniciada = (e) => e.status === "concluida" || e.status === "em_andamento" || (Number(e.percentual) || 0) > 0;
  const lista = pis.map((pi) => {
    const doPi = etapas.filter((e) => e.pi_id === pi.id);
    if (doPi.some(iniciada)) return null;
    const inicio = doPi.map((e) => e.data_prevista_inicio).filter(Boolean).sort()[0] || null;
    const d = diasAte(inicio);
    return { pi, qtd: doPi.length, inicio, sem: doPi.length === 0, atrasado: d !== null && d < 0 };
  }).filter(Boolean)
    // sem cronograma primeiro, depois atrasados para iniciar, depois pela data de início
    .sort((a, b) => (b.sem - a.sem) || (b.atrasado - a.atrasado) || (a.inicio || "9999").localeCompare(b.inicio || "9999"));
  const visiveis = lista.filter((l) => !filtro || (filtro === "sem" ? l.sem : !l.sem));
  return (
    <section className="cartao p-4 md:p-5 h-full flex flex-col min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="titulo-quadro">PIs não iniciados <span className={`selo ml-1 ${lista.length ? "bg-amber/10 text-amber" : "bg-green/10 text-green"}`}>{lista.length}</span></h2>
        <div className="flex flex-wrap gap-1.5">
          {[["", "Todos"], ["sem", "Sem cronograma"], ["nada", "Nada iniciado"]].map(([v, l]) => (
            <button key={v} onClick={() => setFiltro(v)} className={`chip ${filtro === v ? "chip-ativo" : ""}`}>{l}</button>
          ))}
        </div>
      </div>
      {visiveis.length === 0 ? (
        <EstadoVazio icone="obra" titulo="Tudo em andamento" texto="Todos os PIs ativos têm cronograma com alguma etapa iniciada." />
      ) : (
        <div className="overflow-auto rolagem-fina flex-1 min-h-0">
          <table className="w-full text-sm min-w-[620px]">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="text-left border-b border-line">
                <th className="py-2 pr-3 titulo-secao">PI</th>
                <th className="py-2 pr-3 titulo-secao">Cliente / projeto</th>
                <th className="py-2 pr-3 titulo-secao">Situação</th>
                <th className="py-2 pr-3 titulo-secao">1º início previsto</th>
                <th className="py-2 pr-3 titulo-secao text-right">Etapas</th>
                <th className="py-2 titulo-secao" />
              </tr>
            </thead>
            <tbody>
              {visiveis.map(({ pi, qtd, inicio, sem, atrasado }) => (
                <tr key={pi.id} className="border-b border-line/60 hover:bg-panel/60">
                  <td className="py-2 pr-3 font-mono font-semibold text-cyan whitespace-nowrap">{pi.codigo}</td>
                  <td className="py-2 pr-3 max-w-[280px]"><div className="truncate">{pi.cliente || "—"}{pi.projeto ? <span className="text-muted"> · {pi.projeto}</span> : ""}</div></td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <span className={`selo ${sem ? "bg-red/10 text-red" : atrasado ? "bg-amber/10 text-amber" : "bg-panel text-muted"}`}>{sem ? "Sem cronograma" : atrasado ? "Atrasado p/ iniciar" : "Nada iniciado"}</span>
                  </td>
                  <td className={`py-2 pr-3 whitespace-nowrap tabular-nums ${atrasado ? "text-red" : ""}`}>{inicio ? formatarData(inicio) : "—"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{qtd}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <Link href={sem ? `/cronograma?pi=${pi.id}` : `/pi?id=${pi.id}`} className="text-cyan text-sm font-semibold hover:underline">{sem ? "Configurar →" : "Abrir PI →"}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Indicador({ titulo, valor, detalhe, icone, cor, href, destaque }) {
  return (
    <div className={`cartao p-4 h-full flex flex-col overflow-hidden ${destaque ? "ring-2 ring-amber/30" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs md:text-sm font-medium text-muted leading-tight">{titulo}</div>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cor}`}><Icone nome={icone} className="w-[18px] h-[18px]" /></div>
      </div>
      <div className="font-head font-bold text-3xl mt-1">{valor}</div>
      <div className="flex items-end justify-between gap-2 mt-auto">
        {detalhe && <div className="text-xs text-muteddim truncate">{detalhe}</div>}
        {href && <Link href={href} draggable={false} className="text-xs font-semibold text-cyan hover:underline shrink-0">Ver →</Link>}
      </div>
    </div>
  );
}
