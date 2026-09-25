"use client";

import { useEffect, useRef, useState } from "react";
import { chamarApi } from "../lib/dados";
import { formatarDataHora } from "../lib/datas";
import { useToast } from "../lib/Toast";
import { Modal, Aviso, Spinner } from "./ui";

const ORIGEM = { criacao: "definida no cadastro", master: "definida pelo Master", propria: "alterada pelo próprio usuário", redefinicao: "gerada automaticamente" };

// SOMENTE Master: senhas registradas de um usuário/cliente (a consulta vai para a Auditoria)
export default function VerSenhas({ authUserId, nome, onFechar }) {
  const { avisar } = useToast();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [visivel, setVisivel] = useState(false);

  const consultouRef = useRef(false); // uma consulta (e um registro na Auditoria) por abertura
  useEffect(() => {
    if (consultouRef.current) return;
    consultouRef.current = true;
    chamarApi("/api/senhas", { authUserId, nome }).then(({ ok, json }) => (ok ? setDados(json.senhas) : setErro(json.error || "Não foi possível consultar.")));
  }, [authUserId, nome]);

  const copiar = async (s) => { try { await navigator.clipboard.writeText(s); avisar("Senha copiada."); } catch { avisar("Não foi possível copiar.", "erro"); } };

  return (
    <Modal titulo={`Senhas — ${nome}`} onFechar={onFechar} largura="max-w-md">
      <div className="flex flex-col gap-3">
        <Aviso tipo="alerta">Informação sigilosa, visível somente ao Master. Esta consulta foi registrada na Auditoria.</Aviso>
        {!dados && !erro && <div className="flex justify-center py-6"><Spinner className="w-6 h-6 text-cyan" /></div>}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {dados && dados.length === 0 && <div className="text-sm text-muteddim">Nenhuma senha registrada ainda (senhas definidas antes desta função não foram guardadas).</div>}
        {dados && dados.length > 0 && (
          <>
            <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
              <input type="checkbox" className="accent-cyan w-4 h-4" checked={visivel} onChange={(e) => setVisivel(e.target.checked)} /> Mostrar senhas
            </label>
            {dados.map((s, i) => (
              <div key={i} className={`rounded-xl border px-3.5 py-3 ${i === 0 ? "border-cyan/40 bg-cyan/5" : "border-line"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-lg tracking-wider">{s.senha === null ? "(ilegível)" : visivel ? s.senha : "••••••••"}</span>
                  {s.senha && <button onClick={() => copiar(s.senha)} className="btn btn-contorno btn-sm">Copiar</button>}
                </div>
                <div className="text-xs text-muted mt-1">
                  {i === 0 ? <strong className="text-cyan">Atual</strong> : "Anterior"} · {formatarDataHora(s.em)} · {ORIGEM[s.origem] || s.origem}{s.por ? ` (${s.por})` : ""}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </Modal>
  );
}
