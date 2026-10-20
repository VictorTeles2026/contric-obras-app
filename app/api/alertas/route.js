import { NextResponse } from "next/server";
import { identificar, permissoesDe, supabaseAdmin, enviarEmail, emailCliente, urlApp, rotaSegura } from "../../../lib/authServidor";
import { resolverPermissoes } from "../../../lib/permissoes";
import { ALERTAS, PRAZOS } from "../../../lib/constantes";

// Alertas automáticos por e-mail.
// - Toda notificação do sininho entra numa fila (notificacoes.email_status = null). O app chama
//   POST {acao:"despachar"} logo depois de notificar, e o cron diário também despacha.
// - GET = cron diário (Vercel, vercel.json): gera o resumo de aprovações pendentes e de prazos
//   (vira notificação no sininho + e-mail) e despacha a fila — inclusive o que ficou no silêncio.
// - POST {acao:"cliente"}: avisa clientes do portal (ata, RDO/ocorrência assinados, linha do tempo, documento).
export const dynamic = "force-dynamic";
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const emailReal = (e) => !!e && /@/.test(e) && !/@usuarios\.contric\.local$/i.test(e);
const agoraSP = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour === "24" ? "00" : p.hour}:${p.minute}` };
};
const dataBR = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

async function padraoAlertas(admin) {
  const { data } = await admin.from("configuracoes").select("valor").eq("chave", "alertas").maybeSingle();
  return { ...ALERTAS, ...(data?.valor || {}) };
}
function emSilencio(cfg) {
  const { hora } = agoraSP(), i = cfg.silencioInicio, f = cfg.silencioFim;
  if (!i || !f || i === f) return false;
  return i < f ? hora >= i && hora < f : hora >= i || hora < f; // atravessa a meia-noite
}

// ---------------- fila: notificações → e-mail ----------------
async function despachar(admin, { ignorarSilencio = false } = {}) {
  const desde = new Date(Date.now() - 3 * 86400000).toISOString();
  const { data: fila, error } = await admin.from("notificacoes").select("id,usuario_id,titulo,mensagem,link,tipo")
    .is("email_status", null).gte("created_at", desde).order("created_at").limit(100);
  if (error) return { enviados: 0, motivo: error.message };
  if (!fila?.length) return { enviados: 0 };
  const cfg = await padraoAlertas(admin);
  const silencio = !ignorarSilencio && emSilencio(cfg);
  const ids = [...new Set(fila.map((n) => n.usuario_id))];
  const { data: us } = await admin.from("usuarios").select("id,nome,email,ativo,alertas").in("id", ids);
  const marcar = (id, status) => admin.from("notificacoes").update({ email_status: status }).eq("id", id);
  let enviados = 0;
  for (const n of fila) {
    const u = (us || []).find((x) => x.id === n.usuario_id);
    const prefs = { ...cfg, ...(u?.alertas || {}) };
    const tipo = n.tipo || "decisoes";
    if (!u || u.ativo === false || !emailReal(u.email) || prefs[tipo] !== true) { await marcar(n.id, "ignorado"); continue; }
    if (silencio) continue; // fica na fila até o fim do silêncio
    // reserva a linha (evita e-mail duplicado se dois despachos rodarem juntos)
    const { data: reservada } = await admin.from("notificacoes").update({ email_status: "enviando" }).eq("id", n.id).is("email_status", null).select("id");
    if (!reservada?.length) continue;
    const link = n.link ? `${urlApp()}${n.link}` : urlApp();
    const r = await enviarEmail({
      para: u.email, assunto: n.titulo,
      texto: `Olá, ${u.nome}!\n\n${n.titulo}\n${n.mensagem || ""}\n\nAbrir no sistema: ${link}`,
      html: emailCliente(esc(n.titulo), [`Olá, <strong>${esc(u.nome)}</strong>!`, ...String(n.mensagem || "").split("\n").filter(Boolean).map(esc)],
        { url: link, texto: "Abrir no SGO Contric" }, "SGO Contric"),
    });
    await marcar(n.id, r.enviado ? "enviado" : `erro: ${String(r.motivo || "").slice(0, 180)}`);
    if (r.enviado) enviados++;
  }
  return { enviados };
}

// ---------------- resumo diário (cron) ----------------
async function resumoDiario(admin) {
  const { dia } = agoraSP();
  const em = (n) => new Date(new Date(`${dia}T12:00:00`).getTime() + n * 86400000).toISOString().slice(0, 10);
  const [usuarios, perfis, excecoes, recursos, alocs, pis, rdos, horas, ocs, solic, etapas] = await Promise.all([
    admin.from("usuarios").select("id,nome,perfil,ativo"),
    admin.from("permissoes_perfil").select("perfil,codigo,valor"),
    admin.from("permissoes_usuario").select("usuario_id,codigo,valor,valido_ate"),
    admin.from("recursos").select("id,usuario_id"),
    admin.from("alocacoes_recurso").select("recurso_id,pi_id"),
    admin.from("pis").select("id,codigo,status"),
    admin.from("rdos").select("id,pi_id").eq("status", "pendente"),
    admin.from("apontamentos_horas").select("id,pi_id,usuario_id,entrada,saida,data,status"),
    admin.from("ocorrencias").select("id,pi_id,rdo_id").eq("status", "pendente"),
    admin.from("solicitacoes_alteracao_cronograma").select("id,etapa_id,status"),
    admin.from("etapas").select("id,pi_id,nome,status,data_prevista_fim,medicao"),
  ]).then((rs) => rs.map((r) => r.data || []));

  const codigo = (id) => pis.find((p) => p.id === id)?.codigo || "?";
  const piDaEtapa = (id) => etapas.find((e) => e.id === id)?.pi_id;
  const ativos = new Set(pis.filter((p) => p.status === "ativo" || !p.status).map((p) => p.id));
  const horasPend = horas.filter((h) => h.status === "pendente" && !(h.entrada && !h.saida));
  const solicPend = solic.filter((s) => String(s.status || "").startsWith("pendente")).map((s) => ({ ...s, pi_id: piDaEtapa(s.etapa_id) }));
  const ocsPend = ocs.filter((o) => !o.rdo_id);
  const abertas = etapas.filter((e) => e.status !== "concluida" && e.data_prevista_fim && ativos.has(e.pi_id));
  const atrasadas = abertas.filter((e) => e.data_prevista_fim < dia);
  const vencendo = abertas.filter((e) => e.data_prevista_fim >= dia && e.data_prevista_fim <= em(PRAZOS.atencao));
  const medicoes = abertas.filter((e) => e.medicao && e.data_prevista_fim >= dia && e.data_prevista_fim <= em(PRAZOS.medicoes));

  const novas = [];
  for (const u of usuarios.filter((x) => x.ativo !== false)) {
    const mapa = resolverPermissoes(u.perfil, perfis.filter((p) => p.perfil === u.perfil), excecoes.filter((e) => e.usuario_id === u.id));
    const meusRec = recursos.filter((r) => r.usuario_id === u.id).map((r) => r.id);
    const meusPis = new Set(alocs.filter((a) => meusRec.includes(a.recurso_id)).map((a) => a.pi_id));
    const no = (cod, lista) => (mapa[cod] === "S" ? lista : mapa[cod] === "P" ? lista.filter((x) => meusPis.has(x.pi_id)) : []);

    const pend = [["RDO", no("rdo.aprovar", rdos)], ["lançamento(s) de horas", no("horas.aprovar", horasPend)],
      ["ocorrência(s)", no("ocorrencia.aprovar", ocsPend)], ["solicitação(ões) de cronograma", no("cronograma.aprovar", solicPend)]].filter(([, l]) => l.length);
    if (pend.length) {
      novas.push({ usuario_id: u.id, tipo: "aprovacoes", link: "/aprovacoes", titulo: `Aprovações pendentes — ${dataBR(dia)}`,
        mensagem: pend.map(([r, l]) => `${l.length} ${r} (${[...new Set(l.map((x) => codigo(x.pi_id)))].slice(0, 6).join(", ")})`).join("\n") });
    }

    const linhas = [];
    const at = no("etapa.editar", atrasadas), ve = no("etapa.editar", vencendo), me = no("etapa.editar", medicoes);
    const lista = (l) => l.slice(0, 8).map((e) => `  • ${codigo(e.pi_id)} — ${e.nome} (${dataBR(e.data_prevista_fim)})`).join("\n") + (l.length > 8 ? `\n  • … e mais ${l.length - 8}` : "");
    if (at.length) linhas.push(`${at.length} etapa(s) atrasada(s):\n${lista(at)}`);
    if (ve.length) linhas.push(`${ve.length} etapa(s) vencendo em até ${PRAZOS.atencao} dia(s):\n${lista(ve)}`);
    if (me.length) linhas.push(`${me.length} medição(ões) nos próximos ${PRAZOS.medicoes} dias:\n${lista(me)}`);
    const esquecidos = horas.filter((h) => h.usuario_id === u.id && h.entrada && !h.saida && h.data && h.data < dia);
    if (esquecidos.length) linhas.push(`Você tem check-in aberto desde ${dataBR(esquecidos[0].data)} em ${codigo(esquecidos[0].pi_id)} — faça o check-out ou corrija o lançamento.`);
    if (linhas.length) {
      novas.push({ usuario_id: u.id, tipo: "prazos", link: at.length || ve.length || me.length ? "/linha-do-tempo" : "/minhas-horas",
        titulo: `Prazos e atrasos — ${dataBR(dia)}`, mensagem: linhas.join("\n\n") });
    }
  }
  // não repete o resumo se o cron rodar duas vezes no mesmo dia
  const { data: jaHoje } = await admin.from("notificacoes").select("usuario_id,titulo").in("titulo", [`Aprovações pendentes — ${dataBR(dia)}`, `Prazos e atrasos — ${dataBR(dia)}`]);
  const inserir = novas.filter((n) => !(jaHoje || []).some((j) => j.usuario_id === n.usuario_id && j.titulo === n.titulo));
  if (inserir.length) {
    const { error } = await admin.from("notificacoes").insert(inserir);
    if (error) return { resumos: 0, motivo: error.message };
  }
  return { resumos: inserir.length };
}

// ---------------- clientes do portal ----------------
const CAMPO = { ata: "ver_atas", rdo: "ver_rdos_assinados", ocorrencia: "ver_ocorrencias_assinadas", linha_tempo: "ver_linha_tempo" };
const TITULO = { ata: "Nova ata de reunião disponível", rdo: "Novo RDO assinado disponível", ocorrencia: "Nova ocorrência assinada disponível",
  linha_tempo: "A linha do tempo da obra foi atualizada", documento: "Novo documento disponível" };
async function avisarClientes(admin, { piId, tipo, detalhe, clienteId }) {
  if (!piId || !TITULO[tipo] || (tipo === "documento" && !clienteId)) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  if ((await padraoAlertas(admin)).clientes !== true) return NextResponse.json({ avisados: 0, motivo: "e-mails a clientes desligados (Usuários → Alertas)" });
  let q = admin.from("cliente_acessos").select("*, clientes(*)").eq("pi_id", piId);
  q = tipo === "documento" ? q.eq("cliente_id", clienteId) : q.eq(CAMPO[tipo], true);
  const { data: acessos, error } = await q;
  if (error) return NextResponse.json({ avisados: 0, motivo: error.message });
  const { data: pi } = await admin.from("pis").select("codigo,cliente,projeto").eq("id", piId).maybeSingle();
  const agora = Date.now();
  let avisados = 0;
  for (const a of acessos || []) {
    const c = a.clientes;
    if (!c || c.ativo === false || !emailReal(c.email)) continue;
    // a linha do tempo muda muito: no máximo 1 aviso a cada 24h por cliente/PI
    if (tipo === "linha_tempo" && a.ultimo_aviso_linha_tempo && agora - new Date(a.ultimo_aviso_linha_tempo).getTime() < 24 * 3600 * 1000) continue;
    const nomePi = `${pi?.codigo || ""} — ${pi?.cliente || ""}${pi?.projeto ? ` — ${pi.projeto}` : ""}`;
    const r = await enviarEmail({
      para: c.email, assunto: `${TITULO[tipo]} — ${pi?.codigo || "obra"}`,
      texto: `Olá, ${c.nome}!\n\n${TITULO[tipo]} em ${nomePi}.${detalhe ? `\n${detalhe}` : ""}\n\nAcesse: ${urlApp()}/acesso-clientes`,
      html: emailCliente(TITULO[tipo], [`Olá, <strong>${esc(c.nome)}</strong>!`, `Obra: <strong>${esc(nomePi)}</strong>`, detalhe ? esc(detalhe) : ""].filter(Boolean),
        { url: `${urlApp()}/acesso-clientes`, texto: "Ver na plataforma" }),
    });
    if (r.enviado) {
      avisados++;
      if (tipo === "linha_tempo") await admin.from("cliente_acessos").update({ ultimo_aviso_linha_tempo: new Date().toISOString() }).eq("id", a.id);
    }
  }
  return NextResponse.json({ avisados });
}

export const POST = rotaSegura(async (req) => {
  const { admin, interno, resposta } = await identificar(req);
  if (resposta) return resposta;
  if (!interno) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });
  const corpo = await req.json().catch(() => ({}));
  if (corpo.acao === "despachar") return NextResponse.json(await despachar(admin));
  if (corpo.acao === "cliente") return avisarClientes(admin, corpo);
  // preferências: do próprio usuário, ou de vários usuários (Usuários → Alertas, exige usuario.editar)
  // corpo.itens = [{ usuarioId, alertas }] — sem itens, vale para quem chama
  if (corpo.acao === "preferencias") {
    const itens = Array.isArray(corpo.itens) ? corpo.itens : [{ usuarioId: interno.id, alertas: corpo.alertas }];
    if (itens.some((i) => i.usuarioId !== interno.id)) {
      const mapa = await permissoesDe(admin, interno);
      if (mapa["usuario.editar"] !== "S") return NextResponse.json({ error: "Seu usuário não pode alterar alertas de outras pessoas." }, { status: 403 });
    }
    for (const i of itens.slice(0, 500)) {
      const prefs = {};
      ["decisoes", "aprovacoes", "prazos"].forEach((k) => { if (typeof i.alertas?.[k] === "boolean") prefs[k] = i.alertas[k]; });
      const { error } = await admin.from("usuarios").update({ alertas: Object.keys(prefs).length ? prefs : null }).eq("id", i.usuarioId);
      if (error) return NextResponse.json({ error: /alertas/.test(error.message) ? "Rode o script alertas-email.sql no Supabase." : error.message }, { status: 400 });
    }
    if (itens.some((i) => i.usuarioId !== interno.id)) {
      await admin.from("logs_auditoria").insert({ usuario_id: interno.id, usuario_nome: interno.nome, acao: "Alterou alertas por e-mail", detalhe: `${itens.length} usuário(s)` });
    }
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
});

// cron diário — a Vercel envia "Authorization: Bearer <CRON_SECRET>"
export const GET = rotaSegura(async (req) => {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }
  const admin = supabaseAdmin();
  const resumo = await resumoDiario(admin);
  const fila = await despachar(admin, { ignorarSilencio: true });
  return NextResponse.json({ ...resumo, ...fila });
});
