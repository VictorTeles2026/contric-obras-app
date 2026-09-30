import { NextResponse } from "next/server";
import { identificar, enviarEmail, emailCliente, urlApp, rotaSegura } from "../../../../lib/authServidor";

// Avisa por e-mail os clientes com acesso a um PI quando uma informação que eles veem muda.
// tipo: "ata" | "rdo" | "linha_tempo". A linha do tempo muda muito: no máximo 1 aviso a cada 24h por cliente/PI.
const CAMPO = { ata: "ver_atas", rdo: "ver_rdos_assinados", linha_tempo: "ver_linha_tempo" };
const TITULO = { ata: "Nova ata de reunião disponível", rdo: "Novo RDO assinado disponível", linha_tempo: "A linha do tempo da obra foi atualizada" };
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export const POST = rotaSegura(async (req) => {
  const { admin, interno, resposta } = await identificar(req);
  if (resposta) return resposta;
  if (!interno) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });
  const { piId, tipo, detalhe } = await req.json().catch(() => ({}));
  if (!piId || !CAMPO[tipo]) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const { data: acessos, error } = await admin.from("cliente_acessos").select("*, clientes(*)").eq("pi_id", piId).eq(CAMPO[tipo], true);
  if (error) return NextResponse.json({ avisados: 0, motivo: error.message });
  const { data: pi } = await admin.from("pis").select("codigo,cliente,projeto").eq("id", piId).maybeSingle();
  const agora = Date.now();
  let avisados = 0;
  for (const a of acessos || []) {
    const c = a.clientes;
    if (!c || c.ativo === false) continue;
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
});
