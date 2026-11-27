"use client";

import { useState } from "react";
import { useTabela, registrarLog } from "../../lib/dados";
import { useAuth, pode } from "../../lib/AuthContext";
import { ehGerencia } from "../../lib/permissoes";
import { supabase } from "../../lib/supabase";
import { formatarData, formatarDataHora, horaCurta, formatarHoras } from "../../lib/datas";
import { STATUS_ETAPA, STATUS_SOLICITACAO } from "../../lib/constantes";
import { notificar } from "../../lib/notificacoes";
import { repartirNormaisExtras } from "../../lib/horas";
import { gerarPdfRdoSeguro } from "../../lib/pdfRdo";
import { decidirOcorrencia } from "../../lib/edicoes";
import { useToast } from "../../lib/Toast";
import PainelShell from "../../components/PainelShell";
import { EditorRdo, EditorHoras, EditorSolicitacao } from "../../components/Editores";
import { ResumoRdoTecnico } from "../../components/RdoTecnico";
import { CabecalhoPagina, EstadoVazio, Esqueleto, Aviso, Spinner } from "../../components/ui";
import Icone from "../../components/Icone";
import CartaoOcorrencia from "../../components/CartaoOcorrencia";
import AcoesMaster from "../../components/AcoesMaster";
import { AbasAprovacoes } from "../../components/ui";
import { excluirRdo, excluirHoras, excluirOcorrencia, excluirSolicitacao } from "../../lib/exclusoes";

const ROTULO_CAMPO = { data_prevista_inicio: "Data de início", data_prevista_fim: "Data de término", nome: "Nome da etapa", outro: "Outro" };
const CAMPOS_APLICAVEIS = ["data_prevista_inicio", "data_prevista_fim", "nome"];

