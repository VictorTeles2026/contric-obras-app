"use client";

import { useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { registrarLog, gravarTolerante, useTabela } from "../lib/dados";
import { agruparPorCliente } from "../lib/dados";
import { hojeISO, addDias, formatarHoras } from "../lib/datas";
import { horasComAlmoco, dividirHoras } from "../lib/horas";
import { JORNADA } from "../lib/constantes";
import { useToast } from "../lib/Toast";
import { Spinner, SeletorPi, Segmentado } from "./ui";
import { valorPermissao } from "../lib/permissoes";

// Lançamento manual de horas do dia.
// - O almoço (padrão 12:00–13:00, em Configurações → Jornada) é descontado automaticamente.
// - Só o LÍDER pode marcar várias obras no mesmo dia ("dia dividido"): as horas são divididas
//   igualmente (blocos de 15 min) e ele pode ajustar a divisão; os registros ficam ligados por
//   `grupo_lancamento`, e a aprovação trata o dia inteiro de uma vez. Os demais lançam 1 obra.
// `largo` (computador): obras à esquerda; dia, horários e envio à direita
export default function FormHoras({ usuario, pis, onEnviado, compacto = false, largo = false }) {
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
    <div className={largo ? "grid gap-6 md:grid-cols-2 items-start" : `flex flex-col ${compacto ? "gap-4" : "gap-5"}`}>
      <div className={largo ? "md:max-h-[560px] md:overflow-y-auto rolagem-fina md:pr-1" : ""}>
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

      <div className={largo ? "flex flex-col gap-5" : "contents"}>
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
      <div className={compacto || largo ? "grid grid-cols-2 gap-3" : "flex flex-col gap-3"}>
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
    </div>
  );
}

// ---------------- Lançar horas para recursos e mão de obra ----------------
// Quem pode: permissão "horas.lancar_equipe" (S = todos os PIs e recursos; P = só os PIs em que
// a pessoa está alocada e os recursos alocados neles — caso do líder). Nunca para o pessoal de campo.
export const podeLancarParaRecursos = (usuario) =>
  !!usuario && !["funcionario", "terceiro"].includes(usuario.perfil) && ["S", "P"].includes(valorPermissao(usuario, "horas.lancar_equipe"));

