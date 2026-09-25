"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTabela, registrarLog, gravarTolerante } from "../../../lib/dados";
import { useAuth, podeEditar } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import { formatarData, formatarDataHora } from "../../../lib/datas";
import { STATUS_SOLICITACAO, etapasEmArvore } from "../../../lib/constantes";
import { useToast } from "../../../lib/Toast";
import PainelShell from "../../../components/PainelShell";
import AbasCronograma from "../../../components/AbasCronograma";
import CapturaMidia from "../../../components/CapturaMidia";
import { EstadoVazio, Esqueleto, Modal, Campo, Aviso, Spinner } from "../../../components/ui";
import Icone from "../../../components/Icone";

const CAMPOS = [["data_prevista_inicio", "Data de início"], ["data_prevista_fim", "Data de término"], ["nome", "Nome da etapa"], ["outro", "Outro"]];
const ROTULO_CAMPO = Object.fromEntries(CAMPOS);
const ehData = (c) => c === "data_prevista_inicio" || c === "data_prevista_fim";
const mostrar = (campo, v) => (!v ? "—" : ehData(campo) && /^\d{4}-\d{2}-\d{2}/.test(v) ? formatarData(v) : v);
const FILTROS = [["", "Todas"], ["pendentes", "Em análise"], ["aprovada", "Aprovadas"], ["rejeitadas", "Reprovadas"]];

