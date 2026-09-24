"use client";

import { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { useTabela, registrarLog } from "../../lib/dados";
import { useAuth, podeEditar } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import { hojeISO as todayISO, addDias, isoLocal } from "../../lib/datas";
import { LISTA_STATUS_ETAPA as STATUS, AREAS, STATUS_PI, COR_STATUS_PI, STATUS_ETAPA } from "../../lib/constantes";
import { useToast } from "../../lib/Toast";
import PainelShell from "../../components/PainelShell";
import { Modal, Campo, EstadoVazio, Spinner } from "../../components/ui";
import Icone from "../../components/Icone";

// fecha um menu suspenso ao clicar fora dele ou apertar Esc
function useFecharAoClicarFora(aberto, fechar) {
  const ref = useRef(null);
  useEffect(() => {
    if (!aberto) return;
    const aoClicar = (e) => { if (ref.current && !ref.current.contains(e.target)) fechar(); };
    const aoTeclar = (e) => { if (e.key === "Escape") fechar(); };
    document.addEventListener("mousedown", aoClicar);
    document.addEventListener("touchstart", aoClicar);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("mousedown", aoClicar);
      document.removeEventListener("touchstart", aoClicar);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto, fechar]);
  return ref;
}

// ---------- dias corridos / dias úteis / feriados ----------
function calcularPascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}
function addDiasDate(date, d) { const nd = new Date(date); nd.setDate(nd.getDate() + d); return nd; }
// data local (toISOString convertia para UTC e podia trocar o dia dos feriados)
function isoDeDate(d) { return isoLocal(d); }
function feriadosDoAno(ano) {
  const pascoa = calcularPascoa(ano);
  const nacionais = [
    [`${ano}-01-01`, "Confraternização Universal"], [`${ano}-04-21`, "Tiradentes"],
    [`${ano}-05-01`, "Dia do Trabalho"], [`${ano}-09-07`, "Independência do Brasil"],
    [`${ano}-10-12`, "Nossa Senhora Aparecida"], [`${ano}-11-02`, "Finados"],
    [`${ano}-11-15`, "Proclamação da República"], [`${ano}-11-20`, "Consciência Negra"],
    [`${ano}-12-25`, "Natal"],
    [isoDeDate(addDiasDate(pascoa, -47)), "Carnaval (segunda)"], [isoDeDate(addDiasDate(pascoa, -46)), "Carnaval (terça)"],
    [isoDeDate(addDiasDate(pascoa, -2)), "Sexta-feira Santa"], [isoDeDate(addDiasDate(pascoa, 60)), "Corpus Christi"],
  ];
  const sp = [[`${ano}-07-09`, "Revolução Constitucionalista (SP)"]];
  return { nacionais, sp };
}
function calcularDiasEFeriados(dataInicioStr, dataFimStr) {
  if (!dataInicioStr || !dataFimStr) return null;
  const di = new Date(dataInicioStr + "T00:00:00");
  const df = new Date(dataFimStr + "T00:00:00");
  if (isNaN(di) || isNaN(df) || df < di) return null;
  const anos = new Set();
  for (let a = di.getFullYear(); a <= df.getFullYear(); a++) anos.add(a);
  const nacMap = new Map(), spMap = new Map();
  anos.forEach((a) => {
    const { nacionais, sp } = feriadosDoAno(a);
    nacionais.forEach(([data, nome]) => nacMap.set(data, nome));
    sp.forEach(([data, nome]) => spMap.set(data, nome));
  });
  let totalDias = 0, diasUteis = 0, feriadosNac = 0, feriadosSp = 0;
  const cur = new Date(di);
  while (cur <= df) {
    totalDias++;
    const iso = isoDeDate(cur);
    const diaSemana = cur.getDay();
    const ehNac = nacMap.has(iso), ehSp = spMap.has(iso);
    if (ehNac) feriadosNac++;
    if (ehSp) feriadosSp++;
    if (diaSemana !== 0 && diaSemana !== 6 && !ehNac && !ehSp) diasUteis++;
    cur.setDate(cur.getDate() + 1);
  }
  return { totalDias, diasUteis, feriadosNac, feriadosSp };
}
function ResumoDiasPeriodo({ dataInicio, dataFim }) {
  const info = calcularDiasEFeriados(dataInicio, dataFim);
  if (!info) return null;
  return (
    <div className="text-[11px] text-muteddim font-mono whitespace-nowrap">
      {info.totalDias}d · {info.diasUteis}d úteis
      {info.feriadosNac > 0 && <> · {info.feriadosNac} fer. nac.</>}
      {info.feriadosSp > 0 && <> · {info.feriadosSp} fer. SP</>}
    </div>
  );
}

