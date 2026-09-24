"use client";

import { useState } from "react";
import { useTabela } from "../../lib/dados";
import PainelShell from "../../components/PainelShell";
import { CabecalhoPagina, EstadoVazio, Esqueleto } from "../../components/ui";
import Icone from "../../components/Icone";

const POR_PAGINA = 100;

export default function AuditoriaPage() {
  // mais recentes primeiro (antes vinham os mais antigos no topo)
  const { dados: logs, carregando } = useTabela("logs_auditoria", { order: { coluna: "created_at", asc: false } });
  const [busca, setBusca] = useState("");
  const [filtroUsuario, setFiltroUsuario] = useState("");
  const [limite, setLimite] = useState(POR_PAGINA);

  const usuariosComLog = [...new Set(logs.map((l) => l.usuario_nome))].sort();
  const termo = busca.trim().toLowerCase();
  const filtrados = logs.filter((l) =>
    (!filtroUsuario || l.usuario_nome === filtroUsuario) &&
    (!termo || `${l.acao} ${l.detalhe || ""} ${l.usuario_nome || ""}`.toLowerCase().includes(termo))
  );

  return (
    <PainelShell>
      <div className="p-4 md:p-8 max-w-6xl mx-auto">
        <CabecalhoPagina titulo="Log de Auditoria" subtitulo={`${logs.length} evento${logs.length !== 1 ? "s" : ""} registrado${logs.length !== 1 ? "s" : ""}.`} />

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Icone nome="buscar" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muteddim" />
            <input placeholder="Buscar por ação, detalhe ou pessoa..." value={busca} onChange={(e) => { setBusca(e.target.value); setLimite(POR_PAGINA); }} className="input pl-9" />
          </div>
          <select value={filtroUsuario} onChange={(e) => { setFiltroUsuario(e.target.value); setLimite(POR_PAGINA); }} className="input sm:!w-60">
            <option value="">Todos os usuários</option>
            {usuariosComLog.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>

        {carregando && <Esqueleto linhas={6} altura={44} />}
        {!carregando && filtrados.length === 0 && <EstadoVazio icone="auditoria" titulo="Nenhum evento" texto="Nada encontrado com esses filtros." />}

        {filtrados.length > 0 && (
          <div className="cartao overflow-hidden">
            <div className="hidden md:grid grid-cols-[150px_170px_220px_1fr] gap-3 px-4 py-2.5 bg-panel border-b border-line titulo-secao">
              <span>Quando</span><span>Quem</span><span>Ação</span><span>Detalhe</span>
            </div>
            <div className="divide-y divide-line/70">
              {filtrados.slice(0, limite).map((l) => (
                <div key={l.id} className="grid grid-cols-1 md:grid-cols-[150px_170px_220px_1fr] gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm hover:bg-panel/60">
                  <span className="font-mono text-xs text-muteddim md:pt-0.5">{new Date(l.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                  <span className="font-semibold truncate">{l.usuario_nome}</span>
                  <span className="text-cyan font-semibold">{l.acao}</span>
                  <span className="text-muted break-words">{l.detalhe}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {filtrados.length > limite && (
          <button onClick={() => setLimite((n) => n + POR_PAGINA)} className="btn btn-contorno w-full mt-4">
            Mostrar mais ({filtrados.length - limite} restantes)
          </button>
        )}
      </div>
    </PainelShell>
  );
}