export default function AprovacoesPage() {
  const { usuario } = useAuth();
  const { avisar } = useToast();
  // cada aba confere a sua permissão (matriz de permissões)
  const podeRdo = pode(usuario, "rdo.aprovar"), podeHoras = pode(usuario, "horas.aprovar");
  const podeOcorrencia = pode(usuario, "ocorrencia.aprovar"), podeSolicitacao = pode(usuario, "cronograma.aprovar");
  const editavel = podeRdo || podeHoras || podeOcorrencia || podeSolicitacao;
  const [aba, setAba] = useState("rdos");
  const [editando, setEditando] = useState(null); // { tipo: "rdo" | "horas" | "solicitacao", item }
  const { dados: pis } = useTabela("pis", { order: { coluna: "codigo" } });
  const { dados: usuarios } = useTabela("usuarios");
  const { dados: etapas, recarregar: recarregarEtapas } = useTabela("etapas");
  const { dados: ocorrencias, recarregar: recarregarOcorrencias } = useTabela("ocorrencias");
  const { dados: rdosPendentes, carregando: c1, recarregar: recarregarRdos } = useTabela("rdos", { order: { coluna: "created_at" }, filtro: [["status", "pendente"]] });
  const { dados: horasPendentes, carregando: c2, recarregar: recarregarHoras } = useTabela("apontamentos_horas", { order: { coluna: "created_at" }, filtro: [["status", "pendente"]] });
  const { dados: solicitacoes, carregando: c3, recarregar: recarregarSolicitacoes } = useTabela("solicitacoes_alteracao_cronograma", { order: { coluna: "created_at" } });
  const ocorrenciasPendentes = ocorrencias.filter((o) => o.status === "pendente" && !o.rdo_id);
  // ocorrências registradas dentro do RDO seguem a decisão do RDO
  const decidirOcorrenciasDoRdo = (rdo, status, motivo) => supabase.from("ocorrencias")
    .update({ status, decidido_por: usuario.id, decidido_em: agora(), motivo_rejeicao: motivo || null }).eq("rdo_id", rdo.id)
    .then(() => {}, () => {});
  const solicitacoesPendentes = solicitacoes.filter((s) => s.status === "pendente_coordenador" || s.status === "pendente_gerente");

  const piInfo = (id) => pis.find((p) => p.id === id);
  const nomeUsuario = (id) => usuarios.find((u) => u.id === id)?.nome || "—";
  // horas lançadas para um recurso (equipamento, veículo ou mão de obra sem usuário): mostra o recurso e quem lançou
  const { dados: recursosH } = useTabela("recursos", { select: "id,nome" });
  const nomeHoras = (h) => {
    const nome = h.usuario_id ? nomeUsuario(h.usuario_id) : recursosH.find((r) => r.id === h.recurso_id)?.nome || "Recurso";
    return h.lancado_por && h.lancado_por !== h.usuario_id ? `${nome} (lançado por ${nomeUsuario(h.lancado_por)})` : nome;
  };
  const agora = () => new Date().toISOString();

  // ---------------- RDO ----------------
  const aprovarRdo = async (rdo, aplicarNoCronograma, sil = false) => {
    const { error } = await supabase.from("rdos").update({ status: "aprovado", decidido_por: usuario.id, decidido_em: agora() }).eq("id", rdo.id);
    if (error) { avisar(`Erro ao aprovar: ${error.message}`, "erro", 6000); return false; }
    let aplicadas = 0;
    if (aplicarNoCronograma) {
      const mudancas = (rdo.atividades || []).filter((a) => {
        const e = etapas.find((x) => x.id === a.etapa_id);
        // macro com sub-etapas é calculada: RDOs antigos que traziam a macro não podem sobrescrevê-la
        if (e && etapas.some((s) => s.parent_etapa_id === e.id)) return false;
        return e && (e.status !== a.status || Number(e.percentual || 0) !== Number(a.percentual || 0));
      });
      const resultados = await Promise.all(mudancas.map((a) =>
        supabase.from("etapas").update({ status: a.status, percentual: a.status === "concluida" ? 100 : Number(a.percentual) || 0 }).eq("id", a.etapa_id)));
      aplicadas = resultados.filter((r) => !r.error).length;
    }
    await decidirOcorrenciasDoRdo(rdo, "aprovada");
    const pi = piInfo(rdo.pi_id);
    await registrarLog(usuario, "Aprovou RDO", `${pi?.codigo} — ${rdo.data}${aplicadas ? ` · ${aplicadas} etapa(s) atualizada(s)` : ""}`);
    await notificar(rdo.lider_id, `RDO aprovado — ${pi?.codigo} (${formatarData(rdo.data)})`, `Aprovado por ${usuario.nome}.`, "/lider");
    gerarPdfRdoSeguro(rdo.id, avisar); // o PDF passa a mostrar "APROVADO"
    if (sil) return true;
    recarregarRdos(); if (aplicadas) recarregarEtapas();
    avisar(aplicadas ? `RDO aprovado · ${aplicadas} etapa(s) atualizada(s) no cronograma.` : "RDO aprovado.");
    return true;
  };
  const reprovarRdo = async (rdo, motivo, sil = false) => {
    const { error } = await supabase.from("rdos").update({ status: "rejeitado", decidido_por: usuario.id, decidido_em: agora(), motivo_rejeicao: motivo }).eq("id", rdo.id);
    if (error) { avisar(`Erro ao reprovar: ${error.message}`, "erro", 6000); return false; }
    await decidirOcorrenciasDoRdo(rdo, "rejeitada", motivo);
    const pi = piInfo(rdo.pi_id);
    await registrarLog(usuario, "Reprovou RDO", `${pi?.codigo} · motivo: ${motivo}`);
    await notificar(rdo.lider_id, `RDO reprovado — ${pi?.codigo} (${formatarData(rdo.data)})`, `Reprovado por ${usuario.nome}.\nMotivo: ${motivo}`, "/lider/rdo");
    gerarPdfRdoSeguro(rdo.id, avisar);
    if (sil) return true;
    recarregarRdos();
    avisar("RDO reprovado — o responsável foi notificado.", "info");
    return true;
  };

  // ---------------- Horas ----------------
  const aprovarHoras = async (h, normais, extras, sil = false) => {
    const { error } = await supabase.from("apontamentos_horas").update({
      status: "aprovado", decidido_por: usuario.id, decidido_em: agora(), horas_normais: normais, horas_extras: extras,
    }).eq("id", h.id);
    if (error) { avisar(`Erro ao aprovar: ${error.message}`, "erro", 6000); return false; }
    await registrarLog(usuario, "Aprovou horas", `${nomeHoras(h)} · ${piInfo(h.pi_id)?.codigo} — ${normais}h normais + ${extras}h extras`);
    await notificar(h.usuario_id, `Horas aprovadas — ${formatarData(h.data)}`, `${piInfo(h.pi_id)?.codigo}: ${normais}h normais${extras ? ` + ${extras}h extras` : ""}. Aprovado por ${usuario.nome}.`);
    if (sil) return true;
    recarregarHoras();
    avisar("Horas aprovadas.");
    return true;
  };
  const reprovarHoras = async (h, motivo, sil = false) => {
    const { error } = await supabase.from("apontamentos_horas").update({ status: "rejeitado", decidido_por: usuario.id, decidido_em: agora(), motivo_rejeicao: motivo }).eq("id", h.id);
    if (error) { avisar(`Erro ao reprovar: ${error.message}`, "erro", 6000); return false; }
    await registrarLog(usuario, "Reprovou horas", `${nomeHoras(h)} · ${piInfo(h.pi_id)?.codigo} · motivo: ${motivo}`);
    await notificar(h.usuario_id, `Horas reprovadas — ${formatarData(h.data)}`, `${piInfo(h.pi_id)?.codigo}. Reprovado por ${usuario.nome}.\nMotivo: ${motivo}`);
    if (sil) return true;
    recarregarHoras();
    avisar("Horas reprovadas — a pessoa foi notificada.", "info");
    return true;
  };

  // ---------------- Horas: "dia dividido" do líder (vários PIs, um grupo) ----------------
  // agrupa os pendentes: registros com o mesmo grupo_lancamento viram um cartão só
  const cartoesHoras = (() => {
    const grupos = new Map(), lista = [];
    horasPendentes.forEach((h) => {
      if (!h.grupo_lancamento) { lista.push({ chave: h.id, itens: [h] }); return; }
      if (!grupos.has(h.grupo_lancamento)) { const g = { chave: h.grupo_lancamento, itens: [] }; grupos.set(h.grupo_lancamento, g); lista.push(g); }
      grupos.get(h.grupo_lancamento).itens.push(h);
    });
    return lista;
  })();
  // aprova o dia inteiro: grava as horas de cada PI (se ajustadas) e reparte normais/extras
  const aprovarGrupo = async (itens, horasPorPi, normaisDia, sil = false) => {
    const partes = repartirNormaisExtras(horasPorPi, normaisDia);
    for (let i = 0; i < itens.length; i++) {
      const { error } = await supabase.from("apontamentos_horas").update({
        status: "aprovado", decidido_por: usuario.id, decidido_em: agora(),
        horas_totais: horasPorPi[i], horas_normais: partes[i].normais, horas_extras: partes[i].extras,
      }).eq("id", itens[i].id);
      if (error) { avisar(`Erro ao aprovar: ${error.message}`, "erro", 6000); recarregarHoras(); return false; }
    }
    const total = horasPorPi.reduce((s, h) => s + h, 0);
    const detalhe = itens.map((h, i) => `${piInfo(h.pi_id)?.codigo}: ${horasPorPi[i]}h`).join(" · ");
    await registrarLog(usuario, "Aprovou horas (dia dividido)", `${nomeUsuario(itens[0].usuario_id)} · ${formatarData(itens[0].data)} · ${total}h (${normaisDia}h normais) · ${detalhe}`);
    await notificar(itens[0].usuario_id, `Horas aprovadas — ${formatarData(itens[0].data)}`, `${total}h em ${itens.length} obras (${detalhe}). Aprovado por ${usuario.nome}.`);
    if (sil) return true;
    recarregarHoras();
    avisar(`Dia aprovado — ${itens.length} obras.`);
    return true;
  };
  const reprovarGrupo = async (itens, motivo, sil = false) => {
    const { error } = await supabase.from("apontamentos_horas").update({ status: "rejeitado", decidido_por: usuario.id, decidido_em: agora(), motivo_rejeicao: motivo })
      .in("id", itens.map((h) => h.id));
    if (error) { avisar(`Erro ao reprovar: ${error.message}`, "erro", 6000); return false; }
    await registrarLog(usuario, "Reprovou horas (dia dividido)", `${nomeUsuario(itens[0].usuario_id)} · ${formatarData(itens[0].data)} · ${itens.length} obras · motivo: ${motivo}`);
    await notificar(itens[0].usuario_id, `Horas reprovadas — ${formatarData(itens[0].data)}`, `Lançamento do dia em ${itens.length} obras. Reprovado por ${usuario.nome}.\nMotivo: ${motivo}`);
    if (sil) return true;
    recarregarHoras();
    avisar("Dia reprovado — a pessoa foi notificada.", "info");
    return true;
  };

  // ---------------- Solicitações ----------------
  // fluxo em duas fases (Coordenador → Gerente); quem tem a permissão e não é
  // coordenador/gerente (ex: Master ou exceção por usuário) decide qualquer fase
  const podeDecidirSolicitacao = (s) => podeSolicitacao && (
    usuario?.perfil === "master" || !(usuario?.perfil === "coordenador" || ehGerencia(usuario?.perfil)) ||
    (s.status === "pendente_coordenador" && usuario?.perfil === "coordenador") ||
    // Diretor, Gerente de Obras, de Equipes e de Processo decidem a fase do Gerente
    (s.status === "pendente_gerente" && ehGerencia(usuario?.perfil)));

  const decidirSolicitacao = async (s, aprovar, motivo, sil = false) => {
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
        avisar("O valor proposto não é uma data válida — ajuste a etapa manualmente em Configurar Cronograma.", "erro", 7000);
      } else {
        const { error } = await supabase.from("etapas").update({ [s.campo_alterado]: valor }).eq("id", etapa.id);
        if (error) { avisar(`Não foi possível aplicar na etapa: ${error.message}`, "erro", 6000); return false; }
      }
    }
    const { error } = await supabase.from("solicitacoes_alteracao_cronograma").update(patch).eq("id", s.id);
    if (error) { avisar(`Erro: ${error.message}`, "erro", 6000); return false; }
    const oQue = `${etapa?.nome || "Etapa"} — ${ROTULO_CAMPO[s.campo_alterado] || s.campo_alterado}`;
    await registrarLog(usuario, aprovar ? "Aprovou solicitação de alteração" : "Reprovou solicitação de alteração", `${oQue}${motivo ? ` · ${motivo}` : ""}`);
    await notificar(s.solicitado_por,
      !aprovar ? `Solicitação reprovada — ${etapa?.nome || "etapa"}` : finaliza ? `Solicitação aprovada — ${etapa?.nome || "etapa"}` : `Solicitação aprovada pelo Coordenador — ${etapa?.nome || "etapa"}`,
      !aprovar ? `${oQue}. Reprovado por ${usuario.nome}.\nMotivo: ${motivo}` : finaliza ? `${oQue}. A alteração foi aplicada ao cronograma.` : `${oQue}. Agora aguarda o Gerente.`,
      "/lider/solicitar");
    if (sil) return true;
    recarregarSolicitacoes(); recarregarEtapas();
    avisar(!aprovar ? "Solicitação reprovada — o solicitante foi notificado." : finaliza ? "Solicitação aprovada e aplicada ao cronograma." : "Aprovada — segue para o Gerente.");
  };

  // ---------------- seleção em lote (por aba) ----------------
  const [selecao, setSelecao] = useState({}); // { aba: Set de chaves }
  const [loteOcupado, setLoteOcupado] = useState("");
  const [motivoLote, setMotivoLote] = useState(null); // null = fechado; texto = recusando
  // itens selecionáveis de cada aba: chave + como aprovar/recusar
  const itensLote = {
    rdos: podeRdo ? rdosPendentes.map((rdo) => ({ chave: rdo.id, aprovar: () => aprovarRdo(rdo, true, true), recusar: (m) => reprovarRdo(rdo, m, true) })) : [],
    horas: podeHoras ? cartoesHoras.map(({ chave, itens }) => {
      const aberto = itens.some((h) => h.entrada && !h.saida);
      if (itens.length > 1) {
        const hs = itens.map((h) => Number(h.horas_totais) || 0);
        return { chave, bloqueado: aberto, aprovar: () => aprovarGrupo(itens, hs, Math.round(hs.reduce((s, x) => s + x, 0) * 100) / 100, true), recusar: (m) => reprovarGrupo(itens, m, true) };
      }
      const h = itens[0], total = Number(h.horas_totais) || 0, sug = h.horas_normais != null;
      return { chave, bloqueado: aberto, aprovar: () => aprovarHoras(h, sug ? Number(h.horas_normais) : total, sug ? Number(h.horas_extras) || 0 : 0, true), recusar: (m) => reprovarHoras(h, m, true) };
    }) : [],
    ocorrencias: podeOcorrencia ? ocorrenciasPendentes.map((o) => ({ chave: o.id,
      aprovar: async () => !(await decidirOcorrencia({ oc: o, aprovar: true, motivo: "", pis, usuario, avisar: () => {} }))?.erro,
      recusar: async (m) => !(await decidirOcorrencia({ oc: o, aprovar: false, motivo: m, pis, usuario, avisar: () => {} }))?.erro })) : [],
    solicitacoes: solicitacoesPendentes.filter((s) => podeDecidirSolicitacao(s)).map((s) => ({ chave: s.id, aprovar: () => decidirSolicitacao(s, true, "", true), recusar: (m) => decidirSolicitacao(s, false, m, true) })),
  };
  const selAba = selecao[aba] || new Set();
  const disponiveisLote = itensLote[aba] || [];
  const selecionados = disponiveisLote.filter((i) => selAba.has(i.chave));
  const marcar = (chave) => setSelecao((p) => { const s = new Set(p[aba] || []); s.has(chave) ? s.delete(chave) : s.add(chave); return { ...p, [aba]: s }; });
  const marcarTodos = () => setSelecao((p) => ({ ...p, [aba]: new Set(disponiveisLote.filter((i) => !i.bloqueado).map((i) => i.chave)) }));
  const desmarcarTodos = () => setSelecao((p) => ({ ...p, [aba]: new Set() }));
  const recarregarAba = () => { recarregarRdos(); recarregarHoras(); recarregarOcorrencias(); recarregarSolicitacoes(); recarregarEtapas(); };
  const executarLote = async (aprovar, motivo = "") => {
    const lista = selecionados.filter((i) => !(aprovar && i.bloqueado));
    const pulados = selecionados.length - lista.length;
    if (!lista.length) { avisar("Nenhum item selecionado pode ser aprovado (horas com check-in em aberto precisam de check-out).", "erro", 6000); return; }
    setLoteOcupado(aprovar ? "Aprovando" : "Recusando");
    let ok = 0;
    for (const i of lista) { if (await (aprovar ? i.aprovar() : i.recusar(motivo))) ok++; }
    await registrarLog(usuario, aprovar ? "Aprovou em lote" : "Recusou em lote", `${abas.find(([k]) => k === aba)?.[1]}: ${ok} de ${lista.length}${!aprovar ? ` · motivo: ${motivo}` : ""}`);
    setLoteOcupado(""); setMotivoLote(null); desmarcarTodos(); recarregarAba();
    const falhas = lista.length - ok;
    avisar(`${ok} item(ns) ${aprovar ? "aprovado(s)" : "recusado(s)"}${falhas ? ` · ${falhas} com erro` : ""}${pulados ? ` · ${pulados} pulado(s) (check-in em aberto)` : ""}.`, falhas ? "erro" : aprovar ? "sucesso" : "info", 7000);
  };
  // caixa de seleção ao lado de cada cartão
  const comCaixa = (chave, children, className = "") => {
    const item = disponiveisLote.find((i) => i.chave === chave);
    if (!item) return <div key={chave} className={className}>{children}</div>;
    return (
      <div key={chave} className={`flex gap-2 items-start ${className}`}>
        <input type="checkbox" checked={selAba.has(chave)} onChange={() => marcar(chave)} disabled={!!loteOcupado}
          className="mt-4 w-5 h-5 accent-cyan shrink-0 cursor-pointer" aria-label="Selecionar para aprovar ou recusar em lote"
          title={item.bloqueado ? "Check-in em aberto: pode ser recusado, mas só é aprovado depois do check-out" : "Selecionar"} />
        <div className={`flex-1 min-w-0 rounded-xl ${selAba.has(chave) ? "ring-2 ring-cyan/50" : ""}`}>{children}</div>
      </div>
    );
  };

  const abas = [
    ["rdos", "RDOs", rdosPendentes.length],
    ["horas", "Horas", horasPendentes.length],
    ["ocorrencias", "Ocorrências", ocorrenciasPendentes.length],
    ["solicitacoes", "Solicitações", solicitacoesPendentes.length],
  ];

  return (
    <PainelShell>
      <div className="p-4 md:p-8">
        <CabecalhoPagina titulo="Aprovações" subtitulo="RDOs, horas e alterações de cronograma aguardando aprovação." />
        <AbasAprovacoes qtdPendentes={abas.reduce((s, [, , n]) => s + n, 0)} />
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

        {/* ações em lote: marcar, aprovar e recusar vários itens de uma vez */}
        {disponiveisLote.length > 0 && (
          <div className="cartao p-3 mb-4 flex flex-wrap items-center gap-2 sticky top-2 z-20">
            <span className="text-sm font-semibold mr-1">{selecionados.length} de {disponiveisLote.length} selecionado(s)</span>
            <button onClick={marcarTodos} disabled={!!loteOcupado} className="btn btn-contorno btn-sm">Marcar todos</button>
            <button onClick={desmarcarTodos} disabled={!!loteOcupado || !selecionados.length} className="btn btn-fantasma btn-sm">Desmarcar todos</button>
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              {motivoLote !== null ? (<>
                <input value={motivoLote} onChange={(e) => setMotivoLote(e.target.value)} autoFocus placeholder="Motivo da recusa (obrigatório)" className="input !py-1.5 !w-64 max-w-full" />
                <button onClick={() => setMotivoLote(null)} disabled={!!loteOcupado} className="btn btn-fantasma btn-sm">Cancelar</button>
                <button onClick={() => executarLote(false, motivoLote.trim())} disabled={!motivoLote.trim() || !!loteOcupado || !selecionados.length} className="btn btn-perigo btn-sm">
                  {loteOcupado === "Recusando" ? <><Spinner /> Recusando...</> : `Confirmar recusa (${selecionados.length})`}
                </button>
              </>) : (<>
                <button onClick={() => setMotivoLote("")} disabled={!!loteOcupado || !selecionados.length} className="btn btn-perigo btn-sm">Recusar ({selecionados.length})</button>
                <button onClick={() => executarLote(true)} disabled={!!loteOcupado || !selecionados.length} className="btn btn-sucesso btn-sm">
                  {loteOcupado === "Aprovando" ? <><Spinner /> Aprovando...</> : `Aprovar (${selecionados.length})`}
                </button>
              </>)}
            </div>
            {aba === "horas" && <div className="w-full texto-apoio">Em lote, as horas são aprovadas como lançadas (sem extras, ou com a sugestão de normais/extras do lançamento). Para ajustar, use o botão do cartão.</div>}
            {aba === "rdos" && <div className="w-full texto-apoio">Em lote, os RDOs aprovados também atualizam o andamento das etapas no cronograma.</div>}
          </div>
        )}

        {aba === "rdos" && (
          <div className="flex flex-col gap-3">
            {c1 && <Esqueleto linhas={2} altura={140} />}
            {!c1 && rdosPendentes.length === 0 && <EstadoVazio icone="aprovar" titulo="Tudo em dia" texto="Nenhum RDO aguardando aprovação." />}
            {rdosPendentes.map((rdo) => comCaixa(rdo.id,
              <RdoCard key={`${rdo.id}-${rdo.editado_em || ""}`} rdo={rdo} pi={piInfo(rdo.pi_id)} lider={nomeUsuario(rdo.lider_id)} editavel={podeRdo}
                editadoPor={rdo.editado_por ? nomeUsuario(rdo.editado_por) : null}
                ocorrencias={ocorrencias.filter((o) => o.rdo_id === rdo.id)}
                onAprovar={(aplicar) => aprovarRdo(rdo, aplicar)} onReprovar={(m) => reprovarRdo(rdo, m)}
                onEditar={() => setEditando({ tipo: "rdo", item: rdo })}
                rodapeMaster={<AcoesMaster permissaoExcluir="rdo.excluir" excluir={(motivo) => excluirRdo({ rdo, pi: piInfo(rdo.pi_id), usuario, motivo })} onExcluido={recarregarRdos}
                  tituloExclusao="Excluir RDO" descricaoExclusao="O RDO, as ocorrências registradas nele e o PDF serão apagados." />} />
            ))}
          </div>
        )}

        {aba === "horas" && (
          <div className="flex flex-col gap-3">
            {c2 && <Esqueleto linhas={2} altura={120} />}
            {!c2 && horasPendentes.length === 0 && <EstadoVazio icone="relogio" titulo="Tudo em dia" texto="Nenhum registro de horas pendente." />}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {cartoesHoras.map(({ chave, itens }) => itens.length > 1 ? comCaixa(chave,
                <GrupoHorasCard key={`${chave}-${itens.map((h) => h.horas_totais).join("|")}`} itens={itens} piInfo={piInfo} pessoa={nomeHoras(itens[0])}
                  editavel={podeHoras} onAprovar={(a, b, c) => aprovarGrupo(a, b, c)} onReprovar={(m) => reprovarGrupo(itens, m)} />, "md:col-span-2"
              ) : itens.map((h) => comCaixa(chave,
                // a chave inclui o total: quando o check-out ou uma edição chega, o card reinicia os campos com o valor novo
                <HorasCard key={`${h.id}-${h.horas_totais}`} registro={h} pi={piInfo(h.pi_id)} pessoa={nomeHoras(h)} editavel={podeHoras}
                  editadoPor={h.editado_por ? nomeUsuario(h.editado_por) : null}
                  onAprovar={aprovarHoras} onReprovar={(m) => reprovarHoras(h, m)} onEditar={() => setEditando({ tipo: "horas", item: h })}
                  rodapeMaster={<AcoesMaster permissaoExcluir="horas.excluir" excluir={(motivo) => excluirHoras({ registro: h, pi: piInfo(h.pi_id), pessoa: usuarios.find((u) => u.id === h.usuario_id), usuario, motivo })}
                    onExcluido={recarregarHoras} tituloExclusao="Excluir lançamento de horas" descricaoExclusao="O lançamento de horas será apagado." />} />
              )))}
            </div>
          </div>
        )}

        {aba === "ocorrencias" && (
          <div className="flex flex-col gap-3">
            {ocorrenciasPendentes.length === 0 && <EstadoVazio icone="alerta" titulo="Nenhuma ocorrência pendente" texto="Ocorrências registradas pela equipe no celular aparecem aqui (as de dentro de um RDO são aprovadas junto com o RDO)." />}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ocorrenciasPendentes.map((o) => comCaixa(o.id,
                <CartaoOcorrencia key={`${o.id}-${o.editado_em || ""}`} oc={o} pi={piInfo(o.pi_id)} pis={pis} podeDecidir={podeOcorrencia}
                  pessoa={usuarios.find((u) => u.id === o.registrado_por)} onMudou={recarregarOcorrencias}
                  rodapeMaster={<AcoesMaster permissaoExcluir="ocorrencia.excluir" excluir={(motivo) => excluirOcorrencia({ oc: o, pi: piInfo(o.pi_id), usuario, motivo })} onExcluido={recarregarOcorrencias}
                    tituloExclusao="Excluir ocorrência" descricaoExclusao="A ocorrência e o PDF serão apagados." />} />
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
              return comCaixa(s.id,
                <SolicitacaoCard key={s.id} s={s} etapa={etapa} pi={piInfo(etapa?.pi_id)} solicitante={nomeUsuario(s.solicitado_por)}
                  editadoPor={s.editado_por ? nomeUsuario(s.editado_por) : null}
                  editavel={podeSolicitacao} podeDecidir={podeDecidirSolicitacao(s)} finalizaDireto={usuario?.perfil === "master"}
                  onDecidir={(aprovar, motivo) => decidirSolicitacao(s, aprovar, motivo)}
                  onEditar={() => setEditando({ tipo: "solicitacao", item: s })}
                  rodapeMaster={<AcoesMaster excluir={(motivo) => excluirSolicitacao({ s, etapa, usuario, motivo })} onExcluido={recarregarSolicitacoes}
                    tituloExclusao="Excluir solicitação" descricaoExclusao="A solicitação de alteração será apagada (o cronograma não muda)." />} />
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
      <div className={`grid ${onEditar ? "grid-cols-3" : "grid-cols-2"} gap-2`}>
        <button onClick={() => executar(onAprovar)} disabled={ocupado || !!bloqueio || !!aprovarBloqueado} title={bloqueio || aprovarBloqueado || ""} className="btn btn-sucesso">
          {ocupado ? <Spinner /> : <Icone nome="aprovar" className="w-4 h-4" strokeWidth={2.4} />} {rotuloAprovar}
        </button>
        {onEditar && <button onClick={onEditar} disabled={ocupado || !!bloqueio} title={bloqueio || ""} className="btn btn-contorno">
          <Icone nome="editar" className="w-4 h-4" /> Editar
        </button>}
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

function RdoCard({ rdo, pi, lider, editadoPor, ocorrencias, editavel, onAprovar, onReprovar, onEditar, rodapeMaster }) {
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
          {rdo.modelo === "tecnico" && <span className="selo bg-navy text-white">RDO Técnico</span>}
          <SeloEditado nome={editadoPor} />
          <span className="selo bg-amber/10 text-amber">Pendente</span>
        </div>
      </div>
      {rdo.modelo === "tecnico" ? <ResumoRdoTecnico tecnico={rdo.tecnico} /> : (
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
      )}
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
              ✓ Assinado por {rdo.assinatura_cliente_nome || "cliente"} — {verAssinatura ? "ocultar" : "ver assinatura"}
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
      {rodapeMaster && <div className="flex justify-end mt-3 pt-3 border-t border-line/70">{rodapeMaster}</div>}
    </div>
  );
}

// "Dia dividido" do líder: um cartão para o dia inteiro, com as horas de cada PI.
// Quem aprova pode ajustar a divisão (a soma tem de bater com o total do dia) e define
// normais/extras do DIA; o sistema reparte normais/extras entre os PIs na proporção das horas.
function GrupoHorasCard({ itens, piInfo, pessoa, editavel, onAprovar, onReprovar }) {
  const primeiro = itens[0];
  const totalDia = Math.round(itens.reduce((s, h) => s + (Number(h.horas_totais) || 0), 0) * 100) / 100;
  const [horas, setHoras] = useState(itens.map((h) => Number(h.horas_totais) || 0));
  const [normais, setNormais] = useState(totalDia);
  const soma = Math.round(horas.reduce((s, h) => s + (Number(h) || 0), 0) * 100) / 100;
  const somaBate = Math.abs(soma - totalDia) < 0.01;
  const extras = Math.max(0, Math.round((totalDia - Number(normais)) * 100) / 100);
  const normaisOk = Number(normais) >= 0 && Number(normais) <= totalDia;
  return (
    <div className="cartao p-4 flex flex-col md:col-span-2">
      <div className="flex justify-between items-start gap-2 mb-2">
        <div className="min-w-0">
          <div className="font-semibold text-sm">{pessoa}</div>
          <div className="text-sm text-muted">{formatarData(primeiro.data)}{primeiro.hora_inicio ? ` · ${String(primeiro.hora_inicio).slice(0, 5)} → ${String(primeiro.hora_fim || "").slice(0, 5)}` : ""} · almoço descontado</div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="selo bg-cyan/10 text-cyan">Dia dividido · {itens.length} obras</span>
          <strong className="font-head text-xl text-textmain">{formatarHoras(totalDia)}</strong>
        </div>
      </div>
      <div className="rounded-xl border border-line divide-y divide-line/70">
        {itens.map((h, i) => (
          <div key={h.id} className="flex items-center gap-3 px-3 py-2">
            <div className="flex-1 min-w-0"><CabecalhoPi pi={piInfo(h.pi_id)} /></div>
            <input type="number" step="0.25" min="0" value={horas[i]} disabled={!editavel} aria-label={`Horas no PI ${piInfo(h.pi_id)?.codigo}`}
              onChange={(e) => setHoras((p) => p.map((x, k) => (k === i ? Math.max(0, Number(e.target.value)) : x)))} className="input !w-24 !py-1.5 text-right" />
            <span className="text-sm text-muted w-4">h</span>
          </div>
        ))}
      </div>
      {!somaBate && <div className="text-xs text-red mt-1.5">A soma das obras ({formatarHoras(soma)}) precisa dar o total do dia ({formatarHoras(totalDia)}).</div>}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <label className="block">
          <span className="rotulo">Normais (dia)</span>
          <input type="number" step="0.5" min="0" max={totalDia} value={normais} disabled={!editavel} onChange={(e) => setNormais(e.target.value)} className="input" />
        </label>
        <div>
          <span className="rotulo">Extras (dia)</span>
          <div className="input bg-panel tabular-nums">{formatarHoras(extras)}</div>
        </div>
      </div>
      <div className="texto-apoio mt-1">Normais e extras são repartidos entre as obras na proporção das horas de cada uma.</div>
      <BotoesDecisao habilitado={editavel} rotuloAprovar="Aprovar dia"
        aprovarBloqueado={!somaBate ? "Ajuste a divisão para bater com o total do dia." : !normaisOk ? "Horas normais acima do total do dia." : null}
        onAprovar={() => onAprovar(itens, horas.map(Number), Number(normais))} onReprovar={onReprovar} />
    </div>
  );
}

function HorasCard({ registro, pi, pessoa, editadoPor, editavel, onAprovar, onReprovar, onEditar, rodapeMaster }) {
  const total = Number(registro.horas_totais) || 0;
  const emAberto = registro.entrada && !registro.saida;
  // lançamento para recursos já traz a sugestão de normais/extras; quem aprova confirma ou ajusta
  const sugerido = registro.status === "pendente" && registro.horas_normais != null;
  const [normais, setNormais] = useState(sugerido ? Number(registro.horas_normais) : total);
  const [extras, setExtras] = useState(sugerido ? Number(registro.horas_extras) || 0 : 0);
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
        {rodapeMaster && <div className="flex justify-end mt-3 pt-3 border-t border-line/70">{rodapeMaster}</div>}
      </div>
    </div>
  );
}

function SolicitacaoCard({ s, etapa, pi, solicitante, editadoPor, editavel, podeDecidir, finalizaDireto, onDecidir, onEditar, rodapeMaster }) {
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
      {rodapeMaster && <div className="flex justify-end mt-3 pt-3 border-t border-line/70">{rodapeMaster}</div>}
    </div>
  );
}
