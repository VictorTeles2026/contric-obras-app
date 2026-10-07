import { NextResponse } from "next/server";
import { exigirPermissao, PERFIS_VALIDOS, gerarPinUnico, registrarSenha } from "../../../lib/authServidor";
import { normalizarLogin, erroLogin, emailAuthDe, ehEmail } from "../../../lib/login";

const equipesValidas = (v) => Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim()).filter(Boolean))] : undefined;

// cria UM usuário; devolve { usuario } ou { erro }
async function criarUm(admin, solicitante, body) {
  const { perfil, funcao, senha, tipoTerceiro, empresaTerceira } = body;
  const nome = String(body.nome || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  // login: o informado (só o Master define um diferente do e-mail) ou, sem ele, o próprio e-mail
  const login = normalizarLogin(solicitante.perfil === "master" && body.login ? body.login : email);

  if (!nome || !perfil) return { erro: "Nome e perfil são obrigatórios." };
  if (!PERFIS_VALIDOS.includes(perfil)) return { erro: "Perfil inválido." };
  if (email && !ehEmail(email)) return { erro: "E-mail inválido." };

  const ehTerceiroAvulso = perfil === "terceiro" && tipoTerceiro === "avulso";
  let authUserId = null, pin = null;

  if (ehTerceiroAvulso) {
    pin = await gerarPinUnico(admin);
  } else {
    const erroL = erroLogin(login);
    if (erroL) return { erro: login ? erroL : "Informe o usuário (login) ou o e-mail." };
    if (!senha || String(senha).length < 6) return { erro: "A senha precisa ter pelo menos 6 caracteres." };
    const { data: jaExiste } = await admin.from("usuarios").select("id").eq("login", login).maybeSingle(); // logins são gravados em minúsculas
    if (jaExiste) return { erro: `O usuário "${login}" já existe.` };
    const { data, error } = await admin.auth.admin.createUser({ email: emailAuthDe(login), password: senha, email_confirm: true });
    if (error) return { erro: /already.*registered|already exists/i.test(error.message) ? `O usuário "${login}" já existe.` : error.message };
    authUserId = data.user.id;
  }

  const { data: usuario, error: erroInsert } = await admin.from("usuarios").insert({
    auth_user_id: authUserId, nome, email: email || null, perfil, funcao: funcao || null,
    tipo_terceiro: perfil === "terceiro" ? (tipoTerceiro || "fixo") : null,
    empresa_terceira: perfil === "terceiro" ? (empresaTerceira || null) : null,
    pin, ativo: true,
  }).select().single();
  if (erroInsert) {
    // se o insert falhar depois de já ter criado o login, desfaz o login criado
    if (authUserId) await admin.auth.admin.deleteUser(authUserId);
    return { erro: erroInsert.message };
  }

  // gravações separadas: se a coluna ainda não existir (script não rodado), não trava a criação
  const extras = {};
  const equipes = equipesValidas(body.equipes);
  if (equipes?.length) extras.equipes = equipes;
  if (!ehTerceiroAvulso) extras.login = login;
  for (const [k, v] of Object.entries(extras)) {
    const { error } = await admin.from("usuarios").update({ [k]: v }).eq("id", usuario.id);
    if (!error) usuario[k] = v;
  }

  if (authUserId) await registrarSenha(admin, { authUserId, nome, email: email || login, tipo: "usuario", senha, definidaPor: solicitante.nome, origem: "criacao" });
  return { usuario };
}

// { ...dados }  → cria um usuário
// { lote: [ {...dados}, ... ] }  → cria vários (cadastro em batelada); devolve o resultado de cada linha
export async function POST(req) {
  const { admin, solicitante, resposta } = await exigirPermissao(req, "usuario.editar");
  if (resposta) return resposta;
  const body = await req.json().catch(() => ({}));

  if (Array.isArray(body.lote)) {
    if (body.lote.length > 200) return NextResponse.json({ error: "Máximo de 200 usuários por vez." }, { status: 400 });
    const resultados = [];
    for (const item of body.lote) {
      try { resultados.push(await criarUm(admin, solicitante, item)); }
      catch (e) { resultados.push({ erro: e.message }); }
    }
    const criados = resultados.filter((r) => r.usuario);
    await admin.from("logs_auditoria").insert({ usuario_id: solicitante.id, usuario_nome: solicitante.nome, acao: "Criou usuários em lote",
      detalhe: `${criados.length} de ${body.lote.length} criado(s): ${criados.map((r) => r.usuario.nome).join(", ")}` });
    return NextResponse.json({ resultados });
  }

  const r = await criarUm(admin, solicitante, body);
  if (r.erro) return NextResponse.json({ error: r.erro }, { status: 400 });
  return NextResponse.json({ usuario: r.usuario });
}