// Registro de TODAS as solicitações de alteração de cronograma de um PI:
// data, motivo, fotos/vídeos e os dados de cada aprovação (Coordenador e Gerente).
export default function SolicitacoesCronogramaPage() {
  const { usuario } = useAuth();
  const editavel = podeEditar(usuario);
  const { dados: pis } = useTabela("pis", { order: { coluna: "codigo" } });
  const { dados: etapas } = useTabela("etapas");
  const { dados: usuarios } = useTabela("usuarios");
  const { dados: solicitacoes, carregando, recarregar } = useTabela("solicitacoes_alteracao_cronograma", { order: { coluna: "created_at", asc: false } });
  const [piId, setPiIdEstado] = useState("");
  const [filtro, setFiltro] = useState("");
  const [novaAberta, setNovaAberta] = useState(false);

  useEffect(() => {
    const doLink = new URLSearchParams(window.location.search).get("pi");
    if (doLink) setPiIdEstado(doLink);
  }, []);
  useEffect(() => { if (!piId && pis.length) setPiIdEstado(pis[0].id); }, [pis, piId]);
  const setPiId = (id) => {
    setPiIdEstado(id);
    const url = new URL(window.location.href); url.searchParams.set("pi", id);
    window.history.replaceState(null, "", url.toString());
  };

  const pi = pis.find((p) => p.id === piId);
  const etapasDoPi = etapas.filter((e) => e.pi_id === piId);
  const doPi = solicitacoes.filter((s) => etapasDoPi.some((e) => e.id === s.etapa_id));
  const pendentes = doPi.filter((s) => s.status?.startsWith("pendente"));
  const filtradas = doPi.filter((s) =>
    !filtro || (filtro === "pendentes" ? s.status?.startsWith("pendente") : filtro === "rejeitadas" ? s.status?.startsWith("rejeitada") : s.status === filtro));
  const nome = (id) => usuarios.find((u) => u.id === id)?.nome || "—";

  return (
    <PainelShell>
      <div className="flex flex-col min-h-full">
        <div className="bg-white border-b border-line px-4 md:px-6 py-3 flex flex-wrap items-center gap-2">
          <select value={piId} onChange={(e) => setPiId(e.target.value)} className="input !w-full sm:!w-auto sm:min-w-[280px] sm:max-w-md font-semibold" aria-label="Selecionar PI">
            {pis.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.cliente}{p.projeto ? ` — ${p.projeto}` : ""}</option>)}
          </select>
          {editavel && pi && (
            <button onClick={() => setNovaAberta(true)} className="btn btn-primario btn-sm !py-2 sm:ml-auto">
              <Icone nome="mais2" className="w-4 h-4" /> Registrar solicitação
            </button>
          )}
        </div>
        <AbasCronograma piId={piId} qtdPendentes={pendentes.length} />

        <div className="p-4 md:p-6 max-w-5xl w-full">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {FILTROS.map(([v, l]) => (
              <button key={v} onClick={() => setFiltro(v)} className={`chip ${filtro === v ? "chip-ativo" : ""}`}>
                {l} ({v === "" ? doPi.length : doPi.filter((s) => v === "pendentes" ? s.status?.startsWith("pendente") : v === "rejeitadas" ? s.status?.startsWith("rejeitada") : s.status === v).length})
              </button>
            ))}
            {pendentes.length > 0 && <Link href="/aprovacoes" className="text-sm text-cyan font-semibold hover:underline ml-auto">Decidir pendentes em Aprovações →</Link>}
          </div>

          {carregando && <Esqueleto linhas={3} altura={120} />}
          {!carregando && filtradas.length === 0 && (
            <EstadoVazio icone="editar" titulo="Nenhuma solicitação" texto={doPi.length ? "Nada com esse filtro." : "Este PI ainda não tem solicitações de alteração de cronograma."} />
          )}

          <div className="flex flex-col gap-3">
            {filtradas.map((s) => {
              const etapa = etapas.find((e) => e.id === s.etapa_id);
              const st = STATUS_SOLICITACAO[s.status] || { rotulo: s.status, classe: "bg-panel text-muted" };
              return (
                <article key={s.id} className="cartao p-4 md:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs text-muted">Solicitada em <strong className="text-textmain">{formatarDataHora(s.created_at)}</strong> por <strong className="text-textmain">{nome(s.solicitado_por)}</strong></div>
                      <div className="font-head font-bold text-base mt-0.5">{etapa?.nome || "Etapa removida"}</div>
                    </div>
                    <span className={`selo shrink-0 ${st.classe}`}>{st.rotulo}</span>
                  </div>

                  <div className="rounded-lg bg-panel px-3 py-2.5 text-sm mt-3">
                    <span className="text-muted">{ROTULO_CAMPO[s.campo_alterado] || s.campo_alterado}:</span>{" "}
                    <span className="line-through text-muteddim">{mostrar(s.campo_alterado, s.valor_atual)}</span> → <strong>{mostrar(s.campo_alterado, s.valor_proposto)}</strong>
                  </div>
                  <div className="text-sm mt-2"><span className="font-semibold">Motivo:</span> <span className="text-muted">{s.justificativa}</span></div>

                  {s.midias?.length > 0 && (
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {s.midias.map((m) => (
                        <a key={m.url} href={m.url} target="_blank" rel="noreferrer" title={m.nome}>
                          {m.tipo === "foto"
                            ? <img src={m.url} alt={m.nome || "foto"} className="w-20 h-20 object-cover rounded-lg border border-line" loading="lazy" />
                            : <span className="w-20 h-20 rounded-lg border border-line bg-panel flex flex-col items-center justify-center text-muted text-xs gap-1"><Icone nome="video" className="w-6 h-6" />vídeo</span>}
                        </a>
                      ))}
                    </div>
                  )}

                  {/* dados da aprovação */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-sm">
                    <Decisao titulo="Coordenador" quem={s.decidido_coordenador_por && nome(s.decidido_coordenador_por)} quando={s.decidido_coordenador_em}
                      motivo={s.motivo_coordenador} reprovou={s.status === "rejeitada_coordenador"} aguardando={s.status === "pendente_coordenador"} />
                    <Decisao titulo="Gerente" quem={s.decidido_gerente_por && nome(s.decidido_gerente_por)} quando={s.decidido_gerente_em}
                      motivo={s.motivo_gerente} reprovou={s.status === "rejeitada_gerente"} aguardando={s.status === "pendente_gerente"}
                      naoChegou={s.status === "pendente_coordenador" || s.status === "rejeitada_coordenador"} />
                  </div>
                  {s.editado_por && <div className="text-xs text-muteddim mt-2">Editada por {nome(s.editado_por)} em {formatarDataHora(s.editado_em)}</div>}
                </article>
              );
            })}
          </div>
        </div>
      </div>
      {novaAberta && pi && (
        <NovaSolicitacao pi={pi} etapas={etapasDoPi} usuario={usuario} onFechar={() => setNovaAberta(false)} onSalvo={recarregar} />
      )}
    </PainelShell>
  );
}

