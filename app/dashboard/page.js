"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Responsive, WidthProvider } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { useTabela } from "../../lib/dados";
import { useAuth } from "../../lib/AuthContext";
import { diasAte, formatarData, saudacao } from "../../lib/datas";
import { STATUS_PI, COR_STATUS_PI } from "../../lib/constantes";
import PainelShell from "../../components/PainelShell";
import { CabecalhoPagina, Esqueleto, EstadoVazio } from "../../components/ui";
import Icone from "../../components/Icone";

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
  ],
  md: [
    { i: "pis-ativos", x: 0, y: 0, w: 6, h: 2, minW: 3, minH: 2 },
    { i: "aprovacoes", x: 6, y: 0, w: 6, h: 2, minW: 3, minH: 2 },
    { i: "atrasadas", x: 0, y: 2, w: 6, h: 2, minW: 3, minH: 2 },
    { i: "medicoes-20", x: 6, y: 2, w: 6, h: 2, minW: 3, minH: 2 },
    { i: "lista-pis", x: 0, y: 4, w: 12, h: 8, minW: 4, minH: 4 },
    { i: "medicoes", x: 0, y: 12, w: 12, h: 8, minW: 4, minH: 4 },
  ],
  sm: [
    { i: "pis-ativos", x: 0, y: 0, w: 1, h: 2 },
    { i: "aprovacoes", x: 0, y: 2, w: 1, h: 2 },
    { i: "atrasadas", x: 0, y: 4, w: 1, h: 2 },
    { i: "medicoes-20", x: 0, y: 6, w: 1, h: 2 },
    { i: "lista-pis", x: 0, y: 8, w: 1, h: 9 },
    { i: "medicoes", x: 0, y: 17, w: 1, h: 9 },
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
  const medicoesProximas = gruposMedicoes.flatMap((g) => g.itens).filter((e) => { const d = diasAte(e.data_prevista_fim); return d !== null && d <= 20; }).length;

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
    "pis-ativos": <Indicador titulo="PIs ativos" valor={pisAtivos.length} detalhe={`${pis.length} no total`} icone="obra" cor="text-cyan bg-cyan/10" href="/cronograma" />,
    aprovacoes: <Indicador titulo="Aprovações pendentes" valor={pendencias} detalhe={`${rdosPendentes.length} RDO · ${horasPendentes.length} horas`} icone="aprovar"
      cor={pendencias ? "text-amber bg-amber/10" : "text-green bg-green/10"} href="/aprovacoes" destaque={pendencias > 0} />,
    atrasadas: <Indicador titulo="Etapas atrasadas" valor={etapasAtrasadas.length} detalhe="em PIs ativos" icone="alerta"
      cor={etapasAtrasadas.length ? "text-red bg-red/10" : "text-green bg-green/10"} href="/linha-do-tempo" />,
    "medicoes-20": <Indicador titulo="Medições em 20 dias" valor={medicoesProximas} detalhe="vencidas ou próximas" icone="calendario" cor="text-[#8E5CD9] bg-[#8E5CD9]/10" />,

    "lista-pis": (
      <section className="cartao p-4 md:p-5 h-full flex flex-col min-h-0">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="font-head font-bold text-base">PIs</h2>
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
        </div>
        {carregandoPis && <Esqueleto linhas={4} altura={56} />}
        {!carregandoPis && pis.length === 0 && (
          <EstadoVazio icone="obra" titulo="Nenhum PI ainda" texto="Crie o primeiro PI no Cronograma."
            acao={<Link href="/cronograma" className="btn btn-primario btn-sm">Ir para o Cronograma</Link>} />
        )}
        {!carregandoPis && pis.length > 0 && pisFiltrados.length === 0 && <div className="text-sm text-muteddim py-6 text-center">Nenhum PI encontrado.</div>}
        <div className="flex flex-col gap-2 overflow-y-auto rolagem-fina flex-1 min-h-0 -mx-1 px-1">
          {pisFiltrados.map((pi) => {
            const prog = progressoDoPi(pi.id);
            return (
              <Link key={pi.id} href={`/cronograma?pi=${pi.id}`} draggable={false} className="group block p-3 rounded-xl border border-transparent bg-panel hover:bg-white hover:border-line hover:shadow-sm transition-all">
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
        <h2 className="font-head font-bold text-base mb-3">Medições em aberto</h2>
        {gruposMedicoes.length === 0 && (
          <EstadoVazio icone="calendario" titulo="Nada a medir" texto="Marque “Medição” em macro ou sub-etapas no Cronograma para acompanhar aqui." />
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
                      <td colSpan={5} className="pt-4 pb-1.5 px-4 md:pl-0 text-xs font-mono text-cyan font-bold">
                        {pi.codigo} — {pi.cliente}{pi.projeto ? ` — ${pi.projeto}` : ""}
                      </td>
                    </tr>
                    {itens.map((etapa) => {
                      const dias = diasAte(etapa.data_prevista_fim);
                      const vencida = dias !== null && dias < 0;
                      const proxima = dias !== null && dias >= 0 && dias <= 20;
                      return (
                        <tr key={etapa.id} className="border-b border-line/60 hover:bg-panel/60">
                          <td className="py-2 px-4 md:pl-0">{etapa.parent_etapa_id ? <span className="text-muteddim">· </span> : ""}{etapa.nome}</td>
                          <td className="py-2 pr-3 text-right font-mono text-xs">{formatarPercentual(etapa.percentual)}</td>
                          <td className="py-2 pr-3 text-right font-mono text-xs">{formatarPercentual(etapa.medicao_percentual)}</td>
                          <td className="py-2 pr-3 text-right font-mono text-xs whitespace-nowrap">{formatarValor(etapa.medicao_valor)}</td>
                          <td className="py-2 pr-4 md:pr-0 whitespace-nowrap">
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
      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        <CabecalhoPagina
          titulo={`${saudacao()}, ${usuario?.nome?.split(" ")[0] || ""}`}
          subtitulo={podeMover ? "Arraste os quadros para reorganizar e puxe as bordas para mudar o tamanho." : "Visão geral das obras"}
          acoes={<>
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
    </PainelShell>
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
