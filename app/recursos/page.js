"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useTabela, registrarLog, gravarTolerante } from "../../lib/dados";
import EmpresasTerceiras from "../../components/EmpresasTerceiras";
import { useRouter } from "next/navigation";
import { useAuth, pode } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import { hojeISO, formatarData } from "../../lib/datas";
import { TIPOS_RECURSO, AREAS, FUNCOES, UNIDADES } from "../../lib/constantes";
import { useToast } from "../../lib/Toast";
import PainelShell from "../../components/PainelShell";
import { Modal, EstadoVazio, Esqueleto, Aviso, Campo, SeletorEquipes } from "../../components/ui";
import Icone from "../../components/Icone";
import GraficoUtilizacao from "../../components/GraficoUtilizacao";
import { ConfirmacaoDupla } from "../../components/AcoesMaster";

function sobrepoe(iniA, fimA, iniB, fimB) { return iniA <= fimB && iniB <= fimA; }
// etapas do PI na ordem do Cronograma (macro seguida das suas sub-etapas), com rótulo "Macro › Sub"
const porOrdem = (a, b) => (a.ordem ?? 999999) - (b.ordem ?? 999999) || String(a.created_at || "").localeCompare(String(b.created_at || ""));
function etapasEmOrdem(etapas, piId) {
  if (!piId) return [];
  const doPi = etapas.filter((e) => e.pi_id === piId);
  return doPi.filter((e) => !e.parent_etapa_id).sort(porOrdem).flatMap((m) => [
    { ...m, rotulo: m.nome, nivel: 0 },
    ...doPi.filter((s) => s.parent_etapa_id === m.id).sort(porOrdem).map((s) => ({ ...s, rotulo: `${m.nome} › ${s.nome}`, nivel: 1 })),
  ]);
}
function rotuloUnidade(u) { return UNIDADES.find((x) => x[0] === u)?.[1] || u; }
function rotuloTipo(t) { return TIPOS_RECURSO.find((x) => x[0] === t)?.[1] || t; }
function tipoParaPerfil(perfil) {
  if (perfil === "terceiro") return "mao_obra_terceira";
  return "mao_obra_propria";
}

