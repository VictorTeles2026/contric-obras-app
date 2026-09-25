"use client";

import { supabase } from "./supabase";
import { STATUS_ETAPA } from "./constantes";

// Gera o PDF de um RDO e salva no Storage (bucket "documentos", pasta do PI).
// Nome: RDO_AAAAMMDD_PI_CLIENTE.pdf (ex: RDO_20260924_PI-2041_AMBEV-JAGUARIUNA.pdf)

export const BUCKET_DOCUMENTOS = "documentos";

function limparNome(texto) {
  return String(texto || "SEM-NOME")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .toUpperCase() || "SEM-NOME";
}

export function baseNomeRdo(rdo, pi) {
  const data = String(rdo.data || "").replace(/-/g, "").slice(0, 8) || "SEMDATA";
  return `RDO_${data}_${limparNome(pi?.codigo)}_${limparNome(pi?.cliente)}`;
}

const dataBR = (iso) => (iso ? new Date(String(iso).slice(0, 10) + "T00:00:00").toLocaleDateString("pt-BR") : "—");
const dataHoraBR = (ts) => (ts ? new Date(ts).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const STATUS_RDO = { pendente: "PENDENTE DE VALIDAÇÃO", aprovado: "APROVADO", rejeitado: "REPROVADO" };

// Baixa uma imagem e reduz para no máximo `maxLado` px (fotos de celular têm 4000px+ e deixariam o PDF enorme)
async function carregarImagem(url, maxLado = 1400) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("imagem indisponível");
  const blob = await resp.blob();
  let origem;
  try {
    origem = await createImageBitmap(blob);
  } catch {
    origem = await new Promise((ok, erro) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = erro;
      img.src = URL.createObjectURL(blob);
    });
  }
  const w0 = origem.width, h0 = origem.height;
  const escala = Math.min(1, maxLado / Math.max(w0, h0));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w0 * escala);
  canvas.height = Math.round(h0 * escala);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(origem, 0, 0, canvas.width, canvas.height);
  return { dados: canvas.toDataURL("image/jpeg", 0.78), w: canvas.width, h: canvas.height };
}

function tamanhoDataUrl(dataUrl) {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => ok({ w: img.width, h: img.height });
    img.onerror = () => ok({ w: 3, h: 1 });
    img.src = dataUrl;
  });
}

