"use client";

import { useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { registrarLog, gravarTolerante } from "../lib/dados";
import { agruparPorCliente } from "../lib/dados";
import { hojeISO, addDias, formatarHoras } from "../lib/datas";
import { horasComAlmoco, dividirHoras } from "../lib/horas";
import { JORNADA } from "../lib/constantes";
import { useToast } from "../lib/Toast";
import { Spinner } from "./ui";

// Lançamento manual de horas do dia.
// - O almoço (padrão 12:00–13:00, em Configurações → Jornada) é descontado automaticamente.
// - Só o LÍDER pode marcar várias obras no mesmo dia ("dia dividido"): as horas são divididas
//   igualmente (blocos de 15 min) e ele pode ajustar a divisão; os registros ficam ligados por
//   `grupo_lancamento`, e a aprovação trata o dia inteiro de uma vez. Os demais lançam 1 obra.
export default function FormHoras({ usuario, pis, onEnviado, compacto = false }) {
  const { avisar } = useToast();
  const variasObras = usuario?.perfil === "lider";
  const porCliente = useMemo(() => agruparPorCliente(pis), [pis]);
  const [pisSelecionados, setPisSelecionados] = useState(pis.length === 1 ? [pis[0].id] : []);
  const [data, setData] = useState(hojeISO());
  const [horaInicio, setHoraInicio] = useState("07:00");
  const [horaFim, setHoraFim] = useState("");
  const [ajustar, setAjustar] = useState(false);
  const [ajuste, setAjuste] = useState({}); // piId → horas (quando ajustado à mão)
  const [enviando, setEnviando] = useState(false);

  const togglePi = (id) => {
    setAjuste({});
    if (!variasObras) { setPisSelecionados([id]); return; }
    setPisSelecionados((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };
  const { brutas, almoco, liquidas: horasTotais, viraDia } = horasComAlmoco(horaInicio, horaFim);
  const divisaoIgual = dividirHoras(horasTotais, pisSelecionados.length);
  const horasDe = (pid, i) => (ajustar && ajuste[pid] !== undefined ? Number(ajuste[pid]) || 0 : divisaoIgual[i] || 0);
  const divisao = pisSelecionados.map((pid, i) => horasDe(pid, i));
  const somaDivisao = Math.round(divisao.reduce((s, h) => s + h, 0) * 100) / 100;
  const divisaoBate = Math.abs(somaDivisao - Math.round(horasTotais * 4) / 4) < 0.01;
  const longoDemais = brutas > 16;
  const podeEnviar = pisSelecionados.length > 0 && horasTotais > 0 && !longoDemais && divisaoBate && divisao.every((h) => h > 0) && !enviando && data <= hojeISO();

  const enviar = async () => {
    if (!podeEnviar) return;
    setEnviando(true);
    const grupo = pisSelecionados.length > 1 ? (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`) : null;
    const linhas = pisSelecionados.map((pid, i) => ({
      usuario_id: usuario.id, pi_id: pid, data,
      horas_totais: divisao[i], status: "pendente",
      hora_inicio: horaInicio, hora_fim: horaFim,
      ...(grupo ? { grupo_lancamento: grupo } : {}),
    }));
    // tolerante: banco ainda sem hora_inicio/hora_fim/grupo_lancamento grava sem essas colunas
    const { error } = await gravarTolerante(linhas, (d) => supabase.from("apontamentos_horas").insert(d));
    setEnviando(false);
    if (error) { avisar(`Não foi possível enviar: ${error.message}`, "erro", 6000); return; }
    await registrarLog(usuario, "Enviou horas do dia", `${data} — ${horaInicio}–${horaFim} (almoço −${formatarHoras(almoco)}) — ${pisSelecionados.length} PI(s) — ${formatarHoras(horasTotais)}`);
    avisar(pisSelecionados.length > 1 ? `Horas enviadas — divididas em ${pisSelecionados.length} obras.` : "Horas enviadas para validação.");
    setPisSelecionados(pis.length === 1 ? [pis[0].id] : []);
    setHoraFim(""); setAjuste({}); setAjustar(false);
    onEnviado?.();
  };

  const tamanhoCampo = compacto ? "input" : "input input-lg";
  const codigo = (pid) => pis.find((p) => p.id === pid)?.codigo || "?";

  return (
    <div className={`flex flex-col ${compacto ? "gap-4" : "gap-5"}`}>
      <div>
        <div className="rotulo">{variasObras && pis.length > 1 ? "Em quais obras você trabalhou hoje? (pode marcar várias)" : "Obra"}</div>
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
          <span className="rotulo">Entrada</span>
          <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className={tamanhoCampo} />
        </label>
        <label className="block">
          <span className="rotulo">Saída</span>
          <input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} className={tamanhoCampo} />
        </label>
      </div>

      {brutas > 0 && (
        <div className={`rounded-xl border p-4 text-sm leading-relaxed animar-fade ${longoDemais ? "bg-red/5 border-red/30 text-red" : "bg-white border-line text-muted"}`}>
          {longoDemais ? (
            <>Total de <strong>{formatarHoras(brutas)}</strong> — confira os horários (máximo de 16h por lançamento).</>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span>Horas trabalhadas</span>
                <strong className="font-head text-2xl text-textmain">{formatarHoras(horasTotais)}</strong>
              </div>
              <div className="text-xs mt-0.5">
                {formatarHoras(brutas)} de {horaInicio} às {horaFim}
                {almoco > 0 ? <> · almoço ({JORNADA.almocoInicio}–{JORNADA.almocoFim}) descontado: <strong>−{formatarHoras(almoco)}</strong></> : " · sem desconto de almoço"}
              </div>
              {viraDia && <div className="text-xs text-amber mt-1">Saída no dia seguinte (virou a noite).</div>}

              {pisSelecionados.length > 1 && (
                <div className="mt-3 pt-3 border-t border-line">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-textmain">Divisão entre {pisSelecionados.length} obras</span>
                    <button type="button" onClick={() => { setAjustar((v) => !v); setAjuste({}); }} className="text-xs font-semibold text-cyan">
                      {ajustar ? "Voltar à divisão igual" : "Ajustar divisão"}
                    </button>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {pisSelecionados.map((pid, i) => (
                      <div key={pid} className="flex items-center justify-between gap-2">
                        <span className="text-textmain font-medium">{codigo(pid)}</span>
                        {ajustar ? (
                          <input type="number" step="0.25" min="0.25" inputMode="decimal" aria-label={`Horas no PI ${codigo(pid)}`}
                            value={ajuste[pid] ?? divisaoIgual[i]} onChange={(e) => setAjuste((p) => ({ ...p, [pid]: e.target.value }))}
                            className="input !w-24 !py-1.5 text-right" />
                        ) : <strong className="text-textmain tabular-nums">{formatarHoras(divisao[i])}</strong>}
                      </div>
                    ))}
                  </div>
                  {ajustar && !divisaoBate && (
                    <div className="text-xs text-red mt-2">A soma ({formatarHoras(somaDivisao)}) precisa dar {formatarHoras(Math.round(horasTotais * 4) / 4)}.</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <button onClick={enviar} disabled={!podeEnviar} className={`btn btn-alerta w-full ${compacto ? "" : "btn-lg"}`}>
        {enviando ? <><Spinner /> Enviando...</> : pisSelecionados.length > 1 ? `Enviar horas (${pisSelecionados.length} obras)` : "Enviar horas"}
      </button>
      {!compacto && pisSelecionados.length === 0 && <div className="text-xs text-center text-muteddim -mt-2">Selecione {variasObras ? "pelo menos uma obra" : "a obra"}.</div>}
    </div>
  );
}
