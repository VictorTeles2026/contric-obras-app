import { NextResponse } from "next/server";
import { exigirPerfis, gerarSenha, registrarSenha, enviarEmail, emailCliente, urlApp, rotaSegura } from "../../../lib/authServidor";

// Gestão de clientes do portal — master, gerente e coordenador (excluir: só master).
const PERFIS = ["master", "gerente", "coordenador"];
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ROTULOS = { ver_atas: "Atas de reuniões", ver_rdos_assinados: "RDOs assinados (PDF)", ver_linha_tempo: "Linha do tempo" };

function mensagemBoasVindas(cliente, senha) {
  const link = `${urlApp()}/acesso-clientes`;
  const texto = `Olá, ${cliente.nome}!\n\nVocê foi incluído(a) no Acesso Clientes Contric, onde poderá acompanhar as informações das suas obras.\n\nEndereço: ${link}\nUsuário: ${cliente.email}\nSenha: ${senha}\n\nRecomendamos trocar a senha no primeiro acesso (menu "Minha senha").`;
  const html = emailCliente("Bem-vindo(a) ao Acesso Clientes Contric", [
    `Olá, <strong>${esc(cliente.nome)}</strong>!`,
    "Você foi incluído(a) na plataforma da Contric, onde poderá acompanhar as informações das suas obras.",
    `<strong>Usuário:</strong> ${esc(cliente.email)}<br><strong>Senha:</strong> <span style="font-family:monospace;font-size:16px">${esc(senha)}</span>`,
    "Recomendamos trocar a senha no primeiro acesso (menu “Minha senha”).",
  ], { url: link, texto: "Acessar a plataforma" });
  return { texto, html };
}

async function log(admin, quem, acao, detalhe) {
  await admin.from("logs_auditoria").insert({ usuario_id: quem.id, usuario_nome: quem.nome, acao, detalhe });
}