export function FormHorasRecursos({ usuario, meusPis, todosPis, onEnviado, largo = false }) {
  const { avisar } = useToast();
  const escopoTotal = valorPermissao(usuario, "horas.lancar_equipe") === "S";
  const pisDisponiveis = (escopoTotal ? todosPis.filter((p) => p.status === "ativo" || !p.status) : meusPis);
  const { dados: recursos } = useTabela("recursos", { order: { coluna: "nome" } });
  const { dados: alocacoes } = useTabela("alocacoes_recurso", { select: "recurso_id,pi_id" });
  const [piId, setPiId] = useState(pisDisponiveis.length === 1 ? pisDisponiveis[0].id : "");
  const [soAlocados, setSoAlocados] = useState(true);
  const [busca, setBusca] = useState("");
  const [marcados, setMarcados] = useState([]);
  const [data, setData] = useState(hojeISO());
  const [modo, setModo] = useState("horario"); // horario | total
  const [inicio, setInicio] = useState("07:00");
  const [fim, setFim] = useState("17:00");
  const [total, setTotal] = useState("");
  const [extrasTxt, setExtrasTxt] = useState("0");
  const [enviando, setEnviando] = useState(false);

  const alocadosNoPi = new Set(alocacoes.filter((a) => a.pi_id === piId).map((a) => a.recurso_id));
  const termo = busca.trim().toLowerCase();
  // líder (escopo P): sempre só os alocados no PI; demais: alocados por padrão, ou todos se desmarcar
  const visivel = (r) => (!escopoTotal || soAlocados ? alocadosNoPi.has(r.id) : true);
  const lista = recursos.filter((r) => r.ativo !== false && visivel(r) && (!termo || (r.nome || "").toLowerCase().includes(termo)));
  const maoDeObra = lista.filter((r) => r.tipo === "mao_obra_propria" || r.tipo === "mao_obra_terceira");
  const outros = lista.filter((r) => !maoDeObra.includes(r));
  const h = horasComAlmoco(inicio, fim);
  const horas = modo === "total" ? Math.round((Number(total) || 0) * 4) / 4 : Math.round(h.liquidas * 4) / 4;
  // normais × extras já no lançamento (quem aprova vê a sugestão e pode ajustar — mesma validação de sempre)
  const extras = Math.round((Number(extrasTxt) || 0) * 4) / 4;
  const normais = Math.max(0, Math.round((horas - extras) * 100) / 100);
  const extrasOk = extras >= 0 && extras <= horas;
  const pode = extrasOk && piId && marcados.length > 0 && horas > 0 && horas <= 24 && data <= hojeISO() && !enviando;
  const marcar = (id) => setMarcados((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const enviar = async () => {
    if (!pode) return;
    setEnviando(true);
    const linhas = marcados.map((rid) => {
      const r = recursos.find((x) => x.id === rid);
      return {
        usuario_id: r?.usuario_id || null, recurso_id: rid, lancado_por: usuario.id, pi_id: piId, data, horas_totais: horas, horas_normais: normais, horas_extras: extras, status: "pendente",
        ...(modo === "horario" ? { hora_inicio: inicio, hora_fim: fim } : {}),
      };
    });
    const { error } = await supabase.from("apontamentos_horas").insert(linhas);
    setEnviando(false);
    if (error) {
      avisar(/recurso_id|lancado_por|null value/i.test(error.message) ? "Rode o script horas-recursos.sql no Supabase." : `Não foi possível lançar: ${error.message}`, "erro", 8000);
      return;
    }
    const pi = pisDisponiveis.find((p) => p.id === piId);
    await registrarLog(usuario, "Lançou horas para recursos", `${pi?.codigo} — ${data} · ${normais}h normais + ${extras}h extras · ${marcados.map((id) => recursos.find((r) => r.id === id)?.nome).join(", ")}`);
    avisar(`${linhas.length} lançamento(s) de ${formatarHoras(horas)} enviados para validação.`);
    setMarcados([]); onEnviado?.();
  };

  const item = (r) => (
    <label key={r.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-pointer border ${marcados.includes(r.id) ? "border-cyan/40 bg-cyan/5" : "border-transparent bg-panel"}`}>
      <input type="checkbox" className="accent-cyan w-4 h-4" checked={marcados.includes(r.id)} onChange={() => marcar(r.id)} />
      <span className="flex-1 min-w-0 truncate">{r.nome}</span>
      {!r.usuario_id && (r.tipo === "mao_obra_propria" || r.tipo === "mao_obra_terceira") && <span className="text-[10px] text-muteddim">sem usuário</span>}
    </label>
  );
  return (
    <div className={largo ? "grid gap-6 md:grid-cols-2 items-start" : "flex flex-col gap-4"}>
      <div className={largo ? "flex flex-col gap-4" : "contents"}>
      <div>
        <span className="rotulo">Obra</span>
        <SeletorPi pis={pisDisponiveis} value={piId} onChange={(v) => { setPiId(v); setMarcados([]); }} className="input" />
        {!escopoTotal && <div className="texto-apoio mt-1">Somente as obras em que você está alocado e os recursos alocados nelas.</div>}
      </div>
      {piId && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="rotulo !mb-0">Recursos e mão de obra ({marcados.length} marcado(s))</span>
            {escopoTotal && (
              <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
                <input type="checkbox" className="accent-cyan" checked={soAlocados} onChange={(e) => setSoAlocados(e.target.checked)} /> só alocados neste PI
              </label>
            )}
          </div>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar recurso..." className="input !py-1.5 mb-2" aria-label="Buscar recurso" />
          <div className={`flex flex-col gap-1 overflow-y-auto rolagem-fina ${largo ? "max-h-[440px]" : "max-h-72"}`}>
            {maoDeObra.length > 0 && <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mt-1">Mão de obra</div>}
            {maoDeObra.map(item)}
            {outros.length > 0 && <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mt-2">Equipamentos, veículos e outros</div>}
            {outros.map(item)}
            {!lista.length && <div className="text-sm text-muteddim py-2">Nenhum recurso {soAlocados || !escopoTotal ? "alocado neste PI" : "encontrado"}.</div>}
          </div>
        </div>
      )}
      {largo && !piId && <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muteddim">Escolha a obra para ver os recursos.</div>}
      </div>
      <div className={largo ? "flex flex-col gap-4 md:border-l md:border-line md:pl-6" : "contents"}>
      <div>
        <span className="rotulo">Dia</span>
        <input type="date" value={data} max={hojeISO()} onChange={(e) => setData(e.target.value)} className="input" />
      </div>
      <Segmentado valor={modo} onChange={setModo} opcoes={[["horario", "Entrada e saída"], ["total", "Total de horas"]]} />
      {modo === "horario" ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="rotulo">Entrada</span><input type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} className="input" /></label>
          <label className="block"><span className="rotulo">Saída</span><input type="time" value={fim} onChange={(e) => setFim(e.target.value)} className="input" /></label>
          <div className="col-span-2 text-sm text-muted">Horas por recurso: <strong className="text-textmain">{formatarHoras(horas)}</strong>{h.almoco > 0 ? ` (almoço ${JORNADA.almocoInicio}–${JORNADA.almocoFim} descontado)` : ""}</div>
        </div>
      ) : (
        <label className="block"><span className="rotulo">Horas por recurso</span>
          <input type="number" min="0.25" max="24" step="0.25" value={total} onChange={(e) => setTotal(e.target.value)} className="input" placeholder="Ex: 8" /></label>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div><span className="rotulo">Normais</span><div className="input bg-panel tabular-nums">{formatarHoras(normais)}</div></div>
        <label className="block"><span className="rotulo">Extras</span>
          <input type="number" min="0" max={horas || 24} step="0.25" value={extrasTxt} onChange={(e) => setExtrasTxt(e.target.value)} className="input" /></label>
        {!extrasOk && <div className="col-span-2 text-xs text-red">As extras não podem passar do total de horas.</div>}
      </div>
      <button onClick={enviar} disabled={!pode} className="btn btn-alerta w-full">
        {enviando ? <><Spinner /> Enviando...</> : `Lançar ${formatarHoras(horas || 0)} para ${marcados.length || 0} recurso(s)`}
      </button>
      <div className="texto-apoio">Os lançamentos vão para validação em Aprovações, como as horas de qualquer pessoa.</div>
      </div>
    </div>
  );
}