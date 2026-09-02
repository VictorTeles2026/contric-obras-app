"use client";

import { useState } from "react";
import { registrarLog } from "../../../lib/dados";
import { useAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import MobileShell from "../../../components/MobileShell";
import { useMinhasPis } from "../page";

const NAV = [
  { href: "/lider", label: "Início", icone: "🏠" },
  { href: "/lider/rdo", label: "RDO", icone: "📋" },
  { href: "/lider/horas", label: "Horas", icone: "⏱" },
  { href: "/lider/cronograma", label: "Obras", icone: "📅" },
  { href: "/lider/solicitar", label: "Solicitar", icone: "✎" },
];

export default function LiderHorasPage() {
  const { usuario } = useAuth();
  const meusPis = useMinhasPis(usuario);
  const [pisSelecionados, setPisSelecionados] = useState([]);
  const [horaInicio, setHoraInicio] = useState("07:00");
  const [horaFim, setHoraFim] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const togglePi = (id) => setPisSelecionados((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const horasTotais = horaInicio && horaFim
    ? Math.max(0, (new Date(`2000-01-01T${horaFim}`) - new Date(`2000-01-01T${horaInicio}`)) / 3600000)
    : 0;

  const enviar = async () => {
    if (pisSelecionados.length === 0 || horasTotais <= 0) return;
    setEnviando(true);
    const horasPorPi = horasTotais / pisSelecionados.length;
    await supabase.from("apontamentos_horas").insert(
      pisSelecionados.map((pid) => ({ usuario_id: usuario.id, pi_id: pid, horas_totais: horasPorPi, status: "pendente" }))
    );
    await registrarLog(usuario, "Enviou horas do dia", `${pisSelecionados.length} PI(s) — ${horasTotais.toFixed(1)}h`);
    setEnviando(false);
    setEnviado(true);
  };

  if (meusPis.length === 0) {
    return <MobileShell nav={NAV}><div className="p-4 text-sm text-muteddim">Você não está alocado em nenhuma obra.</div></MobileShell>;
  }

  if (enviado) {
    return (
      <MobileShell nav={NAV}>
        <div className="p-6 flex flex-col items-center text-center gap-3 mt-10">
          <div className="text-4xl">✓</div>
          <div className="font-head font-bold text-lg">Horas enviadas</div>
          <p className="text-sm text-muted">Pendente de validação.</p>
          <a href="/lider" className="mt-4 px-5 py-2.5 rounded-lg bg-cyan text-white text-sm font-semibold">Voltar ao início</a>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell nav={NAV}>
      <div className="p-4 flex flex-col gap-4">
        <div className="font-head font-bold text-lg">Minhas horas de hoje</div>

        <div>
          <div className="text-xs text-muteddim mb-2">Em quais obras você trabalhou hoje?</div>
          <div className="flex flex-wrap gap-2">
            {meusPis.map((p) => (
              <button key={p.id} type="button" onClick={() => togglePi(p.id)}
                className={`px-3 py-2 rounded-full text-sm border ${pisSelecionados.includes(p.id) ? "bg-cyan text-white border-cyan" : "border-line text-muted bg-white"}`}>
                {p.codigo}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <div className="text-xs text-muteddim mb-1">Início</div>
            <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-line text-sm bg-white" />
          </div>
          <div className="flex-1">
            <div className="text-xs text-muteddim mb-1">Fim</div>
            <input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-line text-sm bg-white" />
          </div>
        </div>

        {horasTotais > 0 && pisSelecionados.length > 0 && (
          <div className="text-sm text-muted bg-white rounded-lg border border-line p-3">
            {horasTotais.toFixed(1)}h ÷ {pisSelecionados.length} obra(s) = {(horasTotais / pisSelecionados.length).toFixed(1)}h cada
          </div>
        )}

        <button onClick={enviar} disabled={pisSelecionados.length === 0 || horasTotais <= 0 || enviando}
          className="py-3 rounded-xl bg-amber text-white font-semibold text-sm disabled:opacity-50">
          {enviando ? "Enviando..." : "Enviar horas do dia"}
        </button>
      </div>
    </MobileShell>
  );
}