async function montarPdf({ rdo, pi, pessoas, ocorrencias, etapas }) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const L = 210, M = 14, largura = L - 2 * M, ALTURA_UTIL = 297 - 16;
  const NAVY = [14, 27, 61], CYAN = [11, 132, 165], MUTED = [91, 107, 133], AMBER = [201, 122, 33];
  const nome = (id) => pessoas.find((p) => p.id === id)?.nome || "—";

  // ---- cabeçalho ----
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, L, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("RELATÓRIO DIÁRIO DE OBRA (RDO)", M, 14);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text("Contric — Gestão de Obras", M, 21);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text(`${pi?.codigo || ""}  ·  ${dataBR(rdo.data)}`, L - M, 14, { align: "right" });
  doc.setFontSize(8.5);
  const corStatus = rdo.status === "aprovado" ? [120, 220, 140] : rdo.status === "rejeitado" ? [255, 150, 150] : [255, 205, 140];
  doc.setTextColor(...corStatus);
  doc.text(STATUS_RDO[rdo.status] || String(rdo.status || "").toUpperCase(), L - M, 21, { align: "right" });

  // ---- dados gerais ----
  const info = [
    ["PI", pi?.codigo || "—", "Data do RDO", dataBR(rdo.data)],
    ["Cliente", pi?.cliente || "—", "Horário do envio", dataHoraBR(rdo.created_at)],
    ["Projeto", pi?.projeto || "—", "Responsável", nome(rdo.lider_id)],
    ["Status", STATUS_RDO[rdo.status] || rdo.status, "Decidido por", rdo.decidido_por ? `${nome(rdo.decidido_por)} em ${dataHoraBR(rdo.decidido_em)}` : "—"],
  ];
  if (rdo.editado_por) info.push(["Editado por", `${nome(rdo.editado_por)} em ${dataHoraBR(rdo.editado_em)}`, "", ""]);
  if (rdo.motivo_rejeicao) info.push(["Motivo da reprovação", rdo.motivo_rejeicao, "", ""]);
  autoTable(doc, {
    startY: 36, body: info, theme: "grid", margin: { left: M, right: M },
    styles: { fontSize: 9, cellPadding: 2.2, lineColor: [215, 224, 236], textColor: [15, 42, 68] },
    columnStyles: {
      0: { fontStyle: "bold", fillColor: [244, 247, 251], cellWidth: 32, textColor: MUTED },
      1: { cellWidth: 60 },
      2: { fontStyle: "bold", fillColor: [244, 247, 251], cellWidth: 32, textColor: MUTED },
    },
  });

  const titulo = (texto, y) => {
    doc.setTextColor(...CYAN); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text(texto.toUpperCase(), M, y);
    doc.setDrawColor(...CYAN); doc.setLineWidth(0.4); doc.line(M, y + 1.5, M + largura, y + 1.5);
    return y + 6;
  };
  const garantirEspaco = (y, precisa) => {
    if (y + precisa > ALTURA_UTIL) { doc.addPage(); return 18; }
    return y;
  };

  // ---- cronograma / atividades ----
  let y = titulo("Andamento do cronograma", doc.lastAutoTable.finalY + 10);
  const atividades = rdo.atividades || [];
  autoTable(doc, {
    startY: y, margin: { left: M, right: M },
    head: [["Etapa", "Status informado", "%", "Início previsto", "Término previsto"]],
    body: atividades.length ? atividades.map((a) => {
      const e = etapas.find((x) => x.id === a.etapa_id);
      const sub = e?.parent_etapa_id;
      return [
        `${sub ? "    · " : ""}${a.nome}`,
        STATUS_ETAPA[a.status]?.rotulo || a.status,
        a.status === "concluida" ? "100%" : `${a.percentual ?? 0}%`,
        dataBR(e?.data_prevista_inicio), dataBR(e?.data_prevista_fim),
      ];
    }) : [["Nenhuma atividade registrada", "", "", "", ""]],
    theme: "striped",
    styles: { fontSize: 8.5, cellPadding: 1.8, textColor: [15, 42, 68] },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
    columnStyles: { 1: { cellWidth: 32 }, 2: { cellWidth: 14, halign: "right" }, 3: { cellWidth: 26 }, 4: { cellWidth: 28 } },
    didParseCell: (d) => {
      if (d.section === "body" && d.column.index === 1) {
        const a = atividades[d.row.index];
        const hex = STATUS_ETAPA[a?.status]?.barra;
        if (hex) d.cell.styles.textColor = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
        d.cell.styles.fontStyle = "bold";
      }
    },
  });

  // ---- ocorrências ----
  y = garantirEspaco(doc.lastAutoTable.finalY + 10, 20);
  y = titulo(`Ocorrências (${ocorrencias.length})`, y);
  doc.setFontSize(9.5);
  if (ocorrencias.length === 0) {
    doc.setTextColor(...MUTED); doc.setFont("helvetica", "normal");
    doc.text("Nenhuma ocorrência relatada.", M, y + 2);
    y += 8;
  }
  for (const [i, o] of ocorrencias.entries()) {
    y = garantirEspaco(y, 16);
    doc.setFont("helvetica", "bold"); doc.setTextColor(...AMBER);
    doc.text(`${i + 1}. ${o.categoria}`, M, y + 2);
    doc.setFont("helvetica", "normal"); doc.setTextColor(...MUTED); doc.setFontSize(8);
    doc.text(`Registrado por ${nome(o.registrado_por)} em ${dataHoraBR(o.created_at)}`, L - M, y + 2, { align: "right" });
    y += 7;
    doc.setFontSize(9.5); doc.setTextColor(15, 42, 68);
    if (o.descricao) {
      const linhas = doc.splitTextToSize(o.descricao, largura);
      for (const linha of linhas) { y = garantirEspaco(y, 5); doc.text(linha, M, y); y += 4.6; }
    }
    // fotos (2 por linha) e links dos vídeos
    const midias = o.midias || [];
    const fotos = midias.filter((m) => m.tipo === "foto");
    const videos = midias.filter((m) => m.tipo !== "foto");
    const larguraFoto = (largura - 6) / 2;
    for (let k = 0; k < fotos.length; k += 2) {
      const par = [];
      for (const f of fotos.slice(k, k + 2)) {
        try { par.push(await carregarImagem(f.url)); } catch { par.push(null); }
      }
      const alturas = par.map((img) => (img ? Math.min(75, larguraFoto * (img.h / img.w)) : 10));
      const alturaLinha = Math.max(...alturas);
      y = garantirEspaco(y + 2, alturaLinha + 2);
      par.forEach((img, j) => {
        const x = M + j * (larguraFoto + 6);
        if (!img) { doc.setTextColor(...MUTED); doc.text("(foto indisponível)", x, y + 5); return; }
        const h = alturas[j];
        const w = Math.min(larguraFoto, h * (img.w / img.h));
        doc.addImage(img.dados, "JPEG", x, y, w, h);
        doc.setDrawColor(215, 224, 236); doc.rect(x, y, w, h);
      });
      y += alturaLinha + 3;
    }
    for (const v of videos) {
      y = garantirEspaco(y, 6);
      doc.setTextColor(...CYAN); doc.setFontSize(8.5);
      doc.textWithLink(`Vídeo: ${v.nome || "abrir"} (link)`, M, y + 3, { url: v.url });
      y += 6;
    }
    y += 3;
  }

  // ---- assinatura ----
  y = garantirEspaco(y + 4, 45);
  y = titulo("Assinatura do cliente", y);
  if (rdo.assinatura_cliente && rdo.assinatura_cliente_imagem) {
    // assinatura reduzida e em JPEG: o PNG original em alta resolução deixava o PDF com ~1 MB
    const assin = await carregarImagem(rdo.assinatura_cliente_imagem, 700).catch(() => null);
    const { w, h } = assin || await tamanhoDataUrl(rdo.assinatura_cliente_imagem);
    const aw = 80, ah = Math.min(35, aw * (h / w));
    doc.addImage(assin ? assin.dados : rdo.assinatura_cliente_imagem, assin ? "JPEG" : "PNG", M, y, aw, ah);
    doc.setDrawColor(...MUTED); doc.line(M, y + ah + 1, M + aw, y + ah + 1);
    doc.setFontSize(8.5); doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "bold"); doc.setTextColor(15, 42, 68); doc.setFontSize(9.5);
    doc.text(`Assinado por: ${rdo.assinatura_cliente_nome || "(nome não informado)"}`, M, y + ah + 5.5);
    doc.setFont("helvetica", "normal"); doc.setTextColor(...MUTED); doc.setFontSize(8.5);
    doc.text(`${pi?.cliente || "Cliente"} — assinado no envio do RDO`, M, y + ah + 10);
  } else {
    doc.setFontSize(9.5); doc.setTextColor(...MUTED);
    doc.text("Assinatura do cliente não coletada neste RDO.", M, y + 2);
  }

  // ---- rodapé em todas as páginas ----
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    doc.text(`${baseNomeRdo(rdo, pi)}.pdf  ·  gerado em ${new Date().toLocaleString("pt-BR")}`, M, 291);
    doc.text(`Página ${p} de ${total}`, L - M, 291, { align: "right" });
  }
  return doc.output("blob");
}

