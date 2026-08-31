"use client";

import { useState } from "react";
import { useTabela } from "../../../lib/dados";

export default function AuditoriaPage() {
  const { dados: logs } = useTabela("logs_auditoria", { order: { coluna: "created_at" } });
  const [busca, setBusca] = useState("");
  const [filtroUsuario, setFiltroUsuario] = useState("");

  const usuariosComLog = [...new Set(logs.map((l) => l.usuario_nome))];
  const filtrados = logs.filter((l) =>
    (!filtroUsuario || l.usuario_nome === filtroUsuario) &&
    (!busca || (l.acao + " " + (l.detalhe || "")).toLowerCase().includes(busca.toLowerCase()))
  );

  return (
    <div className="p-6">
      <h1 className="font-head font-bold text-xl mb-1">Log de Auditoria</h1>
      <p className="text-sm text-muted mb-4">{logs.length} evento{logs.length !== 1 ? "s" : ""} registrados.</p>

      <div className="flex gap-2 mb-4">
        <input placeholder="Buscar por ação ou detalhe..." value={busca} onChange={(e) => setBusca(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg border border-line text-sm" />
        <select value={filtroUsuario} onChange={(e) => setFiltroUsuario(e.target.value)} className="px-3 py-2 rounded-lg border border-line text-sm">
          <option value="">Todos os usuários</option>
          {usuariosComLog.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        {filtrados.length === 0 && <div className="text-sm text-muteddim text-center py-8">Nenhum evento encontrado.</div>}
        {filtrados.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center gap-3 p-2 bg-panel rounded-lg text-xs">
            <span className="font-mono text-muteddim w-32 shrink-0">{new Date(l.created_at).toLocaleString("pt-BR")}</span>
            <span className="font-semibold w-32 shrink-0">{l.usuario_nome}</span>
            <span className="text-cyan font-semibold w-44 shrink-0">{l.acao}</span>
            <span className="text-muted flex-1">{l.detalhe}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
