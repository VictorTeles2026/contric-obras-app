import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "./supabaseAdmin";

// Garante que quem chama a rota /api é um usuário logado, ativo e com perfil Master.
// Sem isso, qualquer pessoa na internet poderia criar/alterar usuários, porque as
// rotas usam a service_role key (que ignora RLS).
export async function exigirMaster(req) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { resposta: NextResponse.json({ error: "Servidor sem SUPABASE_SERVICE_ROLE_KEY configurada." }, { status: 500 }) };
  }
  const cabecalho = req.headers.get("authorization") || "";
  const token = cabecalho.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { resposta: NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 }) };
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    return { resposta: NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 }) };
  }

  const { data: solicitante } = await admin
    .from("usuarios")
    .select("id, nome, perfil, ativo")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  if (!solicitante || solicitante.perfil !== "master" || solicitante.ativo === false) {
    return { resposta: NextResponse.json({ error: "Somente o Master pode gerenciar usuários." }, { status: 403 }) };
  }

  return { admin, solicitante };
}

export const PERFIS_VALIDOS = ["master", "gerente", "coordenador", "lider", "funcionario", "terceiro", "visualizador"];

export async function gerarPinUnico(admin) {
  for (let i = 0; i < 10; i++) {
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    const { data } = await admin.from("usuarios").select("id").eq("pin", pin).maybeSingle();
    if (!data) return pin;
  }
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ---------------------------------------------------------------------------
// Identifica quem chama a rota (usuário interno OU cliente) a partir do token.
export async function identificar(req) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { resposta: NextResponse.json({ error: "Servidor sem SUPABASE_SERVICE_ROLE_KEY configurada." }, { status: 500 }) };
  }
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { resposta: NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 }) };
  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return { resposta: NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 }) };
  const authUser = data.user;
  const { data: interno } = await admin.from("usuarios").select("id, nome, email, perfil, ativo").eq("auth_user_id", authUser.id).maybeSingle();
  if (interno && interno.ativo !== false) return { admin, authUser, interno };
  const { data: cliente } = await admin.from("clientes").select("*").eq("auth_user_id", authUser.id).maybeSingle();
  if (cliente && cliente.ativo !== false) return { admin, authUser, cliente };
  return { resposta: NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 }) };
}

// exige usuário interno com um dos perfis informados
export async function exigirPerfis(req, perfis) {
  const r = await identificar(req);
  if (r.resposta) return r;
  if (!r.interno || !perfis.includes(r.interno.perfil)) {
    return { resposta: NextResponse.json({ error: "Seu perfil não tem permissão para esta ação." }, { status: 403 }) };
  }
  return r;
}

// ---- senhas: geração, criptografia (AES-256-GCM) e registro ----
// A chave é derivada da service role key (que só existe no servidor).
function chaveSenhas() {
  return crypto.createHash("sha256").update(`${process.env.SENHAS_CHAVE || process.env.SUPABASE_SERVICE_ROLE_KEY}|contric-senhas`).digest();
}
export function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", chaveSenhas(), iv);
  const dados = Buffer.concat([c.update(String(texto), "utf8"), c.final()]);
  return [iv.toString("base64"), c.getAuthTag().toString("base64"), dados.toString("base64")].join(".");
}
export function decifrar(cifrado) {
  try {
    const [iv, tag, dados] = String(cifrado).split(".").map((p) => Buffer.from(p, "base64"));
    const d = crypto.createDecipheriv("aes-256-gcm", chaveSenhas(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(dados), d.final()]).toString("utf8");
  } catch {
    return null; // chave mudou ou registro corrompido
  }
}
export function gerarSenha(tamanho = 10) {
  // sem caracteres ambíguos (0/O, 1/l/I) — fácil de digitar no celular
  const letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(tamanho);
  let s = "";
  for (let i = 0; i < tamanho; i++) s += letras[bytes[i] % letras.length];
  return /\d/.test(s) ? s : s.slice(0, -1) + String(2 + (bytes[0] % 8));
}
export async function registrarSenha(admin, { authUserId, nome, email, tipo, senha, definidaPor, origem }) {
  if (!authUserId || !senha) return;
  try {
    await admin.from("senhas_registradas").insert({
      auth_user_id: authUserId, titular_nome: nome, titular_email: email, titular_tipo: tipo,
      senha_cifrada: cifrar(senha), definida_por_nome: definidaPor, origem,
    });
  } catch { /* tabela ainda não criada: não impede a troca de senha */ }
}

// ---- e-mail (Resend). Sem RESEND_API_KEY configurada, não envia e avisa. ----
export async function enviarEmail({ para, assunto, html, texto }) {
  const chave = process.env.RESEND_API_KEY;
  if (!chave) return { enviado: false, motivo: "envio de e-mail ainda não configurado — falta a RESEND_API_KEY" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_REMETENTE || "Contric <onboarding@resend.dev>", to: [para], subject: assunto, html, text: texto }),
    });
    if (!r.ok) return { enviado: false, motivo: `Falha no envio (${r.status}): ${(await r.text()).slice(0, 200)}` };
    return { enviado: true };
  } catch (e) {
    return { enviado: false, motivo: e.message };
  }
}

export const urlApp = () => (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "").replace(/\/$/, "");

// modelo visual dos e-mails do portal de clientes (cinza escuro)
export function emailCliente(titulo, paragrafos, botao) {
  const corpo = paragrafos.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#27272a">${p}</p>`).join("");
  const link = botao?.url ? `<p style="margin:20px 0 0"><a href="${botao.url}" style="background:#27272a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;display:inline-block">${botao.texto}</a></p>` : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f4f5;padding:24px">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e7">
      <div style="background:#27272a;color:#fff;padding:18px 24px;font-size:18px;font-weight:700">Acesso Clientes Contric</div>
      <div style="padding:24px"><h2 style="margin:0 0 14px;font-size:18px;color:#18181b">${titulo}</h2>${corpo}${link}</div>
      <div style="padding:14px 24px;font-size:12px;color:#71717a;border-top:1px solid #e4e4e7">Mensagem automática — Contric Gestão de Obras.</div>
    </div></div>`;
}
// Envolve um handler de rota: qualquer erro inesperado vira uma resposta JSON com mensagem
// (em vez de uma resposta 500 vazia, que o app não consegue explicar ao usuário).
export function rotaSegura(handler) {
  return async (req) => {
    try {
      return await handler(req);
    } catch (e) {
      console.error(e);
      return NextResponse.json({ error: `Erro inesperado no servidor: ${e?.message || e}` }, { status: 500 });
    }
  };
}