"use client";

import { horasComAlmoco } from "../lib/horas";
import { JORNADA } from "../lib/constantes";
import { nomeBaseAnexo } from "../lib/pdfRdo";
import CapturaMidia from "./CapturaMidia";
import Icone from "./Icone";

// RDO Técnico: registro para técnicos de automação/CLP/segurança (modelo "RDO TÉCNICO").
// Fica em rdos.modelo = "tecnico" e os dados em rdos.tecnico (jsonb). Sempre ligado a um PI.
export const MODELOS_RDO = [["obra", "RDO de Obra"], ["tecnico", "RDO Técnico"]];
export const DESLOCAMENTOS = ["Atendimento técnico local", "Acompanhamento", "Deslocamento até o cliente", "Retorno à base", "Atendimento remoto"];
export const SUGESTOES_ITEM = [
  "Interface de I/O (Hardware)", "Implementação de Software & Lógica", "Parametrização de inversor / servo", "IHM / Supervisório",
  "Rede industrial / comunicação", "Segurança NR12 (intertravamentos, relés, scanners)", "Teste do Ciclo de Funcionamento",
  "Produção de Peça de Teste com Operador", "Restabelecimento e Normalização", "Diagnóstico de falha",
];
export const STATUS_FINAL = [
  ["liberada", "Liberada para produção", "#2E9E44"],
  ["restricao", "Liberada com restrições", "#C97A21"],
  ["parada", "Parada / aguardando", "#D64545"],
];

export const tecnicoVazio = () => ({
  inicio: "08:00", fim: "17:00", deslocamento: ["Atendimento técnico local"], horasDeslocamento: "",
  intervencoes: [{ item: "", acao: "" }], acompanhamento: "", custodia: "", status: "liberada", statusTexto: "", midias: [],
});

// horas de campo descontando o almoço da jornada (Configurações → Jornada)
export function horasTecnico(v) {
  if (!v?.inicio || !v?.fim) return { brutas: 0, almoco: 0, liquidas: 0, texto: "—" };
  const h = horasComAlmoco(v.inicio, v.fim);
  return { ...h, texto: h.liquidas ? `${String(h.liquidas).replace(".", ",")} h` : "—" };
}

export function faltaNoTecnico(v) {
  if (!v?.inicio || !v?.fim || !(horasTecnico(v).liquidas > 0)) return "Informe o horário de atuação (início e fim).";
  if (!(v.intervencoes || []).some((i) => i.acao?.trim())) return "Descreva pelo menos uma intervenção técnica executada.";
  if (!v.acompanhamento?.trim()) return "Preencha o acompanhamento técnico em campo.";
  return null;
}
// remove linhas vazias antes de gravar
export const limparTecnico = (v) => ({ ...v, intervencoes: (v.intervencoes || []).filter((i) => i.item?.trim() || i.acao?.trim()).map((i) => ({ item: i.item.trim(), acao: i.acao.trim() })) });

