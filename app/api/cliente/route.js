import { NextResponse } from "next/server";
import { identificar, rotaSegura } from "../../../lib/authServidor";
import { consolidarMacros } from "../../../lib/constantes";

export const dynamic = "force-dynamic";

// Portal do cliente: devolve SOMENTE o que foi liberado para ele (o cliente não lê o banco direto).
// ?resumo=1 → só o cadastro (usado no login para saber que é cliente).
export const GET = rotaSegura(async (req) => {
  const { admin, cliente, resposta } = await identificar(req);
  if (resposta) return resposta;
  if (!cliente) return NextResponse.json({ error: "Não é um cliente." }, { status: 403 });
  const perfil = { id: cliente.id, nome: cliente.nome, email: cliente.email, empresa: cliente.empresa, funcao: cliente.funcao, perfil: "cliente" };
  if (new URL(req.url).searchParams.get("resumo")) return NextResponse.json({ cliente: perfil });

  const { data: acessosDiretos } = await admin.from("cliente_acessos").select("*").eq("cliente_id", cliente.id);
  // contrato: acesso ao PI Pai vale para todas as obras (filhos) dele, com os mesmos itens liberados
  const acessos = [...(acessosDiretos || [])];
  const paisComAcesso = acessos.map((a) => a.pi_id);
  const { data: filhosLib, error: eFilhos } = paisComAcesso.length ? await admin.from("pis").select("id,pi_pai_id").in("pi_pai_id", paisComAcesso) : { data: [] };
  for (const f of eFilhos ? [] : filhosLib || []) {
    if (acessos.some((a) => a.pi_id === f.id)) continue;
    const doPai = acessos.find((a) => a.pi_id === f.pi_pai_id);
    acessos.push({ ...doPai, id: `herdado-${f.id}`, pi_id: f.id, herdado: true });
  }
  const filhosPorPai = {};
  (eFilhos ? [] : filhosLib || []).forEach((f) => { (filhosPorPai[f.pi_pai_id] = filhosPorPai[f.pi_pai_id] || []).push(f.id); });
  const obras = [];
  for (const a of acessos) {
    const { data: pi } = await admin.from("pis").select("*").eq("id", a.pi_id).maybeSingle();
    if (!pi) continue;
    // só o necessário do PI para o portal (nada de valores internos)
    const piPortal = { id: pi.id, codigo: pi.codigo, cliente: pi.cliente, projeto: pi.projeto, status: pi.status, prazo: pi.prazo, pi_pai_id: pi.pi_pai_id || null };
    const obra = { pi: piPortal, filhos: filhosPorPai[pi.id] || [], acessos: { atas: a.ver_atas, rdos: a.ver_rdos_assinados, linhaTempo: a.ver_linha_tempo, ocorrencias: !!a.ver_ocorrencias_assinadas }, atas: [], rdos: [], etapas: [], ocorrencias: [], documentos: [] };

    if (a.ver_ocorrencias_assinadas) {
      const { data: ocs } = await admin.from("ocorrencias").select("id,categoria,descricao,created_at,status,pdf_path,assinatura_cliente,assinatura_cliente_nome")
        .eq("pi_id", pi.id).eq("assinatura_cliente", true).order("created_at", { ascending: false });
      for (const o of (ocs || []).filter((x) => x.pdf_path && x.status !== "rejeitada" && x.status !== "rejeitado")) {
        const { data } = await admin.storage.from("documentos").createSignedUrl(o.pdf_path, 3600);
        if (data?.signedUrl) obra.ocorrencias.push({ id: o.id, data: o.created_at, categoria: o.categoria, descricao: o.descricao, status: o.status, assinadoPor: o.assinatura_cliente_nome, url: data.signedUrl });
      }
    }
    // documentos liberados individualmente para este cliente (página Documentos)
    const { data: docs } = await admin.from("cliente_documentos").select("caminho,created_at").eq("cliente_id", cliente.id).eq("pi_id", pi.id);
    for (const d of docs || []) {
      const { data } = await admin.storage.from("documentos").createSignedUrl(d.caminho, 3600);
      if (data?.signedUrl) obra.documentos.push({ nome: d.caminho.split("/").pop(), data: d.created_at, url: data.signedUrl }); // arquivo apagado: some da lista
    }
    // pastas inteiras liberadas a este cliente: todos os arquivos cujo nome começa com o prefixo da pasta
    const { data: pastas } = await admin.from("cliente_pastas").select("prefixo,nome").eq("cliente_id", cliente.id).eq("pi_id", pi.id);
    if (pastas?.length) {
      const { data: arquivos } = await admin.storage.from("documentos").list(pi.id, { limit: 1000 });
      const ja = new Set(obra.documentos.map((d) => d.nome));
      for (const f of (arquivos || []).filter((x) => x.id && !ja.has(x.name))) {
        const pasta = pastas.find((p) => f.name.startsWith(`${p.prefixo}_`));
        if (!pasta) continue;
        const { data } = await admin.storage.from("documentos").createSignedUrl(`${pi.id}/${f.name}`, 3600);
        if (data?.signedUrl) obra.documentos.push({ nome: f.name, pasta: pasta.nome, data: f.created_at, url: data.signedUrl });
      }
    }
    obra.documentos.sort((x, y) => String(y.data).localeCompare(String(x.data)));

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
        // mesmos campos usados no PDF/Excel do cronograma da Contric (responsável e ordem de criação inclusos)
        .select("id,nome,parent_etapa_id,ordem,created_at,status,percentual,data_prevista_inicio,data_prevista_fim,responsavel_texto").eq("pi_id", pi.id);
      obra.etapas = etapas || [];
    }
    obra._peso = Number(pi.valor_contrato) || 0; // uso interno (ponderação); não vai para o portal
    obras.push(obra);
  }
  // consolidado do contrato: avanço de cada obra e do conjunto (ponderado pelo valor de cada obra)
  const avancoDe = (o) => {
    const macros = consolidarMacros(o.etapas || []).filter((e) => !e.parent_etapa_id);
    return macros.length ? macros.reduce((s, e) => s + (e.status === "concluida" ? 100 : Math.min(100, Number(e.percentual) || 0)), 0) / macros.length : 0;
  };
  for (const pai of obras.filter((o) => o.filhos.length)) {
    const lista = obras.filter((o) => pai.filhos.includes(o.pi.id));
    const peso = (o) => (lista.some((x) => x._peso > 0) ? o._peso : 1);
    const total = lista.reduce((s, o) => s + peso(o), 0) || 1;
    pai.consolidado = {
      avanco: Math.round(lista.reduce((s, o) => s + avancoDe(o) * peso(o), 0) / total),
      termino: lista.flatMap((o) => (o.etapas || []).map((e) => e.data_prevista_fim)).filter(Boolean).sort().pop() || null,
      obras: lista.map((o) => ({ id: o.pi.id, codigo: o.pi.codigo, projeto: o.pi.projeto, avanco: Math.round(avancoDe(o)),
        termino: (o.etapas || []).map((e) => e.data_prevista_fim).filter(Boolean).sort().pop() || null, comCronograma: !!(o.etapas || []).length })),
    };
  }
  obras.forEach((o) => { delete o._peso; });
  // ordem: contrato (PI Pai) seguido das suas obras
  obras.sort((x, y) => String(x.pi.pi_pai_id ? `${obras.find((o) => o.pi.id === x.pi.pi_pai_id)?.pi.codigo || ""}~${x.pi.codigo}` : x.pi.codigo)
    .localeCompare(String(y.pi.pi_pai_id ? `${obras.find((o) => o.pi.id === y.pi.pi_pai_id)?.pi.codigo || ""}~${y.pi.codigo}` : y.pi.codigo), "pt-BR", { numeric: true }));
  return NextResponse.json({ cliente: perfil, obras });
});

