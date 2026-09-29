"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { BUCKET_DOCUMENTOS, linkTemporario } from "../lib/pdfRdo";
import { marcarDocumentosLidos } from "../lib/documentosLidos";
import { formatarDataHora } from "../lib/datas";
import { useToast } from "../lib/Toast";
import { Esqueleto, Spinner } from "./ui";
import Icone from "./Icone";

// mesma classificação da página Documentos (pelo prefixo do nome do arquivo)
const TIPOS = [
  ["rdo", "RDOs", "pdf", "bg-red/10 text-red"],
  ["ocorrencia", "Ocorrências", "alerta", "bg-amber/10 text-amber"],
  ["ata", "Atas de reuniões", "usuarios", "bg-navy/10 text-navy"],
  ["arquivo", "Outros documentos", "pasta", "bg-cyan/10 text-cyan"],
];
const tipoDoArquivo = (nome) => nome.startsWith("RDO_") ? "rdo" : nome.startsWith("OCORRENCIA_") ? "ocorrencia" : nome.startsWith("ATA_") ? "ata" : "arquivo";

// Quadro do Dashboard: documentos de todos os PIs que este usuário ainda não abriu,
// separados por tipo e, dentro do tipo, por PI. Clicar abre o arquivo e o marca como lido.
export default function DocumentosNaoAbertos({ usuario, pis }) {
  const { avisar } = useToast();
  const [arquivos, setArquivos] = useState(null); // [{ caminho, nome, tipo, data, pi }]
  const [lidos, setLidos] = useState(new Set());
  const [erroTabela, setErroTabela] = useState(false);
  const [aba, setAba] = useState("rdo");
  const [marcando, setMarcando] = useState(false);

  const idsPis = pis.map((p) => p.id).join(",");
  const carregar = useCallback(async () => {
    if (!usuario?.id || !pis.length) { setArquivos([]); return; }
    const [listas, { data: lidosDb, error }] = await Promise.all([
      Promise.all(pis.map((pi) => supabase.storage.from(BUCKET_DOCUMENTOS).list(pi.id, { limit: 1000 }).then((r) => ({ pi, lista: r.data || [] })))),
      supabase.from("documentos_lidos").select("caminho").eq("usuario_id", usuario.id),
    ]);
    setErroTabela(!!error);
    setLidos(new Set((lidosDb || []).map((l) => l.caminho)));
    setArquivos(listas.flatMap(({ pi, lista }) => lista.filter((f) => f.id && !f.name.startsWith("."))
      .map((f) => ({ caminho: `${pi.id}/${f.name}`, nome: f.name, tipo: tipoDoArquivo(f.name), data: f.created_at || f.updated_at, pi }))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.id, idsPis]);
  useEffect(() => { carregar(); }, [carregar]);

  const naoAbertos = useMemo(() => (arquivos || []).filter((a) => !lidos.has(a.caminho)), [arquivos, lidos]);
  const contagem = (t) => naoAbertos.filter((a) => a.tipo === t).length;
  const doTipo = naoAbertos.filter((a) => a.tipo === aba);
  const porPi = useMemo(() => {
    const g = new Map();
    doTipo.sort((x, y) => String(y.data || "").localeCompare(String(x.data || ""))).forEach((a) => {
      if (!g.has(a.pi.id)) g.set(a.pi.id, { pi: a.pi, itens: [] });
      g.get(a.pi.id).itens.push(a);
    });
    return [...g.values()].sort((x, y) => (x.pi.codigo || "").localeCompare(y.pi.codigo || ""));
  }, [doTipo]);

  const marcar = async (caminhos) => {
    setLidos((p) => new Set([...p, ...caminhos])); // some do quadro na hora
    const { error } = await marcarDocumentosLidos(usuario, caminhos);
    if (error) avisar(`Não foi possível registrar a leitura: ${error.message}`, "erro", 6000);
  };
  // abre a aba antes do "await" — senão o navegador bloqueia como pop-up
  const abrir = async (a) => {
    const janela = window.open("", "_blank");
    try {
      const url = await linkTemporario(a.caminho);
      if (janela) janela.location.href = url; else window.location.href = url;
      marcar([a.caminho]);
    } catch (e) {
      janela?.close();
      avisar(`Não foi possível abrir: ${e.message}`, "erro");
    }
  };
  const marcarTodos = async () => {
    if (!doTipo.length || !window.confirm(`Marcar ${doTipo.length} documento(s) de "${TIPOS.find(([t]) => t === aba)[1]}" como lidos?`)) return;
    setMarcando(true); await marcar(doTipo.map((a) => a.caminho)); setMarcando(false);
  };

  return (
    <section className="cartao p-4 md:p-5 h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="font-head font-bold text-base">Documentos não abertos</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{naoAbertos.length} no total</span>
          <button onClick={carregar} className="p-1.5 rounded-lg text-muted hover:bg-panel" title="Atualizar" aria-label="Atualizar"><Icone nome="historico" className="w-4 h-4" /></button>
        </div>
      </div>
      {erroTabela && <div className="text-xs text-amber mb-2">Rode o script <strong>documentos-lidos.sql</strong> no Supabase para guardar o que já foi aberto.</div>}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {TIPOS.map(([t, l]) => (
          <button key={t} onClick={() => setAba(t)} className={`chip ${aba === t ? "chip-ativo" : ""}`}>
            {l}{contagem(t) > 0 && <span className={`ml-1 font-bold ${aba === t ? "" : "text-red"}`}>{contagem(t)}</span>}
          </button>
        ))}
        {doTipo.length > 0 && (
          <button onClick={marcarTodos} disabled={marcando} className="ml-auto text-xs text-muted hover:text-cyan hover:underline">
            {marcando ? <Spinner className="w-3.5 h-3.5" /> : "Marcar todos como lidos"}
          </button>
        )}
      </div>

      {arquivos === null && <Esqueleto linhas={3} altura={44} />}
      {arquivos !== null && doTipo.length === 0 && (
        <div className="text-sm text-muteddim text-center py-6">Nenhum documento novo deste tipo. ✓</div>
      )}
      <div className="flex flex-col gap-3 overflow-y-auto rolagem-fina flex-1 min-h-0 -mx-1 px-1">
        {porPi.map(({ pi, itens }) => (
          <div key={pi.id}>
            <div className="text-xs font-mono text-cyan font-bold mb-1 truncate">
              {pi.codigo} — {pi.cliente}{pi.projeto ? <span className="font-sans font-normal text-muted"> · {pi.projeto}</span> : ""}
              <span className="font-sans font-normal text-muteddim"> ({itens.length})</span>
            </div>
            <div className="flex flex-col gap-1">
              {itens.map((a) => {
                const [, , icone, cor] = TIPOS.find(([t]) => t === a.tipo);
                return (
                  <button key={a.caminho} onClick={() => abrir(a)} title="Abrir documento"
                    className="flex items-center gap-2.5 text-left px-2.5 py-2 rounded-lg bg-panel hover:bg-white hover:shadow-sm border border-transparent hover:border-line transition-all">
                    <span className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${cor}`}><Icone nome={icone} className="w-4 h-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold truncate">{a.nome}</span>
                      <span className="block text-[11px] text-muteddim">{a.data ? formatarDataHora(a.data) : "—"}</span>
                    </span>
                    <span className="w-2 h-2 rounded-full bg-cyan shrink-0" aria-label="não aberto" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
