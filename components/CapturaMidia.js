"use client";

import { useState, useRef } from "react";
import { supabase } from "../lib/supabase";
import Icone from "./Icone";
import { Spinner } from "./ui";

const LIMITE_MB = 50;

function extensaoDe(arquivo) {
  return (arquivo.name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5)
    || (arquivo.type.split("/")[1] || "bin").replace(/[^a-z0-9]/g, "").slice(0, 5);
}

// `baseNome`: nome do documento a que o anexo pertence (ex: OCORRENCIA_20260925_PI-2041_AMBEV).
// O arquivo é salvo como <baseNome>_01.jpg, _02.mp4... — mesmo nome do documento, muda só
// a numeração e a extensão. Sem baseNome (obra ainda não escolhida) o envio fica bloqueado.
export default function CapturaMidia({ value, onChange, compacto, baseNome }) {
  const proximoNumeroRef = useRef(0);
  const [enviando, setEnviando] = useState(0);
  const [erro, setErro] = useState("");
  const inputFotoRef = useRef(null);
  const inputVideoRef = useRef(null);
  const midiasRef = useRef(value || []);
  midiasRef.current = value || [];

  const enviarArquivo = async (arquivo, tipo) => {
    setErro("");
    if (arquivo.size > LIMITE_MB * 1024 * 1024) {
      setErro(`Arquivo muito grande (máx. ${LIMITE_MB} MB). Grave um vídeo mais curto.`);
      return;
    }
    if (!baseNome) { setErro("Escolha a obra antes de anexar fotos ou vídeos."); return; }
    setEnviando((n) => n + 1);
    const ext = extensaoDe(arquivo);
    // numeração: continua depois dos anexos que já existem; se o nome estiver ocupado, tenta o próximo
    proximoNumeroRef.current = Math.max(proximoNumeroRef.current, midiasRef.current.length);
    let caminho, error;
    for (let tentativa = 0; tentativa < 30; tentativa++) {
      const n = ++proximoNumeroRef.current;
      caminho = `${baseNome}_${String(n).padStart(2, "0")}.${ext}`;
      ({ error } = await supabase.storage.from("ocorrencias").upload(caminho, arquivo, { contentType: arquivo.type || undefined }));
      if (!error || !/exist|duplicate|409/i.test(`${error.message} ${error.statusCode || ""}`)) break;
    }
    if (error) {
      setErro(/fetch|network/i.test(error.message) ? "Sem conexão — não foi possível enviar o arquivo." : error.message);
      setEnviando((n) => n - 1);
      return;
    }
    const { data } = supabase.storage.from("ocorrencias").getPublicUrl(caminho);
    // usa a lista mais recente (evita perder um anexo se dois uploads terminarem juntos)
    onChange([...midiasRef.current, { url: data.publicUrl, tipo, nome: caminho }]);
    setEnviando((n) => n - 1);
  };

  const aoEscolher = (tipo) => (e) => {
    Array.from(e.target.files || []).forEach((f) => enviarArquivo(f, tipo));
    e.target.value = "";
  };

  const remover = (i) => onChange(midiasRef.current.filter((_, idx) => idx !== i));
  const tamanhoMiniatura = compacto ? "w-16 h-16" : "w-20 h-20";
  const classeBotao = compacto ? "btn btn-contorno btn-sm" : "btn btn-contorno flex-1 py-3";

  return (
    <div>
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={() => inputFotoRef.current?.click()} disabled={!baseNome} className={classeBotao}>
          <Icone nome="camera" className="w-[18px] h-[18px]" /> Foto
        </button>
        <input ref={inputFotoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={aoEscolher("foto")} />

        <button type="button" onClick={() => inputVideoRef.current?.click()} disabled={!baseNome} className={classeBotao}>
          <Icone nome="video" className="w-[18px] h-[18px]" /> Vídeo
        </button>
        <input ref={inputVideoRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={aoEscolher("video")} />
      </div>

      {!baseNome && <div className="text-xs text-muteddim mt-1.5">Escolha a obra para liberar fotos e vídeos.</div>}
      {erro && <div className="text-sm text-red mt-2">⚠ {erro}</div>}

      {(midiasRef.current.length > 0 || enviando > 0) && (
        <div className="flex flex-wrap gap-2 mt-3">
          {midiasRef.current.map((m, i) => (
            <div key={m.url} className="relative animar-fade">
              {m.tipo === "foto" ? (
                <a href={m.url} target="_blank" rel="noreferrer">
                  <img src={m.url} alt={m.nome} className={`${tamanhoMiniatura} object-cover rounded-lg border border-line`} />
                </a>
              ) : (
                <a href={m.url} target="_blank" rel="noreferrer" className={`${tamanhoMiniatura} rounded-lg border border-line bg-panel flex items-center justify-center text-muted`}>
                  <Icone nome="video" className="w-7 h-7" />
                </a>
              )}
              <button type="button" onClick={() => remover(i)} aria-label="Remover anexo"
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red text-white flex items-center justify-center shadow">
                <Icone nome="fechar" className="w-3.5 h-3.5" strokeWidth={2.6} />
              </button>
            </div>
          ))}
          {Array.from({ length: enviando }).map((_, i) => (
            <div key={`env-${i}`} className={`${tamanhoMiniatura} rounded-lg border border-dashed border-cyan/50 bg-cyan/5 flex flex-col items-center justify-center gap-1 text-cyan text-[11px]`}>
              <Spinner className="w-5 h-5" /> Enviando
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