function Decisao({ titulo, quem, quando, motivo, reprovou, aguardando, naoChegou }) {
  const estado = quem ? (reprovou ? "Reprovou" : "Aprovou") : aguardando ? "Aguardando" : naoChegou ? "—" : "—";
  const cor = quem ? (reprovou ? "border-red/30 bg-red/5" : "border-green/30 bg-green/5") : aguardando ? "border-amber/30 bg-amber/5" : "border-line bg-white";
  return (
    <div className={`rounded-lg border px-3 py-2 ${cor}`}>
      <div className="titulo-secao">{titulo}</div>
      <div className="font-semibold">{estado}{quem ? ` — ${quem}` : ""}</div>
      {quando && <div className="text-xs text-muted">{formatarDataHora(quando)}</div>}
      {motivo && <div className="text-xs text-muted mt-0.5">“{motivo}”</div>}
    </div>
  );
}

function NovaSolicitacao({ pi, etapas, usuario, onFechar, onSalvo }) {
  const { avisar } = useToast();
  const [etapaId, setEtapaId] = useState("");
  const [campo, setCampo] = useState("data_prevista_fim");
  const [valor, setValor] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [midias, setMidias] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const etapa = etapas.find((e) => e.id === etapaId);
  const pode = etapaId && valor.trim() && justificativa.trim() && !salvando;

  const salvar = async () => {
    setSalvando(true);
    const { error } = await gravarTolerante({
      etapa_id: etapaId, solicitado_por: usuario.id, campo_alterado: campo,
      valor_atual: campo === "outro" ? null : etapa?.[campo] || null, valor_proposto: valor.trim(),
      justificativa: justificativa.trim(), status: "pendente_coordenador", midias,
    }, (d) => supabase.from("solicitacoes_alteracao_cronograma").insert(d));
    setSalvando(false);
    if (error) { avisar(`Não foi possível registrar: ${error.message}`, "erro", 6000); return; }
    await registrarLog(usuario, "Registrou solicitação de alteração", `${pi.codigo} — ${etapa?.nome} — ${ROTULO_CAMPO[campo]}`);
    avisar("Solicitação registrada — segue para aprovação.");
    onSalvo?.(); onFechar();
  };

  return (
    <Modal titulo={`Nova solicitação — ${pi.codigo}`} onFechar={onFechar}
      rodape={<>
        <button onClick={onFechar} className="btn btn-fantasma">Cancelar</button>
        <button onClick={salvar} disabled={!pode} className="btn btn-primario">{salvando ? <><Spinner /> Salvando...</> : "Registrar"}</button>
      </>}>
      <div className="flex flex-col gap-4">
        <Campo rotulo="Etapa">
          <select value={etapaId} onChange={(e) => setEtapaId(e.target.value)} className="input">
            <option value="">Selecione...</option>
            {etapasEmArvore(etapas).map((e) => <option key={e.id} value={e.id}>{e.nivel ? "   · " : ""}{e.nome}</option>)}
          </select>
        </Campo>
        <div>
          <span className="rotulo">O que mudar</span>
          <div className="grid grid-cols-2 gap-2">
            {CAMPOS.map(([v, l]) => (
              <button key={v} type="button" onClick={() => { setCampo(v); setValor(""); }}
                className={`py-2 px-3 rounded-lg text-sm font-semibold border ${campo === v ? "bg-cyan text-white border-cyan" : "bg-white border-line text-muted"}`}>{l}</button>
            ))}
          </div>
        </div>
        {etapa && campo !== "outro" && <div className="text-sm text-muted">Valor atual: <strong className="text-textmain">{mostrar(campo, etapa[campo])}</strong></div>}
        <Campo rotulo={campo === "outro" ? "O que deve mudar" : "Novo valor"}>
          {ehData(campo) ? <input type="date" value={valor} onChange={(e) => setValor(e.target.value)} className="input" />
            : <input value={valor} onChange={(e) => setValor(e.target.value)} className="input" />}
        </Campo>
        <Campo rotulo="Motivo / justificativa">
          <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} rows={3} className="input" />
        </Campo>
        <div>
          <span className="rotulo">Fotos ou vídeos (opcional)</span>
          <CapturaMidia value={midias} onChange={setMidias} compacto />
        </div>
        <Aviso tipo="info">A solicitação segue o fluxo normal: Coordenador e depois Gerente, em Aprovações.</Aviso>
      </div>
    </Modal>
  );
}
