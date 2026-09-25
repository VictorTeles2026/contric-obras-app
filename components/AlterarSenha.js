"use client";

import { useState } from "react";
import { chamarApi } from "../lib/dados";
import { useToast } from "../lib/Toast";
import { Modal, Campo, Aviso, Spinner } from "./ui";

// Troca da própria senha (usuário ou cliente). A senha atual é conferida no servidor.
export default function AlterarSenha({ onFechar }) {
  const { avisar } = useToast();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const curta = nova && nova.length < 6;
  const diferente = confirma && nova !== confirma;
  const pode = atual && nova.length >= 6 && nova === confirma && !salvando;

  const salvar = async () => {
    setSalvando(true); setErro("");
    const { ok, json } = await chamarApi("/api/alterar-senha", { senhaAtual: atual, novaSenha: nova });
    setSalvando(false);
    if (!ok) { setErro(json.error || "Não foi possível alterar a senha."); return; }
    avisar("Senha alterada. Use a nova senha no próximo acesso.");
    onFechar();
  };

  const tipo = mostrar ? "text" : "password";
  return (
    <Modal titulo="Alterar minha senha" onFechar={onFechar} largura="max-w-sm"
      rodape={<>
        <button onClick={onFechar} className="btn btn-fantasma" disabled={salvando}>Cancelar</button>
        <button onClick={salvar} disabled={!pode} className="btn btn-primario">{salvando ? <><Spinner /> Salvando...</> : "Salvar nova senha"}</button>
      </>}>
      <form onSubmit={(e) => { e.preventDefault(); if (pode) salvar(); }} className="flex flex-col gap-4">
        <Campo rotulo="Senha atual"><input type={tipo} value={atual} onChange={(e) => setAtual(e.target.value)} autoComplete="current-password" className="input input-lg" autoFocus /></Campo>
        <Campo rotulo="Nova senha" dica="Mínimo de 6 caracteres.">
          <input type={tipo} value={nova} onChange={(e) => setNova(e.target.value)} autoComplete="new-password" className={`input input-lg ${curta ? "!border-amber" : ""}`} />
        </Campo>
        <Campo rotulo="Repita a nova senha">
          <input type={tipo} value={confirma} onChange={(e) => setConfirma(e.target.value)} autoComplete="new-password" className={`input input-lg ${diferente ? "!border-red" : ""}`} />
          {diferente && <span className="block text-xs text-red mt-1">As senhas não conferem.</span>}
        </Campo>
        <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
          <input type="checkbox" className="accent-cyan w-4 h-4" checked={mostrar} onChange={(e) => setMostrar(e.target.checked)} /> Mostrar senhas
        </label>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
