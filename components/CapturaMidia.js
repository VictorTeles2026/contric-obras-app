"use client";

import { useState, useRef } from "react";
import { supabase } from "../lib/supabase";

export default function CapturaMidia({ value, onChange, compacto }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const inputFotoRef = useRef(null);
  const inputVideoRef = useRef(null);

  const midias = value || [];

  const enviarArquivo = async (arquivo, tipo) => {
    setErro(""); setEnviando(true);
    const caminho = `${Date.now()}-${arquivo.name}`.replace(/\s+/g, "-");
    const { error } = await supabase.storage.from("ocorrencias").upload(caminho, arquivo);
    if (error) {
      setErro(error.message);
      setEnviando(false);
      return;
    }
    const { data } = supabase.storage.from("ocorrencias").getPublicUrl(caminho);
    onChange([...midias, { url: data.publicUrl, tipo, nome: arquivo.name }]);
    setEnviando(false);
  };

  const remover = (i) => onChange(midias.filter((_, idx) => idx !== i));

  return (
    <div>
      <div className="flex gap-2 flex-wrap">
        <button type="button" disabled={enviando} onClick={() => inputFotoRef.current?.click()}
          className={`px-3 py-1.5 rounded-lg border border-line text-muted disabled:opacity-50 ${compacto ? "text-xs" : "text-sm"}`}>
          📷 Foto
        </button>
        <input ref={inputFotoRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarArquivo(f, "foto"); e.target.value = ""; }} />

        <button type="button" disabled={enviando} onClick={() => inputVideoRef.current?.click()}
          className={`px-3 py-1.5 rounded-lg border border-line text-muted disabled:opacity-50 ${compacto ? "text-xs" : "text-sm"}`}>
          🎥 Vídeo
        </button>
        <input ref={inputVideoRef} type="file" accept="video/*" capture="environment" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarArquivo(f, "video"); e.target.value = ""; }} />

        {enviando && <span className={`text-muteddim self-center ${compacto ? "text-xs" : "text-sm"}`}>Enviando...</span>}
      </div>

      {erro && <div className={`text-red mt-1 ${compacto ? "text-xs" : "text-sm"}`}>⚠ {erro}</div>}

      {midias.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {midias.map((m, i) => (
            <div key={i} className="relative">
              {m.tipo === "foto" ? (
                <img src={m.url} alt={m.nome} className={compacto ? "w-14 h-14 object-cover rounded-lg border border-line" : "w-20 h-20 object-cover rounded-lg border border-line"} />
              ) : (
                <div className={`${compacto ? "w-14 h-14" : "w-20 h-20"} rounded-lg border border-line bg-panel flex items-center justify-center text-xl`}>🎥</div>
              )}
              <button type="button" onClick={() => remover(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red text-white text-xs flex items-center justify-center">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
