import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { resolverPermissoes, PERFIS_INTERNOS } from "./permissoes";

// ATENÇÃO: este cliente usa a service_role key (acesso total, ignora RLS).
// Só pode ser usado em código que roda no SERVIDOR (rotas /api/*), nunca em "use client".
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

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

export const PERFIS_VALIDOS = PERFIS_INTERNOS;

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

// permissões vigentes de um usuário interno (matriz do perfil + exceções dele)
export async function permissoesDe(admin, interno) {
  const [{ data: doPerfil, error }, { data: excecoes }] = await Promise.all([
    admin.from("permissoes_perfil").select("codigo, valor").eq("perfil", interno.perfil),
    admin.from("permissoes_usuario").select("codigo, valor, valido_ate").eq("usuario_id", interno.id),
  ]);
  return resolverPermissoes(interno.perfil, error ? null : doPerfil, excecoes || []);
}

// exige usuário interno com a permissão (S ou P) — ou com QUALQUER uma de uma lista
export async function exigirPermissao(req, codigos) {
  const r = await identificar(req);
  if (r.resposta) return r;
  if (!r.interno) return { resposta: NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 }) };
  const mapa = await permissoesDe(r.admin, r.interno);
  const lista = Array.isArray(codigos) ? codigos : [codigos];
  if (!lista.some((c) => mapa[c] === "S" || mapa[c] === "P")) {
    return { resposta: NextResponse.json({ error: "Seu usuário não tem permissão para esta ação." }, { status: 403 }) };
  }
  return { ...r, solicitante: r.interno, permissoes: mapa, tem: (c) => mapa[c] === "S" || mapa[c] === "P" };
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

// ---- senhas ----
// As senhas NÃO são guardadas em lugar nenhum (antes havia um registro reversível; removido por segurança).
export function gerarSenha(tamanho = 10) {
  // sem caracteres ambíguos (0/O, 1/l/I) — fácil de digitar no celular
  const letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(tamanho);
  let s = "";
  for (let i = 0; i < tamanho; i++) s += letras[bytes[i] % letras.length];
  return /\d/.test(s) ? s : s.slice(0, -1) + String(2 + (bytes[0] % 8));
}
// remetente a partir de EMAIL_REMETENTE ("Nome <endereco>" ou só o endereço). Limpa caracteres
// invisíveis/acentos que entram ao copiar e colar (o Resend recusa endereço com não-ASCII).
function remetente() {
  const bruto = String(process.env.EMAIL_REMETENTE || "").normalize("NFKC").replace(/[​-‍﻿ ]/g, " ").trim();
  if (!bruto) return "Contric <onboarding@resend.dev>";
  const m = bruto.match(/^(.*?)<([^>]+)>\s*$/);
  const endereco = (m ? m[2] : bruto).replace(/[^\x21-\x7E]/g, "").replace(/^["']|["']$/g, "");
  const nome = (m ? m[1] : "").replace(/["<>]/g, "").trim().normalize("NFD").replace(/[^\x20-\x7E]/g, "");
  return nome ? `${nome} <${endereco}>` : endereco;
}

// ---- e-mail (Resend). Sem RESEND_API_KEY configurada, não envia e avisa. ----
// anexos: [{ nome, base64 }] (opcional)
export async function enviarEmail({ para, assunto, html, texto, anexos = [] }) {
  // Forma mais simples: SMTP do e-mail que a empresa já usa (Gmail, Outlook, Locaweb...)
  if (process.env.SMTP_USUARIO && process.env.SMTP_SENHA) {
    try {
      const nodemailer = (await import("nodemailer")).default;
      const usuario = process.env.SMTP_USUARIO;
      const host = process.env.SMTP_SERVIDOR
        || (/@(gmail|googlemail)\.com$/i.test(usuario) ? "smtp.gmail.com"
          : /@(outlook|hotmail|live)\.com/i.test(usuario) ? "smtp-mail.outlook.com" : "smtp.gmail.com");
      const porta = Number(process.env.SMTP_PORTA || 465);
      const transporte = nodemailer.createTransport({ host, port: porta, secure: porta === 465, auth: { user: usuario, pass: process.env.SMTP_SENHA } });
      await transporte.sendMail({ from: process.env.EMAIL_REMETENTE || `Contric <${usuario}>`, to: para, subject: assunto, html, text: texto, attachments: anexos.map((a) => ({ filename: a.nome, content: Buffer.from(a.base64, "base64") })) });
      return { enviado: true };
    } catch (e) {
      return { enviado: false, motivo: `Falha no envio pelo SMTP: ${e.message}` };
    }
  }
  const chave = (process.env.RESEND_API_KEY || "").trim();
  if (!chave) return { enviado: false, motivo: "envio de e-mail ainda não configurado — falta SMTP_USUARIO/SMTP_SENHA (ou RESEND_API_KEY)" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: remetente(), to: [String(para).trim()], subject: assunto, html, text: texto, ...(anexos.length ? { attachments: anexos.map((a) => ({ filename: a.nome, content: a.base64 })) } : {}) }),
    });
    if (!r.ok) return { enviado: false, motivo: `Falha no envio (${r.status}): ${(await r.text()).slice(0, 200)}` };
    return { enviado: true };
  } catch (e) {
    return { enviado: false, motivo: e.message };
  }
}

