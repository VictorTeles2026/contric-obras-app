import { NextResponse } from "next/server";
import { exigirMaster, PERFIS_VALIDOS, gerarPinUnico, registrarSenha } from "../../../lib/authServidor";

export async function POST(req) {
  const { admin, solicitante, resposta } = await exigirMaster(req);
  if (resposta) return resposta;

  const body = await req.json().catch(() => ({}));
  const { perfil, funcao, senha, tipoTerceiro, empresaTerceira } = body;
  const nome = String(body.nome || "").trim();
  const email = String(body.email || "").trim().toLowerCase();

  if (!nome || !perfil) {
    return NextResponse.json({ error: "Nome e perfil são obrigatórios." }, { status: 400 });
  }
  if (!PERFIS_VALIDOS.includes(perfil)) {
    return NextResponse.json({ error: "Perfil inválido." }, { status: 400 });
  }

  const ehTerceiroAvulso = perfil === "terceiro" && tipoTerceiro === "avulso";

  let authUserId = null;
  let pin = null;

  if (ehTerceiroAvulso) {
    pin = await gerarPinUnico(admin);
  } else {
    if (!email || !senha) {
      return NextResponse.json({ error: "E-mail e senha são obrigatórios para esse perfil." }, { status: 400 });
    }
    if (String(senha).length < 6) {
      return NextResponse.json({ error: "A senha precisa ter pelo menos 6 caracteres." }, { status: 400 });
    }
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    });
    if (error) {
      const msg = /already.*registered|already exists/i.test(error.message) ? "Já existe um login com esse e-mail." : error.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    authUserId = data.user.id;
  }

  const { data: usuario, error: erroInsert } = await admin
    .from("usuarios")
    .insert({
      auth_user_id: authUserId,
      nome,
      email: email || null,
      perfil,
      funcao: funcao || null,
      tipo_terceiro: perfil === "terceiro" ? (tipoTerceiro || "fixo") : null,
      empresa_terceira: perfil === "terceiro" ? (empresaTerceira || null) : null,
      pin,
      ativo: true,
    })
    .select()
    .single();

  if (erroInsert) {
    // se o insert falhar depois de já ter criado o login, desfaz o login criado
    if (authUserId) await admin.auth.admin.deleteUser(authUserId);
    return NextResponse.json({ error: erroInsert.message }, { status: 400 });
  }

  if (authUserId) await registrarSenha(admin, { authUserId, nome, email, tipo: "usuario", senha, definidaPor: solicitante.nome, origem: "criacao" });
  return NextResponse.json({ usuario });
}
