import { NextResponse } from "next/server";
import { exigirMaster, PERFIS_VALIDOS, gerarPinUnico, registrarSenha } from "../../../lib/authServidor";

const BANIDO = "876000h"; // ~100 anos = efetivamente desabilitado

export async function POST(req) {
  const { admin, solicitante, resposta } = await exigirMaster(req);
  if (resposta) return resposta;

  const body = await req.json().catch(() => ({}));
  const { id, nome, perfil, funcao, novaSenha, tipoTerceiro, empresaTerceira, ativo } = body;
  const email = body.email === undefined || body.email === null ? body.email : String(body.email).trim().toLowerCase();

  if (!id) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });
  if (perfil !== undefined && !PERFIS_VALIDOS.includes(perfil)) {
    return NextResponse.json({ error: "Perfil inválido." }, { status: 400 });
  }
  if (novaSenha && String(novaSenha).length < 6) {
    return NextResponse.json({ error: "A senha precisa ter pelo menos 6 caracteres." }, { status: 400 });
  }

  // evita que o Master se tranque para fora do sistema sem querer
  if (id === solicitante.id) {
    if (ativo === false) return NextResponse.json({ error: "Você não pode desabilitar o seu próprio acesso." }, { status: 400 });
    if (perfil !== undefined && perfil !== "master") return NextResponse.json({ error: "Você não pode remover o seu próprio perfil de Master." }, { status: 400 });
  }

  const { data: atual, error: erroAtual } = await admin.from("usuarios").select("*").eq("id", id).single();
  if (erroAtual) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

  const ativoFinal = ativo !== undefined ? ativo : atual.ativo;

  const patch = {};
  if (nome !== undefined) {
    if (!String(nome).trim()) return NextResponse.json({ error: "Nome é obrigatório." }, { status: 400 });
    patch.nome = String(nome).trim();
  }
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
        await admin.auth.admin.updateUserById(authUserId, { ban_duration: BANIDO });
      }
      if (!atual.pin) patch.pin = await gerarPinUnico(admin);
      patch.email = null;
    } else {
      // precisa de login
      if (!authUserId) {
        // nunca teve login (era terceiro avulso) — cria agora
        if (!email) return NextResponse.json({ error: "E-mail é obrigatório para esse perfil." }, { status: 400 });
        if (!novaSenha) return NextResponse.json({ error: "Defina uma senha para o novo login." }, { status: 400 });
        const { data, error } = await admin.auth.admin.createUser({ email, password: novaSenha, email_confirm: true });
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        authUserId = data.user.id;
        patch.auth_user_id = authUserId;
      } else {
        // se voltou de "avulso" para um perfil com login, o login antigo estava bloqueado:
        // libera de novo (respeitando o status ativo/desabilitado)
        const updates = { ban_duration: ativoFinal ? "none" : BANIDO };
        if (email && email !== atual.email) updates.email = email;
        if (novaSenha) updates.password = novaSenha;
        const { error } = await admin.auth.admin.updateUserById(authUserId, updates);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (email !== undefined) patch.email = email || null;
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
  const ehAvulso = usuario.perfil === "terceiro" && usuario.tipo_terceiro === "avulso";
  if (usuario.auth_user_id && ativo !== undefined && !ehAvulso) {
    await admin.auth.admin.updateUserById(usuario.auth_user_id, {
      ban_duration: ativo ? "none" : BANIDO,
    });
  }

  if (novaSenha && usuario.auth_user_id) {
    await registrarSenha(admin, { authUserId: usuario.auth_user_id, nome: usuario.nome, email: usuario.email, tipo: "usuario", senha: novaSenha, definidaPor: solicitante.nome, origem: "master" });
  }
  return NextResponse.json({ usuario });
}