// escolha do modelo: RDO de Obra (atual) ou RDO Técnico
export function SeletorModeloRdo({ valor, onChange, grande = false }) {
  return (
    <div className={`flex p-1 rounded-xl bg-panel border border-line ${grande ? "" : "max-w-md"}`} role="radiogroup" aria-label="Modelo do RDO">
      {MODELOS_RDO.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={valor === v} onClick={() => onChange(v)}
          className={`flex-1 rounded-lg font-semibold transition-colors ${grande ? "py-3 text-base" : "py-2 text-sm"} ${valor === v ? "bg-white text-cyan shadow-sm" : "text-muted"}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

// campos do RDO Técnico (controlado: valor + onChange). `grande` = layout do celular
export function CamposRdoTecnico({ valor, onChange, pi, data, grande = false }) {
  const v = valor;
  const set = (patch) => onChange({ ...v, ...patch });
  const h = horasTecnico(v);
  const input = grande ? "input input-lg" : "input";
  const alterarInt = (i, patch) => set({ intervencoes: v.intervencoes.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  const secao = (n, titulo) => (
    <div className="flex items-center gap-2 bg-navy text-white rounded-lg px-3 py-2 text-xs font-bold tracking-wider uppercase">{n}. {titulo}</div>
  );
  return (
    <div className="flex flex-col gap-4">
      {/* 1. jornada */}
      <div className="flex flex-col gap-3">
        {secao(1, "Jornada e deslocamento")}
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="rotulo">Início</span><input type="time" value={v.inicio} onChange={(e) => set({ inicio: e.target.value })} className={input} /></label>
          <label className="block"><span className="rotulo">Fim</span><input type="time" value={v.fim} onChange={(e) => set({ fim: e.target.value })} className={input} /></label>
        </div>
        <div className="rounded-xl bg-cyan/5 border border-cyan/20 px-3 py-2 text-sm">
          Execução técnica em campo: <strong className="text-cyan">{h.texto}</strong>
          {h.almoco > 0 && <span className="text-muted"> · {v.inicio} às {v.fim} ({String(h.almoco).replace(".", ",")} h de almoço, {JORNADA.almocoInicio}–{JORNADA.almocoFim})</span>}
        </div>
        <div>
          <span className="rotulo">Trânsito / deslocamento</span>
          <div className="flex flex-wrap gap-2">
            {DESLOCAMENTOS.map((d) => {
              const on = (v.deslocamento || []).includes(d);
              return (
                <button key={d} type="button" aria-pressed={on} onClick={() => set({ deslocamento: on ? v.deslocamento.filter((x) => x !== d) : [...(v.deslocamento || []), d] })}
                  className={`chip ${grande ? "!py-2.5 !px-4" : ""} ${on ? "chip-ativo" : ""}`}>{d}</button>
              );
            })}
          </div>
          <label className="flex items-center gap-2 mt-2 text-sm text-muted">
            Horas de deslocamento (opcional)
            <input type="number" min="0" step="0.5" value={v.horasDeslocamento} onChange={(e) => set({ horasDeslocamento: e.target.value })} className="input !w-24 !py-1.5 text-right" />
          </label>
        </div>
      </div>

      {/* 2. intervenções */}
      <div className="flex flex-col gap-3">
        {secao(2, "Intervenções técnicas (CLP, segurança NR12...)")}
        <datalist id="sugestoes-item-tecnico">{SUGESTOES_ITEM.map((s) => <option key={s} value={s} />)}</datalist>
        {v.intervencoes.map((it, i) => (
          <div key={i} className="rounded-xl border border-line p-3 flex flex-col gap-2 bg-white">
            <div className="flex items-center gap-2">
              <input list="sugestoes-item-tecnico" value={it.item} onChange={(e) => alterarInt(i, { item: e.target.value })}
                placeholder="Subsistema / item (ex: Interface de I/O)" className={`${input} flex-1 font-semibold`} aria-label={`Subsistema ${i + 1}`} />
              {v.intervencoes.length > 1 && (
                <button type="button" onClick={() => set({ intervencoes: v.intervencoes.filter((_, k) => k !== i) })} className="p-2 rounded-lg text-muteddim hover:text-red" aria-label="Remover intervenção">
                  <Icone nome="lixo" className="w-4 h-4" />
                </button>
              )}
            </div>
            <textarea value={it.acao} onChange={(e) => alterarInt(i, { acao: e.target.value })} rows={grande ? 3 : 2}
              placeholder="Ação técnica executada" className={input} aria-label={`Ação técnica ${i + 1}`} />
          </div>
        ))}
        <button type="button" onClick={() => set({ intervencoes: [...v.intervencoes, { item: "", acao: "" }] })} className={`btn btn-contorno ${grande ? "btn-lg" : "btn-sm"} self-start`}>
          <Icone nome="mais2" className="w-4 h-4" /> Adicionar intervenção
        </button>
      </div>

      {/* 3. acompanhamento e status */}
      <div className="flex flex-col gap-3">
        {secao(3, "Acompanhamento e status da máquina")}
        <label className="block"><span className="rotulo">Acompanhamento técnico em campo</span>
          <textarea value={v.acompanhamento} onChange={(e) => set({ acompanhamento: e.target.value })} rows={grande ? 4 : 3} className={input}
            placeholder="Resumo do que foi feito, testado e validado" /></label>
        <label className="block"><span className="rotulo">Custódia de componentes (opcional)</span>
          <input value={v.custodia} onChange={(e) => set({ custodia: e.target.value })} className={input} placeholder="Ex: placa substituída entregue à equipe do cliente" /></label>
        <div>
          <span className="rotulo">Status de partida da produção / finalização</span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {STATUS_FINAL.map(([k, l, cor]) => (
              <button key={k} type="button" aria-pressed={v.status === k} onClick={() => set({ status: k })}
                className={`rounded-xl border px-3 ${grande ? "py-3" : "py-2"} text-sm font-semibold transition-colors ${v.status === k ? "text-white border-transparent" : "bg-white border-line text-muted"}`}
                style={v.status === k ? { background: cor } : undefined}>{l}</button>
            ))}
          </div>
          <textarea value={v.statusTexto} onChange={(e) => set({ statusTexto: e.target.value })} rows={2} className={`${input} mt-2`}
            placeholder="Ex: máquina testada, ajustada e liberada; ciclo automático validado com o operador" />
        </div>
        <div>
          <span className="rotulo">Fotos e evidências (opcional)</span>
          <CapturaMidia value={v.midias || []} onChange={(m) => set({ midias: m })} compacto={!grande} baseNome={nomeBaseAnexo("RDO-TEC", data, pi)} />
        </div>
      </div>
    </div>
  );
}

// resumo somente leitura (Aprovações, Histórico)
export function ResumoRdoTecnico({ tecnico }) {
  const t = tecnico || {};
  const st = STATUS_FINAL.find(([k]) => k === t.status);
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted">
        <span>Atuação: <strong className="text-textmain">{t.inicio}–{t.fim}</strong> ({horasTecnico(t).texto})</span>
        {(t.deslocamento || []).length > 0 && <span>{t.deslocamento.join(" · ")}{t.horasDeslocamento ? ` · ${t.horasDeslocamento} h desloc.` : ""}</span>}
      </div>
      <div className="flex flex-col divide-y divide-line/70 rounded-lg border border-line/70">
        {(t.intervencoes || []).map((i, k) => (
          <div key={k} className="px-3 py-2"><strong className="font-semibold">{i.item || "Intervenção"}</strong><span className="text-muted"> — {i.acao}</span></div>
        ))}
        {!(t.intervencoes || []).length && <div className="px-3 py-2 text-muteddim">Sem intervenções registradas.</div>}
      </div>
      {t.acompanhamento && <div><strong>Acompanhamento:</strong> {t.acompanhamento}</div>}
      {t.custodia && <div><strong>Custódia:</strong> {t.custodia}</div>}
      {st && <div><span className="selo text-white" style={{ background: st[2] }}>{st[1]}</span>{t.statusTexto ? <span className="text-muted"> {t.statusTexto}</span> : ""}</div>}
      {(t.midias || []).length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {t.midias.map((m) => (
            <a key={m.url} href={m.url} target="_blank" rel="noreferrer">
              {m.tipo === "foto" ? <img src={m.url} alt={m.nome || "foto"} className="w-14 h-14 object-cover rounded-md border border-line" />
                : <span className="w-14 h-14 rounded-md border border-line bg-white flex items-center justify-center text-xs text-muted">vídeo</span>}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
