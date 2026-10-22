"use client";

import { useState, useRef } from "react";
import { useAuth, pode } from "../lib/AuthContext";
import { chamarApi, useTabela, gravarTolerante, registrarLog } from "../lib/dados";
import { supabase } from "../lib/supabase";
import { useToast } from "../lib/Toast";
import { LISTA_STATUS_ETAPA, CATEGORIAS_OCORRENCIA, STATUS_PI } from "../lib/constantes";
import { horasEntreHorarios, hojeISO, isoLocal, addDias } from "../lib/datas";
import { nomeBaseAnexo } from "../lib/pdfRdo";
import { salvarEdicaoRdo, salvarEdicaoHoras, salvarEdicaoSolicitacao, salvarEdicaoOcorrencia } from "../lib/edicoes";
import { Modal, Campo, Aviso, Spinner } from "./ui";
import CapturaMidia from "./CapturaMidia";
import Icone from "./Icone";
import { CamposRdoTecnico, tecnicoVazio, limparTecnico } from "./RdoTecnico";

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
  const ehTecnico = rdo.modelo === "tecnico";
  const [tecnico, setTecnico] = useState(() => ({ ...tecnicoVazio(), ...(rdo.tecnico || {}) }));
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
      ...(ehTecnico ? { tecnico: limparTecnico(tecnico) } : {}),
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

        {ehTecnico && <CamposRdoTecnico valor={tecnico} onChange={setTecnico} pi={pi} data={data} />}

        {!ehTecnico && <div>
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
        </div>}

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
                <CapturaMidia value={o.midias} onChange={(m) => alterarOc(i, { midias: m })} compacto baseNome={nomeBaseAnexo("RDO", data, pi)} />
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
  // aprovador (Relatórios/Aprovações/Histórico) também ajusta a divisão normais × extras
  const [normais, setNormais] = useState(registro.horas_normais ?? registro.horas_totais ?? "");
  const normaisNum = normais === "" ? 0 : Number(normais);
  const extras = totalFinal !== null ? Math.round((totalFinal - normaisNum) * 100) / 100 : null;
  const divisaoOk = !comoAprovador || totalFinal === null || (normaisNum >= 0 && extras >= 0);
  const valido = piId && data && divisaoOk && (ehCheckin ? !!entrada : totalFinal > 0 && totalFinal <= 24);

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
    if (comoAprovador && totalFinal !== null) { novo.horas_normais = normaisNum; novo.horas_extras = extras; }
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
        {comoAprovador && totalFinal !== null && (
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Horas normais">
              <input type="number" step="0.25" min="0" max={totalFinal} value={normais} onChange={(e) => setNormais(e.target.value)} className="input" />
            </Campo>
            <Campo rotulo="Horas extras">
              <div className={`input bg-panel tabular-nums ${extras < 0 ? "text-red" : ""}`}>{extras.toLocaleString("pt-BR")}h</div>
            </Campo>
            {!divisaoOk && <div className="col-span-2 text-xs text-red">As horas normais não podem passar do total ({totalFinal.toLocaleString("pt-BR")}h).</div>}
          </div>
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
          <CapturaMidia value={midias} onChange={setMidias}
            baseNome={nomeBaseAnexo("OCORRENCIA", oc.created_at ? isoLocal(new Date(oc.created_at)) : null, pis.find((p) => p.id === oc.pi_id))} />
        </div>
        {comoAprovador && <Aviso tipo="info">Quem registrou receberá uma notificação com o que foi alterado. O PDF é atualizado automaticamente.</Aviso>}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
      </div>
    </Modal>
  );
}

// ---------------- Cliente do portal (página Clientes e abertura de PI) ----------------
const mascaraTelefone = (v) => {
  const d = String(v || "").replace(/\D/g, "").slice(0, 11);
  return d.length <= 10 ? d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2") : d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
};

