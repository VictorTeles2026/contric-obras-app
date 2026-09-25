"use client";

import { useState } from "react";
import { useTabela, registrarLog } from "../../../lib/dados";
import { useAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import { useMinhasPis } from "../../../lib/minhasPis";
import { NAV_LIDER } from "../../../lib/nav";
import { formatarData, formatarDataHora } from "../../../lib/datas";
import { STATUS_SOLICITACAO, etapasEmArvore } from "../../../lib/constantes";
import { useToast } from "../../../lib/Toast";
import MobileShell from "../../../components/MobileShell";
import { Esqueleto, EstadoVazio, Spinner } from "../../../components/ui";
import { EditorSolicitacao } from "../../../components/Editores";
import Icone from "../../../components/Icone";

const CAMPOS = [["data_prevista_inicio", "Data de início"], ["data_prevista_fim", "Data de término"], ["nome", "Nome da etapa"], ["outro", "Outro"]];
const ROTULO_CAMPO = Object.fromEntries(CAMPOS);
const ehCampoData = (c) => c === "data_prevista_inicio" || c === "data_prevista_fim";
const mostrarValor = (campo, v) => (!v ? "—" : ehCampoData(campo) && /^\d{4}-\d{2}-\d{2}/.test(v) ? formatarData(v) : v);

export default function LiderSolicitarPage() {
  const { usuario } = useAuth();
  const { avisar } = useToast();
  const { meusPis, carregando } = useMinhasPis(usuario);
  const { dados: etapas } = useTabela("etapas");
  const { dados: minhasSolicitacoes, recarregar } = useTabela("solicitacoes_alteracao_cronograma", {
    order: { coluna: "created_at", asc: false }, filtro: [["solicitado_por", usuario?.id]],
  });

  const [etapaId, setEtapaId] = useState("");
  const [campo, setCampo] = useState("data_prevista_fim");
  const [valorProposto, setValorProposto] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [editando, setEditando] = useState(null);

  const etapaSelecionada = etapas.find((e) => e.id === etapaId);
  const valorAtual = campo === "outro" ? null : etapaSelecionada?.[campo] || null;
  const podeEnviar = etapaId && valorProposto.trim() && justificativa.trim() && !enviando;

  const enviar = async () => {
    if (!podeEnviar) return;
    setEnviando(true);
    const { error } = await supabase.from("solicitacoes_alteracao_cronograma").insert({
      etapa_id: etapaId, solicitado_por: usuario.id, campo_alterado: campo,
      valor_atual: valorAtual, valor_proposto: valorProposto.trim(),
      justificativa: justificativa.trim(), status: "pendente_coordenador",
    });
    setEnviando(false);
    if (error) { avisar(`Não foi possível enviar: ${error.message}`, "erro", 6000); return; }
    await registrarLog(usuario, "Solicitou alteração de cronograma", `${etapaSelecionada?.nome} — ${ROTULO_CAMPO[campo]}`);
    setEtapaId(""); setValorProposto(""); setJustificativa("");
    avisar("Solicitação enviada para o Coordenador.");
    recarregar();
  };

  const nomeEtapa = (id) => etapas.find((e) => e.id === id)?.nome || "Etapa";

  return (
    <MobileShell nav={NAV_LIDER} perfis={["lider"]}>
      <div className="p-4 flex flex-col gap-5">
        <div className="pt-1">
          <div className="font-head font-bold text-2xl">Solicitar alteração</div>
          <p className="text-sm text-muted mt-1">Peça mudança de data ou nome de uma etapa. O Coordenador e o Gerente analisam.</p>
        </div>

        {carregando ? <Esqueleto linhas={2} altura={120} /> : meusPis.length === 0 ? (
          <div className="cartao"><EstadoVazio icone="obra" titulo="Nenhuma obra" texto="Você não está alocado em nenhuma obra." /></div>
        ) : (
          <div className="cartao p-4 flex flex-col gap-4">
            <label className="block">
              <span className="rotulo">Etapa</span>
              <select value={etapaId} onChange={(e) => setEtapaId(e.target.value)} className="input input-lg">
                <option value="">Selecione...</option>
                {meusPis.map((pi) => (
                  <optgroup key={pi.id} label={`${pi.codigo} — ${pi.projeto || pi.cliente || ""}`}>
                    {etapasEmArvore(etapas.filter((e) => e.pi_id === pi.id)).map((e) => (
                      <option key={e.id} value={e.id}>{e.nivel ? "   · " : ""}{e.nome}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <div>
              <span className="rotulo">O que quer mudar</span>
              <div className="grid grid-cols-2 gap-2">
                {CAMPOS.map(([v, l]) => (
                  <button key={v} type="button" onClick={() => { setCampo(v); setValorProposto(""); }}
                    className={`py-2.5 px-3 rounded-lg text-sm font-semibold border transition-colors ${campo === v ? "bg-cyan text-white border-cyan" : "bg-white border-line text-muted"}`}>{l}</button>
                ))}
              </div>
            </div>

            {etapaSelecionada && campo !== "outro" && (
              <div className="text-sm text-muted bg-panel rounded-lg px-3 py-2.5">Valor atual: <strong className="text-textmain">{mostrarValor(campo, valorAtual)}</strong></div>
            )}

            <label className="block">
              <span className="rotulo">{campo === "outro" ? "O que deve mudar" : "Novo valor"}</span>
              {ehCampoData(campo) ? (
                <input type="date" value={valorProposto} onChange={(e) => setValorProposto(e.target.value)} className="input input-lg" />
              ) : (
                <input value={valorProposto} onChange={(e) => setValorProposto(e.target.value)} className="input input-lg"
                  placeholder={campo === "nome" ? "Novo nome da etapa" : "Descreva a alteração"} />
              )}
            </label>
            <label className="block">
              <span className="rotulo">Justificativa</span>
              <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} rows={3} className="input input-lg"
                placeholder="Por que precisa mudar?" />
            </label>
            <button onClick={enviar} disabled={!podeEnviar} className="btn btn-primario btn-lg w-full">
              {enviando ? <><Spinner /> Enviando...</> : "Enviar solicitação"}
            </button>
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          <div className="titulo-secao">Minhas solicitações</div>
          {minhasSolicitacoes.map((s) => {
            const st = STATUS_SOLICITACAO[s.status] || { rotulo: s.status, classe: "bg-panel text-muted" };
            return (
              <div key={s.id} className="cartao p-4 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-base leading-snug">{nomeEtapa(s.etapa_id)}</div>
                  <span className={`selo shrink-0 ${st.classe}`}>{st.rotulo}</span>
                </div>
                <div className="text-muted mt-1">
                  {ROTULO_CAMPO[s.campo_alterado] || s.campo_alterado}: {mostrarValor(s.campo_alterado, s.valor_atual)} → <strong className="text-textmain">{mostrarValor(s.campo_alterado, s.valor_proposto)}</strong>
                </div>
                {s.created_at && <div className="text-xs text-muteddim mt-1.5">{formatarDataHora(s.created_at)}{s.editado_em ? " · editada" : ""}</div>}
                {(s.motivo_coordenador || s.motivo_gerente) && s.status.startsWith("rejeitada") && (
                  <div className="text-sm text-red bg-red/5 rounded-lg px-3 py-2 mt-2">Motivo: {s.motivo_gerente || s.motivo_coordenador}</div>
                )}
                {s.status === "pendente_coordenador" && (
                  <button onClick={() => setEditando(s)} className="btn btn-contorno btn-sm w-full mt-2.5">
                    <Icone nome="editar" className="w-4 h-4" /> Editar (até ser analisada)
                  </button>
                )}
              </div>
            );
          })}
          {minhasSolicitacoes.length === 0 && <div className="text-sm text-muteddim">Nenhuma solicitação ainda.</div>}
        </div>
        {editando && (
          <EditorSolicitacao s={editando} etapas={etapas} comoAprovador={false} onFechar={() => setEditando(null)} onSalvo={recarregar} />
        )}
      </div>
    </MobileShell>
  );
}
