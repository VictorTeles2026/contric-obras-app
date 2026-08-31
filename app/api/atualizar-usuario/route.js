import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export async function POST(req) {
  const body = await req.json();
  const { id, nome, funcao, ativo, auth_user_id } = body;

  if (!id) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });

  const admin = supabaseAdmin();

  const patch = {};
  if (nome !== undefined) patch.nome = nome;
  if (funcao !== undefined) patch.funcao = funcao;
  if (ativo !== undefined) patch.ativo = ativo;

  const { data: usuario, error } = await admin.from("usuarios").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // se tem login (auth_user_id), também bloqueia/libera o acesso de verdade, não só a flag no banco
  if (auth_user_id && ativo !== undefined) {
    await admin.auth.admin.updateUserById(auth_user_id, {
      ban_duration: ativo ? "none" : "876000h", // ~100 anos = efetivamente desabilitado
    });
  }

  return NextResponse.json({ usuario });
}
