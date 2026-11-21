import { NextResponse } from "next/server";
import { identificar, rotaSegura } from "../../../lib/authServidor";
import { STATUS_ETAPA } from "../../../lib/constantes";

export const dynamic = "force-dynamic";

// "Atualizar avanço" (Cronograma → Meus PIs): quem está ALOCADO numa etapa pode alterar
// o status e o % dela. O banco só deixa gestores alterarem etapas, então a gravação passa
// por aqui: o servidor confere a alocação, grava só status/% e registra na Auditoria.
const sobrepoe = (a1, a2, b1, b2) => a1 && a2 && b1 && b2 && a1 <= b2 && b1 <= a2;

export const POST = rotaSegura(async (req) => {
  const { admin, interno, resposta } = await identificar(req);
  if (resposta) return resposta;
  if (!interno) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const status = String(body.status || "");
  if (!STATUS_ETAPA[status]) return NextResponse.json({ error: "Status inválido." }, { status: 400 });
  let percentual = Math.round(Number(body.percentual));
  if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) return NextResponse.json({ error: "O percentual deve ficar entre 0 e 100." }, { status: 400 });
  if (status === "concluida") percentual = 100;
  if (status === "nao_iniciada") percentual = 0;

  const { data: etapa } = await admin.from("etapas").select("id,nome,pi_id,parent_etapa_id,status,percentual,data_prevista_inicio,data_prevista_fim").eq("id", body.etapaId).maybeSingle();
  if (!etapa) return NextResponse.json({ error: "Etapa não encontrada." }, { status: 404 });
  // macro com sub-etapas é calculada pelas subs: o avanço é lançado nas sub-etapas
  const { count: nSubs } = await admin.from("etapas").select("id", { count: "exact", head: true }).eq("parent_etapa_id", etapa.id);
  if (nSubs) return NextResponse.json({ error: "Esta macro-etapa é calculada pelas sub-etapas — atualize as sub-etapas." }, { status: 400 });

  // a pessoa precisa estar alocada (pelo recurso vinculado a ela) nesta etapa
  const { data: meus } = await admin.from("recursos").select("id").eq("usuario_id", interno.id);
  const ids = (meus || []).map((r) => r.id);
  if (!ids.length) return NextResponse.json({ error: "Seu usuário não está vinculado a um recurso." }, { status: 403 });
  // contrato: alocação no PI Pai (por período) vale para as obras (filhos) dele
  const { data: piEtapa } = await admin.from("pis").select("pi_pai_id").eq("id", etapa.pi_id).maybeSingle();
  const pisValidos = [etapa.pi_id, piEtapa?.pi_pai_id].filter(Boolean);
  const { data: alocs } = await admin.from("alocacoes_recurso").select("etapa_id,pi_id,periodo_inicio,periodo_fim").in("recurso_id", ids).in("pi_id", pisValidos);
  const alocado = (alocs || []).some((a) => (a.etapa_id ? a.etapa_id === etapa.id || a.etapa_id === etapa.parent_etapa_id
    : sobrepoe(a.periodo_inicio, a.periodo_fim, etapa.data_prevista_inicio, etapa.data_prevista_fim)));
  if (!alocado) return NextResponse.json({ error: "Você não está alocado nesta etapa." }, { status: 403 });

  const patch = { status, percentual };
  let { error } = await admin.from("etapas").update({ ...patch, percentual_atualizado_em: new Date().toISOString() }).eq("id", etapa.id);
  if (error && /percentual_atualizado_em/.test(error.message)) ({ error } = await admin.from("etapas").update(patch).eq("id", etapa.id));
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { data: pi } = await admin.from("pis").select("codigo").eq("id", etapa.pi_id).maybeSingle();
  const rot = (s) => STATUS_ETAPA[s]?.rotulo || s || "—";
  await admin.from("logs_auditoria").insert({
    usuario_id: interno.id, usuario_nome: interno.nome, acao: "Atualizou avanço de etapa",
    detalhe: `${pi?.codigo || ""} — "${etapa.nome}": ${rot(etapa.status)} ${Number(etapa.percentual) || 0}% → ${rot(status)} ${percentual}%`,
  }).then(() => {}, () => {});
  return NextResponse.json({ ok: true, status, percentual });
});
