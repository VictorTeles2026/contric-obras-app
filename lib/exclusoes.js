"use client";

import { supabase } from "./supabase";
import { registrarLog } from "./dados";
import { BUCKET_DOCUMENTOS } from "./pdfRdo";

// Exclusões — permitidas SOMENTE ao Master. Cada exclusão fica registrada na Auditoria
// com o resumo do que foi apagado e o motivo informado.

export const ehMaster = (usuario) => usuario?.perfil === "master";

const fmtData = (v) => (v ? new Date(String(v).slice(0, 10) + "T00:00:00").toLocaleDateString("pt-BR") : "—");
const semPermissao = { erro: "Somente o Master pode excluir." };

async function auditar(usuario, acao, resumo, motivo) {
  await registrarLog(usuario, acao, `${resumo}${motivo ? ` · motivo: ${motivo}` : ""}`);
}

async function removerArquivo(caminho) {
  if (!caminho) return;
  await supabase.storage.from(BUCKET_DOCUMENTOS).remove([caminho]);
}

export async function excluirRdo({ rdo, pi, usuario, motivo }) {
  if (!ehMaster(usuario)) return semPermissao;
  // ocorrências do RDO primeiro (a ocorrência aponta para o RDO)
  const { data: ocs } = await supabase.from("ocorrencias").select("id").eq("rdo_id", rdo.id);
  const { error: e1 } = await supabase.from("ocorrencias").delete().eq("rdo_id", rdo.id);
  if (e1) return { erro: e1.message };
  const { error } = await supabase.from("rdos").delete().eq("id", rdo.id);
  if (error) return { erro: error.message };
  await removerArquivo(rdo.pdf_path);
  await auditar(usuario, "Excluiu RDO (Master)",
    `${pi?.codigo || "PI"} — RDO de ${fmtData(rdo.data)} (status: ${rdo.status}; ${(rdo.atividades || []).length} atividade(s); ${(ocs || []).length} ocorrência(s)${rdo.pdf_path ? "; PDF removido" : ""})`, motivo);
  return { ok: true };
}

export async function excluirHoras({ registro, pi, pessoa, usuario, motivo }) {
  if (!ehMaster(usuario)) return semPermissao;
  const { error } = await supabase.from("apontamentos_horas").delete().eq("id", registro.id);
  if (error) return { erro: error.message };
  await auditar(usuario, "Excluiu lançamento de horas (Master)",
    `${pessoa?.nome || "—"} · ${pi?.codigo || "PI"} · ${fmtData(registro.data)} · ${registro.horas_totais ?? "em aberto"}h (status: ${registro.status})`, motivo);
  return { ok: true };
}

export async function excluirOcorrencia({ oc, pi, usuario, motivo }) {
  if (!ehMaster(usuario)) return semPermissao;
  const { error } = await supabase.from("ocorrencias").delete().eq("id", oc.id);
  if (error) return { erro: error.message };
  await removerArquivo(oc.pdf_path);
  await auditar(usuario, "Excluiu ocorrência (Master)",
    `${pi?.codigo || "PI"} — ${oc.categoria}${oc.descricao ? `: ${oc.descricao}` : ""} (status: ${oc.status || "—"}; ${(oc.midias || []).length} anexo(s))`, motivo);
  return { ok: true };
}

export async function excluirSolicitacao({ s, etapa, usuario, motivo }) {
  if (!ehMaster(usuario)) return semPermissao;
  const { error } = await supabase.from("solicitacoes_alteracao_cronograma").delete().eq("id", s.id);
  if (error) return { erro: error.message };
  await auditar(usuario, "Excluiu solicitação de alteração (Master)",
    `${etapa?.nome || "Etapa"} — ${s.campo_alterado}: ${s.valor_atual || "—"} → ${s.valor_proposto} (status: ${s.status})`, motivo);
  return { ok: true };
}

// arquivo em Documentos; se for o PDF de um RDO/ocorrência, desvincula do registro
export async function excluirDocumento({ caminho, pi, usuario, motivo }) {
  if (!ehMaster(usuario)) return semPermissao;
  const { error } = await supabase.storage.from(BUCKET_DOCUMENTOS).remove([caminho]);
  if (error) return { erro: error.message };
  await supabase.from("rdos").update({ pdf_path: null }).eq("pdf_path", caminho).then(() => {}, () => {});
  await supabase.from("ocorrencias").update({ pdf_path: null }).eq("pdf_path", caminho).then(() => {}, () => {});
  await auditar(usuario, "Excluiu documento (Master)", `${pi?.codigo || "PI"} — ${caminho.split("/").pop()}`, motivo);
  return { ok: true };
}

// Relatórios: apaga os valores realizados digitados de um grupo (custo ou horas) do PI
export async function limparRealizados({ pi, categoriaIds, grupo, usuario, motivo }) {
  if (!ehMaster(usuario)) return semPermissao;
  const { error } = await supabase.from("orcamento_pi_item").update({ valor_realizado: null }).eq("pi_id", pi.id).in("categoria_id", categoriaIds);
  if (error) return { erro: error.message };
  await auditar(usuario, "Apagou valores realizados (Master)", `${pi.codigo} — ${grupo}`, motivo);
  return { ok: true };
}
