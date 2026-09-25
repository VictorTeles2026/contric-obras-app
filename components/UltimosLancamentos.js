"use client";

import { useEffect, useState } from "react";
import { useTabela } from "../lib/dados";
import { formatarData, formatarHoras } from "../lib/datas";
import { EditorHoras } from "./Editores";
import Icone from "./Icone";

const COR_STATUS = { pendente: "bg-amber/10 text-amber", aprovado: "bg-green/10 text-green", rejeitado: "bg-red/10 text-red" };
const ROTULO_STATUS = { pendente: "pendente", aprovado: "aprovado", rejeitado: "reprovado" };

// `versao`: número que o pai incrementa após um lançamento, para recarregar a lista
// mesmo sem o tempo real do Supabase habilitado na tabela.
// `pisEditaveis`: obras que a pessoa pode escolher ao editar um lançamento pendente.
export default function UltimosLancamentos({ usuario, pis, pisEditaveis, versao = 0 }) {
  const { dados, recarregar } = useTabela("apontamentos_horas", {
    filtro: [["usuario_id", usuario?.id]], order: { coluna: "created_at", asc: false },
  });
  const [editando, setEditando] = useState(null);
  useEffect(() => { if (versao) recarregar(); }, [versao, recarregar]);
  const recentes = dados.slice(0, 10);
  if (recentes.length === 0) return null;

  // a obra do registro precisa estar na lista, mesmo que a pessoa não esteja mais alocada nela
  const opcoesPi = (registro) => {
    const base = pisEditaveis?.length ? pisEditaveis : pis;
    return base.some((p) => p.id === registro.pi_id) ? base : [...base, ...pis.filter((p) => p.id === registro.pi_id)];
  };

  return (
    <div className="flex flex-col gap-2 mt-2">
      <div className="titulo-secao">Últimos lançamentos</div>
      {recentes.map((h) => (
        <div key={h.id} className="cartao px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">{pis.find((p) => p.id === h.pi_id)?.codigo || "—"}</div>
              <div className="text-xs text-muted">{formatarData(h.data)}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-head font-bold">{h.horas_totais != null ? formatarHoras(h.horas_totais) : "em aberto"}</span>
              <span className={`selo ${COR_STATUS[h.status] || "bg-panel text-muted"}`}>{ROTULO_STATUS[h.status] || h.status}</span>
            </div>
          </div>
          {h.status === "rejeitado" && h.motivo_rejeicao && (
            <div className="text-sm text-red bg-red/5 rounded-lg px-3 py-2 mt-2">Motivo: {h.motivo_rejeicao}</div>
          )}
          {h.status === "pendente" && (
            <button onClick={() => setEditando(h)} className="btn btn-contorno btn-sm w-full mt-2.5">
              <Icone nome="editar" className="w-4 h-4" /> Editar (até ser aprovado)
            </button>
          )}
        </div>
      ))}
      {editando && (
        <EditorHoras registro={editando} pis={opcoesPi(editando)} comoAprovador={false}
          onFechar={() => setEditando(null)} onSalvo={recarregar} />
      )}
    </div>
  );
}
