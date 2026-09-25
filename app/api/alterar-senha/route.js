import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { identificar, registrarSenha, rotaSegura } from "../../../lib/authServidor";

// Qualquer usuário (interno ou cliente) troca a PRÓPRIA senha, confirmando a senha atual.
// A nova senha fica registrada (criptografada) para consulta exclusiva do Master.
export const POST = rotaSegura(async (req) => {
  const { admin, authUser, interno, cliente, resposta } = await identificar(req);
  if (resposta) return resposta;
  const { senhaAtual, novaSenha } = await req.json().catch(() => ({}));
  if (!senhaAtual || !novaSenha) return NextResponse.json({ error: "Informe a senha atual e a nova." }, { status: 400 });
  if (String(novaSenha).length < 6) return NextResponse.json({ error: "A nova senha precisa ter pelo menos 6 caracteres." }, { status: 400 });
  if (novaSenha === senhaAtual) return NextResponse.json({ error: "A nova senha deve ser diferente da atual." }, { status: 400 });

  // confere a senha atual (cliente temporário, sem guardar sessão)
  const verificador = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: erroLogin } = await verificador.auth.signInWithPassword({ email: authUser.email, password: senhaAtual });
  if (erroLogin) return NextResponse.json({ error: "Senha atual incorreta." }, { status: 400 });

  const { error } = await admin.auth.admin.updateUserById(authUser.id, { password: novaSenha });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const titular = interno || cliente;
  await registrarSenha(admin, { authUserId: authUser.id, nome: titular.nome, email: authUser.email, tipo: interno ? "usuario" : "cliente", senha: novaSenha, definidaPor: titular.nome, origem: "propria" });
  await admin.from("logs_auditoria").insert({ usuario_id: interno?.id || null, usuario_nome: titular.nome, acao: "Alterou a própria senha", detalhe: interno ? "usuário interno" : "cliente (portal)" });
  return NextResponse.json({ ok: true });
});
