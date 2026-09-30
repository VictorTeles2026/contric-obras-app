import { NextResponse } from "next/server";
import { exigirMaster, decifrar, rotaSegura } from "../../../lib/authServidor";

// SOMENTE Master: histórico de senhas de um usuário/cliente (decifrado no servidor).
// Cada consulta fica registrada na Auditoria.
export const POST = rotaSegura(async (req) => {
  const { admin, solicitante, resposta } = await exigirMaster(req);
  if (resposta) return resposta;
  const { authUserId, nome } = await req.json().catch(() => ({}));
  if (!authUserId) return NextResponse.json({ error: "Informe o usuário." }, { status: 400 });
  const { data, error } = await admin.from("senhas_registradas").select("*").eq("auth_user_id", authUserId).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: /senhas_registradas/.test(error.message) ? "Registro de senhas ainda não criado — rode o script clientes-senhas.sql." : error.message }, { status: 400 });
  await admin.from("logs_auditoria").insert({ usuario_id: solicitante.id, usuario_nome: solicitante.nome, acao: "Visualizou senha (Master)", detalhe: nome || data?.[0]?.titular_nome || authUserId });
  return NextResponse.json({
    senhas: (data || []).map((s) => ({ senha: decifrar(s.senha_cifrada), em: s.created_at, por: s.definida_por_nome, origem: s.origem })),
  });
});
