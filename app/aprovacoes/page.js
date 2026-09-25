"use client";

import { useState } from "react";
import { useTabela, registrarLog } from "../../lib/dados";
import { useAuth, podeEditar } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import { formatarData, formatarDataHora, horaCurta, formatarHoras } from "../../lib/datas";
import { STATUS_ETAPA, STATUS_SOLICITACAO } from "../../lib/constantes";
import { notificar } from "../../lib/notificacoes";
import { gerarPdfRdoSeguro } from "../../lib/pdfRdo";
import { useToast } from "../../lib/Toast";
import PainelShell from "../../components/PainelShell";
import { EditorRdo, EditorHoras, EditorSolicitacao } from "../../components/Editores";
import { CabecalhoPagina, EstadoVazio, Esqueleto, Aviso, Spinner } from "../../components/ui";
import Icone from "../../components/Icone";

const ROTULO_CAMPO = { data_prevista_inicio: "Data de início", data_prevista_fim: "Data de término", nome: "Nome da etapa", outro: "Outro" };
const CAMPOS_APLICAVEIS = ["data_prevista_inicio", "data_prevista_fim", "nome"];

export default function AprovacoesPage() {
  const { usuario } = useAuth();
  const { avisar } = useToast();
  const editavel = podeEditar(usuario);
  const [aba, setAba] = useState("rdos");
  const [editando, setEditando] = useState(null); // { tipo: "rdo" | "horas" | "solicitacao", item }
  const { dados: pis } = useTabela("pis", { order: { coluna: "codigo" } });
  const { dados: usuarios } = useTabela("usuarios");
  const { dados: etapas, recarregar: recarregarEtapas } = useTabela("etapas");
  const { dados: ocorrencias, recarregar: recarregarOcorrencias } = useTabela("ocorrencias");
  const { dados: rdosPendentes, carregando: c1, recarregar: recarregarRdos } = useTabela("rdos", { order: { coluna: "created_at" }, filtro: [["status", "pendente"]] });
  const { dados: horasPendentes, carregando: c2, recarregar: recarregarHoras } = useTabela("apontamentos_horas", { order: { coluna: "created_at" }, filtro: [["status", "pendente"]] });
  const { dados: solicitacoes, carregando: c3, recarregar: recarregarSolicitacoes } = useTabela("solicitacoes_alteracao_cronograma", { order: { coluna: "created_at" } });
  const solicitacoesPendentes = solicitacoes.filter((s) => s.status === "pendente_coordenador" || s.status === "pendente_gerente");

  const piInfo = (id) => pis.find((p) => p.id === id);
  const nomeUsuario = (id) => usuarios.find((u) => u.id === id)?.nome || "—";
  const agora = () => new Date().toISOString();

  // ---------------- RDO ----------------
  const aprovarRdo = async (rdo, aplicarNoCronograma) => {
    const { error } = await supabase.from("rdos").update({ status: "aprovado", decidido_por: usuario.id, decidido_em: agora() }).eq("id", rdo.id);
    if (error) { avisar(`Erro ao aprovar: ${error.message}`, "erro", 6000); return; }
    let aplicadas = 0;
    if (aplicarNoCronograma) {
      const mudancas = (rdo.atividades || []).filter((a) => {
        const e = etapas.find((x) => x.id === a.etapa_id);
        return e && (e.status !== a.status || Number(e.percentual || 0) !== Number(a.percentual || 0));
      });
      const resultados = await Promise.all(mudancas.map((a) =>
        supabase.from("etapas").update({ status: a.status, percentual: a.status === "concluida" ? 100 : Number(a.percentual) || 0 }).eq("id", a.etapa_id)));
      aplicadas = resultados.filter((r) => !r.error).length;
    }
    const pi = piInfo(rdo.pi_id);
    await registrarLog(usuario, "Aprovou RDO", `${pi?.codigo} — ${rdo.data}${aplicadas ? ` · ${aplicadas} etapa(s) atualizada(s)` : ""}`);
    await notificar(rdo.lider_id, `RDO aprovado — ${pi?.codigo} (${formatarData(rdo.data)})`, `Aprovado por ${usuario.nome}.`, "/lider");
    recarregarRdos(); if (aplicadas) recarregarEtapas();
    avisar(aplicadas ? `RDO aprovado · ${aplicadas} etapa(s) atualizada(s) no cronograma.` : "RDO aprovado.");
    gerarPdfRdoSeguro(rdo.id, avisar); // o PDF passa a mostrar "APROVADO"
  };
  const reprovarRdo = async (rdo, motivo) => {
    const { error } = await supabase.from("rdos").update({ status: "rejeitado", decidido_por: usuario.id, decidido_em: agora(), motivo_rejeicao: motivo }).eq("id", rdo.id);
    if (error) { avisar(`Erro ao reprovar: ${error.message}`, "erro", 6000); return; }
    const pi = piInfo(rdo.pi_id);
    await registrarLog(usuario, "Reprovou RDO", `${pi?.codigo} · motivo: ${motivo}`);
    await notificar(rdo.lider_id, `RDO reprovado — ${pi?.codigo} (${formatarData(rdo.data)})`, `Reprovado por ${usuario.nome}.\nMotivo: ${motivo}`, "/lider/rdo");
    recarregarRdos();
    avisar("RDO reprovado — o responsável foi notificado.", "info");
    gerarPdfRdoSeguro(rdo.id, avisar);
  };

  // ---------------- Horas ----------------
  const aprovarHoras = async (h, normais, extras) => {
    const { error } = await supabase.from("apontamentos_horas").update({
      status: "aprovado", decidido_por: usuario.id, decidido_em: agora(), horas_normais: normais, horas_extras: extras,
    }).eq("id", h.id);
    if (error) { avisar(`Erro ao aprovar: ${error.message}`, "erro", 6000); return; }
    await registrarLog(usuario, "Aprovou horas", `${nomeUsuario(h.usuario_id)} · ${piInfo(h.pi_id)?.codigo} — ${normais}h normais + ${extras}h extras`);
    await notificar(h.usuario_id, `Horas aprovadas — ${formatarData(h.data)}`, `${piInfo(h.pi_id)?.codigo}: ${normais}h normais${extras ? ` + ${extras}h extras` : ""}. Aprovado por ${usuario.nome}.`);
    recarregarHoras();
    avisar("Horas aprovadas.");
  };
  const reprovarHoras = async (h, motivo) => {
    const { error } = await supabase.from("apontamentos_horas").update({ status: "rejeitado", decidido_por: usuario.id, decidido_em: agora(), motivo_rejeicao: motivo }).eq("id", h.id);
    if (error) { avisar(`Erro ao reprovar: ${error.message}`, "erro", 6000); return; }
    await registrarLog(usuario, "Reprovou horas", `${nomeUsuario(h.usuario_id)} · ${piInfo(h.pi_id)?.codigo} · motivo: ${motivo}`);
    await notificar(h.usuario_id, `Horas reprovadas — ${formatarData(h.data)}`, `${piInfo(h.pi_id)?.codigo}. Reprovado por ${usuario.nome}.\nMotivo: ${motivo}`);
    recarregarHoras();
    avisar("Horas reprovadas — a pessoa foi notificada.", "info");
  };

  // ---------------- Solicitações ----------------
  const podeDecidirSolicitacao = (s) =>
    usuario?.perfil === "master" ||
    (s.status === "pendente_coordenador" && usuario?.perfil === "coordenador") ||
    (s.status === "pendente_gerente" && usuario?.perfil === "gerente");

  const decidirSolicitacao = async (s, aprovar, motivo) => {
    const etapa = etapas.find((e) => e.id === s.etapa_id);
    const naEtapaCoord = s.status === "pendente_coordenador";
    // master aprova as duas fases de uma vez
    const finaliza = aprovar && (!naEtapaCoord || usuario.perfil === "master");
    const patch = naEtapaCoord
      ? { decidido_coordenador_por: usuario.id, decidido_coordenador_em: agora(), motivo_coordenador: motivo || null,
          status: aprovar ? (finaliza ? "aprovada" : "pendente_gerente") : "rejeitada_coordenador" }
      : { decidido_gerente_por: usuario.id, decidido_gerente_em: agora(), motivo_gerente: motivo || null,
          status: aprovar ? "aprovada" : "rejeitada_gerente" };
    if (naEtapaCoord && finaliza) Object.assign(patch, { decidido_gerente_por: usuario.id, decidido_gerente_em: agora() });

    if (finaliza && etapa && CAMPOS_APLICAVEIS.includes(s.campo_alterado)) {
      const valor = s.valor_proposto.trim();
      const ehData = s.campo_alterado !== "nome";
      if (ehData && !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
        avisar("O valor proposto não é uma data válida — ajuste a etapa manualmente no Cronograma.", "erro", 7000);
      } else {
        const { error } = await supabase.from("etapas").update({ [s.campo_alterado]: valor }).eq("id", etapa.id);
        if (error) { avisar(`Não foi possível aplicar na etapa: ${error.message}`, "erro", 6000); return; }
      }
    }
    const { error } = await supabase.from("solicitacoes_alteracao_cronograma").update(patch).eq("id", s.id);
    if (error) { avisar(`Erro: ${error.message}`, "erro", 6000); return; }
    const oQue = `${etapa?.nome || "Etapa"} — ${ROTULO_CAMPO[s.campo_alterado] || s.campo_alterado}`;
    await registrarLog(usuario, aprovar ? "Aprovou solicitação de alteração" : "Reprovou solicitação de alteração", `${oQue}${motivo ? ` · ${motivo}` : ""}`);
    await notificar(s.solicitado_por,
      !aprovar ? `Solicitação reprovada — ${etapa?.nome || "etapa"}` : finaliza ? `Solicitação aprovada — ${etapa?.nome || "etapa"}` : `Solicitação aprovada pelo Coordenador — ${etapa?.nome || "etapa"}`,
      !aprovar ? `${oQue}. Reprovado por ${usuario.nome}.\nMotivo: ${motivo}` : finaliza ? `${oQue}. A alteração foi aplicada ao cronograma.` : `${oQue}. Agora aguarda o Gerente.`,
      "/lider/solicitar");
    recarregarSolicitacoes(); recarregarEtapas();
    avisar(!aprovar ? "Solicitação reprovada — o solicitante foi notificado." : finaliza ? "Solicitação aprovada e aplicada ao cronograma." : "Aprovada — segue para o Gerente.");
  };

  const abas = [
    ["rdos", "RDOs", rdosPendentes.length],
    ["horas", "Horas", horasPendentes.length],
    ["solicitacoes", "Solicitações", solicitacoesPendentes.length],
  ];

  return (
    <PainelShell>
      <div className="p-4 md:p-8 max-w-5xl mx-auto">
        <CabecalhoPagina titulo="Aprovações" subtitulo="RDOs, horas e alterações de cronograma aguardando aprovação." />
        {!editavel && <Aviso tipo="info" className="mb-4">Modo visualização — seu perfil não pode aprovar, editar ou reprovar.</Aviso>}

        <div className="flex gap-1 border-b border-line mb-5 overflow-x-auto">
          {abas.map(([v, l, n]) => (
            <button key={v} onClick={() => setAba(v)}
              className={`relative px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors ${aba === v ? "text-cyan" : "text-muted hover:text-textmain"}`}>
              {l}
              <span className={`ml-2 selo ${n ? "bg-amber/15 text-amber" : "bg-panel text-muteddim"}`}>{n}</span>
              {aba === v && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-cyan rounded-full" />}
            </button>
          ))}
        </div>

        {aba === "rdos" && (
          <div className="flex flex-col gap-3">
            {c1 && <Esqueleto linhas={2} altura={140} />}
            {!c1 && rdosPendentes.length === 0 && <EstadoVazio icone="aprovar" titulo="Tudo em dia" texto="Nenhum RDO aguardando aprovação." />}
            {rdosPendentes.map((rdo) => (
              <RdoCard key={`${rdo.id}-${rdo.editado_em || ""}`} rdo={rdo} pi={piInfo(rdo.pi_id)} lider={nomeUsuario(rdo.lider_id)} editavel={editavel}
                editadoPor={rdo.editado_por ? nomeUsuario(rdo.editado_por) : null}
                ocorrencias={ocorrencias.filter((o) => o.rdo_id === rdo.id)}
                onAprovar={(aplicar) => aprovarRdo(rdo, aplicar)} onReprovar={(m) => reprovarRdo(rdo, m)}
                onEditar={() => setEditando({ tipo: "rdo", item: rdo })} />
            ))}
          </div>
        )}

        {aba === "horas" && (
          <div className="flex flex-col gap-3">
            {c2 && <Esqueleto linhas={2} altura={120} />}
            {!c2 && horasPendentes.length === 0 && <EstadoVazio icone="relogio" titulo="Tudo em dia" texto="Nenhum registro de horas pendente." />}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {horasPendentes.map((h) => (
                // a chave inclui o total: quando o check-out ou uma edição chega, o card reinicia os campos com o valor novo
                <HorasCard key={`${h.id}-${h.horas_totais}`} registro={h} pi={piInfo(h.pi_id)} pessoa={nomeUsuario(h.usuario_id)} editavel={editavel}
                  editadoPor={h.editado_por ? nomeUsuario(h.editado_por) : null}
                  onAprovar={aprovarHoras} onReprovar={(m) => reprovarHoras(h, m)} onEditar={() => setEditando({ tipo: "horas", item: h })} />
              ))}
            </div>
          </div>
        )}

        {aba === "solicitacoes" && (
          <div className="flex flex-col gap-3">
            {c3 && <Esqueleto linhas={2} altura={120} />}
            {!c3 && solicitacoesPendentes.length === 0 && <EstadoVazio icone="editar" titulo="Nenhuma solicitação" texto="Pedidos de alteração de cronograma feitos pelos líderes aparecem aqui." />}
            {solicitacoesPendentes.map((s) => {
              const etapa = etapas.find((e) => e.id === s.etapa_id);
              return (
                <SolicitacaoCard key={s.id} s={s} etapa={etapa} pi={piInfo(etapa?.pi_id)} solicitante={nomeUsuario(s.solicitado_por)}
                  editadoPor={s.editado_por ? nomeUsuario(s.editado_por) : null}
                  editavel={editavel} podeDecidir={podeDecidirSolicitacao(s)} finalizaDireto={usuario?.perfil === "master"}
                  onDecidir={(aprovar, motivo) => decidirSolicitacao(s, aprovar, motivo)}
                  onEditar={() => setEditando({ tipo: "solicitacao", item: s })} />
              );
            })}
          </div>
        )}
      </div>

      {editando?.tipo === "rdo" && (
        <EditorRdo rdo={editando.item} pi={piInfo(editando.item.pi_id)} pis={pis} comoAprovador
          ocorrenciasOriginais={ocorrencias.filter((o) => o.rdo_id === editando.item.id)}
          onFechar={() => setEditando(null)} onSalvo={() => { recarregarRdos(); recarregarOcorrencias(); }} />
      )}
      {editando?.tipo === "horas" && (
        <EditorHoras registro={editando.item} pis={pis} comoAprovador onFechar={() => setEditando(null)} onSalvo={recarregarHoras} />
      )}
      {editando?.tipo === "solicitacao" && (
        <EditorSolicitacao s={editando.item} etapas={etapas} comoAprovador onFechar={() => setEditando(null)} onSalvo={recarregarSolicitacoes} />
      )}
    </PainelShell>
  );
}

function CabecalhoPi({ pi }) {
  return (
    <div className="text-sm font-semibold leading-snug">
      <span className="font-mono text-cyan">{pi?.codigo || "?"}</span> <span className="text-muteddim font-normal">·</span> {pi?.cliente || "?"}
      {pi?.projeto && <> <span className="text-muteddim font-normal">·</span> <span className="text-muted font-normal">{pi.projeto}</span></>}
    </div>
  );
}

// Aprovar · Editar · Reprovar — sempre visíveis. Reprovar abre o campo de motivo (obrigatório).
function BotoesDecisao({ onAprovar, onEditar, onReprovar, habilitado = true, aprovarBloqueado = null, rotuloAprovar = "Aprovar", dica }) {
  const [reprovando, setReprovando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const executar = async (fn) => { setOcupado(true); await fn(); setOcupado(false); };
  const bloqueio = !habilitado ? "Seu perfil não pode decidir este item." : null;

  if (reprovando) {
    return (
      <div className="mt-3 rounded-xl border border-red/30 bg-red/5 p-3 flex flex-col gap-2 animar-fade">
        <label className="rotulo !text-red !mb-0" htmlFor="motivo-reprovacao">Explique o motivo da reprovação</label>
        <textarea id="motivo-reprovacao" autoFocus rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)}
          placeholder="O solicitante receberá esta explicação na notificação." className="input" />
        <div className="flex gap-2 justify-end">
          <button onClick={() => { setReprovando(false); setMotivo(""); }} className="btn btn-fantasma" disabled={ocupado}>Cancelar</button>
          <button onClick={() => executar(() => onReprovar(motivo.trim()))} disabled={!motivo.trim() || ocupado} className="btn btn-perigo">
            {ocupado ? <><Spinner /> Enviando...</> : "Confirmar reprovação"}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-3">
      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => executar(onAprovar)} disabled={ocupado || !!bloqueio || !!aprovarBloqueado} title={bloqueio || aprovarBloqueado || ""} className="btn btn-sucesso">
          {ocupado ? <Spinner /> : <Icone nome="aprovar" className="w-4 h-4" strokeWidth={2.4} />} {rotuloAprovar}
        </button>
        <button onClick={onEditar} disabled={ocupado || !!bloqueio} title={bloqueio || ""} className="btn btn-contorno">
          <Icone nome="editar" className="w-4 h-4" /> Editar
        </button>
        <button onClick={() => setReprovando(true)} disabled={ocupado || !!bloqueio} title={bloqueio || ""} className="btn btn-contorno-perigo">
          <Icone nome="fechar" className="w-4 h-4" /> Reprovar
        </button>
      </div>
      {(bloqueio || aprovarBloqueado || dica) && <div className="text-xs text-muteddim mt-1.5">{bloqueio || aprovarBloqueado || dica}</div>}
    </div>
  );
}

