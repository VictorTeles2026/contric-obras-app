"use client";

import { useState, useRef } from "react";
import { useTabela, registrarLog, chamarApi } from "../../lib/dados";
import { useAuth, podeEditar } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import { BUCKET_DOCUMENTOS, gerarPdfRdo, gerarPdfOcorrencia, linkTemporario } from "../../lib/pdfRdo";
import { formatarDataHora } from "../../lib/datas";
import { useToast } from "../../lib/Toast";
import PainelShell from "../../components/PainelShell";
import { CabecalhoPagina, EstadoVazio, Esqueleto, Aviso, Spinner, Modal } from "../../components/ui";
import Icone from "../../components/Icone";
import { ConfirmarExclusao } from "../../components/AcoesMaster";
import { EditorRdo, EditorOcorrencia } from "../../components/Editores";
import { ehMaster, excluirDocumento } from "../../lib/exclusoes";

const TIPOS = [["", "Todos"], ["rdo", "RDOs (PDF)"], ["ocorrencia", "Ocorrências (PDF)"], ["ata", "Atas de reuniões"], ["arquivo", "Outros documentos"], ["foto", "Fotos"], ["video", "Vídeos"]];
const ICONE_TIPO = { rdo: "pdf", ocorrencia: "alerta", ata: "usuarios", arquivo: "pasta", foto: "camera", video: "video" };
const COR_TIPO = { rdo: "bg-red/10 text-red", ocorrencia: "bg-amber/10 text-amber", ata: "bg-navy/10 text-navy", arquivo: "bg-cyan/10 text-cyan", foto: "bg-green/10 text-green", video: "bg-[#8E5CD9]/10 text-[#8E5CD9]" };

// Classificação dos arquivos enviados: o prefixo do nome identifica a classificação
// (ex: ATA_REUNIAO_20260925_PI-2041_AMBEV.pdf). O nome sugerido pode ser editado, mas o prefixo é mantido.
const CLASSIFICACOES = [
  ["ATA_REUNIAO", "Ata de reunião"], ["CONTRATO", "Contrato"], ["PROPOSTA", "Proposta / orçamento"], ["PROJETO", "Projeto / desenho"],
  ["RELATORIO", "Relatório"], ["NF", "Nota fiscal"], ["FOTO", "Foto"], ["DOC", "Outro documento"],
];
const rotuloClassificacao = (nome) => CLASSIFICACOES.find(([p]) => nome.startsWith(`${p}_`))?.[1];
const limparParte = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toUpperCase();
function sugerirNome(prefixo, pi) {
  const h = new Date();
  const data = `${h.getFullYear()}${String(h.getMonth() + 1).padStart(2, "0")}${String(h.getDate()).padStart(2, "0")}`;
  return [prefixo, data, limparParte(pi?.codigo), limparParte(pi?.cliente)].filter(Boolean).join("_");
}
const extensao = (nome) => { const p = nome.split("."); return p.length > 1 ? `.${p.pop().toLowerCase().replace(/[^a-z0-9]/g, "")}` : ""; };

function tamanhoLegivel(bytes) {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}
function nomeSeguro(nome) {
  const partes = nome.split(".");
  const ext = partes.length > 1 ? `.${partes.pop().toLowerCase().replace(/[^a-z0-9]/g, "")}` : "";
  const base = partes.join(".").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "arquivo";
  return base.slice(0, 80) + ext;
}

