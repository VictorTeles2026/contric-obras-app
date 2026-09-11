"use client";

import { useState, useMemo } from "react";
import { useTabela, registrarLog } from "../../lib/dados";
import { useAuth, podeEditar } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import PainelShell from "../../components/PainelShell";

const TIPOS_RECURSO = [
  ["mao_obra_propria", "Mão de obra própria"],
  ["mao_obra_terceira", "Mão de obra terceira"],
  ["ferramenta", "Ferramenta"],
  ["veiculo", "Veículo"],
  ["equipamento", "Equipamento"],
  ["canteiro", "Canteiro"],
  ["conteiner", "Contêiner"],
];
const UNIDADES = [["hora", "Hora"], ["diaria", "Diária"], ["semana", "Semana"], ["quinzena", "Quinzena"], ["mes", "Mês"]];
const PERFIS_COM_ALOCACAO = ["lider", "funcionario", "terceiro"];

function hojeISO() { return new Date().toISOString().slice(0, 10); }
function sobrepoe(iniA, fimA, iniB, fimB) { return iniA <= fimB && iniB <= fimA; }
function rotuloUnidade(u) { return UNIDADES.find((x) => x[0] === u)?.[1] || u; }
function rotuloTipo(t) { return TIPOS_RECURSO.find((x) => x[0] === t)?.[1] || t; }
function tipoParaPerfil(perfil) {
  if (perfil === "terceiro") return "mao_obra_terceira";
  if (perfil === "lider" || perfil === "funcionario") return "mao_obra_propria";
  return "mao_obra_propria";
}