export function FormCliente({ inicial, onFechar, onSalvo }) {
  const novo = !inicial.id;
  const [v, setV] = useState({ nome: inicial.nome || "", empresa: inicial.empresa || "", funcao: inicial.funcao || "", telefone: inicial.telefone || "", email: inicial.email || "" });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim());
  const pode = v.nome.trim() && emailOk && !salvando;
  const set = (k) => (e) => setV((p) => ({ ...p, [k]: k === "telefone" ? mascaraTelefone(e.target.value) : e.target.value }));

  const salvar = async () => {
    setSalvando(true); setErro("");
    const { ok, json } = await chamarApi("/api/clientes", novo ? { acao: "criar", ...v } : { acao: "editar", id: inicial.id, ...v });
    setSalvando(false);
    if (!ok) { setErro(json.error || "Não foi possível salvar."); return; }
    onSalvo(json); onFechar();
  };

  return (
    <Modal titulo={novo ? "Novo cliente" : `Editar — ${inicial.nome}`} onFechar={onFechar} largura="max-w-md"
      rodape={<>
        <button onClick={onFechar} className="btn btn-fantasma" disabled={salvando}>Cancelar</button>
        <button onClick={salvar} disabled={!pode} className="btn btn-primario">{salvando ? <><Spinner /> Salvando...</> : novo ? "Cadastrar e gerar acesso" : "Salvar"}</button>
      </>}>
      <div className="flex flex-col gap-3.5">
        <Campo rotulo="Nome"><input value={v.nome} onChange={set("nome")} className="input" autoFocus /></Campo>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo rotulo="Empresa"><input value={v.empresa} onChange={set("empresa")} className="input" /></Campo>
          <Campo rotulo="Função"><input value={v.funcao} onChange={set("funcao")} className="input" placeholder="Ex: Engenheiro de manutenção" /></Campo>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo rotulo="Telefone"><input value={v.telefone} onChange={set("telefone")} inputMode="tel" className="input" placeholder="(11) 90000-0000" /></Campo>
          <Campo rotulo="E-mail (usuário de acesso)">
            <input type="email" value={v.email} onChange={set("email")} className={`input ${v.email && !emailOk ? "!border-red" : ""}`} />
          </Campo>
        </div>
        {novo && <Aviso tipo="info">Uma senha aleatória será criada. Em seguida aparece uma mensagem pronta com endereço, usuário e senha para você copiar e encaminhar ao cliente.</Aviso>}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
      </div>
    </Modal>
  );
}

