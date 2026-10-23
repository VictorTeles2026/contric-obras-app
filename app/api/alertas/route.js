import { NextResponse } from "next/server";
import { identificar, permissoesDe, supabaseAdmin, enviarEmail, emailCliente, urlApp, rotaSegura } from "../../../lib/authServidor";
import { resolverPermissoes } from "../../../lib/permissoes";
import { ALERTAS, PRAZOS, TIPOS_ALERTA, MODELO_EMAIL, montarEmailEquipe, datasAlertaEtapa } from "../../../lib/constantes";

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
  const { data: linhaModelo } = await admin.from("configuracoes").select("valor").eq("chave", "modelo_email").maybeSingle();
  const modelo = { ...MODELO_EMAIL, ...(linhaModelo?.valor || {}) };
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
    const email = montarEmailEquipe(modelo, { nome: u.nome, titulo: n.titulo, mensagem: n.mensagem, tipo, link, data: dataBR(agoraSP().dia) });
    const r = await enviarEmail({ para: u.email, assunto: email.assunto, texto: email.texto, html: email.html });
    await marcar(n.id, r.enviado ? "enviado" : `erro: ${String(r.motivo || "").slice(0, 180)}`);
    if (r.enviado) enviados++;
  }
  return { enviados };
}

// ---------------- resumo diário (cron) ----------------
// Alçada: cada pessoa só recebe o que a função dela cobre (permissões do perfil + exceções) e
// só dos PIs em que está ALOCADA ou é RESPONSÁVEL por alguma etapa. O Master vê todos os PIs.
const diaSemana = (iso) => new Date(`${iso}T12:00:00`).getDay(); // 0 = domingo
const somarDias = (iso, n) => new Date(new Date(`${iso}T12:00:00`).getTime() + n * 86400000).toISOString().slice(0, 10);
const cobre = (a, d) => (!a.periodo_inicio || a.periodo_inicio <= d) && (!a.periodo_fim || a.periodo_fim >= d);

