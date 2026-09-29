"use client";

import { useState } from "react";
import { Modal, Spinner } from "./ui";

// Exclusão com duas confirmações: 1ª pergunta se tem certeza; 2ª avisa que tudo será
// perdido e que não há como desfazer. onConfirmar deve devolver { ok } ou { erro }.
export default function ConfirmacaoDupla({ titulo, pergunta, perdas, onConfirmar, onFechar }) {
  const [passo, setPasso] = useState(1);
  const [executando, setExecutando] = useState(false);
  const [erro, setErro] = useState("");

  const confirmar = async () => {
    setExecutando(true); setErro("");
    const r = await onConfirmar();
    setExecutando(false);
    if (r?.erro) setErro(r.erro); else onFechar();
  };

  return (
    <Modal titulo={passo === 1 ? titulo : "Confirmação final"} onFechar={() => !executando && onFechar()} largura="max-w-md"
      rodape={passo === 1 ? <>
        <button onClick={onFechar} className="btn btn-fantasma">Cancelar</button>
        <button onClick={() => setPasso(2)} className="btn btn-perigo">Sim, quero excluir</button>
      </> : <>
        <button onClick={onFechar} disabled={executando} className="btn btn-fantasma">Cancelar</button>
        <button onClick={confirmar} disabled={executando} className="btn btn-perigo">
          {executando ? <><Spinner /> Excluindo...</> : "Excluir definitivamente"}
        </button>
      </>}>
      {passo === 1 ? (
        <p className="text-sm">{pergunta}</p>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <div className="rounded-xl border border-red/40 bg-red/5 text-red p-3.5">
            <strong>Todas as informações serão perdidas e esta ação NÃO poderá ser revertida.</strong>
            {perdas && <div className="mt-1.5">{perdas}</div>}
          </div>
          {erro && <div className="text-red">{erro}</div>}
        </div>
      )}
    </Modal>
  );
}
