"use client";

import { useState } from "react";
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
  const [nrNome, setNrNome] = useState("");
  const [nrTipo, setNrTipo] = useState("mao_obra_propria");
  const [nrUnidade, setNrUnidade] = useState("hora");
  const [nrUsuarioId, setNrUsuarioId] = useState("");
  const ehMaoDeObra = (t) => t === "mao_obra_propria" || t === "mao_obra_terceira";
  const usuariosElegiveis = usuarios.filter((u) => PERFIS_COM_ALOCACAO.includes(u.perfil));
  const usuarioJaVinculado = (id) => recursos.some((r) => r.usuario_id === id && r.id !== selecionadoId);

  const criarRecurso = async () => {
    if (!nrNome.trim()) return;
    const { data, error } = await supabase.from("recursos").insert({
      nome: nrNome, tipo: nrTipo, custo_unidade: nrUnidade,
      usuario_id: ehMaoDeObra(nrTipo) && nrUsuarioId ? nrUsuarioId : null,
    }).select().single();
    if (!error) {
      await registrarLog(usuario, "Criou recurso", nrNome);
      setNrNome(""); setNrUsuarioId(""); setNovoOpen(false);
      setSelecionadoId(data.id);
      recarregarRecursos();
    }
  };

  const abrirEdicao = () => {
    if (!selecionado) return;
    setNrNome(selecionado.nome); setNrTipo(selecionado.tipo);
    setNrUnidade(selecionado.custo_unidade); setNrUsuarioId(selecionado.usuario_id || "");
    setEditarOpen(true);
  };
  const salvarEdicao = async () => {
    if (!nrNome.trim() || !selecionado) return;
    await supabase.from("recursos").update({
      nome: nrNome, tipo: nrTipo, custo_unidade: nrUnidade,
      usuario_id: ehMaoDeObra(nrTipo) && nrUsuarioId ? nrUsuarioId : null,
    }).eq("id", selecionado.id);
    await registrarLog(usuario, "Editou recurso", nrNome);
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

  return (
    <PainelShell>
    <div className="flex flex-col md:flex-row h-full">
      <div className="w-full md:w-72 border-b md:border-b-0 md:border-r border-line p-4 overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="font-head font-bold text-sm">Recursos</div>
          {editavel && (
            <button onClick={() => setNovoOpen((o) => !o)} className="px-2 py-1 rounded-lg bg-cyan text-white text-xs font-semibold">+ Novo</button>
          )}
        </div>

        {novoOpen && (
          <RecursoForm
            nome={nrNome} setNome={setNrNome} tipo={nrTipo} setTipo={setNrTipo}
            unidade={nrUnidade} setUnidade={setNrUnidade} usuarioId={nrUsuarioId} setUsuarioId={setNrUsuarioId}
            ehMaoDeObra={ehMaoDeObra} usuariosElegiveis={usuariosElegiveis} usuarioJaVinculado={usuarioJaVinculado}
            onSalvar={criarRecurso} rotuloBotao="Criar"
          />
        )}

        <div className="flex flex-col gap-1">
          {recursos.map((r) => (
            <button key={r.id} onClick={() => { setSelecionadoId(r.id); setAvisoOverlap(false); setEditandoAlocId(null); setEditarOpen(false); }}
              className={`text-left p-2 rounded-lg border text-xs ${selecionadoId === r.id ? "border-cyan bg-cyan/5" : "border-line"}`}>
              <div className="font-semibold">{r.nome}</div>
              <div className="text-muteddim font-mono text-[10px]">{TIPOS_RECURSO.find((t) => t[0] === r.tipo)?.[1]} · apropriação por {rotuloUnidade(r.custo_unidade)}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        {!selecionado && <div className="text-sm text-muteddim">Selecione um recurso à esquerda.</div>}
        {selecionado && (
          <>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="font-head font-bold text-lg">{selecionado.nome}</div>
                <div className="text-xs text-muted">{TIPOS_RECURSO.find((t) => t[0] === selecionado.tipo)?.[1]} · apropriação por {rotuloUnidade(selecionado.custo_unidade)}</div>
                {selecionado.usuario_id && (
                  <div className="text-xs text-cyan font-mono">Vinculado a: {usuarios.find((u) => u.id === selecionado.usuario_id)?.nome}</div>
                )}
              </div>
              {editavel && (
                <button onClick={abrirEdicao} className="text-xs border border-line rounded-full px-3 py-1 text-muted shrink-0">Editar Recurso</button>
              )}
            </div>

            {editarOpen && (
              <div className="mb-4 max-w-sm">
                <RecursoForm
                  nome={nrNome} setNome={setNrNome} tipo={nrTipo} setTipo={setNrTipo}
                  unidade={nrUnidade} setUnidade={setNrUnidade} usuarioId={nrUsuarioId} setUsuarioId={setNrUsuarioId}
                  ehMaoDeObra={ehMaoDeObra} usuariosElegiveis={usuariosElegiveis} usuarioJaVinculado={usuarioJaVinculado}
                  onSalvar={salvarEdicao} rotuloBotao="Salvar alterações" onCancelar={() => setEditarOpen(false)}
                />
              </div>
            )}

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

      <style jsx global>{`
        .input { width: 100%; padding: 7px 9px; border-radius: 8px; border: 1px solid #D7E0EC; font-size: 12.5px; background: white; }
      `}</style>
    </div>
    </PainelShell>
  );
}

function RecursoForm({ nome, setNome, tipo, setTipo, unidade, setUnidade, usuarioId, setUsuarioId, ehMaoDeObra, usuariosElegiveis, usuarioJaVinculado, onSalvar, rotuloBotao, onCancelar }) {
  return (
    <div className="bg-panel rounded-lg p-3 mb-3 flex flex-col gap-2">
      <input placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} className="input" />
      <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="input">
        {TIPOS_RECURSO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <div>
        <div className="text-[10px] text-muteddim mb-1">PERÍODO DE APROPRIAÇÃO</div>
        <select value={unidade} onChange={(e) => setUnidade(e.target.value)} className="input">
          {UNIDADES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {ehMaoDeObra(tipo) && (
        <select value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)} className="input">
          <option value="">Vincular a usuário (opcional)</option>
          {usuariosElegiveis.map((u) => (
            <option key={u.id} value={u.id} disabled={usuarioJaVinculado(u.id)}>
              {u.nome}{usuarioJaVinculado(u.id) ? " — já vinculado" : ""}
            </option>
          ))}
        </select>
      )}
      <div className="flex gap-2">
        <button onClick={onSalvar} className="flex-1 py-1.5 rounded-lg bg-navy text-white text-xs font-semibold">{rotuloBotao}</button>
        {onCancelar && <button onClick={onCancelar} className="px-3 py-1.5 text-xs text-muted">Cancelar</button>}
      </div>
    </div>
  );
}