// escolhe um nome livre na pasta do PI (se já houver outro RDO no mesmo dia, acrescenta _2, _3...)
async function caminhoParaRdo(rdo, pi) {
  const base = baseNomeRdo(rdo, pi);
  const pasta = pi.id;
  if (rdo.pdf_path && rdo.pdf_path.startsWith(`${pasta}/${base}`)) return rdo.pdf_path;
  const { data } = await supabase.storage.from(BUCKET_DOCUMENTOS).list(pasta, { limit: 1000, search: `RDO_` });
  const existentes = new Set((data || []).map((f) => f.name));
  let nome = `${base}.pdf`;
  for (let n = 2; existentes.has(nome); n++) nome = `${base}_${n}.pdf`;
  return `${pasta}/${nome}`;
}

export async function gerarPdfRdo(rdoId) {
  const { data: rdo, error } = await supabase.from("rdos").select("*").eq("id", rdoId).single();
  if (error || !rdo) throw new Error(error?.message || "RDO não encontrado");
  const [{ data: pi }, { data: pessoas }, { data: ocorrencias }] = await Promise.all([
    supabase.from("pis").select("*").eq("id", rdo.pi_id).single(),
    supabase.from("usuarios").select("id,nome"),
    supabase.from("ocorrencias").select("*").eq("rdo_id", rdo.id).order("created_at"),
  ]);
  const idsEtapas = (rdo.atividades || []).map((a) => a.etapa_id).filter(Boolean);
  const { data: etapas } = idsEtapas.length
    ? await supabase.from("etapas").select("id,parent_etapa_id,data_prevista_inicio,data_prevista_fim").in("id", idsEtapas)
    : { data: [] };

  const blob = await montarPdf({ rdo, pi, pessoas: pessoas || [], ocorrencias: ocorrencias || [], etapas: etapas || [] });
  const caminho = await caminhoParaRdo(rdo, pi);
  const { error: erroUpload } = await supabase.storage.from(BUCKET_DOCUMENTOS)
    .upload(caminho, blob, { upsert: true, contentType: "application/pdf" });
  if (erroUpload) throw new Error(erroUpload.message);
  // se a data mudou (edição), o nome mudou: remove o arquivo antigo
  if (rdo.pdf_path && rdo.pdf_path !== caminho) {
    await supabase.storage.from(BUCKET_DOCUMENTOS).remove([rdo.pdf_path]);
  }
  await supabase.from("rdos").update({ pdf_path: caminho }).eq("id", rdo.id);
  return caminho;
}

