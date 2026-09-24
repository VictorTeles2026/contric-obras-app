"use client";

import { useState, useMemo, useRef } from "react";
import { useTabela, registrarLog } from "../../lib/dados";
import { useAuth, podeEditar } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import { hojeISO, formatarData } from "../../lib/datas";
import { TIPOS_RECURSO } from "../../lib/constantes";
import { useToast } from "../../lib/Toast";
import PainelShell from "../../components/PainelShell";
import { Modal, EstadoVazio, Esqueleto, Aviso, Campo } from "../../components/ui";
import Icone from "../../components/Icone";
const UNIDADES = [["hora", "Hora"], ["diaria", "Diária"], ["semana", "Semana"], ["quinzena", "Quinzena"], ["mes", "Mês"]];
const PERFIS_COM_ALOCACAO = ["lider", "funcionario", "terceiro"];

function sobrepoe(iniA, fimA, iniB, fimB) { return iniA <= fimB && iniB <= fimA; }
function rotuloUnidade(u) { return UNIDADES.find((x) => x[0] === u)?.[1] || u; }
function rotuloTipo(t) { return TIPOS_RECURSO.find((x) => x[0] === t)?.[1] || t; }
function tipoParaPerfil(perfil) {
  if (perfil === "terceiro") return "mao_obra_terceira";
  return "mao_obra_propria";
}