export default function RecursosPage({ searchParams }) {
  const router = useRouter();
  const { usuario } = useAuth();
  const editavel = pode(usuario, "recurso.editar");
  const podeAlocar = pode(usuario, "recurso.alocar");
  const { avisar } = useToast();
  const detalheRef = useRef(null);
  const { dados: pis } = useTabela("pis", { order: { coluna: "codigo" } });
  const { dados: usuarios } = useTabela("usuarios");
  const { dados: recursos, carregando: carregandoRecursos, recarregar: recarregarRecursos } = useTabela("recursos", { order: { coluna: "nome" } });
  const { dados: alocacoes, recarregar: recarregarAlocacoes } = useTabela("alocacoes_recurso");
  const { dados: etapas } = useTabela("etapas", { select: "id,pi_id,nome,parent_etapa_id,ordem,created_at,data_prevista_inicio,data_prevista_fim", order: { coluna: "created_at" } });
  const opcoesEtapa = (piId) => etapasEmOrdem(etapas, piId);
  const nomeEtapa = (id) => opcoesEtapa(etapas.find((e) => e.id === id)?.pi_id).find((e) => e.id === id)?.rotulo;
  const { dados: empresas, carregando: carregandoEmpresas, erro: erroEmpresas, recarregar: recarregarEmpresas } = useTabela("empresas_terceiras", { order: { coluna: "nome" } });
  const empresasAtivas = empresas.filter((e) => e.ativa);
  const nomeEmpresa = (id) => empresas.find((e) => e.id === id)?.nome;

  const [selecionadosIds, setSelecionadosIds] = useState([]);
  const [ancoraId, setAncoraId] = useState(null);
  const selecionadoId = selecionadosIds.length === 1 ? selecionadosIds[0] : null;
  const selecionado = recursos.find((r) => r.id === selecionadoId);
  const alocsDoSelecionado = alocacoes.filter((a) => a.recurso_id === selecionadoId);

  const [novoOpen, setNovoOpen] = useState(false);
  const [editarOpen, setEditarOpen] = useState(false);
  const [alocarOpen, setAlocarOpen] = useState(false);
  const [massaOpen, setMassaOpen] = useState(false);
  const [excluindoRecurso, setExcluindoRecurso] = useState(null);
  const master = pode(usuario, "recurso.excluir");
  const excluirRecurso = async (r) => {
    const qtd = alocacoes.filter((a) => a.recurso_id === r.id).length;
    const { error: e1 } = await supabase.from("alocacoes_recurso").delete().eq("recurso_id", r.id);
    if (e1) return { erro: e1.message };
    const { error } = await supabase.from("recursos").delete().eq("id", r.id);
    if (error) return { erro: error.message };
    await registrarLog(usuario, "Excluiu recurso (Master)", `${r.nome} (${rotuloTipo(r.tipo)}) · ${qtd} alocação(ões) apagada(s)`);
    avisar(`Recurso "${r.nome}" excluído — registrado na Auditoria.`, "info");
    setSelecionadosIds([]); recarregarRecursos(); recarregarAlocacoes();
    return { ok: true };
  };
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [filtroEquipe, setFiltroEquipe] = useState("");
  const [mostrarDesabilitados, setMostrarDesabilitados] = useState(true);
  const [alternandoAtivo, setAlternandoAtivo] = useState(false);
  const alternarAtivo = async (r) => {
    const ativo = r.ativo === false;
    setAlternandoAtivo(true);
    const { data: gravado, error } = await supabase.from("recursos").update({ ativo }).eq("id", r.id).select("id, ativo");
    // sem erro mas sem linha alterada = o banco bloqueou (permissão)
    if (!error && !gravado?.length) { setAlternandoAtivo(false); avisar("O banco não permitiu alterar este recurso (permissão).", "erro", 7000); return; }
    setAlternandoAtivo(false);
    // mostra o erro real do banco (antes só dizia "rode o script", o que escondia a causa)
    if (error) { avisar(`Não foi possível alterar: ${error.message}${/ativo/.test(error.message) ? " — rode o recursos-ativo.sql (versão atual, com a recarga do cache) no Supabase." : ""}`, "erro", 9000); return; }
    await registrarLog(usuario, ativo ? "Habilitou recurso" : "Desabilitou recurso", r.nome);
    avisar(ativo ? `${r.nome} habilitado.` : `${r.nome} desabilitado — não aparece mais para novas alocações.`);
    recarregarRecursos();
  };
  const [gruposFechados, setGruposFechados] = useState([]);

  // qualquer usuário (todos os perfis) pode virar recurso e ser alocado nos PIs;
  // desabilitados ficam de fora, exceto o que já está vinculado ao recurso em edição
  const usuariosElegiveis = usuarios
    .filter((u) => u.ativo !== false || u.id === selecionado?.usuario_id)
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
  // usuário que já é recurso (para avisar e evitar duplicar)
  const recursoDoUsuario = (uid) => recursos.find((r) => r.usuario_id === uid);

  const fecharTudoMenos = (aberto) => {
    setNovoOpen(aberto === "novo");
    setEditarOpen(aberto === "editar");
    setAlocarOpen(aberto === "alocar");
  };

  const recursosFiltrados = useMemo(() => {
    const termo = buscaAplicada.trim().toLowerCase();
    return recursos.filter((r) => (mostrarDesabilitados || r.ativo !== false) && (!filtroEquipe || (r.equipes || []).includes(filtroEquipe)) && (!termo ||
      r.nome.toLowerCase().includes(termo) ||
      rotuloTipo(r.tipo).toLowerCase().includes(termo) ||
      (r.atributos?.funcao || "").toLowerCase().includes(termo) ||
      (usuarios.find((u) => u.id === r.usuario_id)?.nome || "").toLowerCase().includes(termo) ||
      (r.equipes || []).some((a) => a.toLowerCase().includes(termo))
    ));
  }, [recursos, buscaAplicada, filtroEquipe, mostrarDesabilitados, usuarios]);

  const grupos = useMemo(() => {
    const porTipo = {};
    recursosFiltrados.forEach((r) => { (porTipo[r.tipo] = porTipo[r.tipo] || []).push(r); });
    return TIPOS_RECURSO.filter(([v]) => porTipo[v]?.length).map(([v, l]) => ({ tipo: v, label: l, itens: porTipo[v] }));
  }, [recursosFiltrados]);
  const toggleGrupo = (tipo) => setGruposFechados((p) => p.includes(tipo) ? p.filter((x) => x !== tipo) : [...p, tipo]);

  const ordemVisivel = useMemo(
    () => grupos.flatMap((g) => gruposFechados.includes(g.tipo) ? [] : g.itens.map((r) => r.id)),
    [grupos, gruposFechados]
  );

  const clicarRecurso = (id, evento) => {
    if (evento.shiftKey && ancoraId) {
      const iA = ordemVisivel.indexOf(ancoraId);
      const iB = ordemVisivel.indexOf(id);
      if (iA !== -1 && iB !== -1) {
        const [ini, fim] = iA < iB ? [iA, iB] : [iB, iA];
        setSelecionadosIds(ordemVisivel.slice(ini, fim + 1));
        fecharTudoMenos(null);
        return;
      }
    }
    setSelecionadosIds([id]);
    setAncoraId(id);
    setEditandoAlocId(null);
    fecharTudoMenos(null);
    // no celular o detalhe fica abaixo da lista: rola até ele
    if (window.innerWidth < 768) setTimeout(() => detalheRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const criarRecurso = async (dados) => {
    const { data, error } = await gravarTolerante({
      nome: dados.nome, tipo: dados.tipo, custo_unidade: dados.unidade,
      usuario_id: dados.usuarioId || null, atributos: { funcao: dados.funcao || null }, equipes: dados.equipes || [],
      empresa_terceira_id: dados.tipo === "mao_obra_terceira" ? dados.empresaId || null : null,
    }, (d) => supabase.from("recursos").insert(d).select().single());
    if (error) { avisar(`Não foi possível criar: ${error.message}`, "erro", 6000); return; }
    await registrarLog(usuario, "Criou recurso", `${dados.nome}${dados.empresaId ? ` — ${nomeEmpresa(dados.empresaId)}` : ""}`);
    avisar(`Recurso "${dados.nome}" criado.`);
    setNovoOpen(false);
    setSelecionadosIds([data.id]);
    setAncoraId(data.id);
    recarregarRecursos();
  };

  const salvarEdicao = async (dados) => {
    if (!selecionado) return;
    const { error, colunasIgnoradas } = await gravarTolerante({
      nome: dados.nome, tipo: dados.tipo, custo_unidade: dados.unidade,
      usuario_id: dados.usuarioId || null, atributos: { ...(selecionado.atributos || {}), funcao: dados.funcao || null }, equipes: dados.equipes || [],
      empresa_terceira_id: dados.tipo === "mao_obra_terceira" ? dados.empresaId || null : null,
      ativo: dados.ativo !== false,
    }, (d) => supabase.from("recursos").update(d).eq("id", selecionado.id));
    if (error) { avisar(`Não foi possível salvar: ${error.message}`, "erro", 6000); return; }
    if (colunasIgnoradas?.includes("ativo")) avisar("Salvo, mas a situação Ativo/Desabilitado não foi gravada: o banco ainda não tem a coluna. Rode o recursos-ativo.sql.", "erro", 9000);
    await registrarLog(usuario, "Editou recurso", `${dados.nome}${dados.empresaId ? ` — ${nomeEmpresa(dados.empresaId)}` : ""}`);
    avisar("Recurso atualizado.");
    setEditarOpen(false);
    recarregarRecursos();
  };

  const [editandoAlocId, setEditandoAlocId] = useState(null);
  const [modo, setModo] = useState("periodo_percentual");
  const [periodoInicio, setPeriodoInicio] = useState(hojeISO());
  const [periodoFim, setPeriodoFim] = useState(hojeISO());
  const [percentual, setPercentual] = useState(100);
  const [piEscolhido, setPiEscolhido] = useState("");
  const [etapaEscolhida, setEtapaEscolhida] = useState("");
  // escolher a etapa faz o mesmo que a alocação pelo Cronograma: usa as datas planejadas dela
  const escolherEtapa = (id) => {
    setEtapaEscolhida(id);
    const e = etapas.find((x) => x.id === id);
    if (e?.data_prevista_inicio) setPeriodoInicio(e.data_prevista_inicio);
    if (e?.data_prevista_fim) setPeriodoFim(e.data_prevista_fim);
    // igual à alocação pelo Cronograma: % / Período com 100% (pode ajustar depois)
    if (e) { setModo("periodo_percentual"); setPercentual(100); }
  };
  const etapaDuplicada = !!etapaEscolhida && alocsDoSelecionado.some((a) => a.etapa_id === etapaEscolhida && a.id !== editandoAlocId);

  // calculado enquanto preenche (antes o aviso só aparecia DEPOIS de já ter salvo)
  const somaSobreposta = useMemo(() => {
    if (modo !== "periodo_percentual") return 0;
    return alocsDoSelecionado
      .filter((a) => a.id !== editandoAlocId && a.modo === "periodo_percentual" && sobrepoe(a.periodo_inicio, a.periodo_fim, periodoInicio, periodoFim))
      .reduce((s, a) => s + Number(a.percentual || 0), Number(percentual) || 0);
  }, [alocsDoSelecionado, editandoAlocId, modo, periodoInicio, periodoFim, percentual]);
  const avisoOverlap = somaSobreposta > 100;
  const periodoInvalido = periodoInicio && periodoFim && periodoFim < periodoInicio;
  const percentualInvalido = modo === "periodo_percentual" && (!(Number(percentual) > 0) || Number(percentual) > 100);

  const salvarAlocacao = async () => {
    if (!selecionadoId || !piEscolhido || periodoInvalido || percentualInvalido || etapaDuplicada) return;

    const payload = {
      recurso_id: selecionadoId, pi_id: piEscolhido, etapa_id: etapaEscolhida || null, modo,
      periodo_inicio: periodoInicio, periodo_fim: periodoFim,
      percentual: modo === "periodo_percentual" ? Number(percentual) : null,
    };
    const { error } = editandoAlocId
      ? await supabase.from("alocacoes_recurso").update(payload).eq("id", editandoAlocId)
      : await supabase.from("alocacoes_recurso").insert(payload);
    if (error) { avisar(`Não foi possível salvar: ${error.message}`, "erro", 6000); return; }
    avisar(editandoAlocId ? "Alocação atualizada." : "Alocação criada.");
    await registrarLog(usuario, editandoAlocId ? "Editou alocação" : "Criou alocação", `${selecionado?.nome} — ${pis.find((p) => p.id === piEscolhido)?.codigo}${etapaEscolhida ? ` · ${nomeEtapa(etapaEscolhida)}` : ""}`);
    setEditandoAlocId(null);
    recarregarAlocacoes();
  };

  const removerAlocacao = async (a) => {
    if (!window.confirm(`Remover a alocação em ${pis.find((p) => p.id === a.pi_id)?.codigo || "PI"}?`)) return;
    const { error } = await supabase.from("alocacoes_recurso").delete().eq("id", a.id);
    if (error) { avisar(`Não foi possível remover: ${error.message}`, "erro", 6000); return; }
    await registrarLog(usuario, "Removeu alocação", `${selecionado?.nome} — ${pis.find((p) => p.id === a.pi_id)?.codigo}`);
    recarregarAlocacoes();
  };

  const aplicarAlocacaoMassa = async ({ piId, etapaId, modoM, inicio, fim, perc, recursoIds }) => {
    // na mesma etapa, não duplica quem já está alocado nela
    const ids = etapaId ? recursoIds.filter((rid) => !alocacoes.some((a) => a.recurso_id === rid && a.etapa_id === etapaId)) : recursoIds;
    if (!ids.length) { avisar("Todos os recursos escolhidos já estão nesta etapa.", "info"); return; }
    const linhas = ids.map((rid) => ({
      recurso_id: rid, pi_id: piId, etapa_id: etapaId || null, modo: modoM, periodo_inicio: inicio, periodo_fim: fim,
      percentual: modoM === "periodo_percentual" ? Number(perc) : null,
    }));
    const { error } = await supabase.from("alocacoes_recurso").insert(linhas);
    if (error) { avisar(`Não foi possível alocar: ${error.message}`, "erro", 6000); return; }
    avisar(`${ids.length} recurso(s) alocado(s)${ids.length < recursoIds.length ? ` · ${recursoIds.length - ids.length} já estavam na etapa` : ""}.`);
    await registrarLog(usuario, "Alocação em massa", `${ids.length} recurso(s) em ${pis.find((p) => p.id === piId)?.codigo}${etapaId ? ` · ${nomeEtapa(etapaId)}` : ""}`);
    setMassaOpen(false);
    recarregarAlocacoes();
  };

  // abas: cadastro/alocação e o gráfico de utilização (que antes era uma página separada)
  // a aba acompanha a URL: os itens do menu "Utilização de recursos" e "Empresas terceiras"
  // abrem esta mesma página com ?aba=utilizacao / ?aba=empresas
  const [aba, setAbaEstado] = useState("cadastro");
  const abaDaUrl = searchParams?.aba;
  useEffect(() => {
    setAbaEstado(abaDaUrl === "utilizacao" || abaDaUrl === "empresas" ? abaDaUrl : "cadastro");
  }, [abaDaUrl]);
  const setAba = (v) => {
    setAbaEstado(v);
    // pelo roteador (e não history.replaceState): assim a URL "oficial" muda junto e o menu continua sincronizado
    router.replace(v !== "cadastro" ? `/recursos?aba=${v}` : "/recursos", { scroll: false });
    setTimeout(() => window.dispatchEvent(new Event("aba-mudou")), 50); // o menu lateral acende o item certo
  };
  const sobrealocados = useMemo(() => recursos.filter((r) => {
    const eventos = [];
    alocacoes.filter((a) => a.recurso_id === r.id && a.modo === "periodo_percentual").forEach((a) => {
      eventos.push([a.periodo_inicio, 1, Number(a.percentual)]);
      eventos.push([a.periodo_fim, 2, -Number(a.percentual)]);
    });
    eventos.sort((x, y) => String(x[0]).localeCompare(String(y[0])) || x[1] - y[1]);
    let atual = 0, pico = 0;
    eventos.forEach(([, , d]) => { atual += d; pico = Math.max(pico, atual); });
    return pico > 100;
  }).length, [recursos, alocacoes]);

  return (
    <PainelShell>
    <div className="flex flex-col md:h-[100dvh]">
      <div className="bg-white border-b border-line px-4 md:px-6 pt-4 shrink-0">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h1 className="titulo-pagina">Recursos</h1>
          <span className="text-xs text-muted">{recursos.length} cadastrados · {alocacoes.length} alocações</span>
        </div>
        <div className="flex gap-1 overflow-x-auto" role="tablist">
          {[["cadastro", "Recursos e alocações", null], ["utilizacao", "Utilização", sobrealocados], ["empresas", "Empresas terceiras", null]].map(([v, l, n]) => (
            <button key={v} role="tab" aria-selected={aba === v} onClick={() => setAba(v)}
              className={`relative px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors ${aba === v ? "text-cyan" : "text-muted hover:text-textmain"}`}>
              {l}
              {n > 0 && <span className="ml-2 selo bg-red/10 text-red" title="Recursos acima de 100%">⚠ {n}</span>}
              {aba === v && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-cyan rounded-full" />}
            </button>
          ))}
        </div>
      </div>

      {aba === "empresas" ? (
        <div className="flex-1 min-h-0 p-4 md:p-6 md:overflow-y-auto rolagem-fina">
          <EmpresasTerceiras empresas={empresas} carregando={carregandoEmpresas} recursos={recursos} editavel={pode(usuario, "empresa.gerenciar")} usuario={usuario}
            onMudou={() => { recarregarEmpresas(); recarregarRecursos(); }} erroTabela={!!erroEmpresas} />
        </div>
      ) : aba === "utilizacao" ? (
        <div className="flex-1 min-h-0 p-4 md:p-6 md:overflow-y-auto rolagem-fina">
          <GraficoUtilizacao recursos={recursos} alocacoes={alocacoes} pis={pis} carregando={carregandoRecursos}
            onSelecionarRecurso={(id) => { setAba("cadastro"); setSelecionadosIds([id]); setAncoraId(id); setEditandoAlocId(null); fecharTudoMenos(null); }} />
        </div>
      ) : (
    <div className="flex flex-col md:flex-row flex-1 min-h-0">
      <aside className="w-full md:w-96 shrink-0 bg-white border-b md:border-b-0 md:border-r border-line p-4 md:p-5 md:overflow-y-auto rolagem-fina">

        {(editavel || podeAlocar) && (
          <div className="flex flex-col gap-2 mb-4">
            <div className="grid grid-cols-2 gap-2">
              {editavel && <button onClick={() => fecharTudoMenos(novoOpen ? null : "novo")} className={`btn ${novoOpen ? "btn-contorno" : "btn-primario"}`}>
                <Icone nome={novoOpen ? "fechar" : "mais2"} className="w-4 h-4" /> {novoOpen ? "Fechar" : "Novo recurso"}
              </button>}
              {podeAlocar && <button onClick={() => setMassaOpen(true)} className="btn btn-contorno !border-amber/50 !text-amber hover:!bg-amber/5">
                ⚡ Alocar vários
              </button>}
            </div>
            {novoOpen && <div className="animar-fade"><RecursoForm usuarios={usuariosElegiveis} recursoDoUsuario={recursoDoUsuario} empresas={empresasAtivas} onIrParaEmpresas={() => setAba("empresas")} onSalvar={criarRecurso} rotuloBotao="Criar recurso" onCancelar={() => setNovoOpen(false)} /></div>}
          </div>
        )}

        <div className="relative mb-2">
          <Icone nome="buscar" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muteddim" />
          <input value={busca} onChange={(e) => { setBusca(e.target.value); setBuscaAplicada(e.target.value); }}
            placeholder="Buscar por nome, tipo, função, equipe..." className="input pl-9" />
        </div>
        <select value={filtroEquipe} onChange={(e) => setFiltroEquipe(e.target.value)} className={`input mb-2 !py-2 !text-sm ${filtroEquipe ? "!border-cyan/40 !text-cyan" : ""}`} aria-label="Filtrar por equipe">
          <option value="">Todas as equipes</option>
          {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted mb-2 px-1 cursor-pointer">
          <input type="checkbox" className="accent-cyan w-4 h-4" checked={mostrarDesabilitados} onChange={(e) => setMostrarDesabilitados(e.target.checked)} />
          Mostrar desabilitados ({recursos.filter((r) => r.ativo === false).length})
        </label>
        <div className="text-xs text-muteddim mb-3 hidden md:block">Clique para ver detalhes · Shift + clique para selecionar vários</div>

        {carregandoRecursos && <Esqueleto linhas={5} altura={52} />}
        <div className="flex flex-col gap-3">
          {grupos.map((g) => (
            <div key={g.tipo}>
              <button onClick={() => toggleGrupo(g.tipo)} className="w-full flex items-center justify-between titulo-secao py-2.5 md:py-1.5 hover:text-muted">
                <span>{g.label} ({g.itens.length})</span>
                <Icone nome="seta" className={`w-3.5 h-3.5 transition-transform ${gruposFechados.includes(g.tipo) ? "" : "rotate-90"}`} strokeWidth={2.4} />
              </button>
              {!gruposFechados.includes(g.tipo) && (
                <div className="flex flex-col gap-1">
                  {g.itens.map((r) => {
                    const sel = selecionadosIds.includes(r.id);
                    const qtdAlocs = alocacoes.filter((a) => a.recurso_id === r.id).length;
                    return (
                      <button key={r.id} onClick={(e) => clicarRecurso(r.id, e)}
                        className={`text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${sel ? "border-cyan bg-cyan/5 shadow-sm" : "border-transparent hover:bg-panel"} ${r.ativo === false ? "opacity-60" : ""}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold truncate">{r.nome}</span>
                          {r.ativo === false && <span className="selo bg-panel text-muted shrink-0">Desabilitado</span>}
                          {qtdAlocs > 0 && <span className="selo bg-panel text-muted shrink-0">{qtdAlocs}</span>}
                        </div>
                        <div className="text-muted text-xs truncate">
                          {r.empresa_terceira_id ? `${nomeEmpresa(r.empresa_terceira_id) || "empresa"} · ` : ""}{r.atributos?.funcao ? `${r.atributos.funcao} · ` : ""}{(r.equipes || []).length ? `${r.equipes.join(", ")} · ` : ""}por {rotuloUnidade(r.custo_unidade).toLowerCase()}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          {!carregandoRecursos && recursosFiltrados.length === 0 && <div className="text-sm text-muteddim py-4 text-center">Nenhum recurso encontrado.</div>}
        </div>
      </aside>

      <section ref={detalheRef} className="flex-1 p-4 md:p-8 md:overflow-y-auto rolagem-fina scroll-mt-16">
        {selecionadosIds.length === 0 && (
          <EstadoVazio icone="recursos" titulo="Selecione um recurso" texto="Escolha um recurso na lista para ver e editar as alocações." />
        )}

        {selecionadosIds.length > 1 && (
          <div className="max-w-xl animar-fade">
            <div className="titulo-destaque mb-3">{selecionadosIds.length} recursos selecionados</div>
            <div className="cartao divide-y divide-line mb-4 max-h-72 overflow-auto">
              {recursos.filter((r) => selecionadosIds.includes(r.id)).map((r) => (
                <div key={r.id} className="text-sm px-4 py-2.5">{r.nome}</div>
              ))}
            </div>
            {podeAlocar && (
              <button onClick={() => setMassaOpen(true)} className="btn btn-alerta">⚡ Alocar estes {selecionadosIds.length} recursos</button>
            )}
          </div>
        )}

        {selecionado && (
          <div className="animar-fade">
            <div className="cartao p-5 mb-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="titulo-destaque flex flex-wrap items-center gap-2">
                  {selecionado.nome}
                  {editavel ? (
                    <button onClick={() => alternarAtivo(selecionado)} disabled={alternandoAtivo} title={selecionado.ativo === false ? "Clique para habilitar" : "Clique para desabilitar"}
                      className={`btn btn-sm border !text-xs ${selecionado.ativo === false ? "border-line text-muted bg-white hover:bg-panel" : "border-green/40 text-green bg-green/5 hover:bg-green/10"}`}>
                      <span className={`w-2 h-2 rounded-full ${selecionado.ativo === false ? "bg-muteddim" : "bg-green"}`} />
                      {selecionado.ativo === false ? "Desabilitado" : "Ativo"}
                    </button>
                  ) : (
                    <span className={`selo ${selecionado.ativo === false ? "bg-panel text-muted" : "bg-green/10 text-green"}`}>{selecionado.ativo === false ? "Desabilitado" : "Ativo"}</span>
                  )}
                </div>
                <div className="text-sm text-muted mt-0.5">
                  {rotuloTipo(selecionado.tipo)} · apropriação por {rotuloUnidade(selecionado.custo_unidade).toLowerCase()}
                  {selecionado.atributos?.funcao && <> · {selecionado.atributos.funcao}</>}
                  {selecionado.empresa_terceira_id && <> · <strong className="text-textmain">{nomeEmpresa(selecionado.empresa_terceira_id)}</strong></>}
                </div>
                {(selecionado.equipes || []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">{selecionado.equipes.map((a) => <span key={a} className="selo bg-cyan/10 text-cyan">{a}</span>)}</div>
                )}
                {selecionado.usuario_id && (
                  <div className="text-sm text-cyan mt-1 flex items-center gap-1.5"><Icone nome="usuarios" className="w-4 h-4" /> Vinculado a {usuarios.find((u) => u.id === selecionado.usuario_id)?.nome}</div>
                )}
              </div>
              {(editavel || podeAlocar || master) && (
                <div className="flex gap-2 shrink-0">
                  {editavel && <button onClick={() => fecharTudoMenos(editarOpen ? null : "editar")} className="btn btn-contorno btn-sm">
                    <Icone nome="editar" className="w-4 h-4" /> Editar
                  </button>}
                  {podeAlocar && <button onClick={() => {
                    setEditandoAlocId(null); setPiEscolhido(""); setEtapaEscolhida(""); setModo("periodo_percentual");
                    setPeriodoInicio(hojeISO()); setPeriodoFim(hojeISO()); setPercentual(100);
                    fecharTudoMenos(alocarOpen && !editandoAlocId ? null : "alocar");
                  }} disabled={selecionado.ativo === false} title={selecionado.ativo === false ? "Recurso desabilitado — habilite para alocar" : undefined} className="btn btn-primario btn-sm">
                    <Icone nome="mais2" className="w-4 h-4" /> Alocar
                  </button>}
                  {master && (
                    <button onClick={() => setExcluindoRecurso(selecionado)} className="btn btn-contorno-perigo btn-sm" title="Excluir recurso" aria-label="Excluir recurso">
                      <Icone nome="lixo" className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {editarOpen && editavel && (
              <div className="mb-4 max-w-md animar-fade">
                <RecursoForm usuarios={usuariosElegiveis} recursoDoUsuario={recursoDoUsuario} recursoAtualId={selecionado.id} empresas={empresasAtivas.concat(empresas.filter((e) => !e.ativa && e.id === selecionado.empresa_terceira_id))} onIrParaEmpresas={() => setAba("empresas")} onSalvar={salvarEdicao} rotuloBotao="Salvar alterações" onCancelar={() => setEditarOpen(false)}
                  valoresIniciais={{ nome: selecionado.nome, tipo: selecionado.tipo, unidade: selecionado.custo_unidade, usuarioId: selecionado.usuario_id || "", funcao: selecionado.atributos?.funcao || "", empresaId: selecionado.empresa_terceira_id || "", equipes: selecionado.equipes || [], ativo: selecionado.ativo !== false }} />
              </div>
            )}

            {alocarOpen && podeAlocar && (
              <div className="cartao p-4 mb-4 flex flex-col gap-3 animar-fade ring-2 ring-cyan/15">
                <div className="titulo-quadro">{editandoAlocId ? "Editar alocação" : "Nova alocação"}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Campo rotulo="PI">
                    <select value={piEscolhido} onChange={(e) => { setPiEscolhido(e.target.value); setEtapaEscolhida(""); }} className="input">
                      <option value="">Selecione o PI...</option>
                      {pis.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.cliente}{p.projeto ? ` — ${p.projeto}` : ""}</option>)}
                    </select>
                  </Campo>
                  <Campo rotulo="Etapa (igual à alocação pelo Cronograma)" className="sm:col-span-2">
                    <select value={etapaEscolhida} onChange={(e) => escolherEtapa(e.target.value)} disabled={!piEscolhido} className="input">
                      <option value="">Sem etapa — só período no PI</option>
                      {opcoesEtapa(piEscolhido).map((e) => <option key={e.id} value={e.id}>{e.nivel ? "   " : ""}{e.rotulo}</option>)}
                    </select>
                    {etapaEscolhida && <span className="block text-xs text-muteddim mt-1">Usa as datas planejadas da etapa (pode ajustar) e aparece na etapa, no Cronograma.</span>}
                  </Campo>
                  <div>
                    <span className="rotulo">Modo</span>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setModo("periodo_percentual")} className={`chip !py-2 flex-1 justify-center ${modo === "periodo_percentual" ? "chip-ativo" : ""}`}>% / Período</button>
                      <button type="button" onClick={() => setModo("cadencia")} className={`chip !py-2 flex-1 justify-center ${modo === "cadencia" ? "!bg-amber !text-white !border-amber" : ""}`}>Cadência</button>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Campo rotulo="Início"><input type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} className="input" /></Campo>
                  <Campo rotulo="Fim"><input type="date" value={periodoFim} min={periodoInicio} onChange={(e) => setPeriodoFim(e.target.value)} className={`input ${periodoInvalido ? "!border-red" : ""}`} /></Campo>
                  {modo === "periodo_percentual" && (
                    <Campo rotulo="Uso (%)"><input type="number" min="1" max="100" value={percentual} onChange={(e) => setPercentual(e.target.value)} className={`input ${percentualInvalido ? "!border-red" : ""}`} /></Campo>
                  )}
                </div>
                {periodoInvalido && <Aviso tipo="erro">A data de fim está antes da data de início.</Aviso>}
                {percentualInvalido && <Aviso tipo="erro">O uso deve ficar entre 1% e 100%.</Aviso>}
                {etapaDuplicada && <Aviso tipo="erro">Este recurso já está alocado nesta etapa.</Aviso>}
                {avisoOverlap && !periodoInvalido && (
                  <Aviso tipo="alerta">Com esta alocação o recurso chega a <strong>{somaSobreposta}%</strong> de uso no período — acima de 100%.</Aviso>
                )}
                <div className="flex gap-2 justify-end">
                  <button onClick={() => { setAlocarOpen(false); setEditandoAlocId(null); }} className="btn btn-fantasma">Cancelar</button>
                  <button onClick={salvarAlocacao} disabled={!piEscolhido || periodoInvalido || percentualInvalido || etapaDuplicada} className="btn btn-primario">
                    {editandoAlocId ? "Salvar alterações" : "Adicionar alocação"}
                  </button>
                </div>
              </div>
            )}

            <div className="titulo-secao mb-2">Alocações ({alocsDoSelecionado.length})</div>
            <div className="flex flex-col gap-2">
              {[...alocsDoSelecionado].sort((x, y) => (y.periodo_inicio || "").localeCompare(x.periodo_inicio || "")).map((a) => {
                const pi = pis.find((p) => p.id === a.pi_id);
                return (
                  <div key={a.id} className={`cartao flex flex-wrap items-center gap-3 px-4 py-3 text-sm ${editandoAlocId === a.id ? "ring-2 ring-cyan/30" : ""}`}>
                    <span className="font-mono text-cyan font-bold">{pi?.codigo || "?"}</span>
                    <span className="text-muted flex-1 min-w-[180px]">
                      {formatarData(a.periodo_inicio)} → {formatarData(a.periodo_fim)}
                      {a.etapa_id && <span className="text-muted"> · {nomeEtapa(a.etapa_id) || "etapa"}</span>}
                    </span>
                    <span className={`selo ${a.modo === "periodo_percentual" ? "bg-cyan/10 text-cyan" : "bg-amber/10 text-amber"}`}>
                      {a.modo === "periodo_percentual" ? `${a.percentual}%` : "cadência"}
                    </span>
                    {podeAlocar && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => {
                          setEditandoAlocId(a.id); setPiEscolhido(a.pi_id); setEtapaEscolhida(a.etapa_id || ""); setModo(a.modo);
                          setPeriodoInicio(a.periodo_inicio); setPeriodoFim(a.periodo_fim); setPercentual(a.percentual || 100);
                          fecharTudoMenos("alocar");
                        }} className="btn btn-fantasma btn-sm">Editar</button>
                        <button onClick={() => removerAlocacao(a)} className="p-1.5 rounded-lg text-muteddim hover:text-red hover:bg-red/5" aria-label="Remover alocação">
                          <Icone nome="lixo" className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {alocsDoSelecionado.length === 0 && <div className="text-sm text-muteddim">Nenhuma alocação ainda.</div>}
            </div>
          </div>
        )}
      </section>
    </div>
      )}

      {excluindoRecurso && (
        <ConfirmacaoDupla titulo="Excluir recurso" onFechar={() => setExcluindoRecurso(null)}
          pergunta={<>Tem certeza que deseja excluir o recurso <strong>{excluindoRecurso.nome}</strong>?</>}
          perdas={<>O recurso e todas as suas alocações ({alocacoes.filter((a) => a.recurso_id === excluindoRecurso.id).length}) em PIs e etapas serão apagados. O usuário vinculado (se houver) não é excluído.</>}
          onConfirmar={() => excluirRecurso(excluindoRecurso)} />
      )}
      {massaOpen && (
        <AlocacaoEmMassaModal pis={pis} recursos={recursos} opcoesEtapa={opcoesEtapa} etapas={etapas} usuarios={usuarios} onAplicar={aplicarAlocacaoMassa} onCancelar={() => setMassaOpen(false)}
          preSelecionados={selecionadosIds} />
      )}
    </div>
    </PainelShell>
  );
}
const ROTULO_PERFIL_CURTO = { master: "Master", gerente: "Gerente", coordenador: "Coordenador", lider: "Líder", funcionario: "Funcionário", terceiro: "Terceiro", visualizador: "Visualizador" };
function RecursoForm({ usuarios, recursoDoUsuario = () => null, recursoAtualId, empresas = [], onIrParaEmpresas, onSalvar, rotuloBotao, onCancelar, valoresIniciais }) {
  const [nome, setNome] = useState(valoresIniciais?.nome || "");
  const [tipo, setTipo] = useState(valoresIniciais?.tipo || "mao_obra_propria");
  const [unidade, setUnidade] = useState(valoresIniciais?.unidade || "hora");
  const [usuarioId, setUsuarioId] = useState(valoresIniciais?.usuarioId || "");
  const [funcao, setFuncao] = useState(valoresIniciais?.funcao || "");
  const [empresaId, setEmpresaId] = useState(valoresIniciais?.empresaId || "");
  const [equipes, setEquipes] = useState(valoresIniciais?.equipes || []);
  const [ativo, setAtivo] = useState(valoresIniciais?.ativo !== false);
  const ehEdicao = !!valoresIniciais;
  const ehTerceira = tipo === "mao_obra_terceira";
  const faltaEmpresa = ehTerceira && !empresaId;

  const ehMaoDeObra = (t) => t === "mao_obra_propria" || t === "mao_obra_terceira";
  const bloqueadoPorVinculo = !!usuarioId;
  // a função só precisa ser escolhida quando o recurso NÃO está vinculado a um usuário
  const faltaFuncao = ehMaoDeObra(tipo) && !bloqueadoPorVinculo && !funcao;

  const onSelecionarUsuario = (id) => {
    setUsuarioId(id);
    const u = usuarios.find((x) => x.id === id);
    if (u) {
      setTipo(tipoParaPerfil(u.perfil));
      setFuncao(u.funcao || "");
      setNome(u.nome);
      if ((u.equipes || []).length) setEquipes(u.equipes); // herda as equipes do usuário (pode ajustar)
      // terceiro com empresa informada no cadastro de usuário: já sugere a empresa de mesmo nome
      const sugerida = u.empresa_terceira && empresas.find((e) => e.nome.trim().toLowerCase() === u.empresa_terceira.trim().toLowerCase());
      if (sugerida) setEmpresaId(sugerida.id);
    }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (nome.trim() && !faltaEmpresa && !faltaFuncao) onSalvar({ nome: nome.trim(), tipo, unidade, usuarioId, funcao, empresaId, equipes, ativo }); }}
      className="bg-panel border border-line rounded-xl p-3.5 flex flex-col gap-3">
      {ehEdicao && (
        <div>
          <span className="rotulo">Situação</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAtivo(true)} className={`chip !py-2 flex-1 justify-center ${ativo ? "!bg-green !text-white !border-green" : ""}`}>Ativo</button>
            <button type="button" onClick={() => setAtivo(false)} className={`chip !py-2 flex-1 justify-center ${!ativo ? "!bg-muted !text-white !border-muted" : ""}`}>Desabilitado</button>
          </div>
          {!ativo && <span className="block text-xs text-muteddim mt-1">Desabilitado não aparece para novas alocações.</span>}
        </div>
      )}
      <Campo rotulo="Vincular a um usuário (opcional)">
        <select value={usuarioId} onChange={(e) => onSelecionarUsuario(e.target.value)} className="input">
          <option value="">Sem vínculo com usuário</option>
          {usuarios.map((u) => {
            const ja = recursoDoUsuario(u.id);
            const outro = ja && ja.id !== recursoAtualId;
            return <option key={u.id} value={u.id} disabled={outro}>{u.nome} — {ROTULO_PERFIL_CURTO[u.perfil] || u.perfil}{outro ? " (já é recurso)" : ""}</option>;
          })}
        </select>
      </Campo>
      <Campo rotulo="Nome"><input placeholder="Ex: Caminhão Munck, João Silva..." value={nome} onChange={(e) => setNome(e.target.value)} className="input" /></Campo>
      <Campo rotulo="Tipo" dica={bloqueadoPorVinculo ? "Definido pelo perfil do usuário vinculado." : undefined}>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} disabled={bloqueadoPorVinculo} className="input">
          {TIPOS_RECURSO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Campo>
      {ehTerceira && (
        <Campo rotulo="Empresa terceira (obrigatório)">
          <select value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} className={`input ${faltaEmpresa ? "!border-amber" : ""}`}>
            <option value="">Selecione a empresa...</option>
            {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}{e.cnpj ? ` — ${e.cnpj}` : ""}{e.ativa ? "" : " (inativa)"}</option>)}
          </select>
          {empresas.length === 0 && (
            <span className="block text-xs text-amber mt-1">
              Nenhuma empresa ativa cadastrada. <button type="button" onClick={onIrParaEmpresas} className="underline font-semibold">Cadastrar em Empresas terceiras</button>
            </span>
          )}
        </Campo>
      )}
      {ehMaoDeObra(tipo) && (bloqueadoPorVinculo ? (
        // vinculado a um usuário: a função vem do cadastro dele
        <Campo rotulo="Função" dica="Definida no cadastro do usuário vinculado.">
          <input value={funcao || "—"} disabled className="input" />
        </Campo>
      ) : (
        <Campo rotulo="Função (obrigatório)">
          <select value={funcao} onChange={(e) => setFuncao(e.target.value)} className={`input ${faltaFuncao ? "!border-amber" : ""}`}>
            <option value="">Selecione...</option>
            {FUNCOES.map((f) => <option key={f} value={f}>{f}</option>)}
            {funcao && !FUNCOES.includes(funcao) && <option value={funcao}>{funcao} (antiga)</option>}
          </select>
        </Campo>
      ))}
      <Campo rotulo="Equipes (opcional)">
        <SeletorEquipes opcoes={AREAS} valor={equipes} onChange={setEquipes} />
      </Campo>
      <Campo rotulo="Modo de apropriação">
        <select value={unidade} onChange={(e) => setUnidade(e.target.value)} className="input">
          {UNIDADES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Campo>
      <div className="flex gap-2">
        <button type="submit" disabled={!nome.trim() || faltaEmpresa || faltaFuncao} className="btn btn-escuro flex-1">{rotuloBotao}</button>
        {onCancelar && <button type="button" onClick={onCancelar} className="btn btn-fantasma">Cancelar</button>}
      </div>
    </form>
  );
}

function AlocacaoEmMassaModal({ pis, recursos, opcoesEtapa, etapas, onAplicar, onCancelar, preSelecionados }) {
  const [piId, setPiId] = useState("");
  const [etapaId, setEtapaId] = useState("");
  const [modoM, setModoM] = useState("periodo_percentual");
  const [inicio, setInicio] = useState(hojeISO());
  const [fim, setFim] = useState(hojeISO());
  const [perc, setPerc] = useState(100);
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroEquipeM, setFiltroEquipeM] = useState("");
  const [selecionados, setSelecionados] = useState(preSelecionados || []);
  const [aplicando, setAplicando] = useState(false);

  const filtrados = recursos.filter((r) => r.ativo !== false &&
    (!filtroTipo || r.tipo === filtroTipo) && (!filtroEquipeM || (r.equipes || []).includes(filtroEquipeM)) &&
    (!busca.trim() || r.nome.toLowerCase().includes(busca.trim().toLowerCase()))
  );
  const toggle = (id) => setSelecionados((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const marcarTodos = () => setSelecionados((p) => [...new Set([...p, ...filtrados.map((r) => r.id)])]);
  const desmarcarTodos = () => setSelecionados((p) => p.filter((id) => !filtrados.some((r) => r.id === id)));
  const periodoInvalido = inicio && fim && fim < inicio;
  const percInvalido = modoM === "periodo_percentual" && (!(Number(perc) > 0) || Number(perc) > 100);
  const podeAplicar = piId && inicio && fim && selecionados.length > 0 && !periodoInvalido && !percInvalido && !aplicando;

  const aplicar = async () => {
    setAplicando(true);
    await onAplicar({ piId, etapaId, modoM, inicio, fim, perc, recursoIds: selecionados });
    setAplicando(false);
  };

  return (
    <Modal titulo="⚡ Alocação em massa" onFechar={onCancelar}
      rodape={<>
        <button onClick={onCancelar} className="btn btn-fantasma">Cancelar</button>
        <button onClick={aplicar} disabled={!podeAplicar} className="btn btn-primario">
          {aplicando ? "Aplicando..." : `Aplicar a ${selecionados.length} recurso(s)`}
        </button>
      </>}>
      <div className="flex flex-col gap-3 mb-4">
        <Campo rotulo="PI">
          <select value={piId} onChange={(e) => { setPiId(e.target.value); setEtapaId(""); }} className="input">
            <option value="">Selecione o PI...</option>
            {pis.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.cliente}{p.projeto ? ` — ${p.projeto}` : ""}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Etapa (igual à alocação pelo Cronograma)">
          <select value={etapaId} disabled={!piId} className="input" onChange={(e) => {
            setEtapaId(e.target.value);
            const et = etapas.find((x) => x.id === e.target.value);
            if (et?.data_prevista_inicio) setInicio(et.data_prevista_inicio);
            if (et?.data_prevista_fim) setFim(et.data_prevista_fim);
            if (et) { setModoM("periodo_percentual"); setPerc(100); } // igual à alocação pelo Cronograma
          }}>
            <option value="">Sem etapa — só período no PI</option>
            {opcoesEtapa(piId).map((e) => <option key={e.id} value={e.id}>{e.nivel ? "   " : ""}{e.rotulo}</option>)}
          </select>
        </Campo>
        <div className="flex gap-2">
          <button type="button" onClick={() => setModoM("periodo_percentual")} className={`chip !py-2 flex-1 justify-center ${modoM === "periodo_percentual" ? "chip-ativo" : ""}`}>% / Período</button>
          <button type="button" onClick={() => setModoM("cadencia")} className={`chip !py-2 flex-1 justify-center ${modoM === "cadencia" ? "!bg-amber !text-white !border-amber" : ""}`}>Cadência</button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Campo rotulo="Início"><input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="input" /></Campo>
          <Campo rotulo="Fim"><input type="date" value={fim} min={inicio} onChange={(e) => setFim(e.target.value)} className={`input ${periodoInvalido ? "!border-red" : ""}`} /></Campo>
          {modoM === "periodo_percentual" && <Campo rotulo="Uso (%)"><input type="number" min="1" max="100" value={perc} onChange={(e) => setPerc(e.target.value)} className={`input ${percInvalido ? "!border-red" : ""}`} /></Campo>}
        </div>
        {periodoInvalido && <div className="text-sm text-red">A data de fim está antes do início.</div>}
      </div>

      <div className="border-t border-line pt-4">
        <div className="flex flex-col sm:flex-row gap-2 mb-2">
          <input placeholder="Buscar recurso..." value={busca} onChange={(e) => setBusca(e.target.value)} className="input flex-1" />
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="input sm:!w-48">
            <option value="">Todos os tipos</option>
            {TIPOS_RECURSO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={filtroEquipeM} onChange={(e) => setFiltroEquipeM(e.target.value)} className="input sm:!w-48">
            <option value="">Todas as equipes</option>
            {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-muted">{filtrados.length} resultado(s) · <strong>{selecionados.length}</strong> selecionado(s)</span>
          <div className="flex gap-3">
            <button onClick={marcarTodos} className="text-sm text-cyan font-semibold hover:underline">Marcar todos</button>
            <button onClick={desmarcarTodos} className="text-sm text-muted hover:underline">Desmarcar</button>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          {filtrados.map((r) => {
            const marcado = selecionados.includes(r.id);
            return (
              <label key={r.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer border transition-colors ${marcado ? "border-cyan/40 bg-cyan/5" : "border-transparent bg-panel hover:bg-line/40"}`}>
                <input type="checkbox" className="accent-cyan w-4 h-4" checked={marcado} onChange={() => toggle(r.id)} />
                <span className="flex-1 truncate">{r.nome}</span>
                <span className="text-xs text-muted shrink-0">{rotuloTipo(r.tipo)}</span>
              </label>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
