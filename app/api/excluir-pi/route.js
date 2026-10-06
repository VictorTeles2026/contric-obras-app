import { NextResponse } from "next/server";
import { exigirPermissao, rotaSegura } from "../../../lib/authServidor";

// Exclusão COMPLETA de um PI (somente Master): apaga tudo o que está ligado a ele
// e os arquivos da pasta do PI no bucket "documentos". Irreversível.

// ordem importa: primeiro o que aponta para outras tabelas do PI (ocorrência → RDO, checklist → turno...)
const TABELAS_POR_PI = [
  "ocorrencias", "apontamentos_horas", "divergencias_escopo", "solicitacoes_material_extra", "materiais",
  "checklist_turno_execucoes", "turnos", "alocacoes_recurso", "rdos", "marcos_faturamento", "orcamento_pi_item",
  "cliente_documentos", "cliente_acessos", "notificacoes",
];
// tabela/coluna que não existe neste banco (script não rodado) não é erro
const ausente = (e) => /does not exist|could not find|schema cache/i.test(e?.message || "");

export const POST = rotaSegura(async (req) => {
  const { admin, interno, resposta } = await exigirPermissao(req, "pi.excluir");
  if (resposta) return resposta;
  const { piId, confirmacao } = await req.json().catch(() => ({}));
  const { data: pi } = await admin.from("pis").select("*").eq("id", piId).maybeSingle();
  if (!pi) return NextResponse.json({ error: "PI não encontrado." }, { status: 404 });
  if (confirmacao !== pi.codigo) return NextResponse.json({ error: "Confirmação inválida." }, { status: 400 });

  const resumo = {};
  const apagar = async (tabela, coluna, valores) => {
    let q = admin.from(tabela).delete({ count: "exact" });
    q = Array.isArray(valores) ? q.in(coluna, valores) : q.eq(coluna, valores);
    const { error, count } = await q;
    if (error && !ausente(error)) throw new Error(`${tabela}: ${error.message}`);
    if (count) resumo[tabela] = (resumo[tabela] || 0) + count;
  };

  // etapas do PI: o que referencia etapa sem "on delete cascade" sai antes
  const { data: etapas } = await admin.from("etapas").select("id").eq("pi_id", pi.id);
  const etapaIds = (etapas || []).map((e) => e.id);
  if (etapaIds.length) {
    await apagar("solicitacoes_alteracao_cronograma", "etapa_id", etapaIds);
    await apagar("alocacoes_recurso", "etapa_id", etapaIds);
    await apagar("ocorrencias", "etapa_id", etapaIds);
  }
  for (const t of TABELAS_POR_PI) await apagar(t, "pi_id", pi.id);
  await apagar("etapas", "pi_id", pi.id); // dependências e revisões saem em cascata

  // arquivos da pasta do PI (PDFs, atas, documentos)
  const { data: arquivos } = await admin.storage.from("documentos").list(pi.id, { limit: 1000 });
  const caminhos = (arquivos || []).filter((f) => f.id).map((f) => `${pi.id}/${f.name}`);
  if (caminhos.length) { await admin.storage.from("documentos").remove(caminhos); resumo.arquivos = caminhos.length; }

  const { error } = await admin.from("pis").delete().eq("id", pi.id);
  if (error) return NextResponse.json({ error: `Não foi possível apagar o PI: ${error.message}` }, { status: 400 });

  const detalhe = Object.entries(resumo).map(([k, v]) => `${k}: ${v}`).join(", ") || "sem registros associados";
  await admin.from("logs_auditoria").insert({ usuario_id: interno.id, usuario_nome: interno.nome, acao: "Excluiu PI e todos os dados (Master)",
    detalhe: `${pi.codigo} — ${pi.cliente || ""}${pi.projeto ? ` — ${pi.projeto}` : ""} · ${detalhe}` });
  return NextResponse.json({ ok: true, resumo });
});
