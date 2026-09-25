"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { useTabela, registrarLog, gravarTolerante } from "../../../lib/dados";
import { useAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import { useMinhasPis, agruparPorCliente } from "../../../lib/minhasPis";
import { NAV_LIDER } from "../../../lib/nav";
import { hojeISO } from "../../../lib/datas";
import { STATUS_ETAPA, LISTA_STATUS_ETAPA, CATEGORIAS_OCORRENCIA, etapasEmArvore } from "../../../lib/constantes";
import { useToast } from "../../../lib/Toast";
import { gerarPdfRdoSeguro } from "../../../lib/pdfRdo";
import MobileShell from "../../../components/MobileShell";
import ColetaAssinatura, { assinaturaValida, faltaNaAssinatura } from "../../../components/ColetaAssinatura";
import CapturaMidia from "../../../components/CapturaMidia";
import { Esqueleto, EstadoVazio, TelaSucesso, Aviso, Spinner } from "../../../components/ui";
import Icone from "../../../components/Icone";

const PASSOS = ["Atividades", "Ocorrências", "Enviar"];
const limitar = (n) => Math.max(0, Math.min(100, Number(n) || 0));

export default function LiderRdoPage() {
  const { usuario } = useAuth();
  const { avisar } = useToast();
  const { meusPis, carregando } = useMinhasPis(usuario);
  const [piEscolhidoId, setPiEscolhidoId] = useState(null);
  const piAtivo = meusPis.find((p) => p.id === piEscolhidoId) || meusPis[0];
  const porCliente = useMemo(() => agruparPorCliente(meusPis), [meusPis]);
  const { dados: etapas } = useTabela("etapas");
  const { dados: meusRdos } = useTabela("rdos", { filtro: [["lider_id", usuario?.id]] });
  const etapasDoPi = useMemo(() => (piAtivo ? etapasEmArvore(etapas.filter((e) => e.pi_id === piAtivo.id)) : []), [etapas, piAtivo]);

  const [passo, setPasso] = useState(1);
  const [statusPorEtapa, setStatusPorEtapa] = useState({});
  const [ocorrencias, setOcorrencias] = useState([]);
  const [novaCategoria, setNovaCategoria] = useState(null);
  const [novaDesc, setNovaDesc] = useState("");
  const [novasMidias, setNovasMidias] = useState([]);
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [etapaEnvio, setEtapaEnvio] = useState("");
  const [assinatura, setAssinatura] = useState({ ativo: false, nome: "", imagem: null });

  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [passo]);
  // ao escolher o tipo de ocorrência, traz o formulário para o meio da tela (não fica escondido atrás dos botões)
  const formOcRef = useRef(null);
  useEffect(() => {
    if (novaCategoria) setTimeout(() => formOcRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }, [novaCategoria]);

  const hoje = hojeISO();
  const jaEnviouHoje = piAtivo && meusRdos.some((r) => r.pi_id === piAtivo.id && r.data === hoje && r.status !== "rejeitado");

  const valorDe = (e) => ({
    status: statusPorEtapa[e.id]?.status ?? e.status,
    percentual: statusPorEtapa[e.id]?.percentual ?? (Number(e.percentual) || 0),
  });
  const alterar = (id, patch) => setStatusPorEtapa((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
  const alteradas = etapasDoPi.filter((e) => {
    const v = valorDe(e);
    return v.status !== e.status || (v.status === "em_andamento" && v.percentual !== (Number(e.percentual) || 0));
  });

  const trocarPi = (id) => {
    setPiEscolhidoId(id); setPasso(1); setStatusPorEtapa({}); setOcorrencias([]);
    setAssinatura({ ativo: false, nome: "", imagem: null });
  };

  const adicionarOcorrencia = () => {
    if (!novaCategoria) return;
    setOcorrencias((p) => [...p, { categoria: novaCategoria, descricao: novaDesc.trim(), midias: novasMidias }]);
    setNovaCategoria(null); setNovaDesc(""); setNovasMidias([]);
  };

  const enviar = async () => {
    if (!piAtivo || enviando) return;
    // ocorrência preenchida mas não "adicionada" — não deixa se perder
    const listaOcorrencias = novaCategoria
      ? [...ocorrencias, { categoria: novaCategoria, descricao: novaDesc.trim(), midias: novasMidias }]
      : ocorrencias;
    setEnviando(true);
    const atividades = etapasDoPi.map((e) => {
      const v = valorDe(e);
      return { etapa_id: e.id, nome: e.nome, status: v.status, percentual: v.status === "concluida" ? 100 : limitar(v.percentual) };
    });
    const { data: rdo, error } = await gravarTolerante({
      pi_id: piAtivo.id, lider_id: usuario.id, data: hoje, atividades, status: "pendente",
      assinatura_cliente: assinatura.ativo, assinatura_cliente_imagem: assinatura.ativo ? assinatura.imagem : null,
      assinatura_cliente_nome: assinatura.ativo ? assinatura.nome.trim() : null,
    }, (d) => supabase.from("rdos").insert(d).select().single());
    if (error) {
      setEnviando(false);
      avisar(`Não foi possível enviar o RDO: ${error.message}`, "erro", 7000);
      return;
    }
    if (listaOcorrencias.length > 0) {
      // ocorrências do RDO são aprovadas/reprovadas junto com o RDO
      const { error: erroOc } = await gravarTolerante(listaOcorrencias.map((o) => ({
        pi_id: piAtivo.id, rdo_id: rdo.id, categoria: o.categoria, descricao: o.descricao || null, midias: o.midias || [], registrado_por: usuario.id, status: "pendente",
      })), (d) => supabase.from("ocorrencias").insert(d));
      if (erroOc) avisar(`RDO enviado, mas as ocorrências falharam: ${erroOc.message}`, "erro", 7000);
    }
    await registrarLog(usuario, "Registrou RDO", `${usuario.nome} — ${piAtivo.codigo}`);
    setEtapaEnvio("Gerando PDF...");
    await gerarPdfRdoSeguro(rdo.id, avisar);
    setEtapaEnvio("");
    setEnviando(false);
    setEnviado(true);
  };

  if (carregando) {
    return <MobileShell nav={NAV_LIDER} perfis={["lider"]}><div className="p-4"><Esqueleto linhas={4} /></div></MobileShell>;
  }

  if (!piAtivo) {
    return (
      <MobileShell nav={NAV_LIDER} perfis={["lider"]}>
        <div className="p-4"><div className="cartao"><EstadoVazio icone="obra" titulo="Nenhuma obra" texto="Você não está alocado em nenhuma obra." /></div></div>
      </MobileShell>
    );
  }

  if (enviado) {
    return (
      <MobileShell nav={NAV_LIDER} perfis={["lider"]}>
        <TelaSucesso titulo="RDO enviado" texto="Pendente de validação pelo Coordenador ou Gerente.">
          {meusPis.length > 1 && (
            <button onClick={() => { setEnviado(false); trocarPi(meusPis.find((p) => p.id !== piAtivo.id)?.id); }} className="btn btn-primario btn-lg w-full">
              Fazer RDO de outra obra
            </button>
          )}
          <Link href="/lider" className="btn btn-contorno btn-lg w-full">Voltar ao início</Link>
        </TelaSucesso>
      </MobileShell>
    );
  }

  return (
    <MobileShell nav={NAV_LIDER} perfis={["lider"]}>
      <div className="p-4">
        {/* obra */}
        <div className="cartao p-4 mb-4">
          <div className="text-xs font-mono text-cyan font-bold tracking-wide">{piAtivo.codigo}</div>
          <div className="font-head font-bold text-xl leading-tight mt-0.5">{piAtivo.projeto || piAtivo.cliente}</div>
          {piAtivo.projeto && <div className="text-sm text-muted">{piAtivo.cliente}</div>}
          {meusPis.length > 1 && (
            <select value={piAtivo.id} onChange={(e) => trocarPi(e.target.value)} className="input mt-3" aria-label="Trocar de obra">
              {porCliente.map(([cliente, pisDoCliente]) => (
                <optgroup key={cliente} label={cliente}>
                  {pisDoCliente.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.projeto || p.cliente}</option>)}
                </optgroup>
              ))}
            </select>
          )}
        </div>

        {jaEnviouHoje && <Aviso tipo="info" className="mb-4">Você já enviou um RDO hoje para esta obra. Um novo envio fica como complemento.</Aviso>}

        {/* passos */}
        <div className="flex gap-2 mb-5">
          {PASSOS.map((nome, i) => {
            const n = i + 1;
            const feito = passo > n, atual = passo === n;
            return (
              <button key={nome} type="button" onClick={() => n < passo && setPasso(n)} disabled={n > passo}
                className="flex-1 flex flex-col gap-1.5 text-left disabled:cursor-default">
                <div className={`h-1.5 rounded-full transition-colors ${passo >= n ? "bg-cyan" : "bg-line"}`} />
                <span className={`text-xs font-semibold ${atual ? "text-cyan" : feito ? "text-textmain" : "text-muteddim"}`}>{feito ? "✓ " : `${n}. `}{nome}</span>
              </button>
            );
          })}
        </div>

        {passo === 1 && (
          <div className="flex flex-col gap-3 animar-surgir">
            <div className="text-sm text-muted">Atualize o andamento de cada atividade.{alteradas.length > 0 && <strong className="text-cyan"> {alteradas.length} alterada(s).</strong>}</div>
            {etapasDoPi.map((e) => {
              const v = valorDe(e);
              const mudou = alteradas.some((a) => a.id === e.id);
              return (
                <div key={e.id} className={`cartao p-4 transition-colors ${e.nivel ? "ml-4 border-l-4 border-l-line" : ""} ${mudou ? "!border-cyan/50 bg-cyan/[0.03]" : ""}`}>
                  <div className={`font-semibold mb-3 leading-snug ${e.nivel ? "text-[15px] text-muted" : "text-base"}`}>{e.nome}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {LISTA_STATUS_ETAPA.map(([valor, rotulo]) => {
                      const ativo = v.status === valor;
                      return (
                        <button key={valor} type="button" onClick={() => alterar(e.id, { status: valor })} aria-pressed={ativo}
                          className={`py-2.5 px-2 rounded-lg text-sm font-semibold border transition-all active:scale-[0.97] ${ativo ? "text-white border-transparent shadow-sm" : "bg-white border-line text-muted"}`}
                          style={ativo ? { background: STATUS_ETAPA[valor].barra } : undefined}>
                          {rotulo}
                        </button>
                      );
                    })}
                  </div>
                  {v.status === "em_andamento" && (
                    <div className="mt-3 flex items-center gap-3 animar-fade">
                      <input type="range" min="0" max="100" step="5" value={limitar(v.percentual)}
                        onChange={(ev) => alterar(e.id, { percentual: limitar(ev.target.value) })}
                        className="flex-1 accent-cyan h-8" aria-label="Percentual concluído" />
                      <div className="relative w-20">
                        <input type="number" inputMode="numeric" min="0" max="100" value={v.percentual}
                          onChange={(ev) => alterar(e.id, { percentual: ev.target.value === "" ? "" : limitar(ev.target.value) })}
                          className="input text-right pr-7" aria-label="Percentual" />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted">%</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {etapasDoPi.length === 0 && <div className="cartao"><EstadoVazio icone="cronograma" titulo="Sem etapas" texto="Nenhuma etapa cadastrada nesta obra. Você ainda pode registrar ocorrências." /></div>}
            <BarraAcoes>
              <button onClick={() => setPasso(2)} className="btn btn-primario btn-lg flex-1">Próximo <Icone nome="seta" className="w-5 h-5" /></button>
            </BarraAcoes>
          </div>
        )}

        {passo === 2 && (
          <div className="flex flex-col gap-3 animar-surgir">
            <div className="text-sm text-muted">Houve algum problema hoje? Se não, é só avançar.</div>
            {ocorrencias.map((o, i) => (
              <div key={i} className="cartao p-4 flex items-start gap-3">
                <div className="flex-1 min-w-0 text-base">
                  <span className="text-amber font-semibold">{o.categoria}</span>{o.descricao ? ` — ${o.descricao}` : ""}
                  {o.midias?.length > 0 && <div className="text-sm text-muteddim mt-1">📎 {o.midias.length} anexo(s)</div>}
                </div>
                <button onClick={() => setOcorrencias((p) => p.filter((_, idx) => idx !== i))} className="p-1.5 text-muteddim hover:text-red" aria-label="Remover ocorrência">
                  <Icone nome="lixo" className="w-5 h-5" />
                </button>
              </div>
            ))}
            <div className="cartao p-4">
              <div className="rotulo">Tipo de ocorrência</div>
              <div className="flex flex-wrap gap-2 mb-3">
                {CATEGORIAS_OCORRENCIA.map((c) => (
                  <button key={c} type="button" onClick={() => setNovaCategoria(novaCategoria === c ? null : c)}
                    className={`px-4 py-2.5 rounded-full text-sm font-medium border transition-colors ${novaCategoria === c ? "bg-amber text-white border-amber" : "border-line text-muted bg-white"}`}>{c}</button>
                ))}
              </div>
              {novaCategoria && (
                <div className="animar-fade scroll-mb-40" ref={formOcRef}>
                  <textarea placeholder="Descreva o que aconteceu (opcional)" value={novaDesc} onChange={(e) => setNovaDesc(e.target.value)} rows={2}
                    className="input input-lg mb-3" />
                  <CapturaMidia value={novasMidias} onChange={setNovasMidias} />
                  <button onClick={adicionarOcorrencia} className="btn btn-alerta w-full mt-3">+ Adicionar ocorrência</button>
                </div>
              )}
            </div>
            <BarraAcoes>
              <button onClick={() => setPasso(1)} className="btn btn-contorno btn-lg"><Icone nome="voltar" className="w-5 h-5" /></button>
              <button onClick={() => { if (novaCategoria) adicionarOcorrencia(); setPasso(3); }} className="btn btn-primario btn-lg flex-1">
                {ocorrencias.length === 0 && !novaCategoria ? "Sem ocorrências" : "Próximo"} <Icone nome="seta" className="w-5 h-5" />
              </button>
            </BarraAcoes>
          </div>
        )}

        {passo === 3 && (
          <div className="flex flex-col gap-3 animar-surgir">
            <div className="cartao p-4">
              <div className="titulo-secao mb-3">Resumo</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Resumo valor={etapasDoPi.length} rotulo="atividades" />
                <Resumo valor={alteradas.length} rotulo="alteradas" destaque />
                <Resumo valor={ocorrencias.length} rotulo="ocorrências" alerta={ocorrencias.length > 0} />
              </div>
              {alteradas.length > 0 && (
                <div className="mt-3 pt-3 border-t border-line flex flex-col gap-1.5">
                  {alteradas.map((e) => {
                    const v = valorDe(e);
                    return (
                      <div key={e.id} className="flex justify-between gap-2 text-sm">
                        <span className="truncate">{e.nome}</span>
                        <span className="shrink-0 font-semibold" style={{ color: STATUS_ETAPA[v.status]?.barra }}>
                          {STATUS_ETAPA[v.status]?.rotulo}{v.status === "em_andamento" ? ` · ${limitar(v.percentual)}%` : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <ColetaAssinatura value={assinatura} onChange={setAssinatura} />

            <BarraAcoes>
              <button onClick={() => setPasso(2)} className="btn btn-contorno btn-lg" disabled={enviando}><Icone nome="voltar" className="w-5 h-5" /></button>
              <button onClick={enviar} disabled={enviando || !assinaturaValida(assinatura)} className="btn btn-sucesso btn-lg flex-1">
                {enviando ? <><Spinner /> {etapaEnvio || "Enviando..."}</> : <><Icone nome="aprovar" className="w-5 h-5" strokeWidth={2.4} /> Enviar RDO</>}
              </button>
            </BarraAcoes>
            {faltaNaAssinatura(assinatura) && <div className="text-xs text-center text-amber font-semibold">{faltaNaAssinatura(assinatura)}</div>}
          </div>
        )}
      </div>
    </MobileShell>
  );
}

// botões de navegação fixos logo acima do menu inferior — sempre ao alcance do polegar
function BarraAcoes({ children }) {
  return (
    <div className="sticky z-20 -mx-4 px-4 pt-3 pb-3 mt-2 bg-gradient-to-t from-panel via-panel to-panel/0"
      style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

function Resumo({ valor, rotulo, destaque, alerta }) {
  return (
    <div className="rounded-xl bg-panel py-3">
      <div className={`font-head font-bold text-2xl ${alerta ? "text-amber" : destaque ? "text-cyan" : "text-textmain"}`}>{valor}</div>
      <div className="text-xs text-muted">{rotulo}</div>
    </div>
  );
}
