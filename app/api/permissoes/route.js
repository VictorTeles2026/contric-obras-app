import { NextResponse } from "next/server";
import { exigirPermissao, rotaSegura } from "../../../lib/authServidor";
import { CATALOGO_PERMISSOES } from "../../../lib/permissoes";

// Grava a matriz de permissões (por perfil) e as exceções por usuário.
// Só quem tem "permissao.gerenciar"; tudo vai para a Auditoria.
const PERFIS = ["master", "gerente", "coordenador", "visualizador", "lider", "funcionario", "terceiro"];
const VALORES = ["S", "N", "P"];
const codigoValido = (c) => CATALOGO_PERMISSOES.some((x) => x.codigo === c);
const acaoDe = (c) => CATALOGO_PERMISSOES.find((x) => x.codigo === c)?.acao || c;

export const POST = rotaSegura(async (req) => {
  const { admin, solicitante, resposta } = await exigirPermissao(req, "permissao.gerenciar");
  if (resposta) return resposta;
  const b = await req.json().catch(() => ({}));
  const log = (acao, detalhe) => admin.from("logs_auditoria").insert({ usuario_id: solicitante.id, usuario_nome: solicitante.nome, acao, detalhe });
  const erroTabela = (e) => NextResponse.json({ error: /permissoes_/.test(e.message) ? "Rode o script permissoes.sql no Supabase." : e.message }, { status: 400 });

  if (b.acao === "perfil") {
    if (!PERFIS.includes(b.perfil) || !codigoValido(b.codigo) || !VALORES.includes(b.valor)) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    const { error } = await admin.from("permissoes_perfil").upsert(
      { perfil: b.perfil, codigo: b.codigo, valor: b.valor, atualizado_por: solicitante.nome, atualizado_em: new Date().toISOString() },
      { onConflict: "perfil,codigo" });
    if (error) return erroTabela(error);
    await log("Alterou permissão de perfil", `${b.perfil} · ${acaoDe(b.codigo)} → ${b.valor}`);
    return NextResponse.json({ ok: true });
  }

  if (b.acao === "excecao") {
    if (!b.usuarioId || !codigoValido(b.codigo) || !VALORES.includes(b.valor)) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    const { data: u } = await admin.from("usuarios").select("nome").eq("id", b.usuarioId).maybeSingle();
    if (!u) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    const { data, error } = await admin.from("permissoes_usuario").upsert({
      usuario_id: b.usuarioId, codigo: b.codigo, valor: b.valor, motivo: b.motivo?.trim() || null,
      valido_ate: b.validoAte || null, criado_por: solicitante.nome, criado_em: new Date().toISOString(),
    }, { onConflict: "usuario_id,codigo" }).select().single();
    if (error) return erroTabela(error);
    await log("Definiu exceção de permissão", `${u.nome} · ${acaoDe(b.codigo)} → ${b.valor}${b.motivo ? ` · motivo: ${b.motivo}` : ""}${b.validoAte ? ` · até ${b.validoAte}` : ""}`);
    return NextResponse.json({ ok: true, excecao: data });
  }

  if (b.acao === "remover_excecao") {
    const { data: ex } = await admin.from("permissoes_usuario").select("*, usuarios(nome)").eq("id", b.id).maybeSingle();
    const { error } = await admin.from("permissoes_usuario").delete().eq("id", b.id);
    if (error) return erroTabela(error);
    if (ex) await log("Removeu exceção de permissão", `${ex.usuarios?.nome || ""} · ${acaoDe(ex.codigo)} (volta ao padrão do perfil)`);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
});