async function resumoDiario(admin) {
  const { dia } = agoraSP();
  const desde = somarDias(dia, -30);
  const cfg = await padraoAlertas(admin);
  const [usuarios, perfis, excecoes, recursos, alocs, pis, rdos, horas, ocs, solic, etapas] = await Promise.all([
    admin.from("usuarios").select("id,nome,perfil,ativo"),
    admin.from("permissoes_perfil").select("perfil,codigo,valor"),
    admin.from("permissoes_usuario").select("usuario_id,codigo,valor,valido_ate"),
    admin.from("recursos").select("id,usuario_id"),
    admin.from("alocacoes_recurso").select("recurso_id,pi_id,etapa_id,periodo_inicio,periodo_fim"),
    admin.from("pis").select("id,codigo,status"),
    admin.from("rdos").select("id,pi_id,lider_id,data,status,created_at").gte("data", desde),
    admin.from("apontamentos_horas").select("id,pi_id,usuario_id,entrada,saida,data,status,created_at").gte("data", desde),
    admin.from("ocorrencias").select("id,pi_id,rdo_id,status,registrado_por,categoria,created_at").gte("created_at", `${desde}T00:00:00`),
    admin.from("solicitacoes_alteracao_cronograma").select("id,etapa_id,status"),
    admin.from("etapas").select("*"),
  ]).then((rs) => rs.map((r) => r.data || []));

  const codigo = (id) => pis.find((p) => p.id === id)?.codigo || "?";
  const nomeEtapa = (id) => etapas.find((e) => e.id === id)?.nome || "etapa";
  const piDaEtapa = (id) => etapas.find((e) => e.id === id)?.pi_id;
  const ativos = new Set(pis.filter((p) => p.status === "ativo" || !p.status).map((p) => p.id));
  const horasPend = horas.filter((h) => h.status === "pendente" && !(h.entrada && !h.saida));
  const solicPend = solic.filter((s) => String(s.status || "").startsWith("pendente")).map((s) => ({ ...s, pi_id: piDaEtapa(s.etapa_id) }));
  const rdosPend = rdos.filter((r) => r.status === "pendente");
  const ocsPend = ocs.filter((o) => o.status === "pendente" && !o.rdo_id);
  const abertas = etapas.filter((e) => e.status !== "concluida" && e.data_prevista_fim && ativos.has(e.pi_id));
  const atrasadas = abertas.filter((e) => e.data_prevista_fim < dia);
  const vencendo = abertas.filter((e) => e.data_prevista_fim >= dia && e.data_prevista_fim <= somarDias(dia, PRAZOS.atencao));
  const medicoes = abertas.filter((e) => e.medicao && e.data_prevista_fim >= dia && e.data_prevista_fim <= somarDias(dia, PRAZOS.medicoes));
  // últimos 7 dias úteis (seg–sex), sem contar hoje
  const diasUteis = [];
  for (let i = 1; diasUteis.length < 7 && i < 15; i++) { const d = somarDias(dia, -i); if (diaSemana(d) % 6 !== 0) diasUteis.push(d); }
  const segunda = diaSemana(dia) === 1;
  const lista = (l, fmt) => l.slice(0, 10).map((x) => `  • ${fmt(x)}`).join("\n") + (l.length > 10 ? `\n  • … e mais ${l.length - 10}` : "");
  const lEtapa = (e) => `${codigo(e.pi_id)} — ${e.nome} (${dataBR(e.data_prevista_fim)})`;

  const novas = [];
  for (const u of usuarios.filter((x) => x.ativo !== false)) {
    const mapa = resolverPermissoes(u.perfil, perfis.filter((p) => p.perfil === u.perfil), excecoes.filter((e) => e.usuario_id === u.id));
    const tem = (c) => mapa[c] === "S" || mapa[c] === "P";
    const meusRec = new Set(recursos.filter((r) => r.usuario_id === u.id).map((r) => r.id));
    const minhasAlocs = alocs.filter((a) => meusRec.has(a.recurso_id));
    const responsavel = etapas.filter((e) => e.responsavel_id === u.id);
    const meusPis = new Set([...minhasAlocs.map((a) => a.pi_id), ...responsavel.map((e) => e.pi_id)]);
    const todos = u.perfil === "master";
    const doEscopo = (l) => (todos ? l : l.filter((x) => meusPis.has(x.pi_id)));
    const no = (cod, l) => (tem(cod) ? doEscopo(l) : []);
    const add = (tipo, link, titulo, linhas) => linhas.length && novas.push({ usuario_id: u.id, tipo, link, titulo: `${titulo} — ${dataBR(dia)}`, mensagem: linhas.join("\n\n") });

    // aprovações pendentes (quem aprova cada tipo)
    const pend = [["RDO", no("rdo.aprovar", rdosPend)], ["lançamento(s) de horas", no("horas.aprovar", horasPend)],
      ["ocorrência(s)", no("ocorrencia.aprovar", ocsPend)], ["solicitação(ões) de cronograma", no("cronograma.aprovar", solicPend)]].filter(([, l]) => l.length);
    add("aprovacoes", "/aprovacoes", "Aprovações pendentes", pend.map(([r, l]) => `${l.length} ${r} (${[...new Set(l.map((x) => codigo(x.pi_id)))].slice(0, 6).join(", ")})`));

    // prazos e atrasos (quem cuida do cronograma)
    const pz = [];
    const at = no("etapa.editar", atrasadas), ve = no("etapa.editar", vencendo), me = no("etapa.editar", medicoes);
    if (at.length) pz.push(`${at.length} etapa(s) atrasada(s):\n${lista(at, lEtapa)}`);
    if (ve.length) pz.push(`${ve.length} etapa(s) vencendo em até ${PRAZOS.atencao} dia(s):\n${lista(ve, lEtapa)}`);
    if (me.length) pz.push(`${me.length} medição(ões) nos próximos ${PRAZOS.medicoes} dias:\n${lista(me, lEtapa)}`);
    const esquecidos = horas.filter((h) => h.usuario_id === u.id && h.entrada && !h.saida && h.data && h.data < dia);
    if (esquecidos.length) pz.push(`Check-in aberto desde ${dataBR(esquecidos[0].data)} em ${codigo(esquecidos[0].pi_id)} — faça o check-out ou corrija o lançamento.`);
    add("prazos", at.length || ve.length || me.length ? "/linha-do-tempo" : "/minhas-horas", "Prazos e atrasos", pz);

    // atividades pendentes da própria pessoa
    const pe = [];
    if (tem("horas.lancar_proprias")) {
      const semHoras = diasUteis.filter((d) => minhasAlocs.some((a) => cobre(a, d) && ativos.has(a.pi_id))
        && !horas.some((h) => h.usuario_id === u.id && h.data === d && h.status !== "rejeitado"));
      if (semHoras.length) pe.push(`Horas não lançadas em ${semHoras.length} dia(s) em que você estava alocado:\n${lista(semHoras.reverse(), dataBR)}`);
    }
    if (tem("rdo.criar") && u.perfil === "lider") {
      const faltam = [];
      diasUteis.forEach((d) => [...new Set(minhasAlocs.filter((a) => cobre(a, d) && ativos.has(a.pi_id)).map((a) => a.pi_id))]
        .forEach((p) => { if (!rdos.some((r) => r.lider_id === u.id && r.pi_id === p && r.data === d)) faltam.push({ d, p }); }));
      if (faltam.length) pe.push(`RDO não enviado (${faltam.length}):\n${lista(faltam.reverse(), (f) => `${codigo(f.p)} — ${dataBR(f.d)}`)}`);
    }
    const rep = [];
    horas.filter((h) => h.usuario_id === u.id && h.status === "rejeitado" && !horas.some((o) => o.usuario_id === u.id && o.data === h.data && o.status !== "rejeitado"))
      .forEach((h) => rep.push(`Horas de ${dataBR(h.data)} (${codigo(h.pi_id)})`));
    rdos.filter((r) => r.lider_id === u.id && String(r.status).startsWith("rejeit") && !rdos.some((o) => o.lider_id === u.id && o.pi_id === r.pi_id && o.data === r.data && !String(o.status).startsWith("rejeit")))
      .forEach((r) => rep.push(`RDO de ${dataBR(r.data)} (${codigo(r.pi_id)})`));
    ocs.filter((o) => o.registrado_por === u.id && String(o.status).startsWith("rejeit")).forEach((o) => rep.push(`Ocorrência ${o.categoria || ""} (${codigo(o.pi_id)})`));
    if (rep.length) pe.push(`${rep.length} item(ns) reprovado(s) a corrigir:\n${lista(rep, (x) => x)}`);
    if (tem("etapa.percentual")) {
      const limite = new Date(Date.now() - (Number(cfg.diasSemPercentual) || 7) * 86400000).toISOString();
      const minhasEtapas = new Set([...minhasAlocs.map((a) => a.etapa_id).filter(Boolean), ...responsavel.map((e) => e.id)]);
      const paradas = etapas.filter((e) => minhasEtapas.has(e.id) && e.status === "em_andamento" && ativos.has(e.pi_id)
        && (e.percentual_atualizado_em || e.created_at || "") < limite);
      if (paradas.length) pe.push(`${paradas.length} etapa(s) em andamento sem % atualizado há mais de ${cfg.diasSemPercentual || 7} dias:\n${lista(paradas, (e) => `${codigo(e.pi_id)} — ${e.nome} (${Number(e.percentual) || 0}%)`)}`);
    }
    add("pendentes", "/minhas-horas", "Atividades pendentes", pe);

    // agenda: atividades em que está alocado (hoje e próximos 3 dias; na segunda, a semana)
    const ag = [];
    const comEtapa = minhasAlocs.filter((a) => a.etapa_id && ativos.has(a.pi_id)).map((a) => ({ a, e: etapas.find((x) => x.id === a.etapa_id) })).filter(({ e }) => e && e.status !== "concluida");
    const fmtA = ({ a, e }) => `${codigo(a.pi_id)} — ${e.nome} · ${dataBR(a.periodo_inicio)} a ${dataBR(a.periodo_fim)} · ${Number(e.percentual) || 0}%${e.data_prevista_fim && e.data_prevista_fim < dia ? " · ATRASADA" : ""}`;
    const hoje = comEtapa.filter(({ a }) => cobre(a, dia));
    const proximos = comEtapa.filter(({ a }) => !cobre(a, dia) && a.periodo_inicio > dia && a.periodo_inicio <= somarDias(dia, 3));
    if (hoje.length) ag.push(`Hoje (${hoje.length}):\n${lista(hoje, fmtA)}`);
    if (proximos.length) ag.push(`Começam nos próximos 3 dias:\n${lista(proximos, fmtA)}`);
    if (segunda) {
      const sexta = somarDias(dia, 4);
      const semana = comEtapa.filter(({ a }) => (!a.periodo_inicio || a.periodo_inicio <= sexta) && (!a.periodo_fim || a.periodo_fim >= dia));
      if (semana.length) ag.push(`Sua semana (${dataBR(dia)} a ${dataBR(sexta)}):\n${lista(semana, fmtA)}`);
    }
    add("agenda", "/minhas-horas", segunda ? "Sua agenda da semana" : "Sua agenda", ag);
  }
  // alertas de prazo programados nas etapas (Configurar Cronograma → sino): hoje é uma das datas de aviso
  const ativosIds = new Set(usuarios.filter((x) => x.ativo !== false).map((x) => x.id));
  for (const e of etapas.filter((x) => x.alertas && x.status !== "concluida" && ativos.has(x.pi_id))) {
    const aviso = datasAlertaEtapa(e).find((a) => a.data === dia);
    if (!aviso) continue;
    const destinos = new Set([
      ...alocs.filter((a) => a.etapa_id === e.id).map((a) => recursos.find((r) => r.id === a.recurso_id)?.usuario_id),
      e.responsavel_id,
    ].filter((id) => id && ativosIds.has(id)));
    const quando = aviso.dias === 0 ? `hoje é o ${aviso.ref} previsto` : `faltam ${aviso.dias} dia(s) para o ${aviso.ref} previsto (${dataBR(aviso.base)})`;
    const macro = e.parent_etapa_id ? etapas.find((m) => m.id === e.parent_etapa_id)?.nome : null;
    destinos.forEach((uid) => novas.push({
      usuario_id: uid, tipo: "lembrete", link: `/linha-do-tempo`,
      titulo: `Alerta de prazo: ${e.nome} — ${codigo(e.pi_id)} — ${dataBR(dia)}`,
      mensagem: [`${codigo(e.pi_id)}${macro ? ` · ${macro}` : ""} · ${e.nome}`, `Atenção: ${quando}.`,
        `Período: ${dataBR(e.data_prevista_inicio)} a ${dataBR(e.data_prevista_fim)} · ${Number(e.percentual) || 0}% concluído.`].join("\n"),
    }));
  }
  // não repete o resumo se o cron rodar duas vezes no mesmo dia
  const titulos = [...new Set(novas.map((n) => n.titulo))];
  const { data: jaHoje } = titulos.length ? await admin.from("notificacoes").select("usuario_id,titulo").in("titulo", titulos) : { data: [] };
  const inserir = novas.filter((n) => !(jaHoje || []).some((j) => j.usuario_id === n.usuario_id && j.titulo === n.titulo));
  if (inserir.length) {
    const { error } = await admin.from("notificacoes").insert(inserir);
    if (error) return { resumos: 0, motivo: error.message };
  }
  return { resumos: inserir.length };
}

