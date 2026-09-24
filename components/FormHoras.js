"use client";

import { useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { registrarLog } from "../lib/dados";
import { agruparPorCliente } from "../lib/minhasPis";
import { hojeISO, addDias, horasEntreHorarios, formatarHoras } from "../lib/datas";
import { useToast } from "../lib/Toast";
import { Spinner } from "./ui";

// Lançamento manual de horas do dia, dividido igualmente entre as obras escolhidas.
// Usado pelo líder, pela equipe (mão de obra) e pelo painel desktop.
export default function FormHoras({ usuario, pis, onEnviado, compacto = false }) {
  const { avisar } = useToast();
  const porCliente = useMemo(() => agruparPorCliente(pis), [pis]);
  const [pisSelecionados, setPisSelecionados] = useState(pis.length === 1 ? [pis[0].id] : []);
  const [data, setData] = useState(hojeISO());
  const [horaInicio, setHoraInicio] = useState("07:00");
  const [horaFim, setHoraFim] = useState("");
  const [enviando, setEnviando] = useState(false);

  const togglePi = (id) => setPisSelecionados((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const { horas: horasTotais, viraDia } = horasEntreHorarios(horaInicio, horaFim);
  const horasPorPi = pisSelecionados.length ? horasTotais / pisSelecionados.length : 0;
  const longoDemais = horasTotais > 16;
  const podeEnviar = pisSelecionados.length > 0 && horasTotais > 0 && !longoDemais && !enviando && data <= hojeISO();

  const enviar = async () => {
    if (!podeEnviar) return;
    setEnviando(true);
    const { error } = await supabase.from("apontamentos_horas").insert(
      pisSelecionados.map((pid) => ({
        usuario_id: usuario.id, pi_id: pid, data,
        horas_totais: Math.round(horasPorPi * 100) / 100, status: "pendente",
      }))
    );
    setEnviando(false);
    if (error) { avisar(`Não foi possível enviar: ${error.message}`, "erro", 6000); return; }
    await registrarLog(usuario, "Enviou horas do dia", `${data} — ${pisSelecionados.length} PI(s) — ${horasTotais.toFixed(1)}h`);
    avisar("Horas enviadas para validação.");
    setPisSelecionados(pis.length === 1 ? [pis[0].id] : []);
    setHoraFim("");
    onEnviado?.();
  };

  const tamanhoCampo = compacto ? "input" : "input input-lg";

  return (
    <div className={`flex flex-col ${compacto ? "gap-4" : "gap-5"}`}>
      <div>
        <div className="rotulo">{pis.length > 1 ? "Em quais obras você trabalhou?" : "Obra"}</div>
        {/* grade única (ordenada por cliente) — agrupar em blocos deixava um card por linha no celular */}
        <div className={compacto ? "flex flex-wrap gap-2" : "grid grid-cols-2 gap-2"}>
          {porCliente.flatMap(([, pisDoCliente]) => pisDoCliente).map((p) => {
            const sel = pisSelecionados.includes(p.id);
            return (
              <button key={p.id} type="button" onClick={() => togglePi(p.id)} aria-pressed={sel}
                className={`relative text-left rounded-xl border transition-all active:scale-[0.98] min-w-0 ${compacto ? "px-3 py-2" : "px-3.5 py-3"} ${sel ? "bg-cyan text-white border-cyan shadow-sm" : "border-line bg-white text-textmain hover:border-muteddim"}`}>
                <div className="font-semibold text-sm pr-4">{p.codigo}</div>
                <div className={`text-xs font-medium truncate ${sel ? "text-white/90" : "text-muted"}`}>{p.cliente || "—"}</div>
                {p.projeto && <div className={`text-xs truncate ${sel ? "text-white/75" : "text-muteddim"}`}>{p.projeto}</div>}
                <span className={`absolute top-2.5 right-2.5 w-4 h-4 rounded-full border flex items-center justify-center text-[10px] ${sel ? "bg-white text-cyan border-white" : "border-line"}`}>{sel ? "✓" : ""}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="rotulo">Dia trabalhado</div>
        <div className="flex gap-2 mb-2">
          {[[hojeISO(), "Hoje"], [addDias(hojeISO(), -1), "Ontem"]].map(([v, l]) => (
            <button key={v} type="button" onClick={() => setData(v)} className={`chip ${data === v ? "chip-ativo" : ""}`}>{l}</button>
          ))}
        </div>
        <input type="date" value={data} max={hojeISO()} onChange={(e) => setData(e.target.value)} className={tamanhoCampo} />
      </div>

      {/* empilhados no celular — evita o controle nativo de hora do iPhone estourar a largura */}
      <div className={compacto ? "grid grid-cols-2 gap-3" : "flex flex-col gap-3"}>
        <label className="block">
          <span className="rotulo">Início</span>
          <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className={tamanhoCampo} />
        </label>
        <label className="block">
          <span className="rotulo">Término</span>
          <input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} className={tamanhoCampo} />
        </label>
      </div>

      {horasTotais > 0 && (
        <div className={`rounded-xl border p-4 text-sm leading-relaxed animar-fade ${longoDemais ? "bg-red/5 border-red/30 text-red" : "bg-white border-line text-muted"}`}>
          {longoDemais ? (
            <>Total de <strong>{formatarHoras(horasTotais)}</strong> — confira os horários (máximo de 16h por lançamento).</>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span>Total do dia</span>
                <strong className="font-head text-2xl text-textmain">{formatarHoras(horasTotais)}</strong>
              </div>
              {viraDia && <div className="text-xs text-amber mt-1">Término no dia seguinte (virou a noite).</div>}
              {pisSelecionados.length > 1 && (
                <div className="text-xs mt-1">Dividido em {pisSelecionados.length} obras = <strong>{formatarHoras(horasPorPi)}</strong> cada</div>
              )}
            </>
          )}
        </div>
      )}

      <button onClick={enviar} disabled={!podeEnviar} className={`btn btn-alerta w-full ${compacto ? "" : "btn-lg"}`}>
        {enviando ? <><Spinner /> Enviando...</> : "Enviar horas"}
      </button>
      {!compacto && pisSelecionados.length === 0 && <div className="text-xs text-center text-muteddim -mt-2">Selecione pelo menos uma obra.</div>}
    </div>
  );
}
