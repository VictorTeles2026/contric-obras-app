"use client";

import { useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../lib/Toast";
import { ehMaster } from "../lib/exclusoes";
import { pode } from "../lib/permissoes";
import { Modal, Aviso, Spinner } from "./ui";
import Icone from "./Icone";

// Confirmação de exclusão (Master): descreve o que será apagado e pede um motivo,
// que vai para a Auditoria junto com o resumo do item.
export function ConfirmarExclusao({ titulo, descricao, onConfirmar, onFechar }) {
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const confirmar = async () => {
    setOcupado(true); setErro("");
    const r = await onConfirmar(motivo.trim());
    setOcupado(false);
    if (r?.erro) { setErro(r.erro); return; }
    onFechar();
  };
  return (
    <Modal titulo={titulo} onFechar={onFechar} largura="max-w-md"
      rodape={<>
        <button onClick={onFechar} className="btn btn-fantasma" disabled={ocupado}>Cancelar</button>
        <button onClick={confirmar} disabled={ocupado || !motivo.trim()} className="btn btn-perigo">
          {ocupado ? <><Spinner /> Excluindo...</> : <><Icone nome="lixo" className="w-4 h-4" /> Excluir definitivamente</>}
        </button>
      </>}>
      <div className="flex flex-col gap-3">
        <Aviso tipo="erro">Esta ação não pode ser desfeita. {descricao}</Aviso>
        <label className="block">
          <span className="rotulo">Motivo da exclusão (vai para a Auditoria)</span>
          <textarea autoFocus rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} className="input" placeholder="Ex: lançamento duplicado" />
        </label>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
      </div>
    </Modal>
  );
}

// Botões "Editar" e "Excluir" de ações restritas. Cada um aparece conforme a matriz de
// permissões (permissaoEditar / permissaoExcluir); sem código informado, só o Master.
// `excluir(motivo)` deve devolver { ok } ou { erro }.
export default function AcoesMaster({ onEditar, excluir, descricaoExclusao, tituloExclusao = "Excluir", onExcluido, compacto = true, permissaoEditar, permissaoExcluir }) {
  const { usuario } = useAuth();
  const { avisar } = useToast();
  const [confirmando, setConfirmando] = useState(false);
  const podeEditarItem = !!onEditar && (permissaoEditar ? pode(usuario, permissaoEditar) : ehMaster(usuario));
  const podeExcluirItem = !!excluir && (permissaoExcluir ? pode(usuario, permissaoExcluir) : ehMaster(usuario));
  if (!podeEditarItem && !podeExcluirItem) return null;
  onEditar = podeEditarItem ? onEditar : null;
  excluir = podeExcluirItem ? excluir : null;
  const cls = compacto ? "btn btn-sm" : "btn";
  return (
    <>
      <div className="flex items-center gap-1.5">
        <span className="selo bg-navy text-white" title="Ações restritas — registradas na Auditoria">{ehMaster(usuario) ? "Master" : "Restrito"}</span>
        {onEditar && <button onClick={onEditar} className={`${cls} btn-contorno`}><Icone nome="editar" className="w-4 h-4" /> Editar</button>}
        {excluir && <button onClick={() => setConfirmando(true)} className={`${cls} btn-contorno-perigo`}><Icone nome="lixo" className="w-4 h-4" /> Excluir</button>}
      </div>
      {confirmando && (
        <ConfirmarExclusao titulo={tituloExclusao} descricao={descricaoExclusao}
          onFechar={() => setConfirmando(false)}
          onConfirmar={async (motivo) => {
            const r = await excluir(motivo);
            if (r?.ok) { avisar("Excluído — registrado na Auditoria.", "info"); onExcluido?.(); }
            return r;
          }} />
      )}
    </>
  );
}

// Exclusão com duas confirmações: 1ª pergunta se tem certeza; 2ª avisa que tudo será
// perdido e que não há como desfazer. onConfirmar deve devolver { ok } ou { erro }.
export function ConfirmacaoDupla({ titulo, pergunta, perdas, onConfirmar, onFechar }) {
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
