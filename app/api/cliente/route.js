import { NextResponse } from "next/server";
import { identificar, rotaSegura } from "../../../lib/authServidor";

export const dynamic = "force-dynamic";

// Portal do cliente: devolve SOMENTE o que foi liberado para ele (o cliente não lê o banco direto).
// ?resumo=1 → só o cadastro (usado no login para saber que é cliente).
export const GET = rotaSegura(async (req) => {
  const { admin, cliente, resposta } = await identificar(req);
  if (resposta) return resposta;
  if (!cliente) return NextResponse.json({ error: "Não é um cliente." }, { status: 403 });
  const perfil = { id: cliente.id, nome: cliente.nome, email: cliente.email, empresa: cliente.empresa, funcao: cliente.funcao, perfil: "cliente" };
  if (new URL(req.url).searchParams.get("resumo")) return NextResponse.json({ cliente: perfil });

  const { data: acessos } = await admin.from("cliente_acessos").select("*").eq("cliente_id", cliente.id);
  const obras = [];
  for (const a of acessos || []) {
    const { data: pi } = await admin.from("pis").select("id,codigo,cliente,projeto,status,prazo").eq("id", a.pi_id).maybeSingle();
    if (!pi) continue;
    const obra = { pi, acessos: { atas: a.ver_atas, rdos: a.ver_rdos_assinados, linhaTempo: a.ver_linha_tempo }, atas: [], rdos: [], etapas: [] };

    if (a.ver_atas) {
      const { data: arquivos } = await admin.storage.from("documentos").list(pi.id, { limit: 500, search: "ATA_" });
      for (const f of (arquivos || []).filter((x) => x.id && x.name.startsWith("ATA_"))) {
        const { data } = await admin.storage.from("documentos").createSignedUrl(`${pi.id}/${f.name}`, 3600);
        obra.atas.push({ nome: f.name, data: f.created_at, tamanho: f.metadata?.size, url: data?.signedUrl });
      }
      obra.atas.sort((x, y) => String(y.data).localeCompare(String(x.data)));
    }
    if (a.ver_rdos_assinados) {
      const { data: rdos } = await admin.from("rdos").select("id,data,status,pdf_path,assinatura_cliente,assinatura_cliente_nome")
        .eq("pi_id", pi.id).eq("assinatura_cliente", true).order("data", { ascending: false });
      for (const r of (rdos || []).filter((x) => x.pdf_path && x.status !== "rejeitado")) {
        const { data } = await admin.storage.from("documentos").createSignedUrl(r.pdf_path, 3600);
        obra.rdos.push({ data: r.data, status: r.status, assinadoPor: r.assinatura_cliente_nome, nome: r.pdf_path.split("/").pop(), url: data?.signedUrl });
      }
    }
    if (a.ver_linha_tempo) {
      const { data: etapas } = await admin.from("etapas")
        .select("id,nome,parent_etapa_id,ordem,status,percentual,data_prevista_inicio,data_prevista_fim").eq("pi_id", pi.id);
      obra.etapas = etapas || [];
    }
    obras.push(obra);
  }
  obras.sort((x, y) => (x.pi.codigo || "").localeCompare(y.pi.codigo || ""));
  return NextResponse.json({ cliente: perfil, obras });
});
