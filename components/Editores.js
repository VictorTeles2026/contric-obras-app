"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth, pode } from "../lib/AuthContext";
import { chamarApi, useTabela, gravarTolerante, registrarLog, useModelosCronograma, aplicarModeloNoPi } from "../lib/dados";
import { supabase } from "../lib/supabase";
import { useToast } from "../lib/Toast";
import { LISTA_STATUS_ETAPA, CATEGORIAS_OCORRENCIA, STATUS_PI, duracaoModelo, etapasDoModelo } from "../lib/constantes";
import { horasEntreHorarios, hojeISO, isoLocal, addDias, diaLancavel } from "../lib/datas";
import { nomeBaseAnexo } from "../lib/pdfRdo";
import { salvarEdicaoRdo, salvarEdicaoHoras, salvarEdicaoSolicitacao, salvarEdicaoOcorrencia } from "../lib/edicoes";
import { Select, Modal, Campo, Aviso, Spinner, SeletorPi } from "./ui";
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
      rodape={<Rodape onFechar={onFechar} onSalvar={salvar} salvando={salvando} podeSalvar={diaLancavel(data)} />}>
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
                  <Select value={o.categoria} onChange={(e) => alterarOc(i, { categoria: e.target.value })} className="input flex-1" aria-label="Categoria">
                    {CATEGORIAS_OCORRENCIA.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
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
  const duracaoOk = !ehCheckin || !saida || (calculado.horas > 0 && calculado.horas <= 24);
  const valido = piId && diaLancavel(data) && divisaoOk && duracaoOk && (ehCheckin ? !!entrada : totalFinal > 0 && totalFinal <= 24);

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
          <SeletorPi pis={pis} value={piId} onChange={(v) => setPiId(v)} className="input" />
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
    const { ok, json } = await chamarApi("/api/clientes", { acao: "enviar_credenciais", id: cliente.id, senha });
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
  const { dados: pis, carregando: carregandoPis } = useTabela("pis", { select: "*" });
  const { dados: categorias } = useTabela("categorias_orcamento", { order: { coluna: "ordem" } });
  const { dados: orcamentos, carregando } = useTabela("orcamento_pi_item", { filtro: [["pi_id", pi?.id]] });
  const valoresAtuais = modo === "edit" ? Object.fromEntries(orcamentos.map((o) => [o.categoria_id, o.valor_orcado])) : {};
  // contrato: obras (PIs filhos) já existentes + os orçamentos de cada uma
  const filhos = modo === "edit" && pi?.id ? pis.filter((p) => p.pi_pai_id === pi.id).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), "pt-BR", { numeric: true })) : [];
  const chaveFilhos = filhos.map((f) => f.id).join(",");
  const [orcFilhos, setOrcFilhos] = useState(null);
  useEffect(() => {
    if (carregandoPis) return;
    const ids = chaveFilhos ? chaveFilhos.split(",") : [];
    if (!ids.length) { setOrcFilhos({}); return; }
    supabase.from("orcamento_pi_item").select("pi_id,categoria_id,valor_orcado").in("pi_id", ids).then(({ data }) => {
      const m = {};
      (data || []).forEach((o) => { (m[o.pi_id] ||= {})[o.categoria_id] = o.valor_orcado; });
      setOrcFilhos(m);
    });
  }, [chaveFilhos, carregandoPis]);
  const obrasIniciais = filhos.map((f) => ({ id: f.id, codigo: f.codigo, projeto: f.projeto || "", prazo: f.prazo || "", status: f.status || "ativo",
    valor: f.valor_contrato ?? "", valores: orcFilhos?.[f.id] || {}, valoresOriginais: orcFilhos?.[f.id] || {} }));
  const [aberta, setAberta] = useState(true);
  const [clienteNovo, setClienteNovo] = useState(null);
  const [credenciais, setCredenciais] = useState(null);
  const vaiMostrarCredenciais = useRef(false); // o FormCliente fecha logo depois de salvar

  const salvar = async (dadosPi, valoresOrcamento, responsavelCliente, obras = null) => {
    let piId = pi?.id;
    const duplicado = pis.some((p) => p.codigo.trim().toLowerCase() === dadosPi.codigo.toLowerCase() && (modo === "create" || p.id !== piId));
    if (duplicado) return `Já existe um PI com o número ${dadosPi.codigo}.`;
    if (obras) {
      const cods = obras.map((o) => o.codigo.trim().toLowerCase());
      const rep = cods.find((c, i) => cods.indexOf(c) !== i || c === dadosPi.codigo.toLowerCase());
      if (rep) return `Código de obra repetido: ${rep.toUpperCase()}.`;
      const usado = obras.find((o) => pis.some((p) => p.codigo.trim().toLowerCase() === o.codigo.trim().toLowerCase() && p.id !== o.id));
      if (usado) return `Já existe um PI com o número ${usado.codigo}.`;
    }
    if (modo === "create") {
      // tolerante: se as colunas do responsável no cliente ainda não existirem, grava o resto
      const { data, error, colunasIgnoradas } = await gravarTolerante(dadosPi, (d) => supabase.from("pis").insert(d).select().single());
      if (error) return error.message;
      if (colunasIgnoradas?.some((c) => /pi_pai_id|valor_contrato/.test(c))) avisar("PI criado, mas o vínculo com o PI Pai / valor da obra não foi gravado: rode o script contratos-pi-pai.sql no Supabase.", "erro", 9000);
      else if (colunasIgnoradas?.length) avisar("PI criado, mas o responsável no cliente não foi gravado: rode o pi-responsavel-cliente.sql no Supabase.", "erro", 9000);
      piId = data.id;
      registrarLog(usuario, "Criou PI", data.codigo);
    } else {
      const { error, colunasIgnoradas } = await gravarTolerante(dadosPi, (d) => supabase.from("pis").update(d).eq("id", piId));
      if (error) return error.message;
      if (colunasIgnoradas?.some((c) => /pi_pai_id|valor_contrato/.test(c))) avisar("PI salvo, mas o vínculo com o PI Pai / valor da obra não foi gravado: rode o script contratos-pi-pai.sql no Supabase.", "erro", 9000);
      else if (colunasIgnoradas?.length) avisar("PI salvo, mas o responsável no cliente não foi gravado: rode o pi-responsavel-cliente.sql no Supabase.", "erro", 9000);
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
    // obras do contrato: cada uma é um PI filho com orçamento próprio; cliente e responsável vêm do PI Pai
    if (obras?.length) {
      const falhas = [];
      for (const o of obras) {
        const dadosObra = { codigo: o.codigo.trim(), pi_pai_id: piId, cliente: dadosPi.cliente, projeto: o.projeto.trim().toLocaleUpperCase("pt-BR") || null,
          prazo: o.prazo || dadosPi.prazo, status: o.status || "ativo", valor_contrato: o.valor === "" ? null : Number(o.valor),
          responsavel_cliente_nome: dadosPi.responsavel_cliente_nome, responsavel_cliente_email: dadosPi.responsavel_cliente_email, responsavel_cliente_telefone: dadosPi.responsavel_cliente_telefone };
        let obraId = o.id;
        if (obraId) {
          const { error, colunasIgnoradas } = await gravarTolerante(dadosObra, (d) => supabase.from("pis").update(d).eq("id", obraId));
          if (error) { falhas.push(`${o.codigo}: ${error.message}`); continue; }
          if (colunasIgnoradas?.includes("pi_pai_id")) return "O vínculo das obras não foi gravado: rode o script contratos-pi-pai.sql no Supabase.";
        } else {
          const { data, error, colunasIgnoradas } = await gravarTolerante(dadosObra, (d) => supabase.from("pis").insert(d).select().single());
          if (error) { falhas.push(`${o.codigo}: ${error.message}`); continue; }
          if (colunasIgnoradas?.includes("pi_pai_id")) return "As obras foram criadas sem vínculo com o PI Pai: rode o script contratos-pi-pai.sql no Supabase.";
          obraId = data.id;
          registrarLog(usuario, "Criou PI", `${data.codigo} (obra do contrato ${dadosPi.codigo})`);
        }
        const linhasObra = Object.entries(o.valores || {})
          .filter(([c, v]) => (v !== "" && v !== undefined) || c in (o.valoresOriginais || {}))
          .map(([c, v]) => ({ pi_id: obraId, categoria_id: c, valor_orcado: Number(v) || 0 }));
        if (linhasObra.length) {
          const { error } = await supabase.from("orcamento_pi_item").upsert(linhasObra, { onConflict: "pi_id,categoria_id" });
          if (error) falhas.push(`${o.codigo} (orçamento): ${error.message}`);
        }
      }
      if (falhas.length) return `PI Pai salvo, mas houve falhas nas obras: ${falhas.join(" · ")}`;
    }
    avisar(modo === "create" ? `PI ${dadosPi.codigo} criado${obras?.length ? ` com ${obras.length} obras` : ""}.` : "PI atualizado.");
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

  if (modo === "edit" && (carregando || carregandoPis || orcFilhos === null)) return null;
  return (
    <>
      {aberta && <PiModal modo={modo} piInicial={pi} categorias={categorias} valoresIniciais={valoresAtuais} todosPis={pis} obrasIniciais={obrasIniciais}
        onSalvar={salvar} onCancelar={onFechar} podeCadastrarCliente={pode(usuario, "cliente.gerenciar")} />}
      {clienteNovo && <FormCliente inicial={clienteNovo} onFechar={() => { setClienteNovo(null); if (!vaiMostrarCredenciais.current) onFechar(); }}
        onSalvo={(r) => { if (r?.senha) { vaiMostrarCredenciais.current = true; setCredenciais({ ...r, titulo: "Cliente cadastrado" }); } }} />}
      {credenciais && <Credenciais dados={credenciais} onFechar={() => { setCredenciais(null); onFechar(); }} />}
    </>
  );
}
function PiModal({ modo, piInicial, categorias, valoresIniciais, onSalvar, onCancelar, podeCadastrarCliente = false, todosPis = [], obrasIniciais = [] }) {
  const [codigo, setCodigo] = useState(piInicial?.codigo || "");
  // contrato com várias obras: este PI é o PI Pai e as obras (filhos) são configuradas aqui embaixo
  const [ehContrato, setEhContrato] = useState(obrasIniciais.length > 0);
  const [obras, setObras] = useState(obrasIniciais);
  const [obraAberta, setObraAberta] = useState(null);
  const sufixo = (n) => String(n).padStart(2, "0");
  const recodificar = (lista, base) => lista.map((o, i) => (o.id || o.codigoManual ? o : { ...o, codigo: `${base}-${sufixo(i + 1)}` }));
  const addObras = (qtd) => setObras((prev) => {
    const novas = Array.from({ length: qtd }, () => ({ id: null, codigo: "", projeto: "", prazo: "", status: "ativo", valor: "", valores: {}, valoresOriginais: {} }));
    return recodificar([...prev, ...novas], codigo.trim() || "PI");
  });
  const mudarObra = (i, campo, v) => setObras((prev) => prev.map((o, j) => (j === i ? { ...o, [campo]: v, ...(campo === "codigo" ? { codigoManual: true } : {}) } : o)));
  const mudarValorObra = (i, catId, v) => setObras((prev) => prev.map((o, j) => (j === i ? { ...o, valores: { ...o.valores, [catId]: v === "" ? "" : Number(v) } } : o)));
  const tirarObra = (i) => setObras((prev) => recodificar(prev.filter((_, j) => j !== i), codigo.trim() || "PI"));
  const mudarCodigo = (v) => { setCodigo(v); setObras((prev) => recodificar(prev, v.trim() || "PI")); };
  // contrato: PI Pai (só consolida) e valor da obra (peso no avanço consolidado)
  const [piPaiId, setPiPaiId] = useState(piInicial?.pi_pai_id || "");
  const [valorContrato, setValorContrato] = useState(piInicial?.valor_contrato ?? "");
  const temFilhos = !!piInicial?.id && todosPis.some((p) => p.pi_pai_id === piInicial.id);
  // pode ser pai: qualquer PI que não seja ele mesmo e que não seja filho de outro (1 nível)
  const opcoesPai = todosPis.filter((p) => p.id !== piInicial?.id && !p.pi_pai_id).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), "pt-BR", { numeric: true }));
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
  const contratoAtivo = ehContrato && obras.length > 0;
  const obrasOk = !ehContrato || (obras.length > 0 && obras.every((o) => o.codigo.trim()));
  const podeSalvar = codigo.trim().length > 0 && !salvando && obrasOk && (!cadastrarCliente || (respNome.trim() && emailRespOk));
  const somaV = (vals, cats) => cats.reduce((s, c) => s + (Number(vals?.[c.id]) || 0), 0);
  // PI Pai: totais = soma das obras
  const soma = (cats) => (contratoAtivo ? obras.reduce((s, o) => s + somaV(o.valores, cats), 0) : somaV(valores, cats));
  const consolidado = (catId) => obras.reduce((s, o) => s + (Number(o.valores?.[catId]) || 0), 0);
  const fmtR = (v) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const salvar = async () => {
    if (!podeSalvar) return;
    setSalvando(true); setErroModal("");
    // cliente e projeto sempre gravados em MAIÚSCULAS
    const erro = await onSalvar({ codigo: codigo.trim(), cliente: cliente.trim().toLocaleUpperCase("pt-BR") || null, projeto: projeto.trim().toLocaleUpperCase("pt-BR") || null, prazo: prazo || null, status,
      responsavel_cliente_nome: respNome.trim() || null, responsavel_cliente_email: respEmail.trim() || null, responsavel_cliente_telefone: respTelefone.trim() || null,
      pi_pai_id: temFilhos || ehContrato ? null : piPaiId || null,
      valor_contrato: ehContrato ? null : valorContrato === "" ? null : Number(valorContrato) }, ehContrato ? {} : valores,
      cadastrarCliente ? { nome: respNome.trim(), email: respEmail.trim().toLowerCase(), telefone: respTelefone.trim(), empresa: cliente.trim().toLocaleUpperCase("pt-BR") } : null,
      ehContrato ? obras : null);
    setSalvando(false);
    if (erro) setErroModal(erro);
  };

  // vals/onSet: planilha do próprio PI ou de uma obra; somenteLeitura: consolidado do PI Pai
  const tabela = (cats, unidade, passo, vals = valores, onSet = setValor, somenteLeitura = false) => (
    <div className="rounded-xl border border-line overflow-hidden">
      <div className="grid grid-cols-[64px_1fr_130px] gap-2 px-3 py-2 bg-panel titulo-secao">
        <span>Cód.</span><span>Descrição</span><span className="text-right">{unidade}</span>
      </div>
      <div className="divide-y divide-line/70">
        {cats.map((c) => (
          <div key={c.id} className="grid grid-cols-[64px_1fr_130px] gap-2 items-center px-3 py-1.5">
            <span className="font-mono text-xs text-muted">{c.codigo}</span>
            <span className="text-sm leading-tight">{c.nome}</span>
            {somenteLeitura
              ? <span className="text-right text-sm tabular-nums pr-3">{passo === "0.01" ? fmtR(consolidado(c.id)) : consolidado(c.id).toLocaleString("pt-BR")}</span>
              : <input type="number" step={passo} min="0" value={vals?.[c.id] ?? ""} placeholder="0" onChange={(e) => onSet(c.id, e.target.value)}
                  className="input !py-1.5 text-right" aria-label={`${c.nome} (${unidade})`} />}
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
        <Campo rotulo={ehContrato ? "Nº do PI Pai *" : "Nº do PI *"} className="col-span-1 md:col-span-1"><input value={codigo} onChange={(e) => mudarCodigo(e.target.value)} className="input" autoFocus placeholder="PI-001" /></Campo>
        <Campo rotulo="Status" className="col-span-1 md:col-span-1">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input">
            {Object.entries(STATUS_PI).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Cliente" className="col-span-2 md:col-span-2"><input value={cliente} onChange={(e) => setCliente(e.target.value.toLocaleUpperCase("pt-BR"))} className="input uppercase" /></Campo>
        <Campo rotulo="Prazo" className="col-span-2 md:col-span-2"><input type="date" value={prazo || ""} onChange={(e) => setPrazo(e.target.value)} className="input" /></Campo>
        <Campo rotulo="Projeto" className="col-span-2 md:col-span-6"><input value={projeto} onChange={(e) => setProjeto(e.target.value.toLocaleUpperCase("pt-BR"))} className="input uppercase" /></Campo>
        {/* obra avulsa já existente vinculada a um contrato: só na edição de um PI que já é filho */}
        {!ehContrato && !temFilhos && piInicial?.pi_pai_id && (<>
          <Campo rotulo="PI Pai (contrato)" className="col-span-2 md:col-span-4" dica="Esta obra pertence a este contrato.">
            <Select value={piPaiId} onChange={(e) => setPiPaiId(e.target.value)} className="input">
              <option value="">— nenhum (PI independente) —</option>
              {opcoesPai.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.cliente}{p.projeto ? ` · ${p.projeto}` : ""}</option>)}
            </Select>
          </Campo>
          <Campo rotulo="Valor da obra (R$)" className="col-span-2 md:col-span-2" dica="Peso no avanço consolidado.">
            <input type="number" min="0" step="0.01" value={valorContrato} onChange={(e) => setValorContrato(e.target.value)} className="input text-right" placeholder="0,00" />
          </Campo>
        </>)}
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

      {/* contrato com várias obras */}
      {!piInicial?.pi_pai_id && (
        <label className={`flex items-start gap-3 rounded-xl border p-3 mb-4 ${obrasIniciais.length ? "" : "cursor-pointer"} ${ehContrato ? "border-cyan bg-cyan/5" : "border-line"}`}>
          <input type="checkbox" checked={ehContrato} disabled={obrasIniciais.length > 0}
            onChange={(e) => { setEhContrato(e.target.checked); if (e.target.checked && !obras.length) { addObras(1); setObraAberta(0); } }} className="mt-0.5 w-4 h-4 accent-cyan" />
          <span className="text-sm"><strong>Contrato com várias obras</strong>
            <span className="texto-apoio block">Este PI vira o PI Pai (só consolida). Cada obra abaixo vira um PI próprio, com orçamento de horas e de custo separado; o PI Pai mostra a soma.</span></span>
        </label>
      )}

      {ehContrato && (
        <div className="mb-6">
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <div className="titulo-quadro text-cyan">Obras do contrato ({obras.length})</div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { addObras(1); setObraAberta(obras.length); }} className="btn btn-contorno btn-sm text-sm">+ 1 obra</button>
              <button type="button" onClick={() => addObras(5)} className="btn btn-contorno btn-sm text-sm">+ 5 obras</button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {obras.map((o, i) => {
              const aberta = obraAberta === i;
              const totR = somaV(o.valores, compraCats), totH = somaV(o.valores, moiCats);
              return (
                <div key={o.id || `n${i}`} className={`rounded-xl border ${aberta ? "border-cyan" : "border-line"}`}>
                  <div className="grid grid-cols-2 md:grid-cols-[130px_1fr_140px_130px_auto] gap-2 items-end p-3">
                    <Campo rotulo="Nº da obra *"><input value={o.codigo} onChange={(e) => mudarObra(i, "codigo", e.target.value)} className="input font-mono" /></Campo>
                    <Campo rotulo="Projeto / local" className="col-span-2 md:col-span-1"><input value={o.projeto} onChange={(e) => mudarObra(i, "projeto", e.target.value.toLocaleUpperCase("pt-BR"))} className="input uppercase" placeholder={projeto || "Nome da obra"} /></Campo>
                    <Campo rotulo="Prazo"><input type="date" value={o.prazo || ""} onChange={(e) => mudarObra(i, "prazo", e.target.value)} className="input" /></Campo>
                    <Campo rotulo="Valor da obra (R$)"><input type="number" min="0" step="0.01" value={o.valor} onChange={(e) => mudarObra(i, "valor", e.target.value)} className="input text-right" placeholder="0,00" /></Campo>
                    <div className="flex gap-1 col-span-2 md:col-span-1 justify-end">
                      <button type="button" onClick={() => setObraAberta(aberta ? null : i)} className="btn btn-fantasma !py-1.5 text-sm whitespace-nowrap">{aberta ? "▲ Fechar orçamento" : "▼ Orçamento"}</button>
                      {!o.id && <button type="button" onClick={() => { tirarObra(i); setObraAberta(null); }} className="btn btn-fantasma !py-1.5 text-sm text-red" title="Remover obra">✕</button>}
                    </div>
                  </div>
                  <div className="px-3 pb-2 -mt-1 text-xs text-muted">Orçado: <strong className="text-textmain">R$ {fmtR(totR)}</strong> · <strong className="text-textmain">{totH.toLocaleString("pt-BR")} h</strong>{!o.prazo && " · prazo do PI Pai"}</div>
                  {aberta && (
                    <div className="border-t border-line p-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div><div className="titulo-secao mb-1">Compra — R$ {fmtR(totR)}</div>{tabela(compraCats, "Valor (R$)", "0.01", o.valores, (c, v) => mudarValorObra(i, c, v))}</div>
                      <div><div className="titulo-secao mb-1">Horas — {totH.toLocaleString("pt-BR")} h</div>{tabela(moiCats, "Horas", "0.5", o.valores, (c, v) => mudarValorObra(i, c, v))}</div>
                    </div>
                  )}
                </div>
              );
            })}
            {obras.length === 0 && <div className="text-sm text-muteddim">Adicione as obras do contrato.</div>}
          </div>
          <div className="text-xs text-muteddim mt-2">Cliente e responsável no cliente vêm do PI Pai. Obras já salvas não são removidas aqui (use o Cadastro de PIs).</div>
        </div>
      )}

      <div className="flex items-baseline justify-between mb-2">
        <div className="titulo-quadro text-cyan">Compra — Produto ou Serviço{ehContrato && " · consolidado das obras"}</div>
        <div className="text-xs text-muted">Total: <strong className="text-textmain">R$ {fmtR(soma(compraCats))}</strong></div>
      </div>
      <div className="mb-6">{tabela(compraCats, "Valor (R$)", "0.01", valores, setValor, ehContrato)}</div>

      <div className="flex items-baseline justify-between mb-2">
        <div className="titulo-quadro text-cyan">Horas (MOI + Contric){ehContrato && " · consolidado das obras"}</div>
        <div className="text-xs text-muted">Total: <strong className="text-textmain">{soma(moiCats).toLocaleString("pt-BR")} h</strong></div>
      </div>
      {tabela(moiCats, "Horas", "0.5", valores, setValor, ehContrato)}
    </Modal>
  );
}