export default function CronogramaPage() {
  const { usuario } = useAuth();
  const editavel = podeEditar(usuario);
  const { dados: pis, recarregar: recarregarPis } = useTabela("pis", { order: { coluna: "created_at" } });
  const { dados: categorias } = useTabela("categorias_orcamento", { order: { coluna: "ordem" } });
  const { dados: orcamentos, recarregar: recarregarOrcamentos } = useTabela("orcamento_pi_item");
  const { dados: recursos } = useTabela("recursos");
  const { avisar } = useToast();
  const [piSelecionadoId, setPiSelecionadoIdEstado] = useState(null);
  const piAtual = pis.find((p) => p.id === piSelecionadoId) || pis[0];

  // abre o PI indicado no link (?pi=...) — o Dashboard já mandava esse parâmetro, mas
  // ele era ignorado e sempre abria o primeiro PI
  useEffect(() => {
    const doLink = new URLSearchParams(window.location.search).get("pi");
    if (doLink) setPiSelecionadoIdEstado(doLink);
  }, []);
  const setPiSelecionadoId = (id) => {
    setPiSelecionadoIdEstado(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("pi", id); else url.searchParams.delete("pi");
    window.history.replaceState(null, "", url.toString());
  };

  const { dados: etapas, recarregar: recarregarEtapas } = useTabela("etapas", { order: { coluna: "created_at" } });
  const { dados: dependencias, recarregar: recarregarDependencias } = useTabela("etapa_dependencias");
  const { dados: alocacoesRecurso, recarregar: recarregarAlocacoesRecurso } = useTabela("alocacoes_recurso");

  const porOrdem = (a, b) => (a.ordem ?? 999999) - (b.ordem ?? 999999);
  const etapasDoPi = useMemo(() => etapas.filter((e) => e.pi_id === (piAtual && piAtual.id)), [etapas, piAtual]);
  const macroEtapas = etapasDoPi.filter((e) => !e.parent_etapa_id).sort(porOrdem);
  const subDe = (macroId) => etapasDoPi.filter((e) => e.parent_etapa_id === macroId).sort(porOrdem);
  const depsDe = (etapaId) => dependencias.filter((d) => d.etapa_id === etapaId).map((d) => etapasDoPi.find((e) => e.id === d.depende_de_etapa_id)).filter(Boolean);
  const alocsDaEtapa = (etapaId) => alocacoesRecurso.filter((a) => a.etapa_id === etapaId);

  const [pisModalAberto, setPisModalAberto] = useState(false);
  const [pisModalModo, setPisModalModo] = useState("create");
  const [erro, setErro] = useState("");

  const salvarPi = async (dadosPi, valoresOrcamento) => {
    let piId = piAtual?.id;
    const duplicado = pis.some((p) => p.codigo.trim().toLowerCase() === dadosPi.codigo.toLowerCase() && (pisModalModo === "create" || p.id !== piId));
    if (duplicado) return `Já existe um PI com o número ${dadosPi.codigo}.`;
    if (pisModalModo === "create") {
      const { data, error } = await supabase.from("pis").insert(dadosPi).select().single();
      if (error) return error.message;
      piId = data.id;
      registrarLog(usuario, "Criou PI", data.codigo);
    } else {
      const { error } = await supabase.from("pis").update(dadosPi).eq("id", piId);
      if (error) return error.message;
      registrarLog(usuario, "Editou PI", dadosPi.codigo);
    }
    // campo apagado que já tinha valor salvo vira 0 (antes era ignorado e o valor antigo ficava)
    const valoresAnteriores = pisModalModo === "edit" ? valoresOrcamentoAtuais : {};
    const linhas = Object.entries(valoresOrcamento)
      .filter(([categoriaId, valor]) => (valor !== "" && valor !== undefined) || categoriaId in valoresAnteriores)
      .map(([categoriaId, valor]) => ({ pi_id: piId, categoria_id: categoriaId, valor_orcado: Number(valor) || 0 }));
    if (linhas.length > 0) {
      const { error } = await supabase.from("orcamento_pi_item").upsert(linhas, { onConflict: "pi_id,categoria_id" });
      if (error) return `PI salvo, mas o orçamento falhou: ${error.message}`;
    }
    setPisModalAberto(false);
    setPiSelecionadoId(piId);
    recarregarPis(); recarregarOrcamentos();
    avisar(pisModalModo === "create" ? `PI ${dadosPi.codigo} criado.` : "PI atualizado.");
    return null;
  };

  const salvarCronogramaBase = async () => {
    if (!piAtual) return;
    if (piAtual.baseline_definida_em && !window.confirm("Este PI já tem um Cronograma Base. Substituir pela versão atual?")) return;
    const { error } = await supabase.from("pis").update({ baseline_definida_em: new Date().toISOString(), baseline_definida_por: usuario.id }).eq("id", piAtual.id);
    if (error) { setErro(error.message); return; }
    registrarLog(usuario, "Salvou Cronograma Base", piAtual.codigo);
    avisar("Cronograma Base salvo.");
    recarregarPis();
  };

  const addMacroEtapa = async () => {
    if (!piAtual) return;
    const t0 = todayISO();
    const proximaOrdem = macroEtapas.length ? Math.max(...macroEtapas.map((e) => e.ordem ?? 0)) + 1 : 0;
    const { error } = await supabase.from("etapas").insert({
      pi_id: piAtual.id, nome: "Nova macro-etapa", tipo: "campo", ordem: proximaOrdem,
      data_prevista_inicio: t0, data_prevista_fim: addDias(t0, 7), status: "nao_iniciada", percentual: 0,
    });
    if (error) { setErro(error.message); return; }
    registrarLog(usuario, "Criou macro-etapa", piAtual.codigo);
    recarregarEtapas();
  };
  const addSubEtapa = async (macroId) => {
    const macro = etapasDoPi.find((e) => e.id === macroId);
    const base = macro?.data_prevista_inicio || todayISO();
    const irmas = subDe(macroId);
    const proximaOrdem = irmas.length ? Math.max(...irmas.map((e) => e.ordem ?? 0)) + 1 : 0;
    const { error } = await supabase.from("etapas").insert({
      pi_id: piAtual.id, parent_etapa_id: macroId, nome: "Nova sub-etapa", tipo: "campo", ordem: proximaOrdem,
      data_prevista_inicio: base, data_prevista_fim: addDias(base, 3), status: "nao_iniciada", percentual: 0,
    });
    if (error) { setErro(error.message); return; }
    recarregarEtapas();
  };
  const atualizarEtapa = async (id, patch) => {
    const atual = etapasDoPi.find((e) => e.id === id);
    if (atual && patch.status && patch.status !== atual.status) {
      registrarLog(usuario, "Alterou status de etapa", `"${atual.nome}" → ${patch.status}`);
    }
    const { error } = await supabase.from("etapas").update(patch).eq("id", id);
    if (error) { setErro(error.message); return; }
    recarregarEtapas();
  };
  const excluirEtapa = async (id) => {
    const etapa = etapasDoPi.find((e) => e.id === id);
    const { error } = await supabase.from("etapas").delete().eq("id", id);
    if (error) {
      // normalmente: a etapa tem sub-etapas, dependências, RDOs ou alocações ligadas a ela
      setErro(/foreign key|violates/i.test(error.message)
        ? `"${etapa?.nome}" tem itens ligados (sub-etapas, dependências, alocações ou solicitações). Remova-os antes de excluir.`
        : error.message);
      return;
    }
    registrarLog(usuario, "Excluiu etapa", `${piAtual?.codigo} — ${etapa?.nome}`);
    recarregarEtapas();
  };

  // impede ciclos (A depende de B, B depende de A...), que travariam qualquer cálculo de caminho
  const criariaCiclo = (origemId, destinoId) => {
    const visitados = new Set();
    const pilha = [origemId];
    while (pilha.length) {
      const atual = pilha.pop();
      if (atual === destinoId) return true;
      if (visitados.has(atual)) continue;
      visitados.add(atual);
      dependencias.filter((d) => d.etapa_id === atual).forEach((d) => pilha.push(d.depende_de_etapa_id));
    }
    return false;
  };

  const criarDependencia = async (origemId, destinoId) => {
    if (origemId === destinoId) return;
    if (dependencias.some((d) => d.etapa_id === destinoId && d.depende_de_etapa_id === origemId)) return;
    if (criariaCiclo(origemId, destinoId)) { setErro("Essa dependência criaria um ciclo (uma etapa dependendo dela mesma)."); return; }
    const destino = etapasDoPi.find((e) => e.id === destinoId);
    const origem = etapasDoPi.find((e) => e.id === origemId);
    const { error } = await supabase.from("etapa_dependencias").insert({ etapa_id: destinoId, depende_de_etapa_id: origemId });
    if (error) { setErro(error.message); return; }
    registrarLog(usuario, "Criou dependência", `"${destino?.nome}" passa a depender de "${origem?.nome}"`);
    recarregarDependencias();
  };
  const removerDependencia = async (origemId, destinoId) => {
    const { error } = await supabase.from("etapa_dependencias").delete().eq("etapa_id", destinoId).eq("depende_de_etapa_id", origemId);
    if (error) { setErro(error.message); return; }
    recarregarDependencias();
  };

  const reordenarEtapa = async (dragId, targetId) => {
    if (dragId === targetId) return;
    const dragEtapa = etapasDoPi.find((e) => e.id === dragId);
    const targetEtapa = etapasDoPi.find((e) => e.id === targetId);
    if (!dragEtapa || !targetEtapa) return;
    const parentDrag = dragEtapa.parent_etapa_id || null;
    const parentTarget = targetEtapa.parent_etapa_id || null;

    if (parentDrag === parentTarget) {
      // mesmo grupo (duas macro-etapas, ou duas sub-etapas da mesma macro) → reordenar posição
      const irmas = etapasDoPi.filter((e) => (e.parent_etapa_id || null) === parentDrag).sort(porOrdem);
      const semArrastada = irmas.filter((e) => e.id !== dragId);
      const idxAlvo = semArrastada.findIndex((e) => e.id === targetId);
      const novaSequencia = [...semArrastada.slice(0, idxAlvo + 1), dragEtapa, ...semArrastada.slice(idxAlvo + 1)];
      await Promise.all(novaSequencia.map((e, i) => supabase.from("etapas").update({ ordem: i }).eq("id", e.id)));
    } else {
      // grupos diferentes → muda de pai (comportamento anterior), vai pro fim da nova lista
      if (parentTarget === dragId) return;
      const novosIrmaos = etapasDoPi.filter((e) => (e.parent_etapa_id || null) === parentTarget && e.id !== dragId);
      const novaOrdem = novosIrmaos.length ? Math.max(...novosIrmaos.map((e) => e.ordem ?? 0)) + 1 : 0;
      const filhas = etapasDoPi.filter((e) => e.parent_etapa_id === dragId);
      if (parentTarget) {
        for (const filha of filhas) await supabase.from("etapas").update({ parent_etapa_id: parentTarget }).eq("id", filha.id);
      }
      await supabase.from("etapas").update({ parent_etapa_id: parentTarget, ordem: novaOrdem }).eq("id", dragId);
    }
    recarregarEtapas();
  };
  const tornarSubDe = async (dragId, macroId) => {
    if (dragId === macroId) return;
    const irmas = subDe(macroId).filter((e) => e.id !== dragId);
    const novaOrdem = irmas.length ? Math.max(...irmas.map((e) => e.ordem ?? 0)) + 1 : 0;
    const filhas = etapasDoPi.filter((e) => e.parent_etapa_id === dragId);
    for (const filha of filhas) await supabase.from("etapas").update({ parent_etapa_id: macroId }).eq("id", filha.id);
    await supabase.from("etapas").update({ parent_etapa_id: macroId, ordem: novaOrdem }).eq("id", dragId);
    recarregarEtapas();
  };

  // ---- Equipe (áreas) ----
  const toggleArea = async (etapa, area) => {
    const atuais = etapa.areas || [];
    const novas = atuais.includes(area) ? atuais.filter((a) => a !== area) : [...atuais, area];
    const { error } = await supabase.from("etapas").update({ areas: novas }).eq("id", etapa.id);
    if (error) { setErro(error.message); return; }
    recarregarEtapas();
  };

  // ---- Alocação de recursos na etapa ----
  const toggleRecursoNaEtapa = async (etapa, recursoId) => {
    const existente = alocacoesRecurso.find((a) => a.etapa_id === etapa.id && a.recurso_id === recursoId);
    const { error } = existente
      ? await supabase.from("alocacoes_recurso").delete().eq("id", existente.id)
      : await supabase.from("alocacoes_recurso").insert({
        recurso_id: recursoId, pi_id: etapa.pi_id, etapa_id: etapa.id,
        modo: "periodo_percentual", periodo_inicio: etapa.data_prevista_inicio || todayISO(),
        periodo_fim: etapa.data_prevista_fim || todayISO(), percentual: 100,
      });
    if (error) { setErro(error.message); return; }
    recarregarAlocacoesRecurso();
  };

  const containerRef = useRef(null);
  const anchorRefs = useRef({});
  const [lines, setLines] = useState([]);
  const [dragOverId, setDragOverId] = useState(null);
  const [dragOverRowId, setDragOverRowId] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null);
  const GUTTER_X = 14;

  const recalcularLinhas = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    const next = [];
    dependencias.forEach((d) => {
      if (!etapasDoPi.some((e) => e.id === d.etapa_id)) return;
      const fromEl = anchorRefs.current[d.depende_de_etapa_id];
      const toEl = anchorRefs.current[d.etapa_id];
      if (!fromEl || !toEl) return;
      const fr = fromEl.getBoundingClientRect();
      const tr = toEl.getBoundingClientRect();
      next.push({
        key: d.depende_de_etapa_id + "-" + d.etapa_id, origemId: d.depende_de_etapa_id, destinoId: d.etapa_id,
        x1: fr.left - cRect.left + 4, y1: fr.top - cRect.top + 4,
        x2: tr.left - cRect.left + 4, y2: tr.top - cRect.top + 4,
      });
    });
    setLines(next);
  }, [dependencias, etapasDoPi]);

  useLayoutEffect(() => { recalcularLinhas(); }, [recalcularLinhas]);
  useEffect(() => {
    const tentar = () => recalcularLinhas();
    if (typeof document !== "undefined" && document.fonts?.ready) document.fonts.ready.then(tentar).catch(() => {});
    const t1 = setTimeout(tentar, 150);
    const t2 = setTimeout(tentar, 500);
    window.addEventListener("resize", tentar);
    const el = containerRef.current;
    el?.addEventListener("scroll", tentar);
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener("resize", tentar); el?.removeEventListener("scroll", tentar); };
  }, [recalcularLinhas]);

  const valoresOrcamentoAtuais = Object.fromEntries((orcamentos.filter((o) => o.pi_id === piAtual?.id)).map((o) => [o.categoria_id, o.valor_orcado]));

  // resumo do PI para o cabeçalho
  const contagem = Object.fromEntries(STATUS.map(([v]) => [v, macroEtapas.filter((e) => e.status === v).length]));
  const progressoPi = macroEtapas.length
    ? Math.round(macroEtapas.reduce((s, e) => s + (e.status === "concluida" ? 100 : Number(e.percentual) || 0), 0) / macroEtapas.length)
    : 0;

  return (
    <PainelShell>
    <div className="flex flex-col h-full">
      <div className="md:sticky md:top-0 z-20 bg-white/95 backdrop-blur border-b border-line px-4 md:px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <select value={piAtual?.id || ""} onChange={(e) => setPiSelecionadoId(e.target.value)} className="input !w-full sm:!w-auto sm:min-w-[280px] sm:max-w-md font-semibold" aria-label="Selecionar PI">
            {pis.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.cliente}{p.projeto ? ` — ${p.projeto}` : ""}</option>)}
          </select>
          {editavel && (
            <button onClick={() => { setPisModalModo("create"); setPisModalAberto(true); }} className="btn btn-primario btn-sm !py-2">
              <Icone nome="mais2" className="w-4 h-4" /> Novo PI
            </button>
          )}
          {editavel && piAtual && (
            <button onClick={() => { setPisModalModo("edit"); setPisModalAberto(true); }} className="btn btn-contorno btn-sm !py-2">
              <Icone nome="editar" className="w-4 h-4" /> Editar PI
            </button>
          )}
          {editavel && piAtual && (
            <button onClick={salvarCronogramaBase}
              title={piAtual.baseline_definida_em ? `Salvo em ${new Date(piAtual.baseline_definida_em).toLocaleString("pt-BR")} — clique para atualizar` : "Congela a versão atual como referência"}
              className={`btn btn-sm !py-2 sm:ml-auto border ${piAtual.baseline_definida_em ? "border-green/40 text-green bg-green/5 hover:bg-green/10" : "border-amber/50 text-amber bg-amber/5 hover:bg-amber/10"}`}>
              {piAtual.baseline_definida_em ? "✓ Cronograma Base salvo" : "⚠ Salvar Cronograma Base"}
            </button>
          )}
        </div>
        {piAtual && macroEtapas.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5 text-xs text-muted">
            <span className={`selo ${COR_STATUS_PI[piAtual.status] || "bg-panel text-muted"}`}>{STATUS_PI[piAtual.status] || piAtual.status}</span>
            <span className="flex items-center gap-2">
              <span className="w-24 h-1.5 rounded-full bg-line overflow-hidden inline-block"><span className="block h-full bg-cyan" style={{ width: `${progressoPi}%` }} /></span>
              <strong className="text-textmain">{progressoPi}%</strong>
            </span>
            {STATUS.map(([v, l]) => contagem[v] > 0 && (
              <span key={v} className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: STATUS_ETAPA[v].barra }} />{contagem[v]} {l.toLowerCase()}</span>
            ))}
            {piAtual.prazo && <span>Prazo: <strong className="text-textmain">{new Date(piAtual.prazo + "T00:00:00").toLocaleDateString("pt-BR")}</strong></span>}
          </div>
        )}
      </div>

      {erro && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-red/10 border-b border-red/30 text-sm text-red animar-fade" role="alert">
          <Icone nome="alerta" className="w-4 h-4 shrink-0" />
          <span className="flex-1">Não deu pra salvar: {erro}</span>
          <button onClick={() => setErro("")} className="font-semibold underline shrink-0">Fechar</button>
        </div>
      )}

      {pisModalAberto && (
        <PiModal
          modo={pisModalModo} piInicial={pisModalModo === "edit" ? piAtual : null}
          categorias={categorias} valoresIniciais={pisModalModo === "edit" ? valoresOrcamentoAtuais : {}}
          onSalvar={salvarPi} onCancelar={() => setPisModalAberto(false)}
        />
      )}

      <div ref={containerRef} className="flex-1 overflow-auto p-4 md:p-6 relative" onClick={() => ctxMenu && setCtxMenu(null)}>
        {!piAtual && (
          <EstadoVazio icone="obra" titulo="Nenhum PI cadastrado" texto="Abra o primeiro PI para começar a planejar as etapas."
            acao={editavel && <button onClick={() => { setPisModalModo("create"); setPisModalAberto(true); }} className="btn btn-primario">+ Novo PI</button>} />
        )}

        {piAtual && (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-3">
              {editavel && (
                <button onClick={addMacroEtapa} className="btn btn-contorno btn-sm !border-cyan !text-cyan hover:!bg-cyan/5">
                  <Icone nome="mais2" className="w-4 h-4" /> Macro-etapa
                </button>
              )}
              {editavel && macroEtapas.length > 0 && (
                <span className="hidden md:inline text-xs text-muteddim">
                  Dica: arraste <strong>⋮⋮</strong> para reordenar · arraste o <span className="inline-block w-2 h-2 rounded-full bg-cyan align-middle" /> até outra etapa para criar dependência · botão direito na seta para excluí-la
                </span>
              )}
            </div>
            {macroEtapas.length === 0 && (
              <EstadoVazio icone="cronograma" titulo="Sem etapas ainda" texto={editavel ? "Adicione a primeira macro-etapa deste PI." : "Este PI ainda não tem etapas."} />
            )}

            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 5 }}>
              <defs>
                <marker id="seta" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 Z" fill="#0B84A5" />
                </marker>
              </defs>
              {lines.map((l) => {
                const path = `M ${l.x1} ${l.y1} H ${GUTTER_X} V ${l.y2} H ${l.x2}`;
                return (
                  <g key={l.key}>
                    <path d={path} stroke="#0B84A5" strokeWidth="1.4" strokeDasharray="4 3" fill="none" opacity="0.75" markerEnd="url(#seta)" pointerEvents="none" />
                    <path d={path} stroke="transparent" strokeWidth="12" fill="none" style={{ pointerEvents: "stroke", cursor: "context-menu" }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        const rect = containerRef.current.getBoundingClientRect();
                        setCtxMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, origemId: l.origemId, destinoId: l.destinoId });
                      }} />
                  </g>
                );
              })}
            </svg>

            {ctxMenu && (
              <div onClick={(e) => e.stopPropagation()} className="absolute bg-white border border-line rounded-lg shadow-lg z-30" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
                <button onClick={() => { removerDependencia(ctxMenu.origemId, ctxMenu.destinoId); setCtxMenu(null); }}
                  className="block w-full text-left px-3 py-2 text-xs text-red hover:bg-red/10">✕ Excluir dependência</button>
              </div>
            )}

            {!piAtual.baseline_definida_em && (
              <div className="text-sm text-[#9a5a14] bg-amber/10 border border-amber/25 rounded-xl px-3.5 py-2.5 mb-3 flex items-start gap-2">
                <Icone nome="alerta" className="w-4 h-4 mt-0.5 shrink-0" />
                Este PI ainda não tem um Cronograma Base salvo — nenhuma alteração está sendo comparada a uma referência.
              </div>
            )}

            <div className="flex flex-col gap-2 relative pl-6" style={{ zIndex: 2 }}>
              {macroEtapas.map((macro) => (
                <div key={macro.id}>
                  <EtapaRow
                    etapa={macro} editavel={editavel} onChange={atualizarEtapa} onDelete={excluirEtapa}
                    deps={depsDe(macro.id)} onRemoverDep={(origemId) => removerDependencia(origemId, macro.id)}
                    anchorRef={(el) => { anchorRefs.current[macro.id] = el; }}
                    onCreateDependency={criarDependencia} dragOverId={dragOverId} setDragOverId={setDragOverId}
                    onReordenar={reordenarEtapa} dragOverRowId={dragOverRowId} setDragOverRowId={setDragOverRowId}
                    onToggleArea={toggleArea} recursos={recursos} alocs={alocsDaEtapa(macro.id)} onToggleRecurso={toggleRecursoNaEtapa}
                  />
                  <SubEtapasDropzone macroId={macro.id} editavel={editavel} onDropTornarSub={tornarSubDe}>
                    {subDe(macro.id).map((sub) => (
                      <EtapaRow
                        key={sub.id} etapa={sub} editavel={editavel} onChange={atualizarEtapa} onDelete={excluirEtapa}
                        deps={depsDe(sub.id)} onRemoverDep={(origemId) => removerDependencia(origemId, sub.id)}
                        anchorRef={(el) => { anchorRefs.current[sub.id] = el; }}
                        onCreateDependency={criarDependencia} dragOverId={dragOverId} setDragOverId={setDragOverId}
                        onReordenar={reordenarEtapa} dragOverRowId={dragOverRowId} setDragOverRowId={setDragOverRowId}
                        onToggleArea={toggleArea} recursos={recursos} alocs={alocsDaEtapa(sub.id)} onToggleRecurso={toggleRecursoNaEtapa}
                      />
                    ))}
                    {editavel && (
                      <button onClick={() => addSubEtapa(macro.id)}
                        className="self-start text-xs text-muted hover:text-cyan hover:border-cyan hover:bg-cyan/5 border border-dashed border-line rounded-full px-3 py-1.5 mt-1 transition-colors">
                        + sub-etapa em “{macro.nome}”
                      </button>
                    )}
                  </SubEtapasDropzone>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
    </PainelShell>
  );
}

function SubEtapasDropzone({ macroId, editavel, onDropTornarSub, children }) {
  const [emCima, setEmCima] = useState(false);
  return (
    <div
      onDragOver={(e) => { if (editavel && e.dataTransfer.types.includes("text/x-reorder-etapa")) { e.preventDefault(); setEmCima(true); } }}
      onDragLeave={() => setEmCima(false)}
      onDrop={(e) => {
        if (!editavel || !e.dataTransfer.types.includes("text/x-reorder-etapa")) return;
        e.preventDefault(); setEmCima(false);
        const dragId = e.dataTransfer.getData("text/x-reorder-etapa");
        if (dragId && dragId !== macroId) onDropTornarSub(dragId, macroId);
      }}
      className={`ml-5 border-l-2 pl-2 mt-1 flex flex-col gap-1 rounded-r-lg ${emCima ? "border-cyan bg-cyan/5" : "border-line"}`}
    >
      {children}
      {emCima && <div className="text-xs text-cyan font-semibold py-1">solte para virar sub-etapa aqui</div>}
    </div>
  );
}

function useCampoDebounced(valorExterno, aoSalvar, atraso = 500) {
  const [valor, setValor] = useState(valorExterno);
  const sujoRef = useRef(false);
  const timeoutRef = useRef(null);
  const pendenteRef = useRef(undefined);
  const aoSalvarRef = useRef(aoSalvar);
  aoSalvarRef.current = aoSalvar;

  useEffect(() => {
    if (!sujoRef.current) setValor(valorExterno);
  }, [valorExterno]);

  // ao desmontar (trocar de PI, sair da tela) salva o que ainda estava esperando —
  // antes a última digitação era descartada se a pessoa saísse em menos de 0,5s
  useEffect(() => () => {
    clearTimeout(timeoutRef.current);
    if (pendenteRef.current !== undefined) aoSalvarRef.current(pendenteRef.current);
  }, []);

  const onChangeLocal = (novoValor) => {
    setValor(novoValor);
    sujoRef.current = true;
    pendenteRef.current = novoValor;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      pendenteRef.current = undefined;
      aoSalvarRef.current(novoValor);
      sujoRef.current = false;
    }, atraso);
  };

  return [valor, onChangeLocal];
}