// versão que nunca lança erro — o RDO já foi salvo; o PDF pode ser gerado de novo em Documentos
export async function gerarPdfRdoSeguro(rdoId, avisar) {
  try {
    const caminho = await gerarPdfRdo(rdoId);
    return caminho;
  } catch (e) {
    avisar?.(`RDO salvo, mas o PDF não foi gerado (${e.message}). Gere de novo em Documentos.`, "erro", 8000);
    return null;
  }
}

export async function linkTemporario(caminho, segundos = 3600, baixar = false) {
  const { data, error } = await supabase.storage.from(BUCKET_DOCUMENTOS)
    .createSignedUrl(caminho, segundos, baixar ? { download: caminho.split("/").pop() } : undefined);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// ======================= PDF da OCORRÊNCIA =======================
// Nome: OCORRENCIA_AAAAMMDD_PI_CLIENTE.pdf
const STATUS_OC = { pendente: "PENDENTE DE APROVAÇÃO", aprovada: "APROVADA", rejeitada: "REPROVADA" };

export function baseNomeOcorrencia(oc, pi) {
  const d = new Date(oc.created_at || Date.now());
  const data = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `OCORRENCIA_${data}_${limparNome(pi?.codigo)}_${limparNome(pi?.cliente)}`;
}

async function montarPdfOcorrencia({ oc, pi, pessoas }) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const L = 210, M = 14, largura = L - 2 * M, ALTURA_UTIL = 297 - 16;
  const NAVY = [14, 27, 61], CYAN = [11, 132, 165], MUTED = [91, 107, 133], AMBER = [201, 122, 33];
  const nome = (id) => pessoas.find((p) => p.id === id)?.nome || "—";
  const funcao = (id) => pessoas.find((p) => p.id === id)?.funcao;

  doc.setFillColor(...AMBER); doc.rect(0, 0, L, 30, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("REGISTRO DE OCORRÊNCIA", M, 14);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text("Contric — Gestão de Obras", M, 21);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text(`${pi?.codigo || ""}  ·  ${dataHoraBR(oc.created_at)}`, L - M, 14, { align: "right" });
  doc.setFontSize(8.5); doc.text(STATUS_OC[oc.status] || String(oc.status || "").toUpperCase(), L - M, 21, { align: "right" });

  const info = [
    ["PI", pi?.codigo || "—", "Data / hora", dataHoraBR(oc.created_at)],
    ["Cliente", pi?.cliente || "—", "Categoria", oc.categoria],
    ["Projeto", pi?.projeto || "—", "Registrado por", `${nome(oc.registrado_por)}${funcao(oc.registrado_por) ? ` (${funcao(oc.registrado_por)})` : ""}`],
    ["Status", STATUS_OC[oc.status] || oc.status || "—", "Decidido por", oc.decidido_por ? `${nome(oc.decidido_por)} em ${dataHoraBR(oc.decidido_em)}` : "—"],
  ];
  if (oc.editado_por) info.push(["Editado por", `${nome(oc.editado_por)} em ${dataHoraBR(oc.editado_em)}`, "", ""]);
  if (oc.motivo_rejeicao) info.push(["Motivo da reprovação", oc.motivo_rejeicao, "", ""]);
  autoTable(doc, {
    startY: 36, body: info, theme: "grid", margin: { left: M, right: M },
    styles: { fontSize: 9, cellPadding: 2.2, lineColor: [215, 224, 236], textColor: [15, 42, 68] },
    columnStyles: { 0: { fontStyle: "bold", fillColor: [244, 247, 251], cellWidth: 32, textColor: MUTED }, 1: { cellWidth: 60 }, 2: { fontStyle: "bold", fillColor: [244, 247, 251], cellWidth: 32, textColor: MUTED } },
  });

  const titulo = (texto, y) => {
    doc.setTextColor(...CYAN); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text(texto.toUpperCase(), M, y);
    doc.setDrawColor(...CYAN); doc.setLineWidth(0.4); doc.line(M, y + 1.5, M + largura, y + 1.5);
    return y + 6;
  };
  const garantir = (y, precisa) => (y + precisa > ALTURA_UTIL ? (doc.addPage(), 18) : y);

  let y = titulo("Descrição", doc.lastAutoTable.finalY + 10);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(15, 42, 68);
  for (const linha of doc.splitTextToSize(oc.descricao || "Sem descrição.", largura)) { y = garantir(y, 5); doc.text(linha, M, y + 1); y += 5; }

  const midias = oc.midias || [];
  const fotos = midias.filter((m) => m.tipo === "foto"), videos = midias.filter((m) => m.tipo !== "foto");
  if (midias.length) {
    y = titulo(`Fotos e vídeos (${midias.length})`, garantir(y + 6, 20));
    const lf = (largura - 6) / 2;
    for (let k = 0; k < fotos.length; k += 2) {
      const par = [];
      for (const f of fotos.slice(k, k + 2)) { try { par.push(await carregarImagem(f.url)); } catch { par.push(null); } }
      const alts = par.map((img) => (img ? Math.min(85, lf * (img.h / img.w)) : 10));
      const alt = Math.max(...alts);
      y = garantir(y + 2, alt + 2);
      par.forEach((img, j) => {
        const x = M + j * (lf + 6);
        if (!img) { doc.setTextColor(...MUTED); doc.text("(foto indisponível)", x, y + 5); return; }
        const w = Math.min(lf, alts[j] * (img.w / img.h));
        doc.addImage(img.dados, "JPEG", x, y, w, alts[j]); doc.setDrawColor(215, 224, 236); doc.rect(x, y, w, alts[j]);
      });
      y += alt + 3;
    }
    for (const v of videos) { y = garantir(y, 6); doc.setTextColor(...CYAN); doc.setFontSize(9); doc.textWithLink(`Vídeo: ${v.nome || "abrir"} (link)`, M, y + 3, { url: v.url }); y += 6; }
  }

  y = titulo("Assinatura do cliente", garantir(y + 6, 50));
  if (oc.assinatura_cliente && oc.assinatura_cliente_imagem) {
    // assinatura reduzida e em JPEG: o PNG original em alta resolução deixava o PDF com ~1 MB
    const assin = await carregarImagem(oc.assinatura_cliente_imagem, 700).catch(() => null);
    const { w, h } = assin || await tamanhoDataUrl(oc.assinatura_cliente_imagem);
    const aw = 80, ah = Math.min(35, aw * (h / w));
    doc.addImage(assin ? assin.dados : oc.assinatura_cliente_imagem, assin ? "JPEG" : "PNG", M, y, aw, ah);
    doc.setDrawColor(...MUTED); doc.line(M, y + ah + 1, M + aw, y + ah + 1);
    doc.setFont("helvetica", "bold"); doc.setTextColor(15, 42, 68); doc.setFontSize(9.5);
    doc.text(`Assinado por: ${oc.assinatura_cliente_nome || "(nome não informado)"}`, M, y + ah + 5.5);
  } else {
    doc.setFontSize(9.5); doc.setTextColor(...MUTED); doc.text("Assinatura do cliente não coletada nesta ocorrência.", M, y + 2);
  }

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    doc.text(`${baseNomeOcorrencia(oc, pi)}.pdf  ·  gerado em ${new Date().toLocaleString("pt-BR")}`, M, 291);
    doc.text(`Página ${p} de ${total}`, L - M, 291, { align: "right" });
  }
  return doc.output("blob");
}