// Contric Transfer — o cliente também envia arquivos (apagados 10 dias depois, como os da Contric).
// 1) acao "transfer_url": confere o acesso ao PI e devolve uma URL de envio direto ao armazenamento
//    (o arquivo não passa pelo servidor — sem o limite de tamanho da Vercel)
// 2) acao "transfer_ok": confirma o arquivo enviado, libera para o próprio cliente e avisa a Contric
const limpar = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toUpperCase();
async function temAcesso(admin, clienteId, piId) {
  const { data: pi } = await admin.from("pis").select("id,codigo,cliente,pi_pai_id").eq("id", piId).maybeSingle();
  if (!pi) return null;
  const ids = [pi.id, pi.pi_pai_id].filter(Boolean);
  const { data } = await admin.from("cliente_acessos").select("id").eq("cliente_id", clienteId).in("pi_id", ids).limit(1);
  return data?.length ? pi : null;
}
export const POST = rotaSegura(async (req) => {
  const { admin, cliente, resposta } = await identificar(req);
  if (resposta) return resposta;
  if (!cliente) return NextResponse.json({ error: "Não é um cliente." }, { status: 403 });
  const corpo = await req.json().catch(() => ({}));
  const pi = corpo.piId ? await temAcesso(admin, cliente.id, corpo.piId) : null;
  if (!pi) return NextResponse.json({ error: "Sem acesso a esta obra." }, { status: 403 });

  if (corpo.acao === "transfer_url") {
    const original = String(corpo.nome || "arquivo");
    if (Number(corpo.tamanho) > 50 * 1024 * 1024) return NextResponse.json({ error: "O arquivo passa de 50 MB." }, { status: 400 });
    const partes = original.split(".");
    const ext = partes.length > 1 ? `.${partes.pop().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8)}` : "";
    const base = limpar(partes.join(".")).slice(0, 60) || "ARQUIVO";
    const h = new Date(Date.now() - 3 * 3600000); // dia em São Paulo
    const dia = h.toISOString().slice(0, 10).replace(/-/g, "");
    const caminho = `${pi.id}/TRANSFER_CLIENTE_${dia}_${limpar(pi.codigo)}_${base}_${Date.now().toString(36).toUpperCase()}${ext}`;
    const { data, error } = await admin.storage.from("documentos").createSignedUploadUrl(caminho);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ caminho, token: data.token });
  }

  if (corpo.acao === "transfer_ok") {
    const caminho = String(corpo.caminho || "");
    if (!caminho.startsWith(`${pi.id}/TRANSFER_CLIENTE_`) || caminho.includes("..")) return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 });
    const nome = caminho.split("/").pop();
    const { data: achados } = await admin.storage.from("documentos").list(pi.id, { limit: 5, search: nome });
    if (!(achados || []).some((f) => f.name === nome)) return NextResponse.json({ error: "O envio não foi concluído." }, { status: 400 });
    await admin.from("cliente_documentos").insert({ cliente_id: cliente.id, pi_id: pi.id, caminho, liberado_por_nome: `${cliente.nome} (cliente)` });
    // avisa a Contric: gestores e quem está alocado na obra (ou no contrato)
    const { data: gestores } = await admin.from("usuarios").select("id")
      .in("perfil", ["master", "diretor", "gerente", "gerente_equipes", "gerente_processo", "coordenador"]).neq("ativo", false);
    const { data: alocs } = await admin.from("alocacoes_recurso").select("recurso_id").in("pi_id", [pi.id, pi.pi_pai_id].filter(Boolean));
    const recIds = [...new Set((alocs || []).map((a) => a.recurso_id))];
    const { data: recs } = recIds.length ? await admin.from("recursos").select("usuario_id").in("id", recIds) : { data: [] };
    const destinos = [...new Set([...(gestores || []).map((u) => u.id), ...(recs || []).map((r) => r.usuario_id).filter(Boolean)])];
    if (destinos.length) {
      await admin.from("notificacoes").insert(destinos.map((usuario_id) => ({ usuario_id, tipo: "documento",
        titulo: `Contric Transfer: arquivo do cliente — ${pi.codigo}`,
        mensagem: `${cliente.nome}${cliente.empresa ? ` (${cliente.empresa})` : ""} enviou "${nome}". Fica disponível por 10 dias.`,
        link: `/documentos?pi=${pi.id}&pasta=TRANSFER` })));
    }
    await admin.from("logs_auditoria").insert({ usuario_nome: `${cliente.nome} (cliente)`, acao: "Contric Transfer: cliente enviou arquivo", detalhe: `${pi.codigo} — ${nome}` });
    return NextResponse.json({ ok: true, nome });
  }
  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
});