export const POST = rotaSegura(async (req) => {
  const { admin, interno, resposta } = await exigirPerfis(req, PERFIS);
  if (resposta) return resposta;
  const body = await req.json().catch(() => ({}));
  const acao = body.acao;

  // ---------- criar ----------
  if (acao === "criar") {
    const nome = String(body.nome || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    if (!nome || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Nome e e-mail válido são obrigatórios." }, { status: 400 });
    const senha = gerarSenha(10);
    const { data: criado, error: e1 } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
    if (e1) return NextResponse.json({ error: /registered|exists/i.test(e1.message) ? "Já existe um login com esse e-mail." : e1.message }, { status: 400 });
    const { data: cliente, error: e2 } = await admin.from("clientes").insert({
      nome, email, empresa: body.empresa?.trim() || null, funcao: body.funcao?.trim() || null, telefone: body.telefone?.trim() || null,
      auth_user_id: criado.user.id, ativo: true,
    }).select().single();
    if (e2) {
      await admin.auth.admin.deleteUser(criado.user.id);
      return NextResponse.json({ error: /clientes/.test(e2.message) ? "Cadastro de clientes ainda não criado — rode o script clientes-senhas.sql." : e2.message }, { status: 400 });
    }
    await registrarSenha(admin, { authUserId: criado.user.id, nome, email, tipo: "cliente", senha, definidaPor: interno.nome, origem: "criacao" });
    const msg = mensagemBoasVindas(cliente, senha);
    const envio = await enviarEmail({ para: email, assunto: "Seu acesso à plataforma Contric", html: msg.html, texto: msg.texto });
    await log(admin, interno, "Cadastrou cliente", `${nome} (${email})${cliente.empresa ? ` — ${cliente.empresa}` : ""} · e-mail ${envio.enviado ? "enviado" : "NÃO enviado"}`);
    return NextResponse.json({ cliente, senha, envio, mensagem: msg.texto });
  }

  const { data: cliente } = await admin.from("clientes").select("*").eq("id", body.id || body.clienteId).maybeSingle();
  if (!cliente) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

  // ---------- editar ----------
  if (acao === "editar") {
    const email = String(body.email || cliente.email).trim().toLowerCase();
    if (email !== cliente.email) {
      const { error } = await admin.auth.admin.updateUserById(cliente.auth_user_id, { email, email_confirm: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const patch = { nome: String(body.nome || cliente.nome).trim(), email, empresa: body.empresa?.trim() || null, funcao: body.funcao?.trim() || null, telefone: body.telefone?.trim() || null };
    const { data, error } = await admin.from("clientes").update(patch).eq("id", cliente.id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await log(admin, interno, "Editou cliente", `${patch.nome} (${email})`);
    return NextResponse.json({ cliente: data });
  }

  // ---------- ativar / desativar ----------
  if (acao === "ativo") {
    await admin.auth.admin.updateUserById(cliente.auth_user_id, { ban_duration: body.ativo ? "none" : "876000h" });
    await admin.from("clientes").update({ ativo: !!body.ativo }).eq("id", cliente.id);
    await log(admin, interno, body.ativo ? "Reativou cliente" : "Desativou cliente", `${cliente.nome} (${cliente.email})`);
    return NextResponse.json({ ok: true });
  }

  // ---------- nova senha aleatória ----------
  if (acao === "redefinir_senha") {
    const senha = gerarSenha(10);
    const { error } = await admin.auth.admin.updateUserById(cliente.auth_user_id, { password: senha });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await registrarSenha(admin, { authUserId: cliente.auth_user_id, nome: cliente.nome, email: cliente.email, tipo: "cliente", senha, definidaPor: interno.nome, origem: "redefinicao" });
    const msg = mensagemBoasVindas(cliente, senha);
    const envio = await enviarEmail({ para: cliente.email, assunto: "Sua nova senha — plataforma Contric", html: msg.html, texto: msg.texto });
    await log(admin, interno, "Redefiniu senha de cliente", `${cliente.nome} · e-mail ${envio.enviado ? "enviado" : "NÃO enviado"}`);
    return NextResponse.json({ senha, envio, mensagem: msg.texto });
  }

  // ---------- excluir (só master) ----------
  if (acao === "excluir") {
    if (interno.perfil !== "master") return NextResponse.json({ error: "Somente o Master pode excluir clientes." }, { status: 403 });
    await admin.from("clientes").delete().eq("id", cliente.id);
    if (cliente.auth_user_id) await admin.auth.admin.deleteUser(cliente.auth_user_id);
    await log(admin, interno, "Excluiu cliente (Master)", `${cliente.nome} (${cliente.email})${body.motivo ? ` · motivo: ${body.motivo}` : ""}`);
    return NextResponse.json({ ok: true });
  }

  // ---------- acessos a um PI ----------
  if (acao === "acesso") {
    const { data: pi } = await admin.from("pis").select("id,codigo,cliente,projeto").eq("id", body.piId).maybeSingle();
    if (!pi) return NextResponse.json({ error: "PI não encontrado." }, { status: 404 });
    const flags = { ver_atas: !!body.ver_atas, ver_rdos_assinados: !!body.ver_rdos_assinados, ver_linha_tempo: !!body.ver_linha_tempo };
    const { data: anterior } = await admin.from("cliente_acessos").select("*").eq("cliente_id", cliente.id).eq("pi_id", pi.id).maybeSingle();
    const nomePi = `${pi.codigo} — ${pi.cliente || ""}${pi.projeto ? ` — ${pi.projeto}` : ""}`;
    if (!Object.values(flags).some(Boolean)) {
      if (anterior) await admin.from("cliente_acessos").delete().eq("id", anterior.id);
      await log(admin, interno, "Removeu acesso de cliente", `${cliente.nome} · ${nomePi}`);
      return NextResponse.json({ ok: true, removido: true });
    }
    const { error } = await admin.from("cliente_acessos").upsert({ cliente_id: cliente.id, pi_id: pi.id, ...flags }, { onConflict: "cliente_id,pi_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const liberados = Object.entries(flags).filter(([, v]) => v).map(([k]) => ROTULOS[k]);
    const mudou = !anterior || Object.keys(flags).some((k) => !!anterior[k] !== flags[k]);
    let envio = { enviado: false, motivo: "sem alterações" };
    if (mudou) {
      const texto = `Olá, ${cliente.nome}!\n\n${anterior ? "Seu acesso foi atualizado" : "Você recebeu acesso"} ao ${nomePi}.\nInformações disponíveis: ${liberados.join(", ")}.\n\nAcesse: ${urlApp()}/acesso-clientes`;
      envio = await enviarEmail({
        para: cliente.email, assunto: `${anterior ? "Acesso atualizado" : "Novo acesso"}: ${pi.codigo}`, texto,
        html: emailCliente(anterior ? "Seu acesso foi atualizado" : "Você recebeu acesso a uma obra", [
          `Olá, <strong>${esc(cliente.nome)}</strong>!`,
          `${anterior ? "Seu acesso foi atualizado" : "Você recebeu acesso"} ao <strong>${esc(nomePi)}</strong>.`,
          `Informações disponíveis: <strong>${liberados.map(esc).join(", ")}</strong>.`,
        ], { url: `${urlApp()}/acesso-clientes`, texto: "Ver na plataforma" }),
      });
    }
    await log(admin, interno, anterior ? "Alterou acesso de cliente" : "Deu acesso a cliente", `${cliente.nome} · ${nomePi} · ${liberados.join(", ")} · e-mail ${envio.enviado ? "enviado" : "NÃO enviado"}`);
    return NextResponse.json({ ok: true, envio });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
});