export async function gerarPdfOcorrencia(ocId) {
  const { data: oc, error } = await supabase.from("ocorrencias").select("*").eq("id", ocId).single();
  if (error || !oc) throw new Error(error?.message || "Ocorrência não encontrada");
  const [{ data: pi }, { data: pessoas }] = await Promise.all([
    supabase.from("pis").select("*").eq("id", oc.pi_id).single(),
    supabase.from("usuarios").select("id,nome,funcao"),
  ]);
  const blob = await montarPdfOcorrencia({ oc, pi, pessoas: pessoas || [] });
  const base = baseNomeOcorrencia(oc, pi);
  let caminho = oc.pdf_path;
  if (!caminho) {
    const { data } = await supabase.storage.from(BUCKET_DOCUMENTOS).list(pi.id, { limit: 1000, search: "OCORRENCIA_" });
    const existentes = new Set((data || []).map((f) => f.name));
    let nome = `${base}.pdf`;
    for (let n = 2; existentes.has(nome); n++) nome = `${base}_${n}.pdf`;
    caminho = `${pi.id}/${nome}`;
  }
  const { error: erroUpload } = await supabase.storage.from(BUCKET_DOCUMENTOS).upload(caminho, blob, { upsert: true, contentType: "application/pdf" });
  if (erroUpload) throw new Error(erroUpload.message);
  await supabase.from("ocorrencias").update({ pdf_path: caminho }).eq("id", oc.id);
  return caminho;
}

export async function gerarPdfOcorrenciaSeguro(ocId, avisar) {
  try { return await gerarPdfOcorrencia(ocId); } catch (e) {
    avisar?.(`Ocorrência salva, mas o PDF não foi gerado (${e.message}). Gere de novo em Documentos.`, "erro", 8000);
    return null;
  }
}
// Nome-base dos anexos (fotos/vídeos): o mesmo do documento a que pertencem.
// tipo: "RDO" | "OCORRENCIA" | "SOLICITACAO"; data: "AAAA-MM-DD" (ou vazio = hoje)
export function nomeBaseAnexo(tipo, data, pi) {
  if (!pi) return null;
  const hoje = new Date();
  const iso = data || `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  return `${tipo}_${String(iso).replace(/-/g, "").slice(0, 8)}_${limparNome(pi.codigo)}_${limparNome(pi.cliente)}`;
}