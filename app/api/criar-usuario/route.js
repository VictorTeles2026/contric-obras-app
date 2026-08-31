import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

function gerarPin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req) {
  const body = await req.json();
  const { nome, perfil, funcao, email, senha, tipoTerceiro, empresaTerceira } = body;

  if (!nome || !perfil) {
    return NextResponse.json({ error: "Nome e perfil são obrigatórios." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const ehTerceiroAvulso = perfil === "terceiro" && tipoTerceiro === "avulso";

  let authUserId = null;
  let pin = null;

  if (ehTerceiroAvulso) {
    pin = gerarPin();
  } else {
    if (!email || !senha) {
      return NextResponse.json({ error: "E-mail e senha são obrigatórios para esse perfil." }, { status: 400 });
    }
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
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
      tipo_terceiro: perfil === "terceiro" ? tipoTerceiro : null,
      empresa_terceira: perfil === "terceiro" ? empresaTerceira : null,
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

  return NextResponse.json({ usuario });
}
