"use client";

import { supabase } from "./supabase";
import { registrarLog } from "./dados";
import { notificar, descreverMudancas } from "./notificacoes";
import { gerarPdfRdoSeguro, gerarPdfOcorrenciaSeguro } from "./pdfRdo";
import { STATUS_ETAPA } from "./constantes";

// Edição de itens enviados para aprovação (RDO, horas, solicitação de alteração).
// - comoAprovador = true: aprovador (desktop) edita e o solicitante é notificado do que mudou
// - comoAprovador = false: o próprio solicitante (celular) edita — só enquanto está pendente;
//   a condição de status vai junto no UPDATE, então se o aprovador decidir antes, nada é gravado.

const fmtData = (v) => (v ? new Date(String(v).slice(0, 10) + "T00:00:00").toLocaleDateString("pt-BR") : "—");
const fmtHora = (v) => (v ? new Date(v).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—");
const fmtHoras = (v) => (v === null || v === undefined || v === "" ? "—" : `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}h`);

const JA_PROCESSADO = "Este item já foi processado pelo aprovador e não pode mais ser editado.";

async function atualizarCondicional(tabela, id, patch, condicaoStatus) {
  let q = supabase.from(tabela).update(patch).eq("id", id);
  if (condicaoStatus) q = q.eq("status", condicaoStatus);
  const { data, error } = await q.select();
  if (error) return { erro: error.message };
  if (!data || data.length === 0) return { erro: JA_PROCESSADO };
  return { linha: data[0] };
}

// ---------------- RDO ----------------
export async function salvarEdicaoRdo({ rdo, novo, ocorrencias, pis, usuario, comoAprovador, avisar }) {
  const agora = new Date().toISOString();
  const patch = { data: novo.data, atividades: novo.atividades, editado_por: usuario.id, editado_em: agora };
  const r = await atualizarCondicional("rdos", rdo.id, patch, comoAprovador ? null : "pendente");
  if (r.erro) return r;

  // ocorrências: alteradas, removidas e novas
  const { originais = [], editadas = [] } = ocorrencias || {};
  const idsMantidos = new Set(editadas.filter((o) => o.id).map((o) => o.id));
  const removidas = originais.filter((o) => !idsMantidos.has(o.id));
  const mudancasOc = [];
  for (const o of removidas) {
    await supabase.from("ocorrencias").delete().eq("id", o.id);
    mudancasOc.push(`Ocorrência removida: ${o.categoria}`);
  }
  for (const o of editadas) {
    if (o.id) {
      const antes = originais.find((x) => x.id === o.id);
      if (antes && (antes.categoria !== o.categoria || (antes.descricao || "") !== (o.descricao || "") || (antes.midias || []).length !== (o.midias || []).length)) {
        await supabase.from("ocorrencias").update({ categoria: o.categoria, descricao: o.descricao || null, midias: o.midias || [] }).eq("id", o.id);
        mudancasOc.push(`Ocorrência alterada: ${o.categoria}${o.descricao ? ` — ${o.descricao}` : ""}`);
      }
    } else {
      await supabase.from("ocorrencias").insert({ pi_id: rdo.pi_id, rdo_id: rdo.id, categoria: o.categoria, descricao: o.descricao || null, midias: o.midias || [], registrado_por: usuario.id });
      mudancasOc.push(`Ocorrência incluída: ${o.categoria}${o.descricao ? ` — ${o.descricao}` : ""}`);
    }
  }

  const mudancas = [
    ...descreverMudancas([{ chave: "data", rotulo: "Data", formatar: fmtData }], rdo, novo),
    ...(novo.atividades || []).flatMap((a) => {
      const antes = (rdo.atividades || []).find((x) => x.etapa_id === a.etapa_id);
      if (!antes || (antes.status === a.status && Number(antes.percentual) === Number(a.percentual))) return [];
      const txt = (x) => `${STATUS_ETAPA[x.status]?.rotulo || x.status}${x.status === "em_andamento" ? ` ${x.percentual}%` : ""}`;
      return [`${a.nome}: ${txt(antes)} → ${txt(a)}`];
    }),
    ...mudancasOc,
  ];

  const pi = pis.find((p) => p.id === rdo.pi_id);
  await registrarLog(usuario, comoAprovador ? "Editou RDO (aprovação)" : "Editou o próprio RDO", `${pi?.codigo} — ${fmtData(novo.data)}${mudancas.length ? ` · ${mudancas.length} alteração(ões)` : ""}`);
  if (comoAprovador && rdo.lider_id !== usuario.id && mudancas.length) {
    await notificar(rdo.lider_id, `Seu RDO de ${pi?.codigo || "obra"} (${fmtData(rdo.data)}) foi editado`,
      `Editado por ${usuario.nome}:\n• ${mudancas.join("\n• ")}`, "/lider");
  }
  await gerarPdfRdoSeguro(rdo.id, avisar);
  return { ok: true, mudancas };
}

// ---------------- Horas ----------------
export async function salvarEdicaoHoras({ registro, novo, pis, usuario, comoAprovador }) {
  const patch = { pi_id: novo.pi_id, data: novo.data, horas_totais: novo.horas_totais, editado_por: usuario.id, editado_em: new Date().toISOString() };
  if (novo.entrada !== undefined) patch.entrada = novo.entrada;
  if (novo.saida !== undefined) patch.saida = novo.saida;
  const r = await atualizarCondicional("apontamentos_horas", registro.id, patch, comoAprovador ? null : "pendente");
  if (r.erro) return r;

  const codigo = (id) => pis.find((p) => p.id === id)?.codigo || "—";
  const mudancas = descreverMudancas([
    { chave: "pi_id", rotulo: "Obra", formatar: codigo },
    { chave: "data", rotulo: "Data", formatar: fmtData },
    { chave: "entrada", rotulo: "Entrada", formatar: fmtHora },
    { chave: "saida", rotulo: "Saída", formatar: fmtHora },
    { chave: "horas_totais", rotulo: "Horas", formatar: fmtHoras },
  ], registro, { ...registro, ...patch });

  await registrarLog(usuario, comoAprovador ? "Editou horas (aprovação)" : "Editou as próprias horas", `${codigo(novo.pi_id)} — ${fmtData(novo.data)} · ${fmtHoras(novo.horas_totais)}`);
  if (comoAprovador && registro.usuario_id !== usuario.id && mudancas.length) {
    await notificar(registro.usuario_id, `Suas horas de ${fmtData(registro.data)} foram editadas`,
      `Editado por ${usuario.nome}:\n• ${mudancas.join("\n• ")}`);
  }
  return { ok: true, mudancas };
}

// ---------------- Solicitação de alteração de cronograma ----------------
const ROTULO_CAMPO = { data_prevista_inicio: "Data de início", data_prevista_fim: "Data de término", nome: "Nome da etapa", outro: "Outro" };
export async function salvarEdicaoSolicitacao({ s, novo, etapas, usuario, comoAprovador }) {
  const patch = { campo_alterado: novo.campo_alterado, valor_proposto: novo.valor_proposto, justificativa: novo.justificativa, editado_por: usuario.id, editado_em: new Date().toISOString() };
  if (novo.campo_alterado !== s.campo_alterado) {
    const etapa = etapas.find((e) => e.id === s.etapa_id);
    patch.valor_atual = novo.campo_alterado === "outro" ? null : etapa?.[novo.campo_alterado] || null;
  }
  const r = await atualizarCondicional("solicitacoes_alteracao_cronograma", s.id, patch, comoAprovador ? null : "pendente_coordenador");
  if (r.erro) return r;

  const valor = (campo) => (v) => (!v ? "—" : campo !== "nome" && campo !== "outro" && /^\d{4}-\d{2}-\d{2}/.test(v) ? fmtData(v) : v);
  const mudancas = descreverMudancas([
    { chave: "campo_alterado", rotulo: "O que mudar", formatar: (v) => ROTULO_CAMPO[v] || v },
    { chave: "valor_proposto", rotulo: "Novo valor", formatar: valor(novo.campo_alterado) },
    { chave: "justificativa", rotulo: "Justificativa" },
  ], s, novo);
  const etapa = etapas.find((e) => e.id === s.etapa_id);
  await registrarLog(usuario, comoAprovador ? "Editou solicitação (aprovação)" : "Editou a própria solicitação", `${etapa?.nome || "Etapa"} — ${ROTULO_CAMPO[novo.campo_alterado]}`);
  if (comoAprovador && s.solicitado_por !== usuario.id && mudancas.length) {
    await notificar(s.solicitado_por, `Sua solicitação sobre "${etapa?.nome || "etapa"}" foi editada`,
      `Editado por ${usuario.nome}:\n• ${mudancas.join("\n• ")}`, "/lider/solicitar");
  }
  return { ok: true, mudancas };
}

// ---------------- Ocorrência (fora de RDO) ----------------
export async function salvarEdicaoOcorrencia({ oc, novo, pis, usuario, comoAprovador, avisar }) {
  const patch = { categoria: novo.categoria, descricao: novo.descricao || null, midias: novo.midias || [], editado_por: usuario.id, editado_em: new Date().toISOString() };
  const r = await atualizarCondicional("ocorrencias", oc.id, patch, comoAprovador ? null : "pendente");
  if (r.erro) return r;
  const mudancas = descreverMudancas([
    { chave: "categoria", rotulo: "Categoria" },
    { chave: "descricao", rotulo: "Descrição" },
    { chave: "midias", rotulo: "Anexos", formatar: (v) => `${(v || []).length} arquivo(s)` },
  ], oc, patch);
  const pi = pis.find((p) => p.id === oc.pi_id);
  await registrarLog(usuario, comoAprovador ? "Editou ocorrência (aprovação)" : "Editou a própria ocorrência", `${pi?.codigo} — ${novo.categoria}`);
  if (comoAprovador && oc.registrado_por !== usuario.id && mudancas.length) {
    await notificar(oc.registrado_por, `Sua ocorrência em ${pi?.codigo || "obra"} foi editada`, `Editado por ${usuario.nome}:\n• ${mudancas.join("\n• ")}`, "/equipe/ocorrencia");
  }
  await gerarPdfOcorrenciaSeguro(oc.id, avisar);
  return { ok: true, mudancas };
}

export async function decidirOcorrencia({ oc, aprovar, motivo, pis, usuario, avisar }) {
  const patch = { status: aprovar ? "aprovada" : "rejeitada", decidido_por: usuario.id, decidido_em: new Date().toISOString(), motivo_rejeicao: aprovar ? null : motivo };
  const r = await atualizarCondicional("ocorrencias", oc.id, patch, "pendente");
  if (r.erro) return { erro: r.erro === JA_PROCESSADO ? "Esta ocorrência já foi decidida por outra pessoa." : r.erro };
  const pi = pis.find((p) => p.id === oc.pi_id);
  await registrarLog(usuario, aprovar ? "Aprovou ocorrência" : "Reprovou ocorrência", `${pi?.codigo} — ${oc.categoria}${motivo ? ` · ${motivo}` : ""}`);
  await notificar(oc.registrado_por,
    `Ocorrência ${aprovar ? "aprovada" : "reprovada"} — ${pi?.codigo || "obra"}`,
    `${oc.categoria}${oc.descricao ? ` — ${oc.descricao}` : ""}.\n${aprovar ? "Aprovada" : "Reprovada"} por ${usuario.nome}.${motivo ? `\nMotivo: ${motivo}` : ""}`, "/equipe/ocorrencia");
  await gerarPdfOcorrenciaSeguro(oc.id, avisar);
  return { ok: true };
}