export const urlApp = () => (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "").replace(/\/$/, "");

// modelo visual dos e-mails do portal de clientes (cinza escuro)
export function emailCliente(titulo, paragrafos, botao, cabecalho = "Acesso Clientes Contric") {
  const corpo = paragrafos.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#27272a">${p}</p>`).join("");
  const link = botao?.url ? `<p style="margin:20px 0 0"><a href="${botao.url}" style="background:#27272a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;display:inline-block">${botao.texto}</a></p>` : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f4f5;padding:24px">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e7">
      <div style="background:#27272a;color:#fff;padding:18px 24px;font-size:18px;font-weight:700">${cabecalho}</div>
      <div style="padding:24px"><h2 style="margin:0 0 14px;font-size:18px;color:#18181b">${titulo}</h2>${corpo}${link}</div>
      <div style="padding:14px 24px;font-size:12px;color:#71717a;border-top:1px solid #e4e4e7">Mensagem automática — Contric Gestão de Obras.</div>
    </div></div>`;
}
// ---------------- Contric Transfer: e-mail de aviso + cópia a quem enviou + evidência salva ----------------
// destinatarios: [{ nome, email, papel }] (clientes avisados; ou a equipe, quando quem envia é o cliente)
// remetente: { nome, email, tipo: "interno" | "cliente" }; arquivos: [{ nome, tamanho }]
// A evidência (HTML) fica em "<pi>/EVIDENCIA_TRANSFER_..." — fora do prefixo TRANSFER_, NÃO é apagada.
export async function avisoTransferComEvidencia(admin, { pi, remetente, destinatarios = [], arquivos = [], ateBR }) {
  const e = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const real = (m) => !!m && /@/.test(m) && !/@usuarios\.contric\.local$/i.test(m);
  const tam = (b) => (b == null ? "—" : b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1).replace(".", ",")} MB`);
  const agora = new Date();
  const quando = agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const nomePi = `${pi.codigo} — ${pi.cliente || ""}${pi.projeto ? ` — ${pi.projeto}` : ""}`;
  const doCliente = remetente.tipo === "cliente";
  const titulo = doCliente ? "Arquivo(s) recebido(s) pelo Contric Transfer" : "Novo arquivo no Contric Transfer";
  const assunto = `${titulo} — ${pi.codigo}`;
  const lista = arquivos.map((a) => `• ${a.nome} (${tam(a.tamanho)})`).join("\n");
  const listaHtml = `<ul style="margin:0;padding-left:18px">${arquivos.map((a) => `<li>${e(a.nome)} <span style="color:#71717a">(${tam(a.tamanho)})</span></li>`).join("")}</ul>`;
  const corpo = (para) => [
    `Olá, <strong>${e(para)}</strong>!`,
    `Obra: <strong>${e(nomePi)}</strong>`,
    `Enviado por <strong>${e(remetente.nome)}</strong>${doCliente ? " (cliente)" : " (Contric)"} em ${e(quando)}:`,
    listaHtml,
    `Disponível até <strong>${e(ateBR)}</strong> — depois disso o(s) arquivo(s) será(ão) apagado(s) automaticamente. Baixe e guarde uma cópia.`,
  ];
  const texto = (para) => `Olá, ${para}!\n\n${titulo} em ${nomePi}.\nEnviado por ${remetente.nome} em ${quando}:\n${lista}\n\nDisponível até ${ateBR}; depois será apagado automaticamente.\n\nAcesse: ${urlApp()}${doCliente ? "" : "/acesso-clientes"}`;
  const botao = { url: `${urlApp()}${doCliente ? `/documentos?pi=${pi.id}&pasta=TRANSFER` : "/acesso-clientes"}`, texto: "Ver na plataforma" };

  const envios = [];
  for (const d of destinatarios) {
    if (!real(d.email)) { envios.push({ ...d, status: "sem e-mail válido" }); continue; }
    const r = await enviarEmail({ para: d.email, assunto, html: emailCliente(titulo, corpo(d.nome), botao), texto: texto(d.nome) });
    envios.push({ ...d, status: r.enviado ? "enviado" : `falhou: ${r.motivo}` });
  }
  // cópia sempre para quem carregou os arquivos
  const paraQuem = destinatarios.map((d) => `${d.nome} <${d.email || "sem e-mail"}>`).join(", ") || "ninguém (sem destinatários)";
  if (real(remetente.email)) {
    const r = await enviarEmail({ para: remetente.email, assunto: `[Cópia] ${assunto}`,
      html: emailCliente(`[Cópia] ${titulo}`, [`<em>Cópia do aviso enviado a: ${e(paraQuem)}</em>`, ...corpo(remetente.nome)], botao),
      texto: `[Cópia do aviso enviado a: ${paraQuem}]\n\n${texto(remetente.nome)}` });
    envios.push({ nome: remetente.nome, email: remetente.email, papel: "cópia para quem enviou", status: r.enviado ? "enviado" : `falhou: ${r.motivo}` });
  } else envios.push({ nome: remetente.nome, email: remetente.email || "—", papel: "cópia para quem enviou", status: "sem e-mail válido" });

  // evidência: registro do envio (arquivos, quem, quando, para quem e o resultado de cada e-mail) + cópia do e-mail
  const linhas = (l) => l.map((c) => `<td style="border:1px solid #ddd;padding:6px 8px">${c}</td>`).join("");
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Evidência Contric Transfer — ${e(pi.codigo)}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#18181b;max-width:900px;margin:24px auto;padding:0 16px">
<h1 style="font-size:20px">Evidência de envio — Contric Transfer</h1>
<table style="border-collapse:collapse;font-size:14px;margin-bottom:16px">
<tr>${linhas(["<strong>Obra</strong>", e(nomePi)])}</tr>
<tr>${linhas(["<strong>Data e hora (Brasília)</strong>", e(quando)])}</tr>
<tr>${linhas(["<strong>Registro (UTC)</strong>", e(agora.toISOString())])}</tr>
<tr>${linhas(["<strong>Enviado por</strong>", `${e(remetente.nome)} ${remetente.email ? `&lt;${e(remetente.email)}&gt;` : ""} · ${doCliente ? "cliente (Acesso Clientes)" : "usuário Contric"}`])}</tr>
<tr>${linhas(["<strong>Disponível até</strong>", `${e(ateBR)} (apagado automaticamente depois)`])}</tr>
</table>
<h2 style="font-size:16px">Arquivos</h2>
<table style="border-collapse:collapse;font-size:13px;margin-bottom:16px"><tr>${linhas(["<strong>Arquivo</strong>", "<strong>Tamanho</strong>", "<strong>Local</strong>"])}</tr>
${arquivos.map((a) => `<tr>${linhas([e(a.nome), tam(a.tamanho), e(`documentos/${pi.id}/${a.nome}`)])}</tr>`).join("")}</table>
<h2 style="font-size:16px">E-mails de aviso</h2>
<table style="border-collapse:collapse;font-size:13px;margin-bottom:16px"><tr>${linhas(["<strong>Destinatário</strong>", "<strong>E-mail</strong>", "<strong>Papel</strong>", "<strong>Resultado</strong>"])}</tr>
${envios.map((d) => `<tr>${linhas([e(d.nome), e(d.email || "—"), e(d.papel || ""), e(d.status)])}</tr>`).join("")}</table>
<h2 style="font-size:16px">Cópia do e-mail enviado</h2>
<p style="font-size:13px"><strong>Assunto:</strong> ${e(assunto)}</p>
${emailCliente(titulo, corpo(destinatarios[0]?.nome || "destinatário"), botao)}
<p style="font-size:11px;color:#71717a;margin-top:16px">Documento gerado automaticamente pelo SGO Contric no momento do envio.</p>
</body></html>`;
  const sp = new Date(agora.getTime() - 3 * 3600000).toISOString();
  const carimbo = `${sp.slice(0, 10).replace(/-/g, "")}_${sp.slice(11, 19).replace(/:/g, "")}`;
  const cod = String(pi.codigo || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").toUpperCase();
  const caminho = `${pi.id}/EVIDENCIA_TRANSFER_${carimbo}_${cod}_${Math.random().toString(36).slice(2, 6).toUpperCase()}.html`;
  const { error } = await admin.storage.from("documentos").upload(caminho, new Blob([html], { type: "text/html" }), { contentType: "text/html; charset=utf-8" });
  return { envios, evidencia: error ? null : caminho, erroEvidencia: error?.message };
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