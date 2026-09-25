"use client";

import { useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../lib/Toast";
import { ehMaster } from "../lib/exclusoes";
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

// Botões "Editar" e "Excluir" que só aparecem para o Master.
// `excluir(motivo)` deve devolver { ok } ou { erro }.
export default function AcoesMaster({ onEditar, excluir, descricaoExclusao, tituloExclusao = "Excluir", onExcluido, compacto = true }) {
  const { usuario } = useAuth();
  const { avisar } = useToast();
  const [confirmando, setConfirmando] = useState(false);
  if (!ehMaster(usuario)) return null;
  const cls = compacto ? "btn btn-sm" : "btn";
  return (
    <>
      <div className="flex items-center gap-1.5">
        <span className="selo bg-navy text-white" title="Ações exclusivas do Master — registradas na Auditoria">Master</span>
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