function SeloEditado({ nome }) {
  return nome ? <span className="selo bg-cyan/10 text-cyan">editado por {nome}</span> : null;
}

function RdoCard({ rdo, pi, lider, editadoPor, ocorrencias, editavel, onAprovar, onReprovar, onEditar }) {
  const [aplicar, setAplicar] = useState(true);
  const [verAssinatura, setVerAssinatura] = useState(false);
  return (
    <div className="cartao p-4 md:p-5">
      <div className="flex justify-between items-start gap-3 mb-3">
        <div className="min-w-0">
          <CabecalhoPi pi={pi} />
          <div className="text-xs text-muted mt-0.5">{formatarData(rdo.data)} · por <strong>{lider}</strong> · enviado {formatarDataHora(rdo.created_at)}</div>
        </div>
        <div className="flex flex-wrap justify-end gap-1 shrink-0">
          <SeloEditado nome={editadoPor} />
          <span className="selo bg-amber/10 text-amber">Pendente</span>
        </div>
      </div>
      <div className="flex flex-col divide-y divide-line/70 rounded-lg border border-line/70">
        {(rdo.atividades || []).map((a, i) => {
          const st = STATUS_ETAPA[a.status] || STATUS_ETAPA.nao_iniciada;
          return (
            <div key={i} className="flex justify-between items-center gap-2 text-sm px-3 py-2">
              <span className="truncate">{a.nome}</span>
              <span className={`selo shrink-0 ${st.classe}`}>{st.rotulo}{a.status === "em_andamento" ? ` · ${a.percentual}%` : ""}</span>
            </div>
          );
        })}
        {(rdo.atividades || []).length === 0 && <div className="text-sm text-muteddim px-3 py-2">Sem atividades registradas.</div>}
      </div>
      {ocorrencias.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          <div className="titulo-secao">Ocorrências ({ocorrencias.length})</div>
          {ocorrencias.map((o) => (
            <div key={o.id} className="text-sm bg-amber/5 border border-amber/20 rounded-lg px-3 py-2">
              <span className="text-amber font-semibold">{o.categoria}</span>{o.descricao ? ` — ${o.descricao}` : ""}
              {o.midias?.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {o.midias.map((m) => (
                    <a key={m.url} href={m.url} target="_blank" rel="noreferrer" className="block">
                      {m.tipo === "foto"
                        ? <img src={m.url} alt={m.nome} className="w-14 h-14 object-cover rounded-md border border-line" />
                        : <span className="w-14 h-14 rounded-md border border-line bg-white flex items-center justify-center text-xs text-muted">vídeo</span>}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {rdo.assinatura_cliente && (
        <div className="mt-3 text-sm">
          {rdo.assinatura_cliente_imagem ? (
            <button onClick={() => setVerAssinatura((v) => !v)} className="text-cyan font-semibold hover:underline py-2 text-left">
              ✓ Assinado pelo cliente — {verAssinatura ? "ocultar" : "ver assinatura"}
            </button>
          ) : <span className="text-muted">Assinatura do cliente solicitada</span>}
          {verAssinatura && <img src={rdo.assinatura_cliente_imagem} alt="Assinatura do cliente" className="mt-2 max-h-32 border border-line rounded-lg bg-white" />}
        </div>
      )}
      <label className="flex items-center gap-2 text-sm text-muted mt-3 cursor-pointer select-none">
        <input type="checkbox" className="w-4 h-4 accent-cyan" checked={aplicar} disabled={!editavel} onChange={(e) => setAplicar(e.target.checked)} />
        Atualizar o andamento das etapas no cronograma ao aprovar
      </label>
      <BotoesDecisao habilitado={editavel} onAprovar={() => onAprovar(aplicar)} onEditar={onEditar} onReprovar={onReprovar} />
    </div>
  );
}

function HorasCard({ registro, pi, pessoa, editadoPor, editavel, onAprovar, onReprovar, onEditar }) {
  const total = Number(registro.horas_totais) || 0;
  const emAberto = registro.entrada && !registro.saida;
  const [normais, setNormais] = useState(total);
  const [extras, setExtras] = useState(0);
  const soma = Math.round((Number(normais) + Number(extras)) * 100) / 100;
  const diverge = !emAberto && Math.abs(soma - total) > 0.01;
  return (
    <div className="cartao p-4 flex flex-col">
      <div className="flex justify-between items-start gap-2 mb-2">
        <div className="min-w-0">
          <div className="font-semibold text-sm">{pessoa}</div>
          <CabecalhoPi pi={pi} />
        </div>
        <div className="flex flex-wrap justify-end gap-1 shrink-0">
          <SeloEditado nome={editadoPor} />
          <span className={`selo ${emAberto ? "bg-cyan/10 text-cyan" : "bg-amber/10 text-amber"}`}>{emAberto ? "Em andamento" : "Pendente"}</span>
        </div>
      </div>
      <div className="flex items-baseline justify-between text-sm text-muted mb-3">
        <span>{formatarData(registro.data)}{registro.entrada ? ` · ${horaCurta(registro.entrada)} → ${registro.saida ? horaCurta(registro.saida) : "…"}` : ""}</span>
        <strong className="font-head text-xl text-textmain">{emAberto ? "—" : formatarHoras(total)}</strong>
      </div>
      {!emAberto && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="rotulo">Normais</span>
              <input type="number" step="0.5" min="0" value={normais} disabled={!editavel}
                onChange={(e) => { const v = Math.max(0, Number(e.target.value)); setNormais(v); setExtras(Math.max(0, Math.round((total - v) * 100) / 100)); }} className="input" />
            </label>
            <label className="block">
              <span className="rotulo">Extras</span>
              <input type="number" step="0.5" min="0" value={extras} disabled={!editavel}
                onChange={(e) => { const v = Math.max(0, Number(e.target.value)); setExtras(v); setNormais(Math.max(0, Math.round((total - v) * 100) / 100)); }} className="input" />
            </label>
          </div>
          {diverge && <div className="text-xs text-amber mt-1.5">Normais + extras ({soma}h) diferente do total lançado ({total}h).</div>}
        </>
      )}
      <div className="mt-auto">
        <BotoesDecisao habilitado={editavel}
          aprovarBloqueado={emAberto ? "Aguardando o check-out — use Editar para informar a saída." : null}
          onAprovar={() => onAprovar(registro, Number(normais), Number(extras))} onEditar={onEditar} onReprovar={onReprovar} />
      </div>
    </div>
  );
}

function SolicitacaoCard({ s, etapa, pi, solicitante, editadoPor, editavel, podeDecidir, finalizaDireto, onDecidir, onEditar }) {
  const st = STATUS_SOLICITACAO[s.status] || { rotulo: s.status, classe: "bg-panel text-muted" };
  const ehData = s.campo_alterado === "data_prevista_inicio" || s.campo_alterado === "data_prevista_fim";
  const mostrar = (v) => (!v ? "—" : ehData && /^\d{4}-\d{2}-\d{2}/.test(v) ? formatarData(v) : v);
  const aguardando = s.status === "pendente_coordenador" ? "Aguardando decisão do Coordenador." : "Aguardando decisão do Gerente.";
  return (
    <div className="cartao p-4 md:p-5">
      <div className="flex justify-between items-start gap-3 mb-2">
        <div className="min-w-0">
          <CabecalhoPi pi={pi} />
          <div className="font-semibold mt-1">{etapa?.nome || "Etapa removida"}</div>
          <div className="text-xs text-muted">por <strong>{solicitante}</strong> · {formatarDataHora(s.created_at)}</div>
        </div>
        <div className="flex flex-wrap justify-end gap-1 shrink-0">
          <SeloEditado nome={editadoPor} />
          <span className={`selo ${st.classe}`}>{st.rotulo}</span>
        </div>
      </div>
      <div className="rounded-lg bg-panel px-3 py-2.5 text-sm">
        <span className="text-muted">{ROTULO_CAMPO[s.campo_alterado] || s.campo_alterado}:</span>{" "}
        <span className="line-through text-muteddim">{mostrar(s.valor_atual)}</span> → <strong>{mostrar(s.valor_proposto)}</strong>
      </div>
      <div className="text-sm text-muted mt-2"><span className="font-semibold text-textmain">Justificativa:</span> {s.justificativa}</div>
      {s.motivo_coordenador && <div className="text-xs text-muted mt-1">Coordenador: {s.motivo_coordenador}</div>}
      <BotoesDecisao habilitado={editavel && podeDecidir}
        rotuloAprovar={s.status === "pendente_coordenador" && !finalizaDireto ? "Aprovar" : "Aprovar e aplicar"}
        dica={s.status === "pendente_coordenador" && !finalizaDireto ? "Ao aprovar, segue para o Gerente." : null}
        onAprovar={() => onDecidir(true)} onEditar={onEditar} onReprovar={(m) => onDecidir(false, m)} />
      {editavel && !podeDecidir && <div className="text-xs text-muteddim mt-1">{aguardando}</div>}
    </div>
  );
}