// ---------------- alocação em PI (na hora) ----------------
// evento: "criada" | "alterada" | "removida". Avisa a pessoa do recurso e, com cópia, os
// coordenadores/gerentes alocados ou responsáveis naquele PI (menos quem fez a alteração).
async function avisarAlocacao(admin, interno, { evento, alocacoes }) {
  if (!["criada", "alterada", "removida"].includes(evento) || !Array.isArray(alocacoes) || !alocacoes.length) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const lista = alocacoes.slice(0, 200);
  const recIds = [...new Set(lista.map((a) => a.recurso_id))], piIds = [...new Set(lista.map((a) => a.pi_id))];
  const [{ data: recs }, { data: pis }, { data: etapas }, { data: chefes }, { data: todosRec }, { data: alocsPi }] = await Promise.all([
    admin.from("recursos").select("id,nome,usuario_id").in("id", recIds),
    admin.from("pis").select("id,codigo,cliente").in("id", piIds),
    admin.from("etapas").select("id,nome,pi_id,responsavel_id").in("pi_id", piIds),
    admin.from("usuarios").select("id,perfil,ativo").in("perfil", ["coordenador", "gerente"]),
    admin.from("recursos").select("id,usuario_id"),
    admin.from("alocacoes_recurso").select("recurso_id,pi_id").in("pi_id", piIds),
  ]);
  const VERBO = { criada: "Você foi alocado", alterada: "Sua alocação mudou", removida: "Você saiu de uma alocação" };
  const VERBO3 = { criada: "alocado", alterada: "teve a alocação alterada", removida: "removido" };
  const novas = [];
  for (const a of lista) {
    const r = (recs || []).find((x) => x.id === a.recurso_id);
    const pi = (pis || []).find((x) => x.id === a.pi_id);
    const etapa = (etapas || []).find((x) => x.id === a.etapa_id);
    const onde = `${pi?.codigo || "PI"}${pi?.cliente ? ` (${pi.cliente})` : ""}${etapa ? ` · ${etapa.nome}` : ""}`;
    const periodo = a.periodo_inicio ? `Período: ${dataBR(a.periodo_inicio)} a ${dataBR(a.periodo_fim)}` : "";
    if (r?.usuario_id && r.usuario_id !== interno.id) {
      novas.push({ usuario_id: r.usuario_id, tipo: "alocacao", link: "/minhas-horas", titulo: `${VERBO[evento]} — ${pi?.codigo || "PI"}`,
        mensagem: [onde, evento !== "removida" ? periodo : "", `Por ${interno.nome}.`].filter(Boolean).join("\n") });
    }
    // cópia: coordenadores/gerentes do PI (alocados nele ou responsáveis por etapa dele)
    const doPi = new Set([
      ...(alocsPi || []).filter((x) => x.pi_id === a.pi_id).map((x) => (todosRec || []).find((t) => t.id === x.recurso_id)?.usuario_id),
      ...(etapas || []).filter((e) => e.pi_id === a.pi_id).map((e) => e.responsavel_id),
    ].filter(Boolean));
    (chefes || []).filter((c) => c.ativo !== false && doPi.has(c.id) && c.id !== interno.id && c.id !== r?.usuario_id).forEach((c) => {
      novas.push({ usuario_id: c.id, tipo: "alocacao", link: `/pi?id=${a.pi_id}&aba=equipe`, titulo: `Alocação em ${pi?.codigo || "PI"}: ${r?.nome || "recurso"} ${VERBO3[evento]}`,
        mensagem: [onde, evento !== "removida" ? periodo : "", `Por ${interno.nome}.`].filter(Boolean).join("\n") });
    });
  }
  if (novas.length) {
    const { error } = await admin.from("notificacoes").insert(novas);
    if (error) return NextResponse.json({ avisados: 0, motivo: error.message });
    await despachar(admin);
  }
  return NextResponse.json({ avisados: novas.length });
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
  if (corpo.acao === "alocacao") return avisarAlocacao(admin, interno, corpo);
  // PDF (ex: cronograma) salvo em Documentos do PI, enviado anexado para contatos escolhidos do cliente
  if (corpo.acao === "enviar_pdf") {
    const mapa = await permissoesDe(admin, interno);
    if (!["pi.ver", "doc.cliente", "cliente.acessos"].some((c) => mapa[c] === "S" || mapa[c] === "P")) return NextResponse.json({ error: "Seu usuário não pode enviar documentos a clientes." }, { status: 403 });
    const { piId, caminho, clienteIds, mensagem, assunto } = corpo;
    if (!piId || !caminho || !String(caminho).startsWith(`${piId}/`) || !Array.isArray(clienteIds) || !clienteIds.length) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    const [{ data: pi }, { data: clientes }, arquivo] = await Promise.all([
      admin.from("pis").select("codigo,cliente,projeto").eq("id", piId).maybeSingle(),
      admin.from("clientes").select("id,nome,email,ativo").in("id", clienteIds.slice(0, 50)),
      admin.storage.from("documentos").download(caminho),
    ]);
    if (arquivo.error || !arquivo.data) return NextResponse.json({ error: `Arquivo não encontrado: ${arquivo.error?.message || ""}` }, { status: 400 });
    const base64 = Buffer.from(await arquivo.data.arrayBuffer()).toString("base64");
    const nomeArq = String(caminho).split("/").pop();
    let enviados = 0; const falhas = [];
    for (const c of (clientes || []).filter((x) => x.ativo !== false && emailReal(x.email))) {
      const paragrafos = [`Olá, <strong>${esc(c.nome)}</strong>!`, `Segue em anexo o documento <strong>${esc(nomeArq)}</strong> referente ao ${esc(pi?.codigo || "")} - ${esc(pi?.cliente || "")}${pi?.projeto ? ` (${esc(pi.projeto)})` : ""}.`];
      if (mensagem) paragrafos.push(esc(mensagem).replace(/\n/g, "<br>"));
      paragrafos.push(`Enviado por ${esc(interno.nome)} — Contric.`);
      const r = await enviarEmail({
        para: c.email, assunto: String(assunto || nomeArq).slice(0, 150),
        texto: `Olá, ${c.nome}!\n\nSegue em anexo ${nomeArq} (${pi?.codigo || ""} - ${pi?.cliente || ""}).${mensagem ? `\n\n${mensagem}` : ""}\n\nEnviado por ${interno.nome} — Contric.`,
        html: emailCliente(esc(String(assunto || nomeArq)), paragrafos, null, "Contric"),
        anexos: [{ nome: nomeArq, base64 }],
      });
      if (r.enviado) enviados++; else falhas.push(`${c.nome}: ${r.motivo}`);
    }
    await admin.from("logs_auditoria").insert({ usuario_id: interno.id, usuario_nome: interno.nome, acao: "Enviou PDF a clientes (SGO)", detalhe: `${pi?.codigo} — ${nomeArq} · ${enviados} enviado(s)${falhas.length ? ` · falhas: ${falhas.join("; ")}` : ""}` });
    if (!enviados) return NextResponse.json({ error: falhas.length ? `Nenhum e-mail enviado — ${falhas[0]}` : "Nenhum contato com e-mail válido." }, { status: 400 });
    return NextResponse.json({ enviados, falhas });
  }
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
      TIPOS_ALERTA.map(([t]) => t).forEach((k) => { if (typeof i.alertas?.[k] === "boolean") prefs[k] = i.alertas[k]; });
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
