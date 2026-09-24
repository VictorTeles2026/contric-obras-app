"use client";

import { useState, useMemo } from "react";
import { useTabela, registrarLog } from "../../lib/dados";
import { useAuth, podeEditar } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import { useMinhasPis } from "../../lib/minhasPis";
import { hojeISO } from "../../lib/datas";
import { STATUS_ETAPA, LISTA_STATUS_ETAPA, CATEGORIAS_OCORRENCIA, etapasEmArvore } from "../../lib/constantes";
import { useToast } from "../../lib/Toast";
import PainelShell from "../../components/PainelShell";
import CapturaMidia from "../../components/CapturaMidia";
import FormHoras from "../../components/FormHoras";
import { CabecalhoPagina, Aviso, EstadoVazio, Spinner } from "../../components/ui";
import Icone from "../../components/Icone";

const limitar = (n) => Math.max(0, Math.min(100, Number(n) || 0));

export default function RdoPage() {
  const { usuario } = useAuth();
  const { avisar } = useToast();
  const editavel = podeEditar(usuario);
  const { dados: pisTodos } = useTabela("pis", { order: { coluna: "codigo" } });
  const pis = pisTodos.filter((p) => p.status !== "cancelado");
  const { dados: etapas } = useTabela("etapas");
  const { dados: usuarios } = useTabela("usuarios");
  const { dados: recursos } = useTabela("recursos");
  const { dados: alocacoes } = useTabela("alocacoes_recurso");
  const { meusPis } = useMinhasPis(usuario);

  const [piId, setPiId] = useState("");
  const piAtual = pis.find((p) => p.id === piId) || pis[0];
  const etapasDoPi = useMemo(() => (piAtual ? etapasEmArvore(etapas.filter((e) => e.pi_id === piAtual.id)) : []), [etapas, piAtual]);

  const liderResponsavel = useMemo(() => {
    if (!piAtual) return null;
    for (const lider of usuarios.filter((u) => u.perfil === "lider")) {
      const idsRecursos = recursos.filter((r) => r.usuario_id === lider.id).map((r) => r.id);
      if (alocacoes.some((a) => idsRecursos.includes(a.recurso_id) && a.pi_id === piAtual.id)) return lider;
    }
    return null;
  }, [piAtual, usuarios, recursos, alocacoes]);
  const naoSouOResponsavel = liderResponsavel && usuario && liderResponsavel.id !== usuario.id;

  const [statusPorEtapa, setStatusPorEtapa] = useState({});
  const [ocorrencias, setOcorrencias] = useState([]);
  const [novaCategoria, setNovaCategoria] = useState(null);
  const [novaDesc, setNovaDesc] = useState("");
  const [novasMidias, setNovasMidias] = useState([]);
  const [enviando, setEnviando] = useState(false);

  const valorDe = (e) => ({
    status: statusPorEtapa[e.id]?.status ?? e.status,
    percentual: statusPorEtapa[e.id]?.percentual ?? (Number(e.percentual) || 0),
  });
  const alterar = (id, patch) => setStatusPorEtapa((p) => ({ ...p, [id]: { ...p[id], ...patch } }));

  const trocarPi = (id) => { setPiId(id); setStatusPorEtapa({}); setOcorrencias([]); setNovaCategoria(null); setNovaDesc(""); setNovasMidias([]); };

  const adicionarOcorrencia = () => {
    if (!novaCategoria) return;
    setOcorrencias((p) => [...p, { categoria: novaCategoria, descricao: novaDesc.trim(), midias: novasMidias }]);
    setNovaCategoria(null); setNovaDesc(""); setNovasMidias([]);
  };

  const enviarRdo = async () => {
    if (!piAtual || enviando) return;
    setEnviando(true);
    const atividades = etapasDoPi.map((e) => {
      const v = valorDe(e);
      return { etapa_id: e.id, nome: e.nome, status: v.status, percentual: v.status === "concluida" ? 100 : limitar(v.percentual) };
    });
    const { data: rdo, error } = await supabase.from("rdos").insert({
      pi_id: piAtual.id, lider_id: usuario.id, data: hojeISO(), atividades, status: "pendente",
    }).select().single();
    if (error) { setEnviando(false); avisar(`Não foi possível enviar: ${error.message}`, "erro", 6000); return; }

    if (ocorrencias.length > 0) {
      const { error: erroOc } = await supabase.from("ocorrencias").insert(
        ocorrencias.map((o) => ({ pi_id: piAtual.id, rdo_id: rdo.id, categoria: o.categoria, descricao: o.descricao || null, midias: o.midias || [], registrado_por: usuario.id }))
      );
      if (erroOc) avisar(`RDO enviado, mas as ocorrências falharam: ${erroOc.message}`, "erro", 6000);
    }

    await registrarLog(usuario, "Registrou RDO (desktop)", `${usuario.nome} — ${piAtual.codigo}${naoSouOResponsavel ? ` · aviso a ${liderResponsavel.nome}` : ""}`);
    if (naoSouOResponsavel) {
      await registrarLog(usuario, "Aviso ao líder responsável", `${liderResponsavel.nome} — RDO de ${piAtual.codigo} preenchido por ${usuario.nome}`);
    }
    setEnviando(false);
    setStatusPorEtapa({}); setOcorrencias([]);
    avisar("RDO enviado — pendente de validação em Aprovações.");
  };

  return (
    <PainelShell>
      <div className="p-4 md:p-8 max-w-5xl mx-auto">
        <CabecalhoPagina titulo="RDO" subtitulo="Relatório diário de obra de qualquer PI." />

        {pis.length === 0 ? <EstadoVazio icone="obra" titulo="Nenhum PI" texto="Cadastre um PI no Cronograma primeiro." /> : (
          <>
            <div className="cartao p-4 mb-4 flex flex-col lg:flex-row lg:items-center gap-3">
              <select value={piAtual?.id || ""} onChange={(e) => trocarPi(e.target.value)} className="input lg:!w-96 min-w-0" aria-label="PI">
                {pis.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.cliente}{p.projeto ? ` — ${p.projeto}` : ""}</option>)}
              </select>
              <span className="text-sm text-muted flex flex-wrap items-center gap-1.5 min-w-0">
                <Icone nome="usuarios" className="w-4 h-4" /> Líder responsável: <strong className="text-textmain">{liderResponsavel ? liderResponsavel.nome : "não identificado"}</strong>
              </span>
            </div>

            {naoSouOResponsavel && (
              <Aviso tipo="alerta" className="mb-4">Você não é o líder responsável por este PI. <strong>{liderResponsavel.nome}</strong> receberá um aviso deste preenchimento.</Aviso>
            )}

            <section className="cartao p-4 md:p-5 mb-4">
              <h2 className="font-head font-bold text-base mb-3">Atividades</h2>
              <div className="flex flex-col gap-1.5">
                {etapasDoPi.map((e) => {
                  const v = valorDe(e);
                  const mudou = v.status !== e.status || (v.status === "em_andamento" && v.percentual !== (Number(e.percentual) || 0));
                  return (
                    <div key={e.id} className={`flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${e.nivel ? "ml-6" : ""} ${mudou ? "bg-cyan/5 ring-1 ring-cyan/30" : "bg-panel"}`}>
                      <span className={`flex-1 min-w-[180px] ${e.nivel ? "text-muted" : "font-semibold"}`}>{e.nivel ? "· " : ""}{e.nome}</span>
                      <select value={v.status} disabled={!editavel} onChange={(ev) => alterar(e.id, { status: ev.target.value })}
                        className="input !w-40 !py-1.5" style={{ color: STATUS_ETAPA[v.status]?.barra }}>
                        {LISTA_STATUS_ETAPA.map(([val, l]) => <option key={val} value={val}>{l}</option>)}
                      </select>
                      {v.status === "em_andamento" && (
                        <div className="relative w-24">
                          <input type="number" min="0" max="100" value={v.percentual} disabled={!editavel}
                            onChange={(ev) => alterar(e.id, { percentual: ev.target.value === "" ? "" : limitar(ev.target.value) })}
                            className="input !py-1.5 text-right pr-7" aria-label="Percentual" />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted">%</span>
                        </div>
                      )}
                    </div>
                  );
                })}
                {etapasDoPi.length === 0 && <div className="text-sm text-muteddim">Este PI não tem etapas cadastradas.</div>}
              </div>
            </section>

            <section className="cartao p-4 md:p-5 mb-4">
              <h2 className="font-head font-bold text-base mb-3">Ocorrências</h2>
              {ocorrencias.map((o, i) => (
                <div key={i} className="flex items-center gap-2 text-sm px-3 py-2 bg-amber/5 border border-amber/20 rounded-lg mb-1.5">
                  <span className="flex-1"><span className="text-amber font-semibold">{o.categoria}</span>{o.descricao ? ` — ${o.descricao}` : ""}
                    {o.midias?.length > 0 && <span className="text-muteddim"> · 📎 {o.midias.length}</span>}</span>
                  <button onClick={() => setOcorrencias((p) => p.filter((_, idx) => idx !== i))} className="text-muteddim hover:text-red p-1" aria-label="Remover"><Icone nome="lixo" className="w-4 h-4" /></button>
                </div>
              ))}
              {editavel && (
                <>
                  <div className="flex gap-2 flex-wrap items-center mb-2">
                    {CATEGORIAS_OCORRENCIA.map((c) => (
                      <button key={c} type="button" onClick={() => setNovaCategoria(novaCategoria === c ? null : c)}
                        className={`chip ${novaCategoria === c ? "!bg-amber !text-white !border-amber" : ""}`}>{c}</button>
                    ))}
                  </div>
                  {novaCategoria && (
                    <div className="flex flex-col gap-2 animar-fade">
                      <div className="flex gap-2">
                        <input placeholder="Descrição (opcional)" value={novaDesc} onChange={(e) => setNovaDesc(e.target.value)} className="input flex-1"
                          onKeyDown={(e) => e.key === "Enter" && adicionarOcorrencia()} />
                        <button onClick={adicionarOcorrencia} className="btn btn-alerta shrink-0">+ Adicionar</button>
                      </div>
                      <CapturaMidia value={novasMidias} onChange={setNovasMidias} compacto />
                    </div>
                  )}
                </>
              )}
            </section>

            {editavel ? (
              <div className="flex justify-end">
                <button onClick={enviarRdo} disabled={!piAtual || enviando} className="btn btn-sucesso btn-lg w-full md:w-auto">
                  {enviando ? <><Spinner /> Enviando...</> : <><Icone nome="aprovar" className="w-5 h-5" strokeWidth={2.4} /> Enviar RDO</>}
                </button>
              </div>
            ) : (
              <Aviso tipo="info">Modo visualização — seu perfil não pode preencher RDO.</Aviso>
            )}
          </>
        )}

        {editavel && meusPis.length > 0 && (
          <section className="cartao p-4 md:p-5 mt-8 max-w-xl">
            <h2 className="font-head font-bold text-base mb-3">Minhas horas</h2>
            <FormHoras usuario={usuario} pis={meusPis} compacto />
          </section>
        )}
      </div>
    </PainelShell>
  );
}
