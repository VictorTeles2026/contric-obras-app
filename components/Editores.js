"use client";

import { useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../lib/Toast";
import { LISTA_STATUS_ETAPA, CATEGORIAS_OCORRENCIA } from "../lib/constantes";
import { horasEntreHorarios, hojeISO, isoLocal } from "../lib/datas";
import { salvarEdicaoRdo, salvarEdicaoHoras, salvarEdicaoSolicitacao, salvarEdicaoOcorrencia } from "../lib/edicoes";
import { Modal, Campo, Aviso, Spinner } from "./ui";
import CapturaMidia from "./CapturaMidia";
import Icone from "./Icone";

const limitar = (n) => Math.max(0, Math.min(100, Number(n) || 0));

function Rodape({ onFechar, onSalvar, salvando, podeSalvar = true }) {
  return (
    <>
      <button onClick={onFechar} className="btn btn-fantasma" disabled={salvando}>Cancelar</button>
      <button onClick={onSalvar} disabled={salvando || !podeSalvar} className="btn btn-primario">
        {salvando ? <><Spinner /> Salvando...</> : "Salvar alterações"}
      </button>
    </>
  );
}

// ---------------- RDO ----------------
export function EditorRdo({ rdo, pi, pis, ocorrenciasOriginais, comoAprovador, onFechar, onSalvo }) {
  const { usuario } = useAuth();
  const { avisar } = useToast();
  const [data, setData] = useState(rdo.data || hojeISO());
  const [atividades, setAtividades] = useState((rdo.atividades || []).map((a) => ({ ...a })));
  const [ocorrencias, setOcorrencias] = useState(ocorrenciasOriginais.map((o) => ({ ...o, midias: o.midias || [] })));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const alterarAtiv = (i, patch) => setAtividades((p) => p.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  const alterarOc = (i, patch) => setOcorrencias((p) => p.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));

  const salvar = async () => {
    setSalvando(true); setErro("");
    const novo = {
      data,
      atividades: atividades.map((a) => ({ ...a, percentual: a.status === "concluida" ? 100 : limitar(a.percentual) })),
    };
    const r = await salvarEdicaoRdo({
      rdo, novo, pis, usuario, comoAprovador, avisar,
      ocorrencias: { originais: ocorrenciasOriginais, editadas: ocorrencias.filter((o) => o.categoria) },
    });
    setSalvando(false);
    if (r.erro) { setErro(r.erro); return; }
    avisar(comoAprovador && r.mudancas?.length ? "RDO editado — o responsável foi notificado." : "RDO atualizado.");
    onSalvo?.();
    onFechar();
  };

  return (
    <Modal titulo={`Editar RDO — ${pi?.codigo || ""}`} onFechar={onFechar} largura="max-w-2xl"
      rodape={<Rodape onFechar={onFechar} onSalvar={salvar} salvando={salvando} podeSalvar={!!data} />}>
      <div className="flex flex-col gap-5">
        <Campo rotulo="Data do RDO" className="max-w-xs">
          <input type="date" value={data} max={hojeISO()} onChange={(e) => setData(e.target.value)} className="input" />
        </Campo>

        <div>
          <div className="titulo-secao mb-2">Atividades</div>
          <div className="flex flex-col gap-2">
            {atividades.map((a, i) => (
              <div key={a.etapa_id || i} className="flex flex-wrap items-center gap-2 rounded-lg bg-panel px-3 py-2">
                <span className="flex-1 min-w-[160px] text-sm font-medium">{a.nome}</span>
                <select value={a.status} onChange={(e) => alterarAtiv(i, { status: e.target.value })} className="input !w-auto !py-1.5" aria-label={`Status de ${a.nome}`}>
                  {LISTA_STATUS_ETAPA.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                {a.status === "em_andamento" && (
                  <div className="relative w-24">
                    <input type="number" inputMode="numeric" min="0" max="100" value={a.percentual ?? 0}
                      onChange={(e) => alterarAtiv(i, { percentual: e.target.value === "" ? "" : limitar(e.target.value) })}
                      className="input !py-1.5 text-right pr-7" aria-label={`Percentual de ${a.nome}`} />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted">%</span>
                  </div>
                )}
              </div>
            ))}
            {atividades.length === 0 && <div className="text-sm text-muteddim">Sem atividades neste RDO.</div>}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="titulo-secao">Ocorrências</div>
            <button onClick={() => setOcorrencias((p) => [...p, { categoria: CATEGORIAS_OCORRENCIA[0], descricao: "", midias: [] }])} className="btn btn-contorno btn-sm">
              <Icone nome="mais2" className="w-4 h-4" /> Incluir
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {ocorrencias.map((o, i) => (
              <div key={o.id || `nova-${i}`} className="rounded-xl border border-amber/25 bg-amber/5 p-3 flex flex-col gap-2">
                <div className="flex gap-2">
                  <select value={o.categoria} onChange={(e) => alterarOc(i, { categoria: e.target.value })} className="input flex-1" aria-label="Categoria">
                    {CATEGORIAS_OCORRENCIA.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button onClick={() => setOcorrencias((p) => p.filter((_, idx) => idx !== i))} className="p-2 rounded-lg text-muteddim hover:text-red hover:bg-red/5" aria-label="Remover ocorrência">
                    <Icone nome="lixo" className="w-4 h-4" />
                  </button>
                </div>
                <textarea value={o.descricao || ""} onChange={(e) => alterarOc(i, { descricao: e.target.value })} rows={2} className="input" placeholder="Descrição" />
                <CapturaMidia value={o.midias} onChange={(m) => alterarOc(i, { midias: m })} compacto />
              </div>
            ))}
            {ocorrencias.length === 0 && <div className="text-sm text-muteddim">Nenhuma ocorrência.</div>}
          </div>
        </div>

        {comoAprovador && <Aviso tipo="info">O responsável pelo RDO receberá uma notificação com o que foi alterado. O PDF do RDO é atualizado automaticamente.</Aviso>}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
      </div>
    </Modal>
  );
}

// ---------------- Horas ----------------
const horaDe = (iso) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false }) : "");
export function EditorHoras({ registro, pis, comoAprovador, onFechar, onSalvo }) {
  const { usuario } = useAuth();
  const { avisar } = useToast();
  const ehCheckin = !!registro.entrada;
  const [piId, setPiId] = useState(registro.pi_id);
  const [data, setData] = useState(registro.data || hojeISO());
  const [entrada, setEntrada] = useState(horaDe(registro.entrada));
  const [saida, setSaida] = useState(horaDe(registro.saida));
  const [total, setTotal] = useState(registro.horas_totais ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const calculado = ehCheckin ? horasEntreHorarios(entrada, saida) : null;
  const totalFinal = ehCheckin ? (saida ? Math.round(calculado.horas * 100) / 100 : null) : (total === "" ? null : Number(total));
  const valido = piId && data && (ehCheckin ? !!entrada : totalFinal > 0 && totalFinal <= 24);

  const paraIso = (dia, hhmm, somarDia = false) => {
    const [h, m] = hhmm.split(":").map(Number);
    const d = new Date(`${dia}T00:00:00`);
    if (somarDia) d.setDate(d.getDate() + 1);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  const salvar = async () => {
    setSalvando(true); setErro("");
    const novo = { pi_id: piId, data, horas_totais: totalFinal };
    if (ehCheckin) {
      novo.entrada = paraIso(data, entrada);
      novo.saida = saida ? paraIso(data, saida, calculado.viraDia) : null;
    }
    const r = await salvarEdicaoHoras({ registro, novo, pis, usuario, comoAprovador });
    setSalvando(false);
    if (r.erro) { setErro(r.erro); return; }
    avisar(comoAprovador && r.mudancas?.length ? "Horas editadas — a pessoa foi notificada." : "Horas atualizadas.");
    onSalvo?.();
    onFechar();
  };

  return (
    <Modal titulo="Editar horas" onFechar={onFechar} largura="max-w-md"
      rodape={<Rodape onFechar={onFechar} onSalvar={salvar} salvando={salvando} podeSalvar={valido} />}>
      <div className="flex flex-col gap-4">
        <Campo rotulo="Obra">
          <select value={piId} onChange={(e) => setPiId(e.target.value)} className="input">
            {pis.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.cliente}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Dia trabalhado">
          <input type="date" value={data} max={isoLocal(new Date())} onChange={(e) => setData(e.target.value)} className="input" />
        </Campo>
        {ehCheckin ? (
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Entrada"><input type="time" value={entrada} onChange={(e) => setEntrada(e.target.value)} className="input" /></Campo>
            <Campo rotulo="Saída"><input type="time" value={saida} onChange={(e) => setSaida(e.target.value)} className="input" /></Campo>
            <div className="col-span-2 text-sm text-muted">
              Total: <strong className="text-textmain">{totalFinal !== null ? `${totalFinal.toLocaleString("pt-BR")}h` : "em aberto (sem saída)"}</strong>
              {calculado?.viraDia && saida && <span className="text-amber"> · saída no dia seguinte</span>}
            </div>
          </div>
        ) : (
          <Campo rotulo="Total de horas">
            <input type="number" step="0.25" min="0" max="24" value={total} onChange={(e) => setTotal(e.target.value)} className="input" />
          </Campo>
        )}
        {comoAprovador && <Aviso tipo="info">A pessoa receberá uma notificação com o que foi alterado.</Aviso>}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
      </div>
    </Modal>
  );
}

// ---------------- Solicitação ----------------
const CAMPOS = [["data_prevista_inicio", "Data de início"], ["data_prevista_fim", "Data de término"], ["nome", "Nome da etapa"], ["outro", "Outro"]];
export function EditorSolicitacao({ s, etapas, comoAprovador, onFechar, onSalvo }) {
  const { usuario } = useAuth();
  const { avisar } = useToast();
  const [campo, setCampo] = useState(s.campo_alterado);
  const [valor, setValor] = useState(s.valor_proposto || "");
  const [justificativa, setJustificativa] = useState(s.justificativa || "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const ehData = campo === "data_prevista_inicio" || campo === "data_prevista_fim";
  const etapa = etapas.find((e) => e.id === s.etapa_id);

  const salvar = async () => {
    setSalvando(true); setErro("");
    const r = await salvarEdicaoSolicitacao({ s, etapas, usuario, comoAprovador, novo: { campo_alterado: campo, valor_proposto: valor.trim(), justificativa: justificativa.trim() } });
    setSalvando(false);
    if (r.erro) { setErro(r.erro); return; }
    avisar(comoAprovador && r.mudancas?.length ? "Solicitação editada — o solicitante foi notificado." : "Solicitação atualizada.");
    onSalvo?.();
    onFechar();
  };

  return (
    <Modal titulo="Editar solicitação" onFechar={onFechar} largura="max-w-md"
      rodape={<Rodape onFechar={onFechar} onSalvar={salvar} salvando={salvando} podeSalvar={valor.trim() && justificativa.trim()} />}>
      <div className="flex flex-col gap-4">
        <div className="text-sm"><span className="text-muted">Etapa:</span> <strong>{etapa?.nome || "—"}</strong></div>
        <div>
          <span className="rotulo">O que mudar</span>
          <div className="grid grid-cols-2 gap-2">
            {CAMPOS.map(([v, l]) => (
              <button key={v} type="button" onClick={() => { if (v !== campo) { setCampo(v); setValor(""); } }}
                className={`py-2.5 px-3 rounded-lg text-sm font-semibold border ${campo === v ? "bg-cyan text-white border-cyan" : "bg-white border-line text-muted"}`}>{l}</button>
            ))}
          </div>
        </div>
        <Campo rotulo={campo === "outro" ? "O que deve mudar" : "Novo valor"}>
          {ehData
            ? <input type="date" value={valor} onChange={(e) => setValor(e.target.value)} className="input" />
            : <input value={valor} onChange={(e) => setValor(e.target.value)} className="input" />}
        </Campo>
        <Campo rotulo="Justificativa">
          <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} rows={3} className="input" />
        </Campo>
        {comoAprovador && <Aviso tipo="info">O solicitante receberá uma notificação com o que foi alterado.</Aviso>}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
      </div>
    </Modal>
  );
}

// ---------------- Ocorrência ----------------
export function EditorOcorrencia({ oc, pis, comoAprovador, onFechar, onSalvo }) {
  const { usuario } = useAuth();
  const { avisar } = useToast();
  const [categoria, setCategoria] = useState(oc.categoria);
  const [descricao, setDescricao] = useState(oc.descricao || "");
  const [midias, setMidias] = useState(oc.midias || []);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const salvar = async () => {
    setSalvando(true); setErro("");
    const r = await salvarEdicaoOcorrencia({ oc, pis, usuario, comoAprovador, avisar, novo: { categoria, descricao: descricao.trim(), midias } });
    setSalvando(false);
    if (r.erro) { setErro(r.erro); return; }
    avisar(comoAprovador && r.mudancas?.length ? "Ocorrência editada — quem registrou foi notificado." : "Ocorrência atualizada.");
    onSalvo?.();
    onFechar();
  };

  return (
    <Modal titulo="Editar ocorrência" onFechar={onFechar} largura="max-w-md"
      rodape={<Rodape onFechar={onFechar} onSalvar={salvar} salvando={salvando} />}>
      <div className="flex flex-col gap-4">
        <div>
          <span className="rotulo">Tipo</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORIAS_OCORRENCIA.map((c) => (
              <button key={c} type="button" onClick={() => setCategoria(c)}
                className={`px-4 py-2 rounded-full text-sm font-medium border ${categoria === c ? "bg-amber text-white border-amber" : "border-line text-muted bg-white"}`}>{c}</button>
            ))}
          </div>
        </div>
        <Campo rotulo="Descrição">
          <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} className="input" />
        </Campo>
        <div>
          <span className="rotulo">Fotos e vídeos</span>
          <CapturaMidia value={midias} onChange={setMidias} />
        </div>
        {comoAprovador && <Aviso tipo="info">Quem registrou receberá uma notificação com o que foi alterado. O PDF é atualizado automaticamente.</Aviso>}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
      </div>
    </Modal>
  );
}