// credenciais recém-criadas: status do e-mail + mensagem pronta para WhatsApp / copiar
export function Credenciais({ dados, onFechar }) {
  const { avisar } = useToast();
  const { cliente, senha, envio, mensagem, titulo } = dados;
  const fone = String(cliente?.telefone || "").replace(/\D/g, "");
  const copiar = async () => { try { await navigator.clipboard.writeText(mensagem); avisar("Mensagem copiada."); } catch { avisar("Não foi possível copiar.", "erro"); } };
  // "Enviar por e-mail via SGO": marcado, o Concluir manda o e-mail com usuário e senha ao cliente
  const [viaSgo, setViaSgo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const concluir = async () => {
    if (!viaSgo || envio?.enviado) { onFechar(); return; }
    setEnviando(true); setErro("");
    const { ok, json } = await chamarApi("/api/clientes", { acao: "enviar_credenciais", id: cliente.id });
    setEnviando(false);
    if (!ok) { setErro(json.error || "Não foi possível enviar."); return; }
    avisar(`E-mail com o acesso enviado para ${cliente.email}.`);
    onFechar();
  };
  return (
    <Modal titulo={titulo} onFechar={onFechar} largura="max-w-md" confirmarAoFechar={false}
      rodape={<button onClick={concluir} disabled={enviando} className="btn btn-primario">{enviando ? <><Spinner /> Enviando...</> : viaSgo ? "Enviar e concluir" : "Concluir"}</button>}>
      <div className="flex flex-col gap-3">
        {envio?.enviado
          ? <Aviso tipo="sucesso">E-mail enviado para <strong>{cliente.email}</strong> com o usuário e a senha.</Aviso>
          : <Aviso tipo="info">Copie a mensagem abaixo e encaminhe ao cliente (WhatsApp, e-mail etc.). A senha só aparece agora.</Aviso>}
        <textarea readOnly value={mensagem} rows={10} onFocus={(e) => e.target.select()}
          className="input !text-sm font-mono leading-relaxed resize-none" />
        <div className="flex flex-wrap gap-2">
          <button onClick={copiar} className="btn btn-primario btn-sm"><Icone nome="copiar" className="w-4 h-4" /> Copiar mensagem</button>
          {fone && <a href={`https://wa.me/55${fone}?text=${encodeURIComponent(mensagem)}`} target="_blank" rel="noreferrer" className="btn btn-contorno btn-sm">Enviar por WhatsApp</a>}
          <a href={`mailto:${cliente.email}?subject=${encodeURIComponent("Seu acesso à plataforma Contric")}&body=${encodeURIComponent(mensagem)}`} className="btn btn-contorno btn-sm">Abrir no e-mail</a>
        </div>
        {!envio?.enviado && cliente?.id && (
          <label className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${viaSgo ? "border-cyan bg-cyan/5" : "border-line"}`}>
            <input type="checkbox" checked={viaSgo} onChange={(e) => setViaSgo(e.target.checked)} className="mt-0.5 w-4 h-4 accent-cyan" />
            <span className="text-sm"><strong>Enviar por e-mail via SGO</strong>
              <span className="texto-apoio block">Ao concluir, o sistema envia automaticamente para <strong>{cliente.email}</strong> o endereço, o usuário e a senha.</span></span>
          </label>
        )}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
      </div>
    </Modal>
  );
}

// ---------------- PI: abertura e edição (páginas Cadastro de PIs e Configurar Cronograma) ----------------
const todayISO = hojeISO;
// janela completa: dados do PI + orçamento; ao salvar, trata o responsável marcado como cliente do portal
export function JanelaPi({ modo, pi, onFechar, onSalvo }) {
  const { usuario } = useAuth();
  const { avisar } = useToast();
  const { dados: pis } = useTabela("pis", { select: "id,codigo" });
  const { dados: categorias } = useTabela("categorias_orcamento", { order: { coluna: "ordem" } });
  const { dados: orcamentos, carregando } = useTabela("orcamento_pi_item", { filtro: [["pi_id", pi?.id]] });
  const valoresAtuais = modo === "edit" ? Object.fromEntries(orcamentos.map((o) => [o.categoria_id, o.valor_orcado])) : {};
  const [aberta, setAberta] = useState(true);
  const [clienteNovo, setClienteNovo] = useState(null);
  const [credenciais, setCredenciais] = useState(null);
  const vaiMostrarCredenciais = useRef(false); // o FormCliente fecha logo depois de salvar

  const salvar = async (dadosPi, valoresOrcamento, responsavelCliente) => {
    let piId = pi?.id;
    const duplicado = pis.some((p) => p.codigo.trim().toLowerCase() === dadosPi.codigo.toLowerCase() && (modo === "create" || p.id !== piId));
    if (duplicado) return `Já existe um PI com o número ${dadosPi.codigo}.`;
    if (modo === "create") {
      // tolerante: se as colunas do responsável no cliente ainda não existirem, grava o resto
      const { data, error, colunasIgnoradas } = await gravarTolerante(dadosPi, (d) => supabase.from("pis").insert(d).select().single());
      if (error) return error.message;
      if (colunasIgnoradas?.length) avisar("PI criado, mas o responsável no cliente não foi gravado: rode o pi-responsavel-cliente.sql no Supabase.", "erro", 9000);
      piId = data.id;
      registrarLog(usuario, "Criou PI", data.codigo);
    } else {
      const { error, colunasIgnoradas } = await gravarTolerante(dadosPi, (d) => supabase.from("pis").update(d).eq("id", piId));
      if (error) return error.message;
      if (colunasIgnoradas?.length) avisar("PI salvo, mas o responsável no cliente não foi gravado: rode o pi-responsavel-cliente.sql no Supabase.", "erro", 9000);
      registrarLog(usuario, "Editou PI", dadosPi.codigo);
    }
    // campo apagado que já tinha valor salvo vira 0
    const linhas = Object.entries(valoresOrcamento)
      .filter(([categoriaId, valor]) => (valor !== "" && valor !== undefined) || categoriaId in valoresAtuais)
      .map(([categoriaId, valor]) => ({ pi_id: piId, categoria_id: categoriaId, valor_orcado: Number(valor) || 0 }));
    if (linhas.length > 0) {
      const { error } = await supabase.from("orcamento_pi_item").upsert(linhas, { onConflict: "pi_id,categoria_id" });
      if (error) return `PI salvo, mas o orçamento falhou: ${error.message}`;
    }
    avisar(modo === "create" ? `PI ${dadosPi.codigo} criado.` : "PI atualizado.");
    onSalvo?.(piId);
    setAberta(false);
    // responsável marcado para virar cliente do portal: já cadastrado → aviso; senão → abre o cadastro preenchido
    if (responsavelCliente) {
      const { data, error } = await supabase.from("clientes").select("id").ilike("email", responsavelCliente.email).limit(1);
      if (error) avisar(`Não foi possível verificar o cliente: ${error.message}`, "erro", 7000);
      else if (data?.length) avisar("Cliente já cadastrado.", "info", 6000);
      else { setClienteNovo(responsavelCliente); return null; }
    }
    onFechar();
    return null;
  };

  if (modo === "edit" && carregando) return null;
  return (
    <>
      {aberta && <PiModal modo={modo} piInicial={pi} categorias={categorias} valoresIniciais={valoresAtuais}
        onSalvar={salvar} onCancelar={onFechar} podeCadastrarCliente={pode(usuario, "cliente.gerenciar")} />}
      {clienteNovo && <FormCliente inicial={clienteNovo} onFechar={() => { setClienteNovo(null); if (!vaiMostrarCredenciais.current) onFechar(); }}
        onSalvo={(r) => { if (r?.senha) { vaiMostrarCredenciais.current = true; setCredenciais({ ...r, titulo: "Cliente cadastrado" }); } }} />}
      {credenciais && <Credenciais dados={credenciais} onFechar={() => { setCredenciais(null); onFechar(); }} />}
    </>
  );
}
function PiModal({ modo, piInicial, categorias, valoresIniciais, onSalvar, onCancelar, podeCadastrarCliente = false }) {
  const [codigo, setCodigo] = useState(piInicial?.codigo || "");
  const [cliente, setCliente] = useState(piInicial?.cliente || "");
  const [projeto, setProjeto] = useState(piInicial?.projeto || "");
  const [prazo, setPrazo] = useState(piInicial?.prazo || addDias(todayISO(), 45));
  const [status, setStatus] = useState(piInicial?.status || "ativo");
  const [respNome, setRespNome] = useState(piInicial?.responsavel_cliente_nome || "");
  const [respEmail, setRespEmail] = useState(piInicial?.responsavel_cliente_email || "");
  const [respTelefone, setRespTelefone] = useState(piInicial?.responsavel_cliente_telefone || "");
  const [cadastrarCliente, setCadastrarCliente] = useState(false); // cadastrar o responsável no Acesso Clientes
  const [valores, setValores] = useState(valoresIniciais || {});

  // categorias desativadas em Configurações somem — a não ser que este PI já tenha valor nelas
  const visivel = (c) => c.ativo !== false || Number(valoresIniciais?.[c.id]) > 0;
  const compraCats = categorias.filter((c) => c.grupo === "compra_reais" && visivel(c));
  const moiCats = categorias.filter((c) => c.grupo === "moi_horas" && visivel(c));
  const setValor = (catId, v) => setValores((prev) => ({ ...prev, [catId]: v === "" ? "" : Number(v) }));
  const [salvando, setSalvando] = useState(false);
  const [erroModal, setErroModal] = useState("");
  const emailRespOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(respEmail.trim());
  const podeSalvar = codigo.trim().length > 0 && !salvando && (!cadastrarCliente || (respNome.trim() && emailRespOk));
  const soma = (cats) => cats.reduce((s, c) => s + (Number(valores[c.id]) || 0), 0);

  const salvar = async () => {
    if (!podeSalvar) return;
    setSalvando(true); setErroModal("");
    // cliente e projeto sempre gravados em MAIÚSCULAS
    const erro = await onSalvar({ codigo: codigo.trim(), cliente: cliente.trim().toLocaleUpperCase("pt-BR") || null, projeto: projeto.trim().toLocaleUpperCase("pt-BR") || null, prazo: prazo || null, status,
      responsavel_cliente_nome: respNome.trim() || null, responsavel_cliente_email: respEmail.trim() || null, responsavel_cliente_telefone: respTelefone.trim() || null }, valores,
      cadastrarCliente ? { nome: respNome.trim(), email: respEmail.trim().toLowerCase(), telefone: respTelefone.trim(), empresa: cliente.trim().toLocaleUpperCase("pt-BR") } : null);
    setSalvando(false);
    if (erro) setErroModal(erro);
  };

  const tabela = (cats, unidade, passo) => (
    <div className="rounded-xl border border-line overflow-hidden">
      <div className="grid grid-cols-[64px_1fr_130px] gap-2 px-3 py-2 bg-panel titulo-secao">
        <span>Cód.</span><span>Descrição</span><span className="text-right">{unidade}</span>
      </div>
      <div className="divide-y divide-line/70">
        {cats.map((c) => (
          <div key={c.id} className="grid grid-cols-[64px_1fr_130px] gap-2 items-center px-3 py-1.5">
            <span className="font-mono text-xs text-muted">{c.codigo}</span>
            <span className="text-sm leading-tight">{c.nome}</span>
            <input type="number" step={passo} min="0" value={valores[c.id] ?? ""} placeholder="0" onChange={(e) => setValor(c.id, e.target.value)}
              className="input !py-1.5 text-right" aria-label={`${c.nome} (${unidade})`} />
          </div>
        ))}
        {cats.length === 0 && <div className="px-3 py-3 text-sm text-muteddim">Nenhuma categoria cadastrada.</div>}
      </div>
    </div>
  );

  return (
    <Modal titulo={modo === "create" ? "Abertura de PI" : `Editar PI — ${piInicial?.codigo}`} onFechar={onCancelar} largura="max-w-3xl"
      rodape={<>
        {erroModal && <div className="text-sm text-red mr-auto self-center">⚠ {erroModal}</div>}
        <button onClick={onCancelar} className="btn btn-fantasma">Cancelar</button>
        <button onClick={salvar} disabled={!podeSalvar} className="btn btn-primario">
          {salvando ? <><Spinner /> Salvando...</> : modo === "create" ? "Criar PI" : "Salvar alterações"}
        </button>
      </>}>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <Campo rotulo="Nº do PI *" className="col-span-1 md:col-span-1"><input value={codigo} onChange={(e) => setCodigo(e.target.value)} className="input" autoFocus placeholder="PI-001" /></Campo>
        <Campo rotulo="Status" className="col-span-1 md:col-span-1">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input">
            {Object.entries(STATUS_PI).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Cliente" className="col-span-2 md:col-span-2"><input value={cliente} onChange={(e) => setCliente(e.target.value.toLocaleUpperCase("pt-BR"))} className="input uppercase" /></Campo>
        <Campo rotulo="Prazo" className="col-span-2 md:col-span-2"><input type="date" value={prazo || ""} onChange={(e) => setPrazo(e.target.value)} className="input" /></Campo>
        <Campo rotulo="Projeto" className="col-span-2 md:col-span-6"><input value={projeto} onChange={(e) => setProjeto(e.target.value.toLocaleUpperCase("pt-BR"))} className="input uppercase" /></Campo>
        <Campo rotulo="Responsável pelo PI no cliente" className="col-span-2 md:col-span-2"><input value={respNome} onChange={(e) => setRespNome(e.target.value)} className="input" placeholder="Nome" /></Campo>
        <Campo rotulo="E-mail do responsável" className="col-span-2 md:col-span-2"><input value={respEmail} onChange={(e) => setRespEmail(e.target.value)} className="input" inputMode="email" autoCapitalize="none" /></Campo>
        <Campo rotulo="Telefone do responsável" className="col-span-2 md:col-span-2"><input value={respTelefone} onChange={(e) => setRespTelefone(e.target.value)} className="input" inputMode="tel" /></Campo>
        {podeCadastrarCliente && (
          <label className={`col-span-2 md:col-span-6 flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${cadastrarCliente ? "border-cyan bg-cyan/5" : "border-line"}`}>
            <input type="checkbox" checked={cadastrarCliente} onChange={(e) => setCadastrarCliente(e.target.checked)} className="mt-0.5 w-4 h-4 accent-cyan" />
            <span className="text-sm"><strong>Cadastrar o responsável como cliente no Acesso Clientes</strong>
              <span className="texto-apoio block">Ao salvar o PI: se o e-mail já tiver cadastro, avisa "Cliente já cadastrado."; se não, abre o cadastro de cliente com os dados preenchidos.</span>
              {cadastrarCliente && (!respNome.trim() || !emailRespOk) && <span className="text-xs text-red block mt-1">Preencha o nome e um e-mail válido do responsável.</span>}
            </span>
          </label>
        )}
      </div>

      <div className="flex items-baseline justify-between mb-2">
        <div className="titulo-quadro text-cyan">Compra — Produto ou Serviço</div>
        <div className="text-xs text-muted">Total: <strong className="text-textmain">R$ {soma(compraCats).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></div>
      </div>
      <div className="mb-6">{tabela(compraCats, "Valor (R$)", "0.01")}</div>

      <div className="flex items-baseline justify-between mb-2">
        <div className="titulo-quadro text-cyan">MOI + Contric (horas)</div>
        <div className="text-xs text-muted">Total: <strong className="text-textmain">{soma(moiCats).toLocaleString("pt-BR")} h</strong></div>
      </div>
      {tabela(moiCats, "Horas", "0.5")}
    </Modal>
  );
}