// ======================= MODELOS DE CRONOGRAMA =======================
// Seletor de modelo + data de início + prévia. `alvos`: um ou vários PIs (ex: as obras de um contrato).
export function ModalAplicarModelo({ alvos, onFechar, onAplicado, titulo }) {
  const { usuario } = useAuth();
  const { avisar } = useToast();
  const { modelos } = useModelosCronograma();
  const [modeloId, setModeloId] = useState("");
  const [inicio, setInicio] = useState(hojeISO());
  const [deps, setDeps] = useState(true);
  const [aplicando, setAplicando] = useState(false);
  const modelo = modelos.find((m) => m.id === modeloId);
  const previa = modelo ? etapasDoModelo(modelo, inicio) : [];
  const aplicar = async () => {
    if (!modelo || !alvos.length) return;
    setAplicando(true);
    const falhas = [];
    for (const pi of alvos) {
      const r = await aplicarModeloNoPi(pi.id, modelo, inicio, { dependencias: deps });
      if (r.erro) falhas.push(`${pi.codigo}: ${r.erro}`);
    }
    await registrarLog(usuario, "Aplicou modelo de cronograma", `"${modelo.nome}" em ${alvos.map((p) => p.codigo).join(", ")} · início ${inicio}${falhas.length ? ` · falhas: ${falhas.join("; ")}` : ""}`);
    setAplicando(false);
    if (falhas.length) { avisar(`Não foi possível em: ${falhas.join(" · ")}`, "erro", 9000); return; }
    avisar(`Modelo aplicado em ${alvos.length} PI(s).`);
    onAplicado?.();
    onFechar();
  };
  return (
    <Modal titulo={titulo || `Aplicar modelo de cronograma${alvos.length === 1 ? ` — ${alvos[0].codigo}` : ` — ${alvos.length} PIs`}`} onFechar={() => !aplicando && onFechar()} largura="max-w-3xl" confirmarAoFechar={false}
      rodape={<>
        <button onClick={onFechar} disabled={aplicando} className="btn btn-fantasma">Cancelar</button>
        <button onClick={aplicar} disabled={!modelo || !inicio || aplicando} className="btn btn-primario">{aplicando ? <><Spinner /> Aplicando...</> : `Aplicar${alvos.length > 1 ? ` em ${alvos.length} PIs` : ""}`}</button>
      </>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {modelos.map((m) => (
            <button key={m.id} type="button" onClick={() => setModeloId(m.id)}
              className={`text-left rounded-xl border p-3 ${modeloId === m.id ? "border-cyan bg-cyan/5 ring-2 ring-cyan/20" : "border-line hover:bg-panel"}`}>
              <div className="flex items-start justify-between gap-2"><span className="font-semibold text-sm">{m.nome}</span>{m.proprio && <span className="selo bg-[#8E5CD9]/10 text-[#8E5CD9] shrink-0">da equipe</span>}</div>
              {m.descricao && <div className="text-xs text-muted mt-0.5">{m.descricao}</div>}
              <div className="text-[11px] text-muteddim mt-1">{m.etapas.length} macro · {m.etapas.reduce((s, e) => s + (e.subs?.length || 0), 0)} sub-etapas · ≈ {duracaoModelo(m)} dias corridos</div>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo rotulo="Início da primeira etapa"><input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="input" /></Campo>
          <label className="flex items-center gap-2 text-sm self-end pb-2 cursor-pointer"><input type="checkbox" className="accent-cyan w-4 h-4" checked={deps} onChange={(e) => setDeps(e.target.checked)} /> Criar dependências em sequência</label>
        </div>
        {modelo && (
          <div className="rounded-xl border border-line max-h-[32vh] overflow-y-auto rolagem-fina">
            {previa.map((l) => (
              <div key={l.ref} className={`flex items-center gap-2 px-3 py-1.5 text-sm border-b border-line/60 last:border-0 ${l.paiRef ? "pl-7 text-muted" : "font-semibold bg-panel/60"}`}>
                <span className="flex-1 min-w-0 leading-snug">{l.nome}</span>
                <span className="text-xs tabular-nums text-muteddim whitespace-nowrap">{l.inicio.split("-").reverse().join("/")} → {l.fim.split("-").reverse().join("/")}</span>
              </div>
            ))}
          </div>
        )}
        <div className="text-xs text-muteddim">As etapas entram depois das que o PI já tiver. Datas, nomes, equipes e alocações podem ser ajustados depois em Configurar Cronograma.</div>
      </div>
    </Modal>
  );
}

// Gerenciar modelos (criar, editar, excluir, e criar a partir do cronograma de um PI).
// `etapasPi`: etapas do PI aberto, para "Salvar este cronograma como modelo".
export function GerenciarModelos({ onFechar, etapasPi = null, piCodigo = "" }) {
  const { avisar } = useToast();
  const { modelos, recarregar } = useModelosCronograma();
  const [editando, setEditando] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const novo = () => setEditando({ id: "", nome: "", descricao: "", etapas: [{ nome: "", subs: [{ nome: "", dias: 5 }] }] });
  // cronograma atual → modelo (durações em dias corridos de cada etapa)
  const doPi = () => {
    const dur = (e) => (e.data_prevista_inicio && e.data_prevista_fim ? Math.max(1, Math.round((new Date(e.data_prevista_fim) - new Date(e.data_prevista_inicio)) / 86400000) + 1) : 5);
    const ord = (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0);
    const macros = (etapasPi || []).filter((e) => !e.parent_etapa_id).sort(ord);
    setEditando({ id: "", nome: `Modelo do ${piCodigo}`, descricao: `Criado a partir do cronograma do ${piCodigo}.`,
      etapas: macros.map((m) => { const subs = etapasPi.filter((s) => s.parent_etapa_id === m.id).sort(ord); return subs.length ? { nome: m.nome, subs: subs.map((s) => ({ nome: s.nome, dias: dur(s) })) } : { nome: m.nome, dias: dur(m) }; }) });
  };
  const salvar = async () => {
    setSalvando(true);
    const { ok, json } = await chamarApi("/api/configuracoes", { acao: "modelo_salvar", modelo: editando });
    setSalvando(false);
    if (!ok) { avisar(json.error || "Não foi possível salvar.", "erro", 7000); return; }
    avisar("Modelo salvo — disponível para todos."); setEditando(null); recarregar();
  };
  const excluir = async (m) => {
    if (!window.confirm(`Excluir o modelo "${m.nome}"? Os cronogramas já criados com ele não mudam.`)) return;
    const { ok, json } = await chamarApi("/api/configuracoes", { acao: "modelo_excluir", id: m.id });
    if (!ok) { avisar(json.error || "Não foi possível excluir.", "erro", 7000); return; }
    avisar("Modelo excluído."); recarregar();
  };
  const set = (fn) => setEditando((p) => { const c = JSON.parse(JSON.stringify(p)); fn(c); return c; });
  if (editando) {
    const valido = editando.nome.trim() && editando.etapas.some((e) => e.nome.trim());
    return (
      <Modal titulo={editando.id ? "Editar modelo" : "Novo modelo de cronograma"} onFechar={() => setEditando(null)} largura="max-w-3xl"
        rodape={<>
          <button onClick={() => setEditando(null)} className="btn btn-fantasma">Voltar</button>
          <button onClick={salvar} disabled={!valido || salvando} className="btn btn-primario">{salvando ? <><Spinner /> Salvando...</> : "Salvar modelo"}</button>
        </>}>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Campo rotulo="Nome do modelo *"><input value={editando.nome} maxLength={80} onChange={(e) => set((c) => { c.nome = e.target.value; })} className="input" /></Campo>
            <Campo rotulo="Descrição"><input value={editando.descricao} maxLength={240} onChange={(e) => set((c) => { c.descricao = e.target.value; })} className="input" /></Campo>
          </div>
          <div className="text-xs text-muted">Macro-etapas e sub-etapas com a duração em <strong>dias corridos</strong>. Macro sem sub-etapas tem a própria duração. Total ≈ {duracaoModelo(editando)} dias.</div>
          {editando.etapas.map((m, i) => (
            <div key={i} className="rounded-xl border border-line p-2.5 flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <input value={m.nome} maxLength={70} placeholder="Nome da macro-etapa" onChange={(e) => set((c) => { c.etapas[i].nome = e.target.value; })} className="input !py-1.5 font-semibold flex-1" />
                {!m.subs?.length && <input type="number" min="1" max="365" value={m.dias || 1} onChange={(e) => set((c) => { c.etapas[i].dias = e.target.value; })} className="input !py-1.5 !w-20 text-right" aria-label="dias" />}
                <button onClick={() => set((c) => { if (i > 0) [c.etapas[i - 1], c.etapas[i]] = [c.etapas[i], c.etapas[i - 1]]; })} className="p-1.5 text-muted hover:text-cyan" title="Subir">▲</button>
                <button onClick={() => set((c) => { c.etapas.splice(i, 1); })} className="p-1.5 text-muteddim hover:text-red" title="Remover macro"><Icone nome="lixo" className="w-4 h-4" /></button>
              </div>
              {(m.subs || []).map((s, k) => (
                <div key={k} className="flex items-center gap-2 pl-5">
                  <input value={s.nome} maxLength={70} placeholder="Sub-etapa" onChange={(e) => set((c) => { c.etapas[i].subs[k].nome = e.target.value; })} className="input !py-1.5 flex-1" />
                  <input type="number" min="1" max="365" value={s.dias} onChange={(e) => set((c) => { c.etapas[i].subs[k].dias = e.target.value; })} className="input !py-1.5 !w-20 text-right" aria-label="dias" />
                  <span className="text-xs text-muteddim">dias</span>
                  <button onClick={() => set((c) => { c.etapas[i].subs.splice(k, 1); })} className="p-1.5 text-muteddim hover:text-red" title="Remover sub-etapa"><Icone nome="lixo" className="w-4 h-4" /></button>
                </div>
              ))}
              <button onClick={() => set((c) => { c.etapas[i].subs = [...(c.etapas[i].subs || []), { nome: "", dias: 5 }]; delete c.etapas[i].dias; })} className="self-start ml-5 text-xs text-cyan hover:underline">+ sub-etapa</button>
            </div>
          ))}
          <button onClick={() => set((c) => { c.etapas.push({ nome: "", subs: [{ nome: "", dias: 5 }] }); })} className="btn btn-contorno btn-sm self-start"><Icone nome="mais2" className="w-4 h-4" /> Macro-etapa</button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal titulo="Modelos de cronograma" onFechar={onFechar} largura="max-w-3xl" confirmarAoFechar={false}
      rodape={<button onClick={onFechar} className="btn btn-primario">Fechar</button>}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <button onClick={novo} className="btn btn-primario btn-sm"><Icone nome="mais2" className="w-4 h-4" /> Novo modelo</button>
          {etapasPi?.length > 0 && <button onClick={doPi} className="btn btn-contorno btn-sm">Salvar o cronograma do {piCodigo} como modelo</button>}
        </div>
        <div className="text-xs text-muted">Os modelos da equipe ficam disponíveis para todos ao montar cronogramas e ao criar as obras de um contrato. Os modelos do sistema não podem ser alterados, mas podem servir de base.</div>
        <div className="flex flex-col divide-y divide-line border border-line rounded-xl">
          {modelos.map((m) => (
            <div key={m.id} className="p-3 flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[200px]">
                <div className="font-semibold text-sm">{m.nome} {m.proprio ? <span className="selo bg-[#8E5CD9]/10 text-[#8E5CD9] ml-1">da equipe{m.criado_por ? ` · ${m.criado_por}` : ""}</span> : <span className="selo bg-panel text-muted ml-1">sistema</span>}</div>
                <div className="text-xs text-muted">{m.etapas.length} macro · {m.etapas.reduce((s, e) => s + (e.subs?.length || 0), 0)} sub · ≈ {duracaoModelo(m)} dias{m.descricao ? ` · ${m.descricao}` : ""}</div>
              </div>
              {m.proprio
                ? <><button onClick={() => setEditando(JSON.parse(JSON.stringify(m)))} className="btn btn-fantasma btn-sm">Editar</button><button onClick={() => excluir(m)} className="p-2 text-muteddim hover:text-red" aria-label="Excluir"><Icone nome="lixo" className="w-4 h-4" /></button></>
                : <button onClick={() => setEditando({ ...JSON.parse(JSON.stringify(m)), id: "", nome: `${m.nome} (cópia)` })} className="btn btn-fantasma btn-sm">Usar como base</button>}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}