export default function RecursosPage() {
  const { usuario } = useAuth();
  const editavel = podeEditar(usuario);
  const { avisar } = useToast();
  const detalheRef = useRef(null);
  const { dados: pis } = useTabela("pis", { order: { coluna: "codigo" } });
  const { dados: usuarios } = useTabela("usuarios");
  const { dados: recursos, carregando: carregandoRecursos, recarregar: recarregarRecursos } = useTabela("recursos", { order: { coluna: "nome" } });
  const { dados: alocacoes, recarregar: recarregarAlocacoes } = useTabela("alocacoes_recurso");

  const [selecionadosIds, setSelecionadosIds] = useState([]);
  const [ancoraId, setAncoraId] = useState(null);
  const selecionadoId = selecionadosIds.length === 1 ? selecionadosIds[0] : null;
  const selecionado = recursos.find((r) => r.id === selecionadoId);
  const alocsDoSelecionado = alocacoes.filter((a) => a.recurso_id === selecionadoId);

  const [novoOpen, setNovoOpen] = useState(false);
  const [editarOpen, setEditarOpen] = useState(false);
  const [alocarOpen, setAlocarOpen] = useState(false);
  const [massaOpen, setMassaOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [gruposFechados, setGruposFechados] = useState([]);

  const usuariosElegiveis = usuarios.filter((u) => PERFIS_COM_ALOCACAO.includes(u.perfil));

  const fecharTudoMenos = (aberto) => {
    setNovoOpen(aberto === "novo");
    setEditarOpen(aberto === "editar");
    setAlocarOpen(aberto === "alocar");
  };

  const recursosFiltrados = useMemo(() => {
    const termo = buscaAplicada.trim().toLowerCase();
    if (!termo) return recursos;
    return recursos.filter((r) =>
      r.nome.toLowerCase().includes(termo) ||
      rotuloTipo(r.tipo).toLowerCase().includes(termo) ||
      (r.atributos?.funcao || "").toLowerCase().includes(termo) ||
      (usuarios.find((u) => u.id === r.usuario_id)?.nome || "").toLowerCase().includes(termo)
    );
  }, [recursos, buscaAplicada, usuarios]);

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
    const { data, error } = await supabase.from("recursos").insert({
      nome: dados.nome, tipo: dados.tipo, custo_unidade: dados.unidade,
      usuario_id: dados.usuarioId || null, atributos: { funcao: dados.funcao || null },
    }).select().single();
    if (error) { avisar(`Não foi possível criar: ${error.message}`, "erro", 6000); return; }
    await registrarLog(usuario, "Criou recurso", dados.nome);
    avisar(`Recurso "${dados.nome}" criado.`);
    setNovoOpen(false);
    setSelecionadosIds([data.id]);
    setAncoraId(data.id);
    recarregarRecursos();
  };

  const salvarEdicao = async (dados) => {
    if (!selecionado) return;
    const { error } = await supabase.from("recursos").update({
      nome: dados.nome, tipo: dados.tipo, custo_unidade: dados.unidade,
      usuario_id: dados.usuarioId || null, atributos: { ...(selecionado.atributos || {}), funcao: dados.funcao || null },
    }).eq("id", selecionado.id);
    if (error) { avisar(`Não foi possível salvar: ${error.message}`, "erro", 6000); return; }
    await registrarLog(usuario, "Editou recurso", dados.nome);
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
    if (!selecionadoId || !piEscolhido || periodoInvalido || percentualInvalido) return;

    const payload = {
      recurso_id: selecionadoId, pi_id: piEscolhido, modo,
      periodo_inicio: periodoInicio, periodo_fim: periodoFim,
      percentual: modo === "periodo_percentual" ? Number(percentual) : null,
    };
    const { error } = editandoAlocId
      ? await supabase.from("alocacoes_recurso").update(payload).eq("id", editandoAlocId)
      : await supabase.from("alocacoes_recurso").insert(payload);
    if (error) { avisar(`Não foi possível salvar: ${error.message}`, "erro", 6000); return; }
    avisar(editandoAlocId ? "Alocação atualizada." : "Alocação criada.");
    await registrarLog(usuario, editandoAlocId ? "Editou alocação" : "Criou alocação", `${selecionado?.nome} — ${pis.find((p) => p.id === piEscolhido)?.codigo}`);
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

  const aplicarAlocacaoMassa = async ({ piId, modoM, inicio, fim, perc, recursoIds }) => {
    const linhas = recursoIds.map((rid) => ({
      recurso_id: rid, pi_id: piId, modo: modoM, periodo_inicio: inicio, periodo_fim: fim,
      percentual: modoM === "periodo_percentual" ? Number(perc) : null,
    }));
    const { error } = await supabase.from("alocacoes_recurso").insert(linhas);
    if (error) { avisar(`Não foi possível alocar: ${error.message}`, "erro", 6000); return; }
    avisar(`${recursoIds.length} recurso(s) alocado(s).`);
    await registrarLog(usuario, "Alocação em massa", `${recursoIds.length} recurso(s) em ${pis.find((p) => p.id === piId)?.codigo}`);
    setMassaOpen(false);
    recarregarAlocacoes();
  };

  return (
    <PainelShell>
    <div className="flex flex-col md:flex-row md:h-[100dvh]">
      <aside className="w-full md:w-96 shrink-0 bg-white border-b md:border-b-0 md:border-r border-line p-4 md:p-5 md:overflow-y-auto rolagem-fina">
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-head font-bold text-xl">Recursos</h1>
          <span className="text-xs text-muted">{recursos.length} cadastrados</span>
        </div>

        {editavel && (
          <div className="flex flex-col gap-2 mb-4">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => fecharTudoMenos(novoOpen ? null : "novo")} className={`btn ${novoOpen ? "btn-contorno" : "btn-primario"}`}>
                <Icone nome={novoOpen ? "fechar" : "mais2"} className="w-4 h-4" /> {novoOpen ? "Fechar" : "Novo recurso"}
              </button>
              <button onClick={() => setMassaOpen(true)} className="btn btn-contorno !border-amber/50 !text-amber hover:!bg-amber/5">
                ⚡ Alocar vários
              </button>
            </div>
            {novoOpen && <div className="animar-fade"><RecursoForm usuarios={usuariosElegiveis} onSalvar={criarRecurso} rotuloBotao="Criar recurso" onCancelar={() => setNovoOpen(false)} /></div>}
          </div>
        )}

        <div className="relative mb-2">
          <Icone nome="buscar" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muteddim" />
          <input value={busca} onChange={(e) => { setBusca(e.target.value); setBuscaAplicada(e.target.value); }}
            placeholder="Buscar por nome, tipo, função..." className="input pl-9" />
        </div>
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
                        className={`text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${sel ? "border-cyan bg-cyan/5 shadow-sm" : "border-transparent hover:bg-panel"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold truncate">{r.nome}</span>
                          {qtdAlocs > 0 && <span className="selo bg-panel text-muted shrink-0">{qtdAlocs}</span>}
                        </div>
                        <div className="text-muted text-xs truncate">
                          {r.atributos?.funcao ? `${r.atributos.funcao} · ` : ""}por {rotuloUnidade(r.custo_unidade).toLowerCase()}
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
            <div className="font-head font-bold text-xl mb-3">{selecionadosIds.length} recursos selecionados</div>
            <div className="cartao divide-y divide-line mb-4 max-h-72 overflow-auto">
              {recursos.filter((r) => selecionadosIds.includes(r.id)).map((r) => (
                <div key={r.id} className="text-sm px-4 py-2.5">{r.nome}</div>
              ))}
            </div>
            {editavel && (
              <button onClick={() => setMassaOpen(true)} className="btn btn-alerta">⚡ Alocar estes {selecionadosIds.length} recursos</button>
            )}
          </div>
        )}

        {selecionado && (
          <div className="max-w-3xl animar-fade">
            <div className="cartao p-5 mb-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-head font-bold text-xl">{selecionado.nome}</div>
                <div className="text-sm text-muted mt-0.5">
                  {rotuloTipo(selecionado.tipo)} · apropriação por {rotuloUnidade(selecionado.custo_unidade).toLowerCase()}
                  {selecionado.atributos?.funcao && <> · {selecionado.atributos.funcao}</>}
                </div>
                {selecionado.usuario_id && (
                  <div className="text-sm text-cyan mt-1 flex items-center gap-1.5"><Icone nome="usuarios" className="w-4 h-4" /> Vinculado a {usuarios.find((u) => u.id === selecionado.usuario_id)?.nome}</div>
                )}
              </div>
              {editavel && (
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => fecharTudoMenos(editarOpen ? null : "editar")} className="btn btn-contorno btn-sm">
                    <Icone nome="editar" className="w-4 h-4" /> Editar
                  </button>
                  <button onClick={() => {
                    setEditandoAlocId(null); setPiEscolhido(""); setModo("periodo_percentual");
                    setPeriodoInicio(hojeISO()); setPeriodoFim(hojeISO()); setPercentual(100);
                    fecharTudoMenos(alocarOpen && !editandoAlocId ? null : "alocar");
                  }} className="btn btn-primario btn-sm">
                    <Icone nome="mais2" className="w-4 h-4" /> Alocar
                  </button>
                </div>
              )}
            </div>

            {editarOpen && editavel && (
              <div className="mb-4 max-w-md animar-fade">
                <RecursoForm usuarios={usuariosElegiveis} onSalvar={salvarEdicao} rotuloBotao="Salvar alterações" onCancelar={() => setEditarOpen(false)}
                  valoresIniciais={{ nome: selecionado.nome, tipo: selecionado.tipo, unidade: selecionado.custo_unidade, usuarioId: selecionado.usuario_id || "", funcao: selecionado.atributos?.funcao || "" }} />
              </div>
            )}

            {alocarOpen && editavel && (
              <div className="cartao p-4 mb-4 flex flex-col gap-3 animar-fade ring-2 ring-cyan/15">
                <div className="font-head font-bold">{editandoAlocId ? "Editar alocação" : "Nova alocação"}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Campo rotulo="PI">
                    <select value={piEscolhido} onChange={(e) => setPiEscolhido(e.target.value)} className="input">
                      <option value="">Selecione o PI...</option>
                      {pis.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.cliente}</option>)}
                    </select>
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
                {avisoOverlap && !periodoInvalido && (
                  <Aviso tipo="alerta">Com esta alocação o recurso chega a <strong>{somaSobreposta}%</strong> de uso no período — acima de 100%.</Aviso>
                )}
                <div className="flex gap-2 justify-end">
                  <button onClick={() => { setAlocarOpen(false); setEditandoAlocId(null); }} className="btn btn-fantasma">Cancelar</button>
                  <button onClick={salvarAlocacao} disabled={!piEscolhido || periodoInvalido || percentualInvalido} className="btn btn-primario">
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
                      {a.etapa_id && <span className="text-muteddim"> · via cronograma</span>}
                    </span>
                    <span className={`selo ${a.modo === "periodo_percentual" ? "bg-cyan/10 text-cyan" : "bg-amber/10 text-amber"}`}>
                      {a.modo === "periodo_percentual" ? `${a.percentual}%` : "cadência"}
                    </span>
                    {editavel && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => {
                          setEditandoAlocId(a.id); setPiEscolhido(a.pi_id); setModo(a.modo);
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

      {massaOpen && (
        <AlocacaoEmMassaModal pis={pis} recursos={recursos} usuarios={usuarios} onAplicar={aplicarAlocacaoMassa} onCancelar={() => setMassaOpen(false)}
          preSelecionados={selecionadosIds} />
      )}
    </div>
    </PainelShell>
  );
}
function RecursoForm({ usuarios, onSalvar, rotuloBotao, onCancelar, valoresIniciais }) {
  const [nome, setNome] = useState(valoresIniciais?.nome || "");
  const [tipo, setTipo] = useState(valoresIniciais?.tipo || "mao_obra_propria");
  const [unidade, setUnidade] = useState(valoresIniciais?.unidade || "hora");
  const [usuarioId, setUsuarioId] = useState(valoresIniciais?.usuarioId || "");
  const [funcao, setFuncao] = useState(valoresIniciais?.funcao || "");

  const ehMaoDeObra = (t) => t === "mao_obra_propria" || t === "mao_obra_terceira";
  const bloqueadoPorVinculo = !!usuarioId;

  const onSelecionarUsuario = (id) => {
    setUsuarioId(id);
    const u = usuarios.find((x) => x.id === id);
    if (u) {
      setTipo(tipoParaPerfil(u.perfil));
      setFuncao(u.funcao || "");
      setNome(u.nome);
    }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (nome.trim()) onSalvar({ nome: nome.trim(), tipo, unidade, usuarioId, funcao }); }}
      className="bg-panel border border-line rounded-xl p-3.5 flex flex-col gap-3">
      <Campo rotulo="Vincular a um usuário (opcional)">
        <select value={usuarioId} onChange={(e) => onSelecionarUsuario(e.target.value)} className="input">
          <option value="">Sem vínculo com usuário</option>
          {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Nome"><input placeholder="Ex: Caminhão Munck, João Silva..." value={nome} onChange={(e) => setNome(e.target.value)} className="input" /></Campo>
      <Campo rotulo="Tipo" dica={bloqueadoPorVinculo ? "Definido pelo perfil do usuário vinculado." : undefined}>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} disabled={bloqueadoPorVinculo} className="input">
          {TIPOS_RECURSO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Campo>
      {ehMaoDeObra(tipo) && (
        <Campo rotulo="Função">
          <input value={funcao} onChange={(e) => setFuncao(e.target.value)} disabled={bloqueadoPorVinculo}
            placeholder="Ex: Eletricista, Mecânico..." className="input" />
        </Campo>
      )}
      <Campo rotulo="Modo de apropriação">
        <select value={unidade} onChange={(e) => setUnidade(e.target.value)} className="input">
          {UNIDADES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Campo>
      <div className="flex gap-2">
        <button type="submit" disabled={!nome.trim()} className="btn btn-escuro flex-1">{rotuloBotao}</button>
        {onCancelar && <button type="button" onClick={onCancelar} className="btn btn-fantasma">Cancelar</button>}
      </div>
    </form>
  );
}

function AlocacaoEmMassaModal({ pis, recursos, onAplicar, onCancelar, preSelecionados }) {
  const [piId, setPiId] = useState("");
  const [modoM, setModoM] = useState("periodo_percentual");
  const [inicio, setInicio] = useState(hojeISO());
  const [fim, setFim] = useState(hojeISO());
  const [perc, setPerc] = useState(100);
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [selecionados, setSelecionados] = useState(preSelecionados || []);
  const [aplicando, setAplicando] = useState(false);

  const filtrados = recursos.filter((r) =>
    (!filtroTipo || r.tipo === filtroTipo) &&
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
    await onAplicar({ piId, modoM, inicio, fim, perc, recursoIds: selecionados });
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
          <select value={piId} onChange={(e) => setPiId(e.target.value)} className="input">
            <option value="">Selecione o PI...</option>
            {pis.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.cliente}</option>)}
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