export default function DocumentosPage() {
  const { usuario } = useAuth();
  const { avisar } = useToast();
  const editavel = podeEditar(usuario);
  const { dados: pis } = useTabela("pis", { order: { coluna: "codigo" } });
  const [piId, setPiId] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState(null); // { pi, itens, rdosSemPdf, erro }
  const [filtroTipo, setFiltroTipo] = useState("");
  const [busca, setBusca] = useState("");
  const [gerando, setGerando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const inputArquivoRef = useRef(null);

  const buscar = async (id = piId) => {
    if (!id) return;
    setBuscando(true);
    const pi = pis.find((p) => p.id === id);
    const [lista, { data: ocorrencias }, { data: rdos }] = await Promise.all([
      supabase.storage.from(BUCKET_DOCUMENTOS).list(id, { limit: 1000, sortBy: { column: "created_at", order: "desc" } }),
      supabase.from("ocorrencias").select("*").eq("pi_id", id),
      supabase.from("rdos").select("*").eq("pi_id", id),
    ]);
    const itens = [];
    (lista.data || []).filter((f) => f.id && !f.name.startsWith(".")).forEach((f) => {
      itens.push({
        chave: `s-${f.name}`, tipo: f.name.startsWith("RDO_") ? "rdo" : f.name.startsWith("OCORRENCIA_") ? "ocorrencia" : f.name.startsWith("ATA_") ? "ata" : "arquivo", nome: f.name,
        classificacao: rotuloClassificacao(f.name),
        data: f.created_at || f.updated_at, tamanho: f.metadata?.size, caminho: `${id}/${f.name}`,
        // registro de origem do PDF (para o Master poder editá-lo; o PDF é refeito ao salvar)
        rdo: (rdos || []).find((r) => r.pdf_path === `${id}/${f.name}`),
        ocorrencia: (ocorrencias || []).find((o) => o.pdf_path === `${id}/${f.name}`),
      });
    });
    (ocorrencias || []).forEach((o) => (o.midias || []).forEach((m, i) => {
      itens.push({
        chave: `o-${o.id}-${i}`, tipo: m.tipo === "foto" ? "foto" : "video", nome: m.nome || `${m.tipo} da ocorrência`,
        detalhe: `Ocorrência: ${o.categoria}${o.descricao ? ` — ${o.descricao}` : ""}`, data: o.created_at, url: m.url,
      });
    }));
    itens.sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));
    setResultado({ pi, itens, rdosSemPdf: (rdos || []).filter((r) => !r.pdf_path),
      ocorrenciasSemPdf: (ocorrencias || []).filter((o) => !o.rdo_id && !o.pdf_path), erro: lista.error?.message });
    setBuscando(false);
  };

  // abre a aba antes do "await" — senão o navegador bloqueia como pop-up
  const abrir = async (item, baixar = false) => {
    if (item.url) { window.open(item.url, "_blank", "noopener"); return; }
    const aba = baixar ? null : window.open("", "_blank");
    try {
      const url = await linkTemporario(item.caminho, 3600, baixar);
      if (baixar) { window.location.href = url; return; }
      if (aba) aba.location.href = url; else window.location.href = url;
    } catch (e) {
      aba?.close();
      avisar(`Não foi possível abrir: ${e.message}`, "erro");
    }
  };

  // exclusão e edição de documentos: somente Master (registrado na Auditoria)
  const master = ehMaster(usuario);
  const [excluindo, setExcluindo] = useState(null);
  const [editandoRegistro, setEditandoRegistro] = useState(null); // { tipo, item, ocorrencias? }
  const editarRegistro = async (item) => {
    if (item.rdo) {
      const { data } = await supabase.from("ocorrencias").select("*").eq("rdo_id", item.rdo.id);
      setEditandoRegistro({ tipo: "rdo", item: item.rdo, ocorrencias: data || [] });
    } else if (item.ocorrencia) setEditandoRegistro({ tipo: "ocorrencia", item: item.ocorrencia });
  };

  // 1º passo: escolher arquivos → abre a classificação com nome sugerido
  const [pendentes, setPendentes] = useState(null); // [{ arquivo, prefixo, base, editado }]
  const prepararEnvio = (arquivos) => {
    const validos = arquivos.filter((a) => {
      if (a.size > 50 * 1024 * 1024) { avisar(`"${a.name}" passa de 50 MB e não foi enviado.`, "erro"); return false; }
      return true;
    });
    if (!validos.length) return;
    setPendentes(validos.map((arquivo) => ({ arquivo, prefixo: "DOC", base: sugerirNome("DOC", resultado.pi), editado: false })));
  };
  const alterarPendente = (i, patch) => setPendentes((p) => p.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  // 2º passo: envia com o nome escolhido
  const enviarArquivos = async (lista) => {
    if (!lista.length || !resultado?.pi) return;
    setEnviando(true);
    const existentes = new Set(resultado.itens.filter((i) => i.caminho).map((i) => i.nome));
    let ok = 0, atas = 0;
    for (const { arquivo: arq, prefixo, base } of lista) {
      // mantém o prefixo da classificação mesmo que o nome tenha sido editado
      let semExt = nomeSeguro(`${base || sugerirNome(prefixo, resultado.pi)}.x`).replace(/\.x$/, "");
      if (!semExt.toUpperCase().startsWith(`${prefixo}_`)) semExt = `${prefixo}_${semExt}`;
      let nome = `${semExt}${extensao(arq.name)}`;
      if (/^(RDO|OCORRENCIA)_/.test(nome)) nome = `DOC_${nome}`; // prefixos reservados para os PDFs gerados
      for (let n = 2; existentes.has(nome); n++) nome = `${semExt}_${n}${extensao(arq.name)}`;
      const { error } = await supabase.storage.from(BUCKET_DOCUMENTOS).upload(`${resultado.pi.id}/${nome}`, arq, { contentType: arq.type || undefined });
      if (error) { avisar(`Falha ao enviar "${arq.name}": ${error.message}`, "erro", 6000); continue; }
      existentes.add(nome); ok++;
      if (prefixo === "ATA_REUNIAO") atas++;
      await registrarLog(usuario, "Enviou documento", `${resultado.pi.codigo} — ${nome} (${CLASSIFICACOES.find(([p]) => p === prefixo)?.[1]})`);
    }
    setEnviando(false);
    setPendentes(null);
    if (atas) chamarApi("/api/clientes/avisar", { piId: resultado.pi.id, tipo: "ata", detalhe: `${atas} nova(s) ata(s) de reunião.` });
    if (ok) { avisar(`${ok} arquivo(s) enviado(s).`); buscar(resultado.pi.id); }
  };

  const gerarFaltantes = async () => {
    setGerando(true);
    let ok = 0, falhas = 0;
    for (const r of resultado.rdosSemPdf) {
      try { await gerarPdfRdo(r.id); ok++; } catch { falhas++; }
    }
    for (const o of resultado.ocorrenciasSemPdf) {
      try { await gerarPdfOcorrencia(o.id); ok++; } catch { falhas++; }
    }
    setGerando(false);
    avisar(`${ok} PDF(s) gerado(s)${falhas ? ` · ${falhas} com erro` : ""}.`, falhas ? "erro" : "sucesso");
    buscar(resultado.pi.id);
  };

  const termo = busca.trim().toLowerCase();
  const itensFiltrados = (resultado?.itens || []).filter((i) =>
    (!filtroTipo || i.tipo === filtroTipo) && (!termo || `${i.nome} ${i.detalhe || ""}`.toLowerCase().includes(termo)));
  const contagem = (t) => (resultado?.itens || []).filter((i) => !t || i.tipo === t).length;

  return (
    <PainelShell>
      <div className="p-4 md:p-8 max-w-6xl mx-auto">
        <CabecalhoPagina titulo="Documentos" subtitulo="Todos os arquivos de cada PI: PDFs dos RDOs, documentos enviados, fotos e vídeos das ocorrências." />

        <form onSubmit={(e) => { e.preventDefault(); buscar(); }} className="cartao p-4 mb-5 flex flex-col sm:flex-row sm:items-end gap-3">
          <label className="block flex-1 min-w-0">
            <span className="rotulo">PI</span>
            <select value={piId} onChange={(e) => setPiId(e.target.value)} className="input">
              <option value="">Selecione o PI...</option>
              {pis.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.cliente}{p.projeto ? ` — ${p.projeto}` : ""}</option>)}
            </select>
          </label>
          <button type="submit" disabled={!piId || buscando} className="btn btn-primario sm:min-w-[130px]">
            {buscando ? <><Spinner /> Buscando...</> : <><Icone nome="buscar" className="w-4 h-4" /> Buscar</>}
          </button>
        </form>

        {!resultado && !buscando && <EstadoVazio icone="pasta" titulo="Escolha um PI" texto="Selecione o PI e clique em Buscar para listar os arquivos." />}
        {buscando && <Esqueleto linhas={5} altura={52} />}

        {resultado && !buscando && (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
              <div>
                <div className="text-xs font-mono text-cyan font-bold">{resultado.pi?.codigo}</div>
                <div className="font-head font-bold text-lg leading-tight">{resultado.pi?.cliente}{resultado.pi?.projeto ? ` — ${resultado.pi.projeto}` : ""}</div>
              </div>
              {editavel && (
                <>
                  <button onClick={() => inputArquivoRef.current?.click()} disabled={enviando} className="btn btn-contorno">
                    {enviando ? <><Spinner /> Enviando...</> : <><Icone nome="upload" className="w-4 h-4" /> Enviar arquivo</>}
                  </button>
                  <input ref={inputArquivoRef} type="file" multiple className="hidden"
                    onChange={(e) => { prepararEnvio(Array.from(e.target.files || [])); e.target.value = ""; }} />
                </>
              )}
            </div>

            {resultado.erro && (
              <Aviso tipo="erro" className="mb-3">
                Não foi possível ler os arquivos salvos ({resultado.erro}). Confira se o script <strong>documentos-notificacoes.sql</strong> foi rodado no Supabase.
              </Aviso>
            )}
            {(resultado.rdosSemPdf.length + resultado.ocorrenciasSemPdf.length) > 0 && (
              <Aviso tipo="alerta" className="mb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>{[resultado.rdosSemPdf.length && `${resultado.rdosSemPdf.length} RDO(s)`, resultado.ocorrenciasSemPdf.length && `${resultado.ocorrenciasSemPdf.length} ocorrência(s)`].filter(Boolean).join(" e ")} deste PI ainda sem PDF.</span>
                  {editavel && (
                    <button onClick={gerarFaltantes} disabled={gerando} className="btn btn-alerta btn-sm">
                      {gerando ? <><Spinner /> Gerando...</> : "Gerar PDFs"}
                    </button>
                  )}
                </div>
              </Aviso>
            )}

            <div className="flex flex-col md:flex-row md:items-center gap-2 mb-3">
              <div className="flex flex-wrap gap-1.5">
                {TIPOS.map(([v, l]) => (
                  <button key={v} onClick={() => setFiltroTipo(v)} className={`chip ${filtroTipo === v ? "chip-ativo" : ""}`}>{l} ({contagem(v)})</button>
                ))}
              </div>
              <div className="relative md:ml-auto md:w-72">
                <Icone nome="buscar" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muteddim" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar por nome..." className="input pl-9" />
              </div>
            </div>

            {itensFiltrados.length === 0 ? (
              <EstadoVazio icone="pasta" titulo="Nenhum arquivo" texto={resultado.itens.length ? "Nada encontrado com esses filtros." : "Este PI ainda não tem arquivos."} />
            ) : (
              <div className="cartao divide-y divide-line/70 overflow-hidden">
                {itensFiltrados.map((i) => (
                  <div key={i.chave} className="flex flex-wrap sm:flex-nowrap items-center gap-3 px-4 py-3 hover:bg-panel/50">
                    {i.tipo === "foto" ? (
                      <img src={i.url} alt="" className="w-10 h-10 rounded-lg object-cover border border-line shrink-0" loading="lazy" />
                    ) : (
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${COR_TIPO[i.tipo]}`}><Icone nome={ICONE_TIPO[i.tipo]} className="w-5 h-5" /></div>
                    )}
                    <div className="min-w-0 flex-1">
                      <button onClick={() => abrir(i)} className="font-semibold text-sm text-left hover:text-cyan hover:underline break-all">{i.nome}</button>
                      <div className="text-xs text-muted truncate">
                        {TIPOS.find(([v]) => v === i.tipo)?.[1]} · {i.data ? formatarDataHora(i.data) : "—"}{i.tamanho ? ` · ${tamanhoLegivel(i.tamanho)}` : ""}
                        {i.classificacao && i.tipo === "arquivo" ? ` · ${i.classificacao}` : ""}
                        {i.detalhe ? ` · ${i.detalhe}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-auto">
                      <button onClick={() => abrir(i)} className="btn btn-fantasma btn-sm">Abrir</button>
                      {i.caminho && (
                        <button onClick={() => abrir(i, true)} className="p-2 rounded-lg text-muted hover:bg-panel" aria-label={`Baixar ${i.nome}`} title="Baixar">
                          <Icone nome="download" className="w-4 h-4" />
                        </button>
                      )}
                      {master && (i.rdo || i.ocorrencia) && (
                        <button onClick={() => editarRegistro(i)} className="p-2 rounded-lg text-muted hover:bg-panel" aria-label={`Editar o registro de ${i.nome}`}
                          title={i.rdo ? "Editar o RDO (o PDF é refeito)" : "Editar a ocorrência (o PDF é refeito)"}>
                          <Icone nome="editar" className="w-4 h-4" />
                        </button>
                      )}
                      {master && i.caminho && (
                        <button onClick={() => setExcluindo(i)} className="p-2 rounded-lg text-muteddim hover:text-red hover:bg-red/5" aria-label={`Excluir ${i.nome}`} title="Excluir">
                          <Icone nome="lixo" className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="text-xs text-muteddim mt-2">
              Os PDFs de RDO e de ocorrência são gerados automaticamente ao enviar, editar, aprovar ou reprovar.
            </div>
          </>
        )}
      </div>
      {pendentes && (
        <Modal titulo={`Enviar ${pendentes.length} arquivo(s) — ${resultado?.pi?.codigo}`} onFechar={() => !enviando && setPendentes(null)} largura="max-w-2xl"
          rodape={<>
            <button onClick={() => setPendentes(null)} disabled={enviando} className="btn btn-fantasma">Cancelar</button>
            <button onClick={() => enviarArquivos(pendentes)} disabled={enviando || pendentes.some((p) => !p.base.trim())} className="btn btn-primario">
              {enviando ? <><Spinner /> Enviando...</> : <><Icone nome="upload" className="w-4 h-4" /> Enviar</>}
            </button>
          </>}>
          <div className="flex flex-col gap-3">
            {pendentes.map((p, i) => (
              <div key={i} className="rounded-xl border border-line p-3 flex flex-col gap-2.5">
                <div className="text-sm text-muted truncate">Arquivo: <strong className="text-textmain">{p.arquivo.name}</strong> · {tamanhoLegivel(p.arquivo.size)}</div>
                <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-2">
                  <label className="block">
                    <span className="rotulo">Classificação</span>
                    <select value={p.prefixo} className="input"
                      onChange={(e) => alterarPendente(i, { prefixo: e.target.value, ...(p.editado ? {} : { base: sugerirNome(e.target.value, resultado.pi) }) })}>
                      {CLASSIFICACOES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </label>
                  <label className="block min-w-0">
                    <span className="rotulo">Nome do arquivo (sugestão — pode editar)</span>
                    <div className="flex items-center gap-1">
                      <input value={p.base} onChange={(e) => alterarPendente(i, { base: e.target.value, editado: true })} className="input font-mono !text-xs" />
                      <span className="text-sm text-muted font-mono shrink-0">{extensao(p.arquivo.name)}</span>
                    </div>
                  </label>
                </div>
                {p.editado && <button onClick={() => alterarPendente(i, { base: sugerirNome(p.prefixo, resultado.pi), editado: false })} className="self-start text-xs text-cyan hover:underline">Voltar à sugestão</button>}
              </div>
            ))}
            <div className="text-xs text-muteddim">A data do nome é a de hoje (dia do envio). Atas de reunião ficam visíveis aos clientes com acesso a este PI, que recebem um aviso por e-mail.</div>
          </div>
        </Modal>
      )}
      {excluindo && (
        <ConfirmarExclusao titulo="Excluir documento"
          descricao={`O arquivo "${excluindo.nome}" será apagado.${excluindo.rdo || excluindo.ocorrencia ? " O registro (RDO/ocorrência) continua existindo e o PDF pode ser gerado de novo aqui." : ""}`}
          onFechar={() => setExcluindo(null)}
          onConfirmar={async (motivo) => {
            const r = await excluirDocumento({ caminho: excluindo.caminho, pi: resultado.pi, usuario, motivo });
            if (r.ok) { avisar("Documento excluído — registrado na Auditoria.", "info"); buscar(resultado.pi.id); }
            return r;
          }} />
      )}
      {editandoRegistro?.tipo === "rdo" && (
        <EditorRdo rdo={editandoRegistro.item} pi={resultado?.pi} pis={pis} comoAprovador ocorrenciasOriginais={editandoRegistro.ocorrencias}
          onFechar={() => setEditandoRegistro(null)} onSalvo={() => buscar(resultado.pi.id)} />
      )}
      {editandoRegistro?.tipo === "ocorrencia" && (
        <EditorOcorrencia oc={editandoRegistro.item} pis={pis} comoAprovador onFechar={() => setEditandoRegistro(null)} onSalvo={() => buscar(resultado.pi.id)} />
      )}
    </PainelShell>
  );
}
