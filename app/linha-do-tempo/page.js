"use client";

import { useState, useMemo, useEffect, useLayoutEffect, useRef } from "react";
import { useTabela } from "../../lib/dados";
import { tsLocal, diasAte as diffDias, formatarData as formatarDataIso } from "../../lib/datas";
import { AREAS, STATUS_ETAPA } from "../../lib/constantes";
import PainelShell from "../../components/PainelShell";
import { CabecalhoPagina, EstadoVazio, Modal } from "../../components/ui";
import Icone from "../../components/Icone";

const STATUS_COR = Object.fromEntries(Object.entries(STATUS_ETAPA).map(([k, v]) => [k, v.barra]));
const LABEL_W = 240;
const PALETA_FILTRO = ["#0B84A5", "#2E9E44", "#C97A21", "#8E5CD9", "#D64545", "#3D8FB5", "#B5752E", "#5C8E5C"];

function formatarData(ts) {
  return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
// primeiro "meia-noite local" a partir de um instante qualquer — as marcas da régua
// caíam em horários quebrados (ex: 14h37) e o rótulo podia mostrar o dia errado
function proximaMeiaNoite(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  if (d.getTime() < ts) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function useFecharAoClicarFora(aberto, fechar) {
  const ref = useRef(null);
  useEffect(() => {
    if (!aberto) return;
    const aoClicar = (e) => { if (ref.current && !ref.current.contains(e.target)) fechar(); };
    document.addEventListener("mousedown", aoClicar);
    document.addEventListener("touchstart", aoClicar);
    return () => { document.removeEventListener("mousedown", aoClicar); document.removeEventListener("touchstart", aoClicar); };
  }, [aberto, fechar]);
  return ref;
}

export default function LinhaDoTempoPage() {
  const { dados: pis, carregando: carregandoPis } = useTabela("pis", { order: { coluna: "codigo" } });
  const { dados: etapas } = useTabela("etapas");
  const { dados: recursos } = useTabela("recursos");
  const { dados: alocacoesRecurso } = useTabela("alocacoes_recurso");
  const [selecionarAberto, setSelecionarAberto] = useState(false);
  const [piIds, setPiIds] = useState([]);
  // na primeira carga já mostra os PIs ativos (antes a tela abria vazia)
  const iniciouRef = useRef(false);
  useEffect(() => {
    if (iniciouRef.current || carregandoPis) return;
    iniciouRef.current = true;
    setPiIds(pis.filter((p) => p.status === "ativo").map((p) => p.id));
  }, [pis, carregandoPis]);
  // período visível (em dias) — a barra de rolagem desloca essa "janela" ao longo do cronograma
  const [janelaDias, setJanelaDias] = useState(60);
  const rolagemRef = useRef(null);
  const [larguraContainer, setLarguraContainer] = useState(0);
  const [rolagem, setRolagem] = useState(0);
  const [nivelPorPi, setNivelPorPi] = useState({}); // "tudo" (padrão) | "macro" | "pi"
  const nivelDe = (piId) => nivelPorPi[piId] || "tudo";
  const proximoNivel = { tudo: "macro", macro: "pi", pi: "tudo" };
  const ciclarNivel = (piId) => setNivelPorPi((p) => ({ ...p, [piId]: proximoNivel[nivelDe(piId)] }));

  // ---- filtro por equipe/recurso ----
  const [equipesDropdownAberto, setEquipesDropdownAberto] = useState(false);
  const [recursosDropdownAberto, setRecursosDropdownAberto] = useState(false);
  const [equipesDraft, setEquipesDraft] = useState([]);
  const [recursosDraft, setRecursosDraft] = useState([]);
  const [filtroAtivo, setFiltroAtivo] = useState({ equipes: [], recursos: [] });
  const toggleEquipeDraft = (a) => setEquipesDraft((p) => p.includes(a) ? p.filter((x) => x !== a) : [...p, a]);
  const toggleRecursoDraft = (id) => setRecursosDraft((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const equipesRef = useFecharAoClicarFora(equipesDropdownAberto, () => setEquipesDropdownAberto(false));
  const recursosRef = useFecharAoClicarFora(recursosDropdownAberto, () => setRecursosDropdownAberto(false));
  const aplicarFiltro = () => { setFiltroAtivo({ equipes: equipesDraft, recursos: recursosDraft }); setEquipesDropdownAberto(false); setRecursosDropdownAberto(false); };
  const limparFiltro = () => { setEquipesDraft([]); setRecursosDraft([]); setFiltroAtivo({ equipes: [], recursos: [] }); };

  // cada equipe/recurso selecionado no filtro ganha uma cor fixa (mesma ordem: equipes depois recursos)
  const itensFiltro = useMemo(() => {
    const nomeRecurso = (id) => recursos.find((r) => r.id === id)?.nome || "?";
    const lista = [
      ...filtroAtivo.equipes.map((a) => ({ tipo: "equipe", valor: a, rotulo: a })),
      ...filtroAtivo.recursos.map((id) => ({ tipo: "recurso", valor: id, rotulo: nomeRecurso(id) })),
    ];
    return lista.map((it, i) => ({ ...it, cor: PALETA_FILTRO[i % PALETA_FILTRO.length] }));
  }, [filtroAtivo, recursos]);

  const sobrepoePeriodo = (iniA, fimA, iniB, fimB) => iniA && fimA && iniB && fimB && iniA <= fimB && iniB <= fimA;
  const recursoBateNaEtapa = (recursoId, etapa) => alocacoesRecurso.some((al) => {
    if (al.recurso_id !== recursoId) return false;
    if (al.etapa_id) return al.etapa_id === etapa.id; // alocação feita direto na etapa (Cronograma)
    // alocação feita por PI + período (tela Recursos, sem etapa específica) — vale se o período cruza com a etapa
    return al.pi_id === etapa.pi_id && sobrepoePeriodo(al.periodo_inicio, al.periodo_fim, etapa.data_prevista_inicio, etapa.data_prevista_fim);
  });

  const itensQueBatemNaEtapa = (etapa) => itensFiltro.filter((it) =>
    it.tipo === "equipe"
      ? (etapa.areas || []).includes(it.valor)
      : recursoBateNaEtapa(it.valor, etapa)
  );

  const pisSelecionados = pis.filter((p) => piIds.includes(p.id));
  const etapasDosPis = etapas.filter((e) => piIds.includes(e.pi_id));
  // monta a lista na mesma ordem de criação do Cronograma: cada macro-etapa
  // seguida imediatamente das suas sub-etapas (também na ordem em que foram criadas)
  const porOrdem = (a, b) => (a.ordem ?? 999999) - (b.ordem ?? 999999);
  const itensOrdenados = (piId) => {
    const doPi = etapasDosPis.filter((e) => e.pi_id === piId);
    const macros = doPi.filter((e) => !e.parent_etapa_id).sort(porOrdem);
    return macros.flatMap((m) => [
      { ...m, nivel: 0 },
      ...doPi.filter((e) => e.parent_etapa_id === m.id).sort(porOrdem).map((s) => ({ ...s, nivel: 1 })),
    ]);
  };

  const periodoTotalDoPi = (piId) => {
    const doPi = etapasDosPis.filter((e) => e.pi_id === piId);
    const tempos = doPi.flatMap((e) => [
      tsLocal(e.data_prevista_inicio),
      tsLocal(e.data_prevista_fim),
    ]).filter(Boolean);
    if (tempos.length === 0) return null;
    return { inicio: Math.min(...tempos), fim: Math.max(...tempos) + 86400000 };
  };

  const escala = useMemo(() => {
    if (etapasDosPis.length === 0) {
      const hoje = new Date();
      return { min: hoje.getTime(), max: hoje.getTime() + 14 * 86400000 };
    }
    const tempos = etapasDosPis.flatMap((e) => [
      tsLocal(e.data_prevista_inicio),
      tsLocal(e.data_prevista_fim),
    ]).filter(Boolean);
    const min = Math.min(...tempos), max = Math.max(...tempos) + 86400000;
    const folga = Math.max((max - min) * 0.04, 2 * 86400000);
    return { min: min - folga, max: max + folga };
  }, [etapasDosPis]);

  const span = escala.max - escala.min || 1;
  const spanDias = span / 86400000;
  const larguraVisivel = Math.max(300, (larguraContainer || 900) - LABEL_W);
  // "Tudo" (janelaDias = null) encaixa o cronograma inteiro na tela, sem rolagem
  const pxPorDia = janelaDias ? larguraVisivel / janelaDias : larguraVisivel / spanDias;
  const largura = Math.max(larguraVisivel, spanDias * pxPorDia);
  const hojeX = ((Date.now() - escala.min) / span) * largura;
  const rolagemMax = Math.max(0, largura - larguraVisivel);
  const inicioVisivel = escala.min + (rolagem / pxPorDia) * 86400000;
  const fimVisivel = inicioVisivel + (larguraVisivel / pxPorDia) * 86400000;

  // mede a largura disponível (muda ao redimensionar a janela ou abrir/fechar a barra lateral)
  const temGrafico = pisSelecionados.length > 0;
  useEffect(() => {
    const el = rolagemRef.current;
    if (!el) return;
    const medir = () => setLarguraContainer(el.clientWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    window.addEventListener("resize", medir);
    return () => { ro.disconnect(); window.removeEventListener("resize", medir); };
  }, [temGrafico]);
  // garantia extra: confere a largura a cada renderização (só atualiza se mudou)
  useLayoutEffect(() => {
    const w = rolagemRef.current?.clientWidth;
    if (w && w !== larguraContainer) setLarguraContainer(w);
  });

  const rolarPara = (x, suave = true) => {
    const el = rolagemRef.current;
    if (!el) return;
    el.scrollTo({ left: Math.max(0, Math.min(rolagemMax, x)), behavior: suave ? "smooth" : "auto" });
  };
  const irParaHoje = (suave = true) => rolarPara(hojeX - larguraVisivel / 2, suave);

  // ao abrir (ou trocar o período), centraliza no dia de hoje
  const centralizouRef = useRef("");
  useEffect(() => {
    const chave = `${janelaDias}|${piIds.join(",")}|${Math.round(largura)}`;
    if (!temGrafico || !larguraContainer || centralizouRef.current === chave) return;
    centralizouRef.current = chave;
    setTimeout(() => irParaHoje(false), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [janelaDias, piIds, largura, larguraContainer, temGrafico]);

  const OPCOES_JANELA = [[14, "2 sem."], [30, "1 mês"], [60, "2 meses"], [90, "3 meses"], [180, "6 meses"], [null, "Tudo"]];
  const idxJanela = OPCOES_JANELA.findIndex(([v]) => v === janelaDias);
  const aproximar = () => idxJanela > 0 && setJanelaDias(OPCOES_JANELA[idxJanela - 1][0]);
  const afastar = () => idxJanela < OPCOES_JANELA.length - 1 && setJanelaDias(OPCOES_JANELA[idxJanela + 1][0]);

  const marcas = useMemo(() => {
    // espaçamento das datas da régua conforme o zoom: pelo menos ~56px entre rótulos
    const passo = [1, 2, 3, 7, 14, 30, 60].find((p) => p * pxPorDia >= 56) || 90;
    const arr = [];
    for (let t = proximaMeiaNoite(escala.min); t <= escala.max; ) { arr.push(t); const d = new Date(t); d.setDate(d.getDate() + passo); t = d.getTime(); }
    return arr;
  }, [escala, pxPorDia]);

  return (
    <PainelShell>
      <div className="p-4 md:p-8">
        <CabecalhoPagina
          titulo="Linha do Tempo"
          subtitulo="Visão multi-PI, para acompanhamento e apresentação."
          acoes={<>
            <button onClick={() => setSelecionarAberto(true)} className="btn btn-contorno !border-cyan !text-cyan hover:!bg-cyan/5">
              <Icone nome="buscar" className="w-4 h-4" /> PIs ({piIds.length} de {pis.length})
            </button>
          </>}
        />

        {/* ---- filtro por equipe / recurso ---- */}
        <div className="cartao flex flex-wrap items-center gap-2 mb-4 p-3">
          <div className="relative" ref={equipesRef}>
            <button onClick={() => { setEquipesDropdownAberto((o) => !o); setRecursosDropdownAberto(false); }} className={`btn btn-sm !py-2 border ${equipesDraft.length ? "border-cyan/40 text-cyan bg-cyan/5" : "border-line bg-white text-muted"}`}>
              Equipes{equipesDraft.length > 0 ? ` (${equipesDraft.length})` : ""} ▾
            </button>
            {equipesDropdownAberto && (
              <div className="absolute z-30 mt-1 bg-white border border-line rounded-xl shadow-xl p-1.5 w-64 max-h-72 overflow-auto rolagem-fina animar-fade">
                {AREAS.map((a) => (
                  <label key={a} className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer rounded-lg hover:bg-panel">
                    <input type="checkbox" className="accent-cyan" checked={equipesDraft.includes(a)} onChange={() => toggleEquipeDraft(a)} />
                    {a}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="relative" ref={recursosRef}>
            <button onClick={() => { setRecursosDropdownAberto((o) => !o); setEquipesDropdownAberto(false); }} className={`btn btn-sm !py-2 border ${recursosDraft.length ? "border-cyan/40 text-cyan bg-cyan/5" : "border-line bg-white text-muted"}`}>
              Recursos{recursosDraft.length > 0 ? ` (${recursosDraft.length})` : ""} ▾
            </button>
            {recursosDropdownAberto && (
              <div className="absolute z-30 mt-1 bg-white border border-line rounded-xl shadow-xl p-1.5 w-64 max-h-72 overflow-auto rolagem-fina animar-fade">
                {recursos.length === 0 && <div className="text-sm text-muteddim px-2 py-1.5">Nenhum recurso cadastrado.</div>}
                {recursos.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer rounded-lg hover:bg-panel">
                    <input type="checkbox" className="accent-cyan" checked={recursosDraft.includes(r.id)} onChange={() => toggleRecursoDraft(r.id)} />
                    <span className="truncate">{r.nome}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <button onClick={aplicarFiltro} className="btn btn-primario btn-sm !py-2">Filtrar</button>
          {(itensFiltro.length > 0 || equipesDraft.length > 0 || recursosDraft.length > 0) && (
            <button onClick={limparFiltro} className="btn btn-fantasma btn-sm !py-2">Limpar filtro</button>
          )}

          {itensFiltro.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 sm:ml-2">
              {itensFiltro.map((it) => (
                <span key={it.tipo + it.valor} className="text-xs font-semibold px-2.5 py-1 rounded-full text-white" style={{ background: it.cor }}>
                  {it.rotulo}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted w-full lg:w-auto lg:ml-auto pt-1 lg:pt-0">
            {Object.entries(STATUS_ETAPA).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ background: v.barra }} />{v.rotulo}</span>
            ))}
            <span className="flex items-center gap-1.5"><span className="w-px h-3 bg-red" />Hoje</span>
          </div>
        </div>

        {!carregandoPis && pisSelecionados.length === 0 && (
          <EstadoVazio icone="linhaTempo" titulo="Nenhum PI selecionado" texto="Escolha quais PIs aparecem na linha do tempo."
            acao={<button onClick={() => setSelecionarAberto(true)} className="btn btn-primario">Selecionar PIs</button>} />
        )}
        {pisSelecionados.length > 0 && (
          <div className="text-xs text-muteddim mb-2">Clique no nome de um PI para alternar: tudo (macro + sub-etapas) → só macro-etapas → contraído.</div>
        )}

        {pisSelecionados.length > 0 && (
          <div className="cartao px-3 py-2.5 mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 sticky top-[calc(3.5rem+env(safe-area-inset-top))] md:top-0 z-30">
            {/* período visível */}
            <div className="flex items-center gap-1" role="group" aria-label="Período visível">
              <button onClick={afastar} disabled={idxJanela === OPCOES_JANELA.length - 1} className="btn btn-contorno btn-sm !px-2.5" title="Mostrar um período maior" aria-label="Diminuir zoom">−</button>
              <select value={janelaDias ?? ""} onChange={(e) => setJanelaDias(e.target.value ? Number(e.target.value) : null)}
                className="input !w-auto !py-1.5 !text-sm font-semibold" aria-label="Período visível">
                {OPCOES_JANELA.map(([v, l]) => <option key={l} value={v ?? ""}>{l}</option>)}
              </select>
              <button onClick={aproximar} disabled={idxJanela === 0} className="btn btn-contorno btn-sm !px-2.5" title="Mostrar um período menor (mais detalhe)" aria-label="Aumentar zoom">+</button>
            </div>

            {/* barra de rolagem do período */}
            <div className="flex items-center gap-2 flex-1 min-w-[260px]">
              <button onClick={() => rolarPara(rolagem - larguraVisivel * 0.8)} disabled={rolagem <= 0} className="btn btn-contorno btn-sm !px-2" aria-label="Período anterior">
                <Icone nome="voltar" className="w-4 h-4" />
              </button>
              <input type="range" min="0" max={Math.max(1, Math.round(rolagemMax))} step="1" value={Math.round(rolagem)} disabled={rolagemMax <= 0}
                onChange={(e) => rolarPara(Number(e.target.value), false)}
                className="flex-1 accent-cyan h-2 cursor-pointer disabled:cursor-default disabled:opacity-40" aria-label="Deslocar o período visível" />
              <button onClick={() => rolarPara(rolagem + larguraVisivel * 0.8)} disabled={rolagem >= rolagemMax - 1} className="btn btn-contorno btn-sm !px-2" aria-label="Próximo período">
                <Icone nome="seta" className="w-4 h-4" />
              </button>
              <button onClick={() => irParaHoje()} className="btn btn-contorno btn-sm !border-red/40 !text-red hover:!bg-red/5">Hoje</button>
            </div>

            <div className="text-xs text-muted whitespace-nowrap">
              <span className="font-semibold text-textmain">{new Date(inicioVisivel).toLocaleDateString("pt-BR")}</span> a <span className="font-semibold text-textmain">{new Date(fimVisivel).toLocaleDateString("pt-BR")}</span>
            </div>
          </div>
        )}

        {pisSelecionados.length > 0 && (
          <div ref={rolagemRef} onScroll={(e) => setRolagem(e.currentTarget.scrollLeft)}
            className="cartao overflow-x-auto rolagem-linha-tempo">
            <div style={{ minWidth: LABEL_W + largura }}>
              {/* cabeçalho: rótulo vazio (fixo) + régua de datas */}
              <div className="flex sticky top-0 bg-white z-20 border-b border-line">
                <div className="shrink-0 sticky left-0 bg-white z-30" style={{ width: LABEL_W }} />
                <div className="relative h-7" style={{ width: largura }}>
                  {marcas.map((t) => (
                    <div key={t} className="absolute top-0 h-full text-[11px] font-mono text-muteddim border-l border-line pl-1 pt-1.5" style={{ left: ((t - escala.min) / span) * largura }}>
                      {formatarData(t)}
                    </div>
                  ))}
                </div>
              </div>

              {pisSelecionados.map((pi) => {
                const itens = itensOrdenados(pi.id);
                const nivel = nivelDe(pi.id);
                const periodo = periodoTotalDoPi(pi.id);
                const icone = { tudo: "▾▾", macro: "▾", pi: "▸" }[nivel];
                const dicaProximo = { tudo: "mostrar só macro-etapas", macro: "contrair para o PI inteiro", pi: "expandir tudo" }[nivel];
                const itensVisiveis = nivel === "macro" ? itens.filter((e) => !e.nivel) : itens;
                return (
                  <div key={pi.id}>
                    <div className="flex bg-panel">
                      <button onClick={() => ciclarNivel(pi.id)} title={`Clique para ${dicaProximo}`}
                        className="shrink-0 sticky left-0 bg-panel z-10 px-3 py-2 text-sm font-mono text-cyan font-bold border-r border-line flex items-center gap-2 text-left hover:bg-line/40 transition-colors"
                        style={{ width: LABEL_W }}>
                        <span className="text-[10px] w-4 shrink-0">{icone}</span>
                        <span className="truncate">{pi.codigo} — {pi.cliente}</span>
                      </button>
                      <div className="relative" style={{ width: largura }}>
                        {nivel === "pi" && (
                          <div className="absolute top-0 bottom-0" style={{ left: hojeX, width: 1, background: "#D64545", opacity: 0.5 }} />
                        )}
                        {nivel === "pi" && periodo && (() => {
                          const left = ((periodo.inicio - escala.min) / span) * largura;
                          const width = Math.max(4, ((periodo.fim - periodo.inicio) / span) * largura);
                          return (
                            <div className="absolute top-3 h-3.5 rounded" style={{ left, width, background: "#0B84A5" }}
                              title={`${pi.codigo} — do início até a última etapa planejada`} />
                          );
                        })()}
                      </div>
                    </div>

                    {nivel !== "pi" && itensVisiveis.map((e) => {
                      const inicio = tsLocal(e.data_prevista_inicio) ?? escala.min;
                      const fim = (tsLocal(e.data_prevista_fim) ?? inicio) + 86400000; // a barra vai até o FIM do último dia
                      const left = ((inicio - escala.min) / span) * largura;
                      const width = Math.max(4, ((fim - inicio) / span) * largura);
                      const dias = e.data_prevista_fim ? diffDias(e.data_prevista_fim) : null;
                      const vencido = e.status !== "concluida" && dias !== null && dias < 0;
                      const urgente = e.status !== "concluida" && dias !== null && dias >= 0 && dias <= 1;
                      const atencao = e.status !== "concluida" && dias !== null && dias > 1 && dias <= 3;
                      const marcas2 = itensQueBatemNaEtapa(e);
                      return (
                        <div key={e.id} className="flex items-center border-b border-line/60">
                          <div className={`shrink-0 sticky left-0 bg-white z-10 py-1.5 truncate border-r border-line ${e.nivel ? "pl-8 pr-2 text-xs text-muted" : "px-3 text-sm font-medium"}`} style={{ width: LABEL_W }} title={e.nome}>
                            {e.nivel ? "· " : ""}{e.nome}
                          </div>
                          <div className={e.nivel ? "relative h-7" : "relative h-8"} style={{ width: largura }}>
                            <div className="absolute inset-0" style={{ left: hojeX, width: 1, background: "#D64545", opacity: 0.5 }} />
                            <div
                              className={e.nivel ? "absolute top-2.5 h-2 rounded-full" : "absolute top-2.5 h-3 rounded"}
                              style={{
                                left, width,
                                background: vencido ? "#D64545" : STATUS_COR[e.status],
                                outline: urgente ? "2px solid #D64545" : atencao ? "2px solid #C97A21" : "none",
                                opacity: e.nivel ? 0.6 : (vencido ? 1 : 0.85),
                              }}
                              title={`${e.nome} · ${STATUS_ETAPA[e.status]?.rotulo || e.status} · ${formatarDataIso(e.data_prevista_inicio)} → ${formatarDataIso(e.data_prevista_fim)}${e.status === "em_andamento" ? ` · ${e.percentual || 0}%` : ""}`}
                            />
                            {marcas2.length > 0 && (
                              <div className="absolute flex gap-0.5" style={{ left, top: e.nivel ? -1 : -2 }}>
                                {marcas2.map((m) => (
                                  <span key={m.tipo + m.valor} className="block rounded-full" style={{ width: 6, height: 6, background: m.cor }} title={m.rotulo} />
                                ))}
                              </div>
                            )}
                            {(vencido || e.status === "em_andamento") && (
                              <span className={`absolute top-2 text-[11px] font-mono whitespace-nowrap ${vencido ? "text-red font-semibold" : "text-muted"}`} style={{ left: left + width + 5 }}>
                                {vencido ? "VENCIDO" : `${e.percentual || 0}%`}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {nivel !== "pi" && itensVisiveis.length === 0 && (
                      <div className="flex">
                        <div className="shrink-0 sticky left-0 bg-white z-10 px-3 py-2 text-xs text-muteddim border-r border-line" style={{ width: LABEL_W }}>Sem macro-etapas</div>
                        <div style={{ width: largura }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ---- tabelas de detalhe por equipe/recurso selecionado no filtro ---- */}
        {itensFiltro.length > 0 && (
          <div className="mt-6 flex flex-col gap-5">
            {itensFiltro.map((it) => {
              const linhas = pisSelecionados.flatMap((pi) =>
                itensOrdenados(pi.id)
                  .filter((e) => (it.tipo === "equipe" ? (e.areas || []).includes(it.valor) : recursoBateNaEtapa(it.valor, e)))
                  .map((e) => ({ pi, etapa: e }))
              );
              return (
                <div key={it.tipo + it.valor}>
                  <div className="font-head font-bold text-sm mb-2 px-2 py-1 rounded inline-block text-white" style={{ background: it.cor }}>
                    {it.rotulo}
                  </div>
                  <div className="cartao overflow-x-auto">
                    <table className="w-full text-sm min-w-[480px]">
                      <thead>
                        <tr className="bg-panel text-left">
                          <th className="px-3 py-2 titulo-secao">PI</th>
                          <th className="px-3 py-2 titulo-secao">Macro/sub etapa</th>
                          <th className="px-3 py-2 titulo-secao">Início</th>
                          <th className="px-3 py-2 titulo-secao">Fim</th>
                        </tr>
                      </thead>
                      <tbody>
                        {linhas.map(({ pi, etapa: e }) => (
                          <tr key={pi.id + e.id} className="border-t border-line">
                            <td className="px-3 py-2 font-mono text-cyan font-bold">{pi.codigo}</td>
                            <td className="px-3 py-2">{e.nivel ? "· " : ""}{e.nome}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{formatarDataIso(e.data_prevista_inicio)}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{formatarDataIso(e.data_prevista_fim)}</td>
                          </tr>
                        ))}
                        {linhas.length === 0 && (
                          <tr><td colSpan={4} className="px-3 py-3 text-muteddim text-center">Nenhuma etapa encontrada nos PIs selecionados.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selecionarAberto && (
        <SelecionarPisModal pis={pis} selecionados={piIds} onConfirmar={(ids) => { setPiIds(ids); setSelecionarAberto(false); }} onCancelar={() => setSelecionarAberto(false)} />
      )}
    </PainelShell>
  );
}

function SelecionarPisModal({ pis, selecionados, onConfirmar, onCancelar }) {
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");
  const [locais, setLocais] = useState(selecionados);

  const ehAberto = (p) => p.status === "ativo" || p.status === "pausado";
  // filtra enquanto digita (antes era preciso clicar em "Pesquisar")
  const termo = busca.trim().toLowerCase();
  const resultados = pis.filter((p) =>
    (!termo || [p.codigo, p.cliente, p.projeto].some((c) => (c || "").toLowerCase().includes(termo))) &&
    (!statusFiltro || (statusFiltro === "abertos" ? ehAberto(p) : !ehAberto(p))));
  const toggleLocal = (id) => setLocais((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const marcarTodos = () => setLocais((p) => [...new Set([...p, ...resultados.map((r) => r.id)])]);
  const desmarcarTodos = () => setLocais((p) => p.filter((id) => !resultados.some((r) => r.id === id)));

  return (
    <Modal titulo="Selecionar PIs" onFechar={onCancelar}
      rodape={<>
        <span className="text-sm text-muted mr-auto self-center">{locais.length} selecionado(s)</span>
        <button onClick={onCancelar} className="btn btn-fantasma">Cancelar</button>
        <button onClick={() => onConfirmar(locais)} className="btn btn-primario">Mostrar na linha do tempo</button>
      </>}>
      <div className="relative mb-3">
        <Icone nome="buscar" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muteddim" />
        <input autoFocus placeholder="Buscar por nº, cliente ou projeto" value={busca} onChange={(e) => setBusca(e.target.value)} className="input pl-9" />
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {[["", "Todos"], ["abertos", "Abertos"], ["encerrados", "Encerrados"]].map(([v, l]) => (
          <button key={v} type="button" onClick={() => setStatusFiltro(v)} className={`chip ${statusFiltro === v ? "chip-ativo" : ""}`}>{l}</button>
        ))}
        <div className="flex gap-3 ml-auto">
          <button onClick={marcarTodos} className="text-sm text-cyan font-semibold hover:underline">Marcar todos</button>
          <button onClick={desmarcarTodos} className="text-sm text-muted hover:underline">Desmarcar</button>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {resultados.map((p) => {
          const marcado = locais.includes(p.id);
          return (
            <label key={p.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer border transition-colors ${marcado ? "border-cyan/40 bg-cyan/5" : "border-transparent bg-panel hover:bg-line/40"}`}>
              <input type="checkbox" className="accent-cyan w-4 h-4" checked={marcado} onChange={() => toggleLocal(p.id)} />
              <span className="font-mono text-cyan font-bold w-24 shrink-0 truncate">{p.codigo}</span>
              <span className="flex-1 min-w-0 truncate">{p.cliente}{p.projeto ? <span className="text-muted"> · {p.projeto}</span> : ""}</span>
              <span className={`selo shrink-0 ${ehAberto(p) ? "bg-green/10 text-green" : "bg-panel text-muteddim"}`}>{ehAberto(p) ? "Aberto" : "Encerrado"}</span>
            </label>
          );
        })}
        {resultados.length === 0 && <div className="text-sm text-muteddim text-center py-6">Nenhum PI encontrado.</div>}
      </div>
    </Modal>
  );
}