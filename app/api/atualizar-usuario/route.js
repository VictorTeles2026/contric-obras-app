import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

function gerarPin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req) {
  const body = await req.json();
  const { id, nome, perfil, funcao, email, novaSenha, tipoTerceiro, empresaTerceira, ativo } = body;

  if (!id) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });

  const admin = supabaseAdmin();

  const { data: atual, error: erroAtual } = await admin.from("usuarios").select("*").eq("id", id).single();
  if (erroAtual) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

  const patch = {};
  if (nome !== undefined) patch.nome = nome;
  if (funcao !== undefined) patch.funcao = funcao;
  if (ativo !== undefined) patch.ativo = ativo;

  // ---- se perfil/tipo de terceiro foram informados (edição completa, só Master faz isso) ----
  if (perfil !== undefined) {
    patch.perfil = perfil;
    patch.tipo_terceiro = perfil === "terceiro" ? (tipoTerceiro || "fixo") : null;
    patch.empresa_terceira = perfil === "terceiro" ? (empresaTerceira || null) : null;

    const vaiSerAvulso = perfil === "terceiro" && (tipoTerceiro || "fixo") === "avulso";
    let authUserId = atual.auth_user_id;

    if (vaiSerAvulso) {
      // não deve ter login — se tinha um (estava fixo/outro perfil), desabilita o login antigo
      if (authUserId) {
        await admin.auth.admin.updateUserById(authUserId, { ban_duration: "876000h" });
      }
      if (!atual.pin) patch.pin = gerarPin();
      patch.email = null;
    } else {
      // precisa de login
      if (!authUserId) {
        // nunca teve login (era terceiro avulso) — cria agora
        if (!email) return NextResponse.json({ error: "E-mail é obrigatório para esse perfil." }, { status: 400 });
        const { data, error } = await admin.auth.admin.createUser({
          email, password: novaSenha || Math.random().toString(36).slice(2, 10), email_confirm: true,
        });
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        authUserId = data.user.id;
        patch.auth_user_id = authUserId;
      } else {
        const updates = {};
        if (email && email !== atual.email) updates.email = email;
        if (novaSenha) updates.password = novaSenha;
        if (Object.keys(updates).length) {
          const { error } = await admin.auth.admin.updateUserById(authUserId, updates);
          if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        }
      }
      if (email !== undefined) patch.email = email;
      patch.pin = null;
    }
  } else if (novaSenha && atual.auth_user_id) {
    // troca de senha isolada (sem mudar mais nada)
    const { error } = await admin.auth.admin.updateUserById(atual.auth_user_id, { password: novaSenha });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data: usuario, error } = await admin.from("usuarios").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // se tem login, também bloqueia/libera o acesso de verdade, não só a flag no banco
  if (usuario.auth_user_id && ativo !== undefined) {
    await admin.auth.admin.updateUserById(usuario.auth_user_id, {
      ban_duration: ativo ? "none" : "876000h", // ~100 anos = efetivamente desabilitado
    });
  }

  return NextResponse.json({ usuario });
}
