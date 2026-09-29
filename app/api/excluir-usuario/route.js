import { NextResponse } from "next/server";
import { exigirMaster, rotaSegura } from "../../../lib/authServidor";

// Exclusão definitiva de um usuário (somente Master). Irreversível.
// - registros que SÃO do usuário (horas, RDOs que ele fez, ocorrências que registrou,
//   solicitações que abriu...) são apagados;
// - registros em que ele só aparece como aprovador/editor/responsável ficam, sem o vínculo.

// [tabela, coluna] → vira null
const DESVINCULAR = [
  ["pis", "baseline_definida_por"], ["etapas", "responsavel_id"], ["etapas", "hold_point_aceito_por"],
  ["etapa_revisoes", "alterado_por"], ["recursos", "usuario_id"],
  ["rdos", "decidido_por"], ["rdos", "editado_por"],
  ["ocorrencias", "decidido_por"], ["ocorrencias", "editado_por"],
  ["apontamentos_horas", "decidido_por"], ["apontamentos_horas", "editado_por"],
  ["solicitacoes_alteracao_cronograma", "decidido_coordenador_por"], ["solicitacoes_alteracao_cronograma", "decidido_gerente_por"],
  ["solicitacoes_alteracao_cronograma", "editado_por"], ["checklist_turno_execucoes", "concluido_por"],
  ["logs_auditoria", "usuario_id"], // o nome continua gravado no texto do log
];
// [tabela, coluna] → linhas apagadas (a ordem importa)
const APAGAR = [
  ["apontamentos_horas", "usuario_id"], ["solicitacoes_alteracao_cronograma", "solicitado_por"],
  ["divergencias_escopo", "criado_por"], ["solicitacoes_material_extra", "solicitante_id"],
  ["ocorrencias", "registrado_por"], ["notificacoes", "usuario_id"], ["documentos_lidos", "usuario_id"],
];
const ausente = (e) => /does not exist|could not find|schema cache/i.test(e?.message || "");

export const POST = rotaSegura(async (req) => {
  const { admin, solicitante, resposta } = await exigirMaster(req);
  if (resposta) return resposta;
  const { id } = await req.json().catch(() => ({}));
  if (id === solicitante.id) return NextResponse.json({ error: "Você não pode excluir o seu próprio usuário." }, { status: 400 });
  const { data: u } = await admin.from("usuarios").select("*").eq("id", id).maybeSingle();
  if (!u) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

  const resumo = {};
  const falha = (t, e) => { throw new Error(`${t}: ${e.message}`); };
  for (const [t, c] of DESVINCULAR) {
    const { error } = await admin.from(t).update({ [c]: null }).eq(c, id);
    if (error && !ausente(error)) falha(`${t}.${c}`, error);
  }
  // RDOs feitos por ele: antes as ocorrências do RDO e o PDF
  const { data: rdos } = await admin.from("rdos").select("id,pdf_path").eq("lider_id", id);
  if (rdos?.length) {
    const ids = rdos.map((r) => r.id);
    const { error: e1 } = await admin.from("ocorrencias").delete().in("rdo_id", ids);
    if (e1 && !ausente(e1)) falha("ocorrencias", e1);
    const { error: e2 } = await admin.from("rdos").delete().in("id", ids);
    if (e2) falha("rdos", e2);
    const pdfs = rdos.map((r) => r.pdf_path).filter(Boolean);
    if (pdfs.length) await admin.storage.from("documentos").remove(pdfs);
    resumo.rdos = rdos.length;
  }
  for (const [t, c] of APAGAR) {
    const { error, count } = await admin.from(t).delete({ count: "exact" }).eq(c, id);
    if (error && !ausente(error)) falha(t, error);
    if (count) resumo[t] = count;
  }

  const { error } = await admin.from("usuarios").delete().eq("id", u.id);
  if (error) return NextResponse.json({ error: `Não foi possível excluir: ${error.message}` }, { status: 400 });
  if (u.auth_user_id) {
    await admin.auth.admin.deleteUser(u.auth_user_id);
    await admin.from("senhas_registradas").delete().eq("auth_user_id", u.auth_user_id);
  }

  const detalhe = Object.entries(resumo).map(([k, v]) => `${k}: ${v}`).join(", ") || "sem registros próprios";
  await admin.from("logs_auditoria").insert({ usuario_id: solicitante.id, usuario_nome: solicitante.nome, acao: "Excluiu usuário (Master)",
    detalhe: `${u.nome} (${u.perfil}${u.email ? ` · ${u.email}` : ""}) · ${detalhe}` });
  return NextResponse.json({ ok: true, resumo });
});
