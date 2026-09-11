"use client";

import { useState } from "react";
import { registrarLog } from "../../lib/dados";
import { useAuth } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import MobileShell from "../../components/MobileShell";
import { useMinhasPis } from "../lider/page";

const NAV = [
  { href: "/equipe", label: "Horas", icone: "⏱" },
  { href: "/equipe/ocorrencia", label: "Ocorrência", icone: "⚠" },
];

export default function EquipeHorasPage() {
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
    return <MobileShell nav={NAV}><div className="p-5 text-base text-muteddim leading-relaxed">Você ainda não está alocado em nenhuma obra. Fale com seu líder.</div></MobileShell>;
  }

  if (enviado) {
    return (
      <MobileShell nav={NAV}>
        <div className="p-6 flex flex-col items-center text-center gap-3 mt-10">
          <div className="text-5xl">✓</div>
          <div className="font-head font-bold text-xl">Horas enviadas</div>
          <p className="text-base text-muted">Seu líder vai validar em breve.</p>
          <button onClick={() => setEnviado(false)} className="mt-4 px-6 py-3 rounded-lg bg-cyan text-white text-base font-semibold">Lançar de novo</button>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell nav={NAV}>
      <div className="p-5 flex flex-col gap-5">
        <div className="font-head font-bold text-xl">Minhas horas de hoje</div>

        <div>
          <div className="text-sm text-muteddim mb-2">Em quais obras você trabalhou hoje?</div>
          <div className="flex flex-wrap gap-2">
            {meusPis.map((p) => (
              <button key={p.id} type="button" onClick={() => togglePi(p.id)}
                className={`px-4 py-2.5 rounded-full text-base border ${pisSelecionados.includes(p.id) ? "bg-cyan text-white border-cyan" : "border-line text-muted bg-white"}`}>
                {p.codigo}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <div className="text-sm text-muteddim mb-1.5">Horário de início</div>
            <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-line text-base bg-white" />
          </div>
          <div>
            <div className="text-sm text-muteddim mb-1.5">Horário de término</div>
            <input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-line text-base bg-white" />
          </div>
        </div>

        {horasTotais > 0 && pisSelecionados.length > 0 && (
          <div className="text-base text-muted bg-white rounded-lg border border-line p-4 leading-relaxed">
            {horasTotais.toFixed(1)}h ÷ {pisSelecionados.length} obra(s) = <strong>{(horasTotais / pisSelecionados.length).toFixed(1)}h</strong> cada
          </div>
        )}

        <button onClick={enviar} disabled={pisSelecionados.length === 0 || horasTotais <= 0 || enviando}
          className="py-4 rounded-xl bg-amber text-white font-semibold text-base disabled:opacity-50">
          {enviando ? "Enviando..." : "Enviar horas do dia"}
        </button>
      </div>
    </MobileShell>
  );
}