function EtapaRow({ etapa, editavel, onChange, onDelete, deps, onRemoverDep, anchorRef, onCreateDependency, dragOverId, setDragOverId, onReordenar, dragOverRowId, setDragOverRowId, onToggleArea, recursos, alocs, onToggleRecurso }) {
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [equipeAberta, setEquipeAberta] = useState(false);
  const [alocAberta, setAlocAberta] = useState(false);
  const isDragOver = dragOverId === etapa.id;
  const isDragOverRow = dragOverRowId === etapa.id;
  const depsComSobreposicao = deps.filter((d) => d.data_prevista_fim && etapa.data_prevista_inicio && d.data_prevista_fim > etapa.data_prevista_inicio);
  const areas = etapa.areas || [];
  const equipeRef = useFecharAoClicarFora(equipeAberta, useCallback(() => setEquipeAberta(false), []));
  const alocRef = useFecharAoClicarFora(alocAberta, useCallback(() => setAlocAberta(false), []));
  // nome em branco não é salvo (a etapa ficaria "invisível"); data apagada vira null (e não "", que o banco recusa)
  const [nomeLocal, setNomeLocal] = useCampoDebounced(etapa.nome, (v) => v.trim() && onChange(etapa.id, { nome: v.trim() }));
  const [inicioLocal, setInicioLocal] = useCampoDebounced(etapa.data_prevista_inicio || "", (v) => onChange(etapa.id, { data_prevista_inicio: v || null }), 300);
  const [fimLocal, setFimLocal] = useCampoDebounced(etapa.data_prevista_fim || "", (v) => onChange(etapa.id, { data_prevista_fim: v || null }), 300);
  const [percLocal, setPercLocal] = useCampoDebounced(etapa.percentual || 0, (v) => onChange(etapa.id, { percentual: Math.max(0, Math.min(100, Number(v) || 0)) }));
  const datasInvertidas = inicioLocal && fimLocal && fimLocal < inicioLocal;
  const corStatus = STATUS_ETAPA[etapa.status]?.barra || "#93A2B8";
  const [medicaoPercLocal, setMedicaoPercLocal] = useCampoDebounced(etapa.medicao_percentual ?? "", (v) => onChange(etapa.id, { medicao_percentual: v === "" ? null : Number(v) }));
  const [medicaoValorLocal, setMedicaoValorLocal] = useCampoDebounced(etapa.medicao_valor ?? "", (v) => onChange(etapa.id, { medicao_valor: v === "" ? null : Number(v) }));

  return (
    <div
      onDragOver={(e) => { if (e.dataTransfer.types.includes("text/x-reorder-etapa")) { e.preventDefault(); setDragOverRowId(etapa.id); } }}
      onDragLeave={() => setDragOverRowId((p) => (p === etapa.id ? null : p))}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("text/x-reorder-etapa")) return;
        e.preventDefault();
        const origemId = e.dataTransfer.getData("text/x-reorder-etapa");
        setDragOverRowId(null);
        if (origemId && origemId !== etapa.id && editavel) onReordenar(origemId, etapa.id);
      }}
      className={`flex flex-wrap items-center gap-2 p-2.5 rounded-xl relative border border-l-4 transition-colors ${isDragOverRow ? "bg-cyan/10 outline outline-2 outline-cyan" : "bg-white hover:shadow-sm"} ${etapa.parent_etapa_id ? "border-line/70" : "border-line"}`}
      style={{ borderLeftColor: corStatus }}
    >
      {editavel && (
        <div draggable onDragStart={(e) => { e.dataTransfer.setData("text/x-reorder-etapa", etapa.id); e.dataTransfer.effectAllowed = "move"; }}
          title="Arraste para reordenar" className="w-5 h-7 flex items-center justify-center text-muteddim hover:text-textmain cursor-grab text-sm select-none rounded hover:bg-panel">⋮⋮</div>
      )}
      <div
        ref={anchorRef} draggable={editavel}
        onDragStart={(e) => { e.dataTransfer.setData("text/x-dependency-origin", etapa.id); e.dataTransfer.effectAllowed = "link"; }}
        onDragOver={(e) => { if (e.dataTransfer.types.includes("text/x-dependency-origin")) { e.preventDefault(); setDragOverId(etapa.id); } }}
        onDragLeave={() => setDragOverId((p) => (p === etapa.id ? null : p))}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes("text/x-dependency-origin")) return;
          e.preventDefault();
          const origemId = e.dataTransfer.getData("text/x-dependency-origin");
          setDragOverId(null);
          if (origemId && origemId !== etapa.id) onCreateDependency(origemId, etapa.id);
        }}
        title="Arraste até outra etapa para criar dependência"
        style={{ width: isDragOver ? 14 : 10, height: isDragOver ? 14 : 10, transition: "width .1s, height .1s" }}
        className={`rounded-full shrink-0 cursor-grab ${isDragOver ? "bg-green" : "bg-cyan"}`}
      />
      <input value={nomeLocal} disabled={!editavel} onChange={(e) => setNomeLocal(e.target.value)} aria-label="Nome da etapa"
        className={`input !py-1.5 flex-1 min-w-[160px] font-head font-semibold disabled:!bg-transparent disabled:!border-transparent disabled:!text-textmain ${etapa.parent_etapa_id ? "!font-medium" : ""}`} />

      <div className="flex flex-col gap-0.5">
        <div className="flex gap-1">
          <input type="date" value={inicioLocal} disabled={!editavel} aria-label="Início previsto"
            onChange={(e) => setInicioLocal(e.target.value)}
            className="input !w-auto !py-1.5 !px-2 !text-xs" />
          <input type="date" value={fimLocal} disabled={!editavel} aria-label="Término previsto"
            onChange={(e) => setFimLocal(e.target.value)}
            className={`input !w-auto !py-1.5 !px-2 !text-xs ${datasInvertidas ? "!border-red" : ""}`} />
        </div>
        <ResumoDiasPeriodo dataInicio={inicioLocal} dataFim={fimLocal} />
        {datasInvertidas && <div className="text-[11px] text-red">⚠ término antes do início</div>}
        {depsComSobreposicao.length > 0 && <div className="text-[11px] text-red">⚠ sobreposição de datas com dependência</div>}
      </div>

      <select value={etapa.status} disabled={!editavel} onChange={(e) => onChange(etapa.id, { status: e.target.value })} aria-label="Status"
        className="input !w-auto !py-1.5 !px-2 !text-xs font-semibold" style={{ color: corStatus }}>
        {STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {etapa.status === "em_andamento" && (
        <div className="relative">
          <input type="number" min="0" max="100" value={percLocal} disabled={!editavel} aria-label="Percentual concluído"
            onChange={(e) => setPercLocal(e.target.value)}
            className="input !w-20 !py-1.5 !pl-2 !pr-6 !text-xs text-right" />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted">%</span>
        </div>
      )}

      <div className="relative" ref={equipeRef}>
        <button onClick={() => { setEquipeAberta((v) => !v); setAlocAberta(false); }} aria-expanded={equipeAberta}
          className={`btn btn-sm !px-2.5 border ${areas.length ? "border-cyan/40 text-cyan bg-cyan/5" : "border-line text-muted bg-white"}`}>
          Equipe{areas.length > 0 ? ` (${areas.length})` : ""} ▾
        </button>
        {equipeAberta && (
          <div className="absolute z-30 mt-1 right-0 sm:right-auto bg-white border border-line rounded-xl shadow-xl p-1.5 w-60 max-h-64 overflow-auto rolagem-fina animar-fade">
            {AREAS.map((a) => (
              <label key={a} className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer rounded-lg hover:bg-panel">
                <input type="checkbox" className="accent-cyan" checked={areas.includes(a)} disabled={!editavel} onChange={() => onToggleArea(etapa, a)} />
                {a}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="relative" ref={alocRef}>
        <button onClick={() => { setAlocAberta((v) => !v); setEquipeAberta(false); }} aria-expanded={alocAberta}
          className={`btn btn-sm !px-2.5 border ${alocs.length ? "border-cyan/40 text-cyan bg-cyan/5" : "border-line text-muted bg-white"}`}>
          Alocação{alocs.length > 0 ? ` (${alocs.length})` : ""} ▾
        </button>
        {alocAberta && (
          <div className="absolute z-30 mt-1 right-0 sm:right-auto bg-white border border-line rounded-xl shadow-xl p-1.5 w-64 max-h-64 overflow-auto rolagem-fina animar-fade">
            {recursos.length === 0 && <div className="text-sm text-muteddim px-2 py-1.5">Nenhum recurso cadastrado.</div>}
            {recursos.map((r) => (
              <label key={r.id} className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer rounded-lg hover:bg-panel">
                <input type="checkbox" className="accent-cyan" checked={alocs.some((a) => a.recurso_id === r.id)} disabled={!editavel} onChange={() => onToggleRecurso(etapa, r.id)} />
                <span className="truncate">{r.nome}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <label className={`flex items-center gap-1.5 text-xs cursor-pointer whitespace-nowrap px-2 py-1.5 rounded-lg border ${etapa.medicao ? "border-[#8E5CD9]/40 text-[#8E5CD9] bg-[#8E5CD9]/5" : "border-line text-muted bg-white"}`}>
          <input type="checkbox" className="accent-[#8E5CD9]" checked={!!etapa.medicao} disabled={!editavel} onChange={(e) => onChange(etapa.id, { medicao: e.target.checked })} />
          Medição
        </label>
        {etapa.medicao && (
          <>
            <input type="number" min="0" max="100" placeholder="%" value={medicaoPercLocal} disabled={!editavel}
              onChange={(e) => setMedicaoPercLocal(e.target.value)}
              className="input !w-16 !py-1.5 !px-2 !text-xs" title="Percentual medido" />
            <input type="number" step="0.01" placeholder="R$" value={medicaoValorLocal} disabled={!editavel}
              onChange={(e) => setMedicaoValorLocal(e.target.value)}
              className="input !w-28 !py-1.5 !px-2 !text-xs" title="Valor medido (R$)" />
          </>
        )}
      </div>

      {deps.length > 0 && (
        <div className="flex flex-wrap gap-1 w-full sm:w-auto">
          <span className="text-[11px] text-muteddim self-center">depende de:</span>
          {deps.map((d) => (
            <span key={d.id} className="inline-flex items-center gap-1 text-[11px] bg-cyan/5 text-cyan border border-cyan/25 rounded-full pl-2 pr-1 py-0.5">
              {d.nome}
              {editavel && <button onClick={() => onRemoverDep(d.id)} className="w-4 h-4 rounded-full hover:bg-red/10 hover:text-red flex items-center justify-center" aria-label={`Remover dependência de ${d.nome}`}>✕</button>}
            </span>
          ))}
        </div>
      )}

      {editavel && (
        confirmarExclusao ? (
          <div className="flex gap-1 ml-auto animar-fade">
            <button onClick={() => { setConfirmarExclusao(false); onDelete(etapa.id); }} className="btn btn-perigo btn-sm">Excluir</button>
            <button onClick={() => setConfirmarExclusao(false)} className="btn btn-fantasma btn-sm">Cancelar</button>
          </div>
        ) : (
          <button onClick={() => setConfirmarExclusao(true)} className="ml-auto p-1.5 rounded-lg text-muteddim hover:text-red hover:bg-red/5" title="Excluir etapa" aria-label="Excluir etapa">
            <Icone nome="lixo" className="w-4 h-4" />
          </button>
        )
      )}
    </div>
  );
}

function PiModal({ modo, piInicial, categorias, valoresIniciais, onSalvar, onCancelar }) {
  const [codigo, setCodigo] = useState(piInicial?.codigo || "");
  const [cliente, setCliente] = useState(piInicial?.cliente || "");
  const [projeto, setProjeto] = useState(piInicial?.projeto || "");
  const [prazo, setPrazo] = useState(piInicial?.prazo || addDias(todayISO(), 45));
  const [status, setStatus] = useState(piInicial?.status || "ativo");
  const [valores, setValores] = useState(valoresIniciais || {});

  const compraCats = categorias.filter((c) => c.grupo === "compra_reais");
  const moiCats = categorias.filter((c) => c.grupo === "moi_horas");
  const setValor = (catId, v) => setValores((prev) => ({ ...prev, [catId]: v === "" ? "" : Number(v) }));
  const [salvando, setSalvando] = useState(false);
  const [erroModal, setErroModal] = useState("");
  const podeSalvar = codigo.trim().length > 0 && !salvando;
  const soma = (cats) => cats.reduce((s, c) => s + (Number(valores[c.id]) || 0), 0);

  const salvar = async () => {
    if (!podeSalvar) return;
    setSalvando(true); setErroModal("");
    const erro = await onSalvar({ codigo: codigo.trim(), cliente: cliente.trim() || null, projeto: projeto.trim() || null, prazo: prazo || null, status }, valores);
    setSalvando(false);
    if (erro) setErroModal(erro);
  };

  const tabela = (cats, unidade, passo) => (
    <div className="rounded-xl border border-line overflow-hidden">
      <div className="grid grid-cols-[64px_1fr_130px] gap-2 px-3 py-2 bg-panel titulo-secao">
        <span>Cód.</span><span>Descrição</span><span className="text-right">{unidade}</span>
      </div>
      <div className="divide-y divide-line/70">
        {cats.map((c) => (
          <div key={c.id} className="grid grid-cols-[64px_1fr_130px] gap-2 items-center px-3 py-1.5">
            <span className="font-mono text-xs text-muted">{c.codigo}</span>
            <span className="text-sm leading-tight">{c.nome}</span>
            <input type="number" step={passo} min="0" value={valores[c.id] ?? ""} placeholder="0" onChange={(e) => setValor(c.id, e.target.value)}
              className="input !py-1.5 text-right" aria-label={`${c.nome} (${unidade})`} />
          </div>
        ))}
        {cats.length === 0 && <div className="px-3 py-3 text-sm text-muteddim">Nenhuma categoria cadastrada.</div>}
      </div>
    </div>
  );

  return (
    <Modal titulo={modo === "create" ? "Abertura de PI" : `Editar PI — ${piInicial?.codigo}`} onFechar={onCancelar} largura="max-w-3xl"
      rodape={<>
        {erroModal && <div className="text-sm text-red mr-auto self-center">⚠ {erroModal}</div>}
        <button onClick={onCancelar} className="btn btn-fantasma">Cancelar</button>
        <button onClick={salvar} disabled={!podeSalvar} className="btn btn-primario">
          {salvando ? <><Spinner /> Salvando...</> : modo === "create" ? "Criar PI" : "Salvar alterações"}
        </button>
      </>}>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <Campo rotulo="Nº do PI *" className="col-span-1 md:col-span-1"><input value={codigo} onChange={(e) => setCodigo(e.target.value)} className="input" autoFocus placeholder="PI-001" /></Campo>
        <Campo rotulo="Status" className="col-span-1 md:col-span-1">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input">
            {Object.entries(STATUS_PI).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Cliente" className="col-span-2 md:col-span-2"><input value={cliente} onChange={(e) => setCliente(e.target.value)} className="input" /></Campo>
        <Campo rotulo="Prazo" className="col-span-2 md:col-span-2"><input type="date" value={prazo || ""} onChange={(e) => setPrazo(e.target.value)} className="input" /></Campo>
        <Campo rotulo="Projeto" className="col-span-2 md:col-span-6"><input value={projeto} onChange={(e) => setProjeto(e.target.value)} className="input" /></Campo>
      </div>

      <div className="flex items-baseline justify-between mb-2">
        <div className="font-head font-bold text-sm text-cyan">Compra — Produto ou Serviço</div>
        <div className="text-xs text-muted">Total: <strong className="text-textmain">R$ {soma(compraCats).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></div>
      </div>
      <div className="mb-6">{tabela(compraCats, "Valor (R$)", "0.01")}</div>

      <div className="flex items-baseline justify-between mb-2">
        <div className="font-head font-bold text-sm text-cyan">MOI + Contric (horas)</div>
        <div className="text-xs text-muted">Total: <strong className="text-textmain">{soma(moiCats).toLocaleString("pt-BR")} h</strong></div>
      </div>
      {tabela(moiCats, "Horas", "0.5")}
    </Modal>
  );
}