export default function RecursosPage() {
  const { usuario } = useAuth();
  const editavel = podeEditar(usuario);
  const { dados: pis } = useTabela("pis", { order: { coluna: "codigo" } });
  const { dados: usuarios } = useTabela("usuarios");
  const { dados: recursos, recarregar: recarregarRecursos } = useTabela("recursos", { order: { coluna: "created_at" } });
  const { dados: alocacoes, recarregar: recarregarAlocacoes } = useTabela("alocacoes_recurso");

  const [selecionadoId, setSelecionadoId] = useState(null);
  const selecionado = recursos.find((r) => r.id === selecionadoId);
  const alocsDoSelecionado = alocacoes.filter((a) => a.recurso_id === selecionadoId);

  const [novoOpen, setNovoOpen] = useState(false);
  const [editarOpen, setEditarOpen] = useState(false);
  const [massaOpen, setMassaOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [gruposFechados, setGruposFechados] = useState([]);

  const usuariosElegiveis = usuarios.filter((u) => PERFIS_COM_ALOCACAO.includes(u.perfil));

  const recursosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return recursos;
    return recursos.filter((r) =>
      r.nome.toLowerCase().includes(termo) ||
      rotuloTipo(r.tipo).toLowerCase().includes(termo) ||
      (r.atributos?.funcao || "").toLowerCase().includes(termo) ||
      (usuarios.find((u) => u.id === r.usuario_id)?.nome || "").toLowerCase().includes(termo)
    );
  }, [recursos, busca, usuarios]);

  const grupos = useMemo(() => {
    const porTipo = {};
    recursosFiltrados.forEach((r) => { (porTipo[r.tipo] = porTipo[r.tipo] || []).push(r); });
    return TIPOS_RECURSO.filter(([v]) => porTipo[v]?.length).map(([v, l]) => ({ tipo: v, label: l, itens: porTipo[v] }));
  }, [recursosFiltrados]);
  const toggleGrupo = (tipo) => setGruposFechados((p) => p.includes(tipo) ? p.filter((x) => x !== tipo) : [...p, tipo]);

  const criarRecurso = async (dados) => {
    const { data, error } = await supabase.from("recursos").insert({
      nome: dados.nome, tipo: dados.tipo, custo_unidade: dados.unidade,
      usuario_id: dados.usuarioId || null, atributos: { funcao: dados.funcao || null },
    }).select().single();
    if (!error) {
      await registrarLog(usuario, "Criou recurso", dados.nome);
      setNovoOpen(false);
      setSelecionadoId(data.id);
      recarregarRecursos();
    }
  };

  const salvarEdicao = async (dados) => {
    if (!selecionado) return;
    await supabase.from("recursos").update({
      nome: dados.nome, tipo: dados.tipo, custo_unidade: dados.unidade,
      usuario_id: dados.usuarioId || null, atributos: { funcao: dados.funcao || null },
    }).eq("id", selecionado.id);
    await registrarLog(usuario, "Editou recurso", dados.nome);
    setEditarOpen(false);
    recarregarRecursos();
  };

  const [avisoOverlap, setAvisoOverlap] = useState(false);
  const [editandoAlocId, setEditandoAlocId] = useState(null);
  const [modo, setModo] = useState("periodo_percentual");
  const [periodoInicio, setPeriodoInicio] = useState(hojeISO());
  const [periodoFim, setPeriodoFim] = useState(hojeISO());
  const [percentual, setPercentual] = useState(100);
  const [piEscolhido, setPiEscolhido] = useState("");

  const salvarAlocacao = async () => {
    if (!selecionadoId || !piEscolhido) return;
    const outras = alocsDoSelecionado.filter((a) => a.id !== editandoAlocId && a.modo === "periodo_percentual");
    let soma = Number(percentual);
    outras.forEach((a) => { if (sobrepoe(a.periodo_inicio, a.periodo_fim, periodoInicio, periodoFim)) soma += Number(a.percentual); });
    setAvisoOverlap(soma > 100);

    const payload = {
      recurso_id: selecionadoId, pi_id: piEscolhido, modo,
      periodo_inicio: periodoInicio, periodo_fim: periodoFim,
      percentual: modo === "periodo_percentual" ? Number(percentual) : null,
    };
    if (editandoAlocId) {
      await supabase.from("alocacoes_recurso").update(payload).eq("id", editandoAlocId);
    } else {
      await supabase.from("alocacoes_recurso").insert(payload);
    }
    await registrarLog(usuario, editandoAlocId ? "Editou alocação" : "Criou alocação", `${selecionado?.nome} — ${pis.find((p) => p.id === piEscolhido)?.codigo}`);
    setEditandoAlocId(null);
    recarregarAlocacoes();
  };

  const removerAlocacao = async (id) => {
    await supabase.from("alocacoes_recurso").delete().eq("id", id);
    recarregarAlocacoes();
  };

  const aplicarAlocacaoMassa = async ({ piId, modoM, inicio, fim, perc, recursoIds }) => {
    const linhas = recursoIds.map((rid) => ({
      recurso_id: rid, pi_id: piId, modo: modoM, periodo_inicio: inicio, periodo_fim: fim,
      percentual: modoM === "periodo_percentual" ? Number(perc) : null,
    }));
    await supabase.from("alocacoes_recurso").insert(linhas);
    await registrarLog(usuario, "Alocação em massa", `${recursoIds.length} recurso(s) em ${pis.find((p) => p.id === piId)?.codigo}`);
    setMassaOpen(false);
    recarregarAlocacoes();
  };

  return (
    <PainelShell>
    <div className="flex flex-col md:flex-row h-full">
      <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-line p-4 overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="font-head font-bold text-sm">RECURSO</div>
          {editavel && (
            <div className="flex gap-1">
              <button onClick={() => setMassaOpen(true)} className="px-2 py-1 rounded-lg border border-amber text-amber text-xs font-semibold">⚡ Em massa</button>
              <button onClick={() => { setNovoOpen((o) => !o); setEditarOpen(false); }} className="px-2 py-1 rounded-lg bg-cyan text-white text-xs font-semibold">+ Novo</button>
            </div>
          )}
        </div>

        {novoOpen && (
          <RecursoForm usuarios={usuariosElegiveis} onSalvar={criarRecurso} rotuloBotao="Criar" />
        )}

        <div className="flex gap-2 mb-2">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, tipo, função..." className="input flex-1" />
          <button onClick={() => {}} className="px-3 py-1.5 rounded-lg border border-line text-muted text-xs whitespace-nowrap">Buscar</button>
        </div>

        {editavel && (
          <button onClick={() => { if (selecionado) { setEditarOpen((o) => !o); setNovoOpen(false); } }} disabled={!selecionado}
            className="w-full mb-3 px-2 py-1.5 rounded-lg border border-line text-muted text-xs font-semibold disabled:opacity-40">
            {selecionado ? `Editar Recurso — ${selecionado.nome}` : "Selecione um recurso para editar"}
          </button>
        )}

        {editarOpen && selecionado && (
          <RecursoForm usuarios={usuariosElegiveis} onSalvar={salvarEdicao} rotuloBotao="Salvar alterações" onCancelar={() => setEditarOpen(false)}
            valoresIniciais={{ nome: selecionado.nome, tipo: selecionado.tipo, unidade: selecionado.custo_unidade, usuarioId: selecionado.usuario_id || "", funcao: selecionado.atributos?.funcao || "" }} />
        )}

        <div className="flex flex-col gap-2">
          {grupos.map((g) => (
            <div key={g.tipo}>
              <button onClick={() => toggleGrupo(g.tipo)} className="w-full flex items-center justify-between text-[11px] font-mono text-muteddim uppercase tracking-wide py-1">
                <span>{g.label} ({g.itens.length})</span>
                <span>{gruposFechados.includes(g.tipo) ? "▸" : "▾"}</span>
              </button>
              {!gruposFechados.includes(g.tipo) && (
                <div className="flex flex-col gap-1">
                  {g.itens.map((r) => (
                    <button key={r.id} onClick={() => { setSelecionadoId(r.id); setAvisoOverlap(false); setEditandoAlocId(null); setEditarOpen(false); }}
                      className={`text-left p-2 rounded-lg border text-xs ${selecionadoId === r.id ? "border-cyan bg-cyan/5" : "border-line"}`}>
                      <div className="font-semibold">{r.nome}</div>
                      <div className="text-muteddim font-mono text-[10px]">
                        {r.atributos?.funcao ? `${r.atributos.funcao} · ` : ""}apropriação por {rotuloUnidade(r.custo_unidade)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {recursosFiltrados.length === 0 && <div className="text-xs text-muteddim">Nenhum recurso encontrado.</div>}
        </div>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        {!selecionado && <div className="text-sm text-muteddim">Selecione um recurso à esquerda.</div>}
        {selecionado && (
          <>
            <div className="mb-4">
              <div className="font-head font-bold text-lg">{selecionado.nome}</div>
              <div className="text-xs text-muted">
                {rotuloTipo(selecionado.tipo)} · apropriação por {rotuloUnidade(selecionado.custo_unidade)}
                {selecionado.atributos?.funcao && <> · {selecionado.atributos.funcao}</>}
              </div>
              {selecionado.usuario_id && (
                <div className="text-xs text-cyan font-mono">Vinculado a: {usuarios.find((u) => u.id === selecionado.usuario_id)?.nome}</div>
              )}
            </div>

            {editavel && (
              <div className="bg-panel rounded-lg p-3 mb-4 flex flex-col gap-2">
                <div className="flex gap-2 items-center flex-wrap">
                  <select value={piEscolhido} onChange={(e) => setPiEscolhido(e.target.value)} className="input flex-1 min-w-[160px]">
                    <option value="">Selecione o PI...</option>
                    {pis.map((p) => <option key={p.id} value={p.id}>{p.codigo}</option>)}
                  </select>
                  <button type="button" onClick={() => setModo("periodo_percentual")} className={`px-3 py-1.5 rounded-full text-xs border ${modo === "periodo_percentual" ? "bg-cyan text-white border-cyan" : "border-line text-muted"}`}>% / Período</button>
                  <button type="button" onClick={() => setModo("cadencia")} className={`px-3 py-1.5 rounded-full text-xs border ${modo === "cadencia" ? "bg-amber text-white border-amber" : "border-line text-muted"}`}>Cadência</button>
                </div>
                <div className="flex gap-2">
                  <input type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} className="input flex-1" />
                  <input type="date" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} className="input flex-1" />
                  {modo === "periodo_percentual" && (
                    <input type="number" min="1" max="100" value={percentual} onChange={(e) => setPercentual(e.target.value)} className="input w-20" />
                  )}
                </div>
                {avisoOverlap && (
                  <div className="text-xs text-amber bg-amber/10 rounded px-2 py-1">⚠ Ultrapassa 100% de uso sobreposto — revise antes de confirmar.</div>
                )}
                <button onClick={salvarAlocacao} disabled={!piEscolhido} className="py-1.5 rounded-lg bg-cyan text-white text-xs font-semibold disabled:opacity-50">
                  {editandoAlocId ? "Salvar alterações" : "+ Adicionar alocação"}
                </button>
              </div>
            )}

            <div className="text-[11px] font-mono text-muteddim mb-2">ALOCAÇÕES ({alocsDoSelecionado.length})</div>
            <div className="flex flex-col gap-2">
              {alocsDoSelecionado.map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-2 bg-panel rounded-lg text-xs">
                  <span className="font-mono text-cyan font-bold">{pis.find((p) => p.id === a.pi_id)?.codigo}</span>
                  <span className="flex-1 text-muted">
                    {a.periodo_inicio} → {a.periodo_fim} · {a.modo === "periodo_percentual" ? `${a.percentual}%` : "cadência"}
                  </span>
                  {editavel && (
                    <>
                      <button onClick={() => {
                        setEditandoAlocId(a.id); setPiEscolhido(a.pi_id); setModo(a.modo);
                        setPeriodoInicio(a.periodo_inicio); setPeriodoFim(a.periodo_fim); setPercentual(a.percentual || 100);
                      }} className="text-muted underline">Editar</button>
                      <button onClick={() => removerAlocacao(a.id)} className="text-muteddim hover:text-red">✕</button>
                    </>
                  )}
                </div>
              ))}
              {alocsDoSelecionado.length === 0 && <div className="text-xs text-muteddim">Nenhuma alocação ainda.</div>}
            </div>
          </>
        )}
      </div>

      {massaOpen && (
        <AlocacaoEmMassaModal pis={pis} recursos={recursos} usuarios={usuarios} onAplicar={aplicarAlocacaoMassa} onCancelar={() => setMassaOpen(false)} />
      )}

      <style jsx global>{`
        .input { width: 100%; padding: 7px 9px; border-radius: 8px; border: 1px solid #D7E0EC; font-size: 12.5px; background: white; }
      `}</style>
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
    }
  };

  return (
    <div className="bg-panel rounded-lg p-3 mb-3 flex flex-col gap-2">
      <input placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} className="input" />

      <select value={usuarioId} onChange={(e) => onSelecionarUsuario(e.target.value)} className="input">
        <option value="">Sem vínculo com usuário</option>
        {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
      </select>

      <select value={tipo} onChange={(e) => setTipo(e.target.value)} disabled={bloqueadoPorVinculo} className="input disabled:bg-line/30 disabled:text-muted">
        {TIPOS_RECURSO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>

      {ehMaoDeObra(tipo) && (
        <div>
          <div className="text-[10px] text-muteddim mb-1">FUNÇÃO</div>
          <input value={funcao} onChange={(e) => setFuncao(e.target.value)} disabled={bloqueadoPorVinculo}
            placeholder="Ex: Eletricista, Mecânico..." className="input disabled:bg-line/30 disabled:text-muted" />
        </div>
      )}

      <div>
        <div className="text-[10px] text-muteddim mb-1">MODO DE APROPRIAÇÃO</div>
        <select value={unidade} onChange={(e) => setUnidade(e.target.value)} className="input">
          {UNIDADES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="flex gap-2">
        <button onClick={() => onSalvar({ nome, tipo, unidade, usuarioId, funcao })} disabled={!nome.trim()}
          className="flex-1 py-1.5 rounded-lg bg-navy text-white text-xs font-semibold disabled:opacity-50">{rotuloBotao}</button>
        {onCancelar && <button onClick={onCancelar} className="px-3 py-1.5 text-xs text-muted">Cancelar</button>}
      </div>
    </div>
  );
}

function AlocacaoEmMassaModal({ pis, recursos, usuarios, onAplicar, onCancelar }) {
  const [piId, setPiId] = useState("");
  const [modoM, setModoM] = useState("periodo_percentual");
  const [inicio, setInicio] = useState(hojeISO());
  const [fim, setFim] = useState(hojeISO());
  const [perc, setPerc] = useState(100);
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [selecionados, setSelecionados] = useState([]);

  const filtrados = recursos.filter((r) =>
    (!filtroTipo || r.tipo === filtroTipo) &&
    (!busca.trim() || r.nome.toLowerCase().includes(busca.trim().toLowerCase()))
  );
  const toggle = (id) => setSelecionados((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const marcarTodos = () => setSelecionados((p) => [...new Set([...p, ...filtrados.map((r) => r.id)])]);
  const desmarcarTodos = () => setSelecionados((p) => p.filter((id) => !filtrados.some((r) => r.id === id)));
  const podeAplicar = piId && inicio && fim && selecionados.length > 0;

  return (
    <div className="fixed inset-0 bg-navy/50 flex items-start justify-center p-4 pt-8 z-50 overflow-auto">
      <div className="bg-white rounded-xl w-full max-w-lg p-5">
        <div className="font-head font-bold text-lg mb-4">⚡ Alocação em massa</div>

        <div className="flex flex-col gap-2 mb-4">
          <select value={piId} onChange={(e) => setPiId(e.target.value)} className="input">
            <option value="">Selecione o PI...</option>
            {pis.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.cliente}</option>)}
          </select>
          <div className="flex gap-2 items-center">
            <button type="button" onClick={() => setModoM("periodo_percentual")} className={`px-3 py-1.5 rounded-full text-xs border ${modoM === "periodo_percentual" ? "bg-cyan text-white border-cyan" : "border-line text-muted"}`}>% / Período</button>
            <button type="button" onClick={() => setModoM("cadencia")} className={`px-3 py-1.5 rounded-full text-xs border ${modoM === "cadencia" ? "bg-amber text-white border-amber" : "border-line text-muted"}`}>Cadência</button>
          </div>
          <div className="flex gap-2">
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="input flex-1" />
            <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="input flex-1" />
            {modoM === "periodo_percentual" && <input type="number" min="1" max="100" value={perc} onChange={(e) => setPerc(e.target.value)} className="input w-20" />}
          </div>
        </div>

        <div className="border-t border-line pt-3">
          <div className="flex gap-2 mb-2">
            <input placeholder="Buscar recurso..." value={busca} onChange={(e) => setBusca(e.target.value)} className="input flex-1" />
            <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="input flex-1">
              <option value="">Todos os tipos</option>
              {TIPOS_RECURSO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-[11px] font-mono text-muteddim">{filtrados.length} resultado(s) · {selecionados.length} selecionado(s)</span>
            <div className="flex gap-3">
              <button onClick={marcarTodos} className="text-xs text-cyan underline">Marcar Todos</button>
              <button onClick={desmarcarTodos} className="text-xs text-muteddim underline">Desmarcar Todos</button>
            </div>
          </div>
          <div className="max-h-52 overflow-auto flex flex-col gap-1">
            {filtrados.map((r) => (
              <label key={r.id} className="flex items-center gap-2 p-2 rounded-lg bg-panel text-xs cursor-pointer">
                <input type="checkbox" checked={selecionados.includes(r.id)} onChange={() => toggle(r.id)} />
                <span className="flex-1">{r.nome}</span>
                <span className="text-muteddim">{rotuloTipo(r.tipo)}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancelar} className="px-3 py-2 text-sm text-muted">Cancelar</button>
          <button onClick={() => onAplicar({ piId, modoM, inicio, fim, perc, recursoIds: selecionados })} disabled={!podeAplicar}
            className="px-4 py-2 rounded-lg bg-cyan text-white text-sm font-semibold disabled:opacity-50">
            Aplicar a {selecionados.length} recurso(s)
          </button>
        </div>
      </div>
    </div>
  );
}
