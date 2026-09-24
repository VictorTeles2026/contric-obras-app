"use client";

import { useState } from "react";
import { registrarLog, useTabela } from "../../../lib/dados";
import { useAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import MobileShell from "../../../components/MobileShell";
import { useMinhasPis, agruparPorCliente } from "../../lider/page";

const NAV = [
  { href: "/equipe", label: "Horas", icone: "⏱" },
  { href: "/equipe/ocorrencia", label: "Ocorrência", icone: "⚠" },
];
const CATEGORIAS = ["Atraso", "Retrabalho", "Reclamação do cliente", "Prejuízo", "Outro"];

export default function EquipeOcorrenciaPage() {
  const { usuario } = useAuth();
  const meusPis = useMinhasPis(usuario);
  const porCliente = agruparPorCliente(meusPis);
  const { dados: minhasOcorrencias, recarregar } = useTabela("ocorrencias", {
    order: { coluna: "created_at" }, filtro: [["registrado_por", usuario?.id]],
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
    return <MobileShell nav={NAV}><div className="p-5 text-base text-muteddim leading-relaxed">Você ainda não está alocado em nenhuma obra.</div></MobileShell>;
  }

  return (
    <MobileShell nav={NAV}>
      <div className="p-5 flex flex-col gap-5">
        <div className="font-head font-bold text-xl">Registrar ocorrência</div>
        {ok && <div className="text-sm text-green bg-green/10 rounded-lg px-4 py-3 font-semibold leading-relaxed">✓ Ocorrência registrada.</div>}

        <div className="bg-white rounded-xl border border-line p-4 flex flex-col gap-4">
          <div>
            <div className="text-sm text-muteddim mb-1.5">Obra</div>
            <select value={piId} onChange={(e) => setPiId(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-line text-base">
              <option value="">Selecione...</option>
              {porCliente.map(([cliente, pisDoCliente]) => (
                <optgroup key={cliente} label={cliente}>
                  {pisDoCliente.map((p) => <option key={p.id} value={p.id}>{p.codigo}{p.projeto ? ` — ${p.projeto}` : ""}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <div className="text-sm text-muteddim mb-2">Categoria</div>
            <div className="flex flex-wrap gap-2">
              {CATEGORIAS.map((c) => (
                <button key={c} type="button" onClick={() => setCategoria(c)}
                  className={`px-4 py-2 rounded-full text-sm border ${categoria === c ? "bg-amber text-white border-amber" : "border-line text-muted"}`}>{c}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-sm text-muteddim mb-1.5">Descrição (opcional)</div>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} className="w-full px-3 py-2.5 rounded-lg border border-line text-base" />
          </div>
          <button onClick={enviar} disabled={!podeEnviar || enviando} className="py-3.5 rounded-lg bg-amber text-white text-base font-semibold disabled:opacity-50">
            {enviando ? "Enviando..." : "Registrar ocorrência"}
          </button>
        </div>

        <div className="text-sm font-mono text-muteddim tracking-wide mt-1">MINHAS OCORRÊNCIAS DE HOJE</div>
        <div className="flex flex-col gap-2.5">
          {minhasOcorrencias.map((o) => (
            <div key={o.id} className="bg-white rounded-xl border border-line p-4 text-base">
              <span className="text-amber font-semibold">{o.categoria}</span>{o.descricao ? ` — ${o.descricao}` : ""}
            </div>
          ))}
          {minhasOcorrencias.length === 0 && <div className="text-sm text-muteddim">Nenhuma ocorrência ainda.</div>}
        </div>
      </div>
    </MobileShell>
  );
}
