"use client";

import { useState } from "react";
import { registrarLog, useTabela } from "../../../lib/dados";
import { useAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import MobileShell from "../../../components/MobileShell";
import { useMinhasPis } from "../../lider/page";

const NAV = [
  { href: "/equipe", label: "Horas", icone: "⏱" },
  { href: "/equipe/ocorrencia", label: "Ocorrência", icone: "⚠" },
];
const CATEGORIAS = ["Atraso", "Retrabalho", "Reclamação do cliente", "Prejuízo", "Outro"];

export default function EquipeOcorrenciaPage() {
  const { usuario } = useAuth();
  const meusPis = useMinhasPis(usuario);
  const { dados: minhasOcorrencias, recarregar } = useTabela("ocorrencias", {
    order: { coluna: "created_at" }, filtro: (q) => q.eq("registrado_por", usuario?.id),
  });

  const [piId, setPiId] = useState("");
  const [categoria, setCategoria] = useState(null);
  const [descricao, setDescricao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);

  const podeEnviar = piId && categoria;

  const enviar = async () => {
    if (!podeEnviar) return;
    setEnviando(true);
    await supabase.from("ocorrencias").insert({ pi_id: piId, categoria, descricao: descricao.trim() || null, registrado_por: usuario.id });
    await registrarLog(usuario, "Registrou ocorrência", `${categoria} — ${meusPis.find((p) => p.id === piId)?.codigo}`);
    setCategoria(null); setDescricao("");
    setEnviando(false); setOk(true); recarregar();
    setTimeout(() => setOk(false), 3000);
  };

  if (meusPis.length === 0) {
    return <MobileShell nav={NAV}><div className="p-4 text-sm text-muteddim">Você ainda não está alocado em nenhuma obra.</div></MobileShell>;
  }

  return (
    <MobileShell nav={NAV}>
      <div className="p-4 flex flex-col gap-4">
        <div className="font-head font-bold text-lg">Registrar ocorrência</div>
        {ok && <div className="text-xs text-green bg-green/10 rounded-lg px-3 py-2 font-semibold">✓ Ocorrência registrada.</div>}

        <div className="bg-white rounded-xl border border-line p-3 flex flex-col gap-3">
          <div>
            <div className="text-xs text-muteddim mb-1">Obra</div>
            <select value={piId} onChange={(e) => setPiId(e.target.value)} className="w-full px-2 py-2 rounded-lg border border-line text-sm">
              <option value="">Selecione...</option>
              {meusPis.map((p) => <option key={p.id} value={p.id}>{p.codigo}</option>)}
            </select>
          </div>
          <div>
            <div className="text-xs text-muteddim mb-1">Categoria</div>
            <div className="flex flex-wrap gap-2">
              {CATEGORIAS.map((c) => (
                <button key={c} type="button" onClick={() => setCategoria(c)}
                  className={`px-3 py-1.5 rounded-full text-xs border ${categoria === c ? "bg-amber text-white border-amber" : "border-line text-muted"}`}>{c}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-muteddim mb-1">Descrição (opcional)</div>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} className="w-full px-2 py-2 rounded-lg border border-line text-sm" />
          </div>
          <button onClick={enviar} disabled={!podeEnviar || enviando} className="py-2.5 rounded-lg bg-amber text-white text-sm font-semibold disabled:opacity-50">
            {enviando ? "Enviando..." : "Registrar ocorrência"}
          </button>
        </div>

        <div className="text-xs font-mono text-muteddim mt-2">MINHAS OCORRÊNCIAS DE HOJE</div>
        <div className="flex flex-col gap-2">
          {minhasOcorrencias.map((o) => (
            <div key={o.id} className="bg-white rounded-xl border border-line p-3 text-xs">
              <span className="text-amber font-semibold">{o.categoria}</span>{o.descricao ? ` — ${o.descricao}` : ""}
            </div>
          ))}
          {minhasOcorrencias.length === 0 && <div className="text-xs text-muteddim">Nenhuma ocorrência ainda.</div>}
        </div>
      </div>
    </MobileShell>
  );
}
