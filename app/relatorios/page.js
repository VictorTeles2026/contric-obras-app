"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useTabela, registrarLog } from "../../lib/dados";
import { useAuth, podeEditar } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import { useToast } from "../../lib/Toast";
import PainelShell from "../../components/PainelShell";
import { CabecalhoPagina, EstadoVazio, Aviso, Spinner } from "../../components/ui";
import Icone from "../../components/Icone";
import { formatarData, horaCurta } from "../../lib/datas";

const VERDE_ESCURO = "#1B6E2D";
const VERMELHO = "#D64545";

// "1.234,56" / "1234,56" / "1234.56" → 1234.56 ; vazio → null
function lerNumero(texto) {
  const t = String(texto ?? "").trim().replace(/\s|R\$/g, "");
  if (!t) return null;
  const normalizado = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : NaN;
}
// valor salvo → texto do campo, já no formato brasileiro ("42.300,50")
function paraTexto(n, tipo) {
  if (n === null || n === undefined || n === "") return "";
  return Number(n).toLocaleString("pt-BR", tipo === "custo" ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 2 });
}
function fmtValor(n, tipo) {
  const opcoes = { minimumFractionDigits: tipo === "custo" ? 2 : 0, maximumFractionDigits: 2 };
  const s = Math.abs(n).toLocaleString("pt-BR", opcoes);
  const sinal = n < 0 ? "−" : "";
  return tipo === "custo" ? `${sinal}R$ ${s}` : `${sinal}${s} h`;
}
function fmtPercentual(p) {
  if (p === null) return "—";
  return `${p < 0 ? "−" : ""}${Math.abs(p).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
// diferença absoluta e % (Orçado − Realizado) / Orçado; sem orçado não há % possível
function calcular(orcado, realizado) {
  const dif = orcado - realizado;
  const perc = orcado ? (dif / orcado) * 100 : null;
  return { dif, perc };
}
const corDe = (n) => (n === null ? undefined : n >= 0 ? VERDE_ESCURO : VERMELHO);

export default function RelatoriosPage() {
  const { usuario } = useAuth();
  const editavel = podeEditar(usuario);
  const { dados: pis } = useTabela("pis", { order: { coluna: "codigo" } });
  const { dados: categorias } = useTabela("categorias_orcamento", { order: { coluna: "ordem" } });
  const { dados: orcamentos, recarregar: recarregarOrcamentos } = useTabela("orcamento_pi_item");

  // seleção (topo) — só vale depois de clicar em "Visualizar"
  const [piId, setPiId] = useState("");
  const [comCusto, setComCusto] = useState(true);
  const [comHoras, setComHoras] = useState(true);
  const [visualizando, setVisualizando] = useState(null); // { piId, custo, horas }

  const podeVisualizar = piId && (comCusto || comHoras);
  const visualizar = () => podeVisualizar && setVisualizando({ piId, custo: comCusto, horas: comHoras });
  const piVisto = pis.find((p) => p.id === visualizando?.piId);
  const itensDoPi = orcamentos.filter((o) => o.pi_id === visualizando?.piId);
  const categoriasHoras = categorias.filter((c) => c.grupo === "moi_horas");

  // lançamentos de horas do PI (reprovados ficam de fora) e quanto cada código acumula
  const { dados: usuarios } = useTabela("usuarios");
  const { dados: apontamentosPi, recarregar: recarregarApontamentos } = useTabela("apontamentos_horas", {
    filtro: visualizando?.horas ? [["pi_id", visualizando.piId]] : [["pi_id", undefined]], order: { coluna: "data", asc: false },
  });
  const lancamentos = apontamentosPi.filter((a) => a.status !== "rejeitado").map((a) => ({ ...a, ...horasDoLancamento(a) }));
  const apontadoPorCodigo = {};
  lancamentos.forEach((l) => {
    if (l.categoria_normal_id) apontadoPorCodigo[l.categoria_normal_id] = (apontadoPorCodigo[l.categoria_normal_id] || 0) + l.normais;
    if (l.categoria_extra_id) apontadoPorCodigo[l.categoria_extra_id] = (apontadoPorCodigo[l.categoria_extra_id] || 0) + l.extras;
  });

  return (
    <PainelShell>
      <div className="p-4 md:p-8 max-w-6xl mx-auto">
        <CabecalhoPagina titulo="Relatórios" subtitulo="Orçado × realizado de cada PI — custos e horas." />

        <div className="cartao p-4 mb-5 flex flex-col lg:flex-row lg:items-end gap-4 print:hidden">
          <label className="block flex-1 min-w-0">
            <span className="rotulo">PI</span>
            <select value={piId} onChange={(e) => setPiId(e.target.value)} className="input">
              <option value="">Selecione o PI...</option>
              {pis.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.cliente}{p.projeto ? ` — ${p.projeto}` : ""}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-2">
            <Flag rotulo="Custo" marcado={comCusto} onChange={setComCusto} />
            <Flag rotulo="Horas" marcado={comHoras} onChange={setComHoras} />
          </div>
          <button onClick={visualizar} disabled={!podeVisualizar} className="btn btn-primario lg:min-w-[140px]">
            <Icone nome="buscar" className="w-4 h-4" /> Visualizar
          </button>
        </div>

        {!visualizando && (
          <EstadoVazio icone="grafico" titulo="Monte o relatório" texto="Selecione o PI, marque Custo e/ou Horas e clique em Visualizar." />
        )}

        {visualizando && piVisto && (
          <>
            <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
              <div>
                <div className="text-xs font-mono text-cyan font-bold">{piVisto.codigo}</div>
                <div className="font-head font-bold text-lg leading-tight">{piVisto.cliente}{piVisto.projeto ? ` — ${piVisto.projeto}` : ""}</div>
              </div>
              <button onClick={() => window.print()} className="btn btn-contorno btn-sm print:hidden">Imprimir</button>
            </div>
            {!editavel && <Aviso tipo="info" className="mb-4 print:hidden">Modo visualização — seu perfil não pode lançar valores realizados.</Aviso>}
            <div className="flex flex-col gap-6">
              {visualizando.custo && (
                <TabelaOrcadoRealizado key={`custo-${piVisto.id}`} tipo="custo" titulo="Compra — Produto ou Serviço"
                  colOrcado="Custos Orçados" colRealizado="Custos Realizados"
                  categorias={categorias.filter((c) => c.grupo === "compra_reais")}
                  itens={itensDoPi} pi={piVisto} editavel={editavel} usuario={usuario} onSalvo={recarregarOrcamentos} />
              )}
              {visualizando.horas && (
                <TabelaOrcadoRealizado key={`horas-${piVisto.id}`} tipo="horas" titulo="MOI + Contric (horas)"
                  colOrcado="Horas Orçadas" colRealizado="Horas Realizadas"
                  categorias={categoriasHoras} apontado={apontadoPorCodigo}
                  itens={itensDoPi} pi={piVisto} editavel={editavel} usuario={usuario} onSalvo={recarregarOrcamentos} />
              )}
              {visualizando.horas && (
                <LancamentosHoras key={`lanc-${piVisto.id}`} lancamentos={lancamentos} usuarios={usuarios} categorias={categoriasHoras}
                  pi={piVisto} editavel={editavel} usuario={usuario} onSalvo={recarregarApontamentos} />
              )}
            </div>
          </>
        )}
      </div>
    </PainelShell>
  );
}

// horas normais / extras de um lançamento: aprovado usa o que o aprovador definiu;
// pendente conta tudo como normal; check-in ainda aberto não soma nada
function horasDoLancamento(a) {
  if (a.entrada && !a.saida) return { normais: 0, extras: 0, aberto: true };
  if (a.status === "aprovado") return { normais: Number(a.horas_normais ?? a.horas_totais) || 0, extras: Number(a.horas_extras) || 0 };
  return { normais: Number(a.horas_totais) || 0, extras: 0 };
}
const fmtH = (n) => `${(Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} h`;

function LancamentosHoras({ lancamentos, usuarios, categorias, pi, editavel, usuario, onSalvo }) {
  const { avisar } = useToast();
  const [salvando, setSalvando] = useState({});
  const pessoa = (id) => usuarios.find((u) => u.id === id);
  const inicio = (l) => (l.entrada ? horaCurta(l.entrada) : l.hora_inicio || "—");
  const fim = (l) => (l.saida ? horaCurta(l.saida) : l.entrada ? "em aberto" : l.hora_fim || "—");
  const semCodigo = lancamentos.filter((l) => (l.normais > 0 && !l.categoria_normal_id) || (l.extras > 0 && !l.categoria_extra_id)).length;
  const totalN = lancamentos.reduce((s, l) => s + l.normais, 0);
  const totalE = lancamentos.reduce((s, l) => s + l.extras, 0);

  const classificar = async (l, campo, catId) => {
    const chave = `${l.id}-${campo}`;
    setSalvando((p) => ({ ...p, [chave]: true }));
    const { error } = await supabase.from("apontamentos_horas").update({ [campo]: catId || null }).eq("id", l.id);
    setSalvando((p) => ({ ...p, [chave]: false }));
    if (error) {
      avisar(/categoria_/.test(error.message)
        ? "O banco ainda não tem os campos de código. Rode o script horas-por-codigo.sql no Supabase."
        : `Não foi possível salvar: ${error.message}`, "erro", 8000);
      return;
    }
    const cat = categorias.find((c) => c.id === catId);
    registrarLog(usuario, "Classificou horas", `${pi.codigo} — ${pessoa(l.usuario_id)?.nome} ${formatarData(l.data)} · ${campo === "categoria_normal_id" ? "normais" : "extras"} → ${cat?.codigo || "sem código"}`);
    onSalvo?.();
  };

  const SeletorCodigo = ({ l, campo, horas }) => (
    <div className="flex items-center gap-1.5">
      <select value={l[campo] || ""} disabled={!editavel || horas <= 0} onChange={(e) => classificar(l, campo, e.target.value)}
        className={`input !py-1 !px-2 !text-xs !w-[92px] font-mono ${horas > 0 && !l[campo] ? "!border-amber" : ""}`}
        aria-label={`Código das horas ${campo === "categoria_normal_id" ? "normais" : "extras"}`} title={categorias.find((c) => c.id === l[campo])?.nome || "Escolha o código"}>
        <option value="">—</option>
        {categorias.map((c) => <option key={c.id} value={c.id}>{c.codigo}</option>)}
      </select>
      {salvando[`${l.id}-${campo}`] && <Spinner className="w-3.5 h-3.5 text-muted" />}
    </div>
  );

  return (
    <section className="cartao overflow-hidden">
      <div className="px-4 md:px-5 py-3 border-b border-line flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-head font-bold text-base text-cyan">Lançamentos de horas do PI</h2>
        <span className="text-xs text-muted">{lancamentos.length} lançamento(s){semCodigo ? <span className="text-amber font-semibold"> · {semCodigo} sem código</span> : ""}</span>
      </div>
      {lancamentos.length === 0 ? (
        <div className="p-6 text-sm text-muteddim">Nenhum lançamento de horas neste PI.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-panel text-left">
                <th className="px-3 py-2.5 titulo-secao">Nome</th>
                <th className="px-3 py-2.5 titulo-secao">Função</th>
                <th className="px-3 py-2.5 titulo-secao">Data</th>
                <th className="px-3 py-2.5 titulo-secao">Início</th>
                <th className="px-3 py-2.5 titulo-secao">Fim</th>
                <th className="px-3 py-2.5 titulo-secao text-right">Normais</th>
                <th className="px-3 py-2.5 titulo-secao">Cód. normais</th>
                <th className="px-3 py-2.5 titulo-secao text-right">Extras</th>
                <th className="px-3 py-2.5 titulo-secao">Cód. extras</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {lancamentos.map((l) => {
                const p = pessoa(l.usuario_id);
                return (
                  <tr key={l.id} className="hover:bg-panel/50">
                    <td className="px-3 py-2 font-medium">
                      {p?.nome || "—"}
                      {l.status === "pendente" && <span className="selo bg-amber/10 text-amber ml-1.5" title="Ainda não aprovado — conta como horas normais">pendente</span>}
                    </td>
                    <td className="px-3 py-2 text-muted">{p?.funcao || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatarData(l.data)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{inicio(l)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{fim(l)}</td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{fmtH(l.normais)}</td>
                    <td className="px-3 py-1.5"><SeletorCodigo l={l} campo="categoria_normal_id" horas={l.normais} /></td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{fmtH(l.extras)}</td>
                    <td className="px-3 py-1.5"><SeletorCodigo l={l} campo="categoria_extra_id" horas={l.extras} /></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-panel border-t-2 border-line">
                <td className="px-3 py-3 font-head font-bold" colSpan={5}>Total</td>
                <td className="px-3 py-3 text-right font-mono font-bold whitespace-nowrap">{fmtH(totalN)}</td>
                <td />
                <td className="px-3 py-3 text-right font-mono font-bold whitespace-nowrap">{fmtH(totalE)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <div className="px-4 md:px-5 py-2.5 text-xs text-muted border-t border-line print:hidden">
        Escolha o código de cada lançamento: as horas são somadas na coluna “Horas Realizadas” daquele código, na tabela acima. Lançamentos reprovados não aparecem.
      </div>
    </section>
  );
}

function Flag({ rotulo, marcado, onChange }) {
  return (
    <label className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer select-none text-sm font-semibold transition-colors ${marcado ? "border-cyan bg-cyan/5 text-cyan" : "border-line bg-white text-muted hover:border-muteddim"}`}>
      <input type="checkbox" className="w-4 h-4 accent-cyan" checked={marcado} onChange={(e) => onChange(e.target.checked)} />
      {rotulo}
    </label>
  );
}

// apontado: horas classificadas nos lançamentos por código (só na tabela de horas).
// O campo "Realizado" mostra ajuste manual (salvo em valor_realizado) + apontado.
function TabelaOrcadoRealizado({ tipo, titulo, colOrcado, colRealizado, categorias, itens, pi, editavel, usuario, onSalvo, apontado = {} }) {
  const { avisar } = useToast();
  const itemDa = (catId) => itens.find((o) => o.categoria_id === catId);

  // valores digitados (texto, para aceitar vírgula) — iniciam com o que está salvo
  const [digitados, setDigitados] = useState({});
  const manualDe = (catId) => itemDa(catId)?.valor_realizado;
  const totalTexto = (catId) => {
    const m = manualDe(catId), a = apontado[catId] || 0;
    if ((m === null || m === undefined) && !a) return "";
    return paraTexto((Number(m) || 0) + a, tipo);
  };
  const [salvando, setSalvando] = useState({});
  const [erroColuna, setErroColuna] = useState(false);
  // campos que o usuário está editando e ainda não salvou — não são sobrescritos pelo banco
  const sujosRef = useRef(new Set());
  useEffect(() => {
    // sincroniza com o banco (carga inicial, recarga e alterações feitas por outra pessoa)
    setDigitados((prev) => Object.fromEntries(categorias.map((c) => [
      c.id, sujosRef.current.has(c.id) ? prev[c.id] : totalTexto(c.id),
    ])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categorias, itens, JSON.stringify(apontado)]);

  const linhas = useMemo(() => categorias.map((c) => {
    const orcado = Number(itemDa(c.id)?.valor_orcado) || 0;
    const lido = lerNumero(digitados[c.id]);
    const invalido = Number.isNaN(lido);
    const realizado = invalido || lido === null ? 0 : lido;
    return { cat: c, orcado, realizado, invalido, ...calcular(orcado, realizado) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [categorias, itens, digitados]);

  const totalOrcado = linhas.reduce((s, l) => s + l.orcado, 0);
  const totalRealizado = linhas.reduce((s, l) => s + l.realizado, 0);
  const total = calcular(totalOrcado, totalRealizado);

  const salvar = async (catId) => {
    const digitado = lerNumero(digitados[catId]);
    if (Number.isNaN(digitado)) { avisar("Valor inválido — use apenas números (ex: 1.250,50).", "erro"); return; }
    // guarda só a parte manual: total digitado − horas já apontadas nos lançamentos
    const a = apontado[catId] || 0;
    const valor = digitado === null ? (a ? 0 : null) : Math.round((digitado - a) * 100) / 100;
    const anterior = itemDa(catId)?.valor_realizado ?? null;
    if ((anterior === null ? null : Number(anterior)) === valor) { sujosRef.current.delete(catId); return; } // nada mudou
    setSalvando((p) => ({ ...p, [catId]: true }));
    const { error } = await supabase.from("orcamento_pi_item")
      .upsert({ pi_id: pi.id, categoria_id: catId, valor_realizado: valor }, { onConflict: "pi_id,categoria_id" });
    setSalvando((p) => ({ ...p, [catId]: false }));
    if (error) {
      if (/valor_realizado/.test(error.message)) setErroColuna(true);
      avisar(`Não foi possível salvar: ${error.message}`, "erro", 7000);
      return;
    }
    sujosRef.current.delete(catId);
    const cat = categorias.find((c) => c.id === catId);
    registrarLog(usuario, `Lançou ${tipo === "custo" ? "custo" : "horas"} realizado`, `${pi.codigo} — ${cat?.codigo} ${cat?.nome}: ${valor ?? "—"}`);
    onSalvo?.();
  };

  const Dif = ({ valor, perc, forte }) => (
    <>
      <td className={`px-3 py-2 text-right font-mono whitespace-nowrap ${forte ? "font-bold" : "font-semibold"}`} style={{ color: corDe(valor) }}>{fmtValor(valor, tipo)}</td>
      <td className={`px-3 py-2 text-right font-mono whitespace-nowrap ${forte ? "font-bold" : "font-semibold"}`} style={{ color: corDe(perc) }}>{fmtPercentual(perc)}</td>
    </>
  );

  return (
    <section className="cartao overflow-hidden">
      <div className="px-4 md:px-5 py-3 border-b border-line flex items-center justify-between gap-2">
        <h2 className="font-head font-bold text-base text-cyan">{titulo}</h2>
        <span className="text-xs text-muted">{tipo === "custo" ? "Valores em R$" : "Valores em horas"}</span>
      </div>
      {erroColuna && (
        <Aviso tipo="erro" className="m-4">
          O banco ainda não tem a coluna de valores realizados. Rode o script <strong>valores-realizados.sql</strong> no SQL Editor do Supabase e tente de novo.
        </Aviso>
      )}
      {categorias.length === 0 ? (
        <div className="p-6 text-sm text-muteddim">Nenhum item cadastrado nesta categoria.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="bg-panel text-left">
                <th className="px-3 py-2.5 titulo-secao w-16">Cód.</th>
                <th className="px-3 py-2.5 titulo-secao">Descrição</th>
                <th className="px-3 py-2.5 titulo-secao text-right">{colOrcado}</th>
                <th className="px-3 py-2.5 titulo-secao text-right w-44">{colRealizado}</th>
                <th className="px-3 py-2.5 titulo-secao text-right">Orçado − Realizado</th>
                <th className="px-3 py-2.5 titulo-secao text-right">Dif %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {linhas.map((l) => (
                <tr key={l.cat.id} className="hover:bg-panel/50">
                  <td className="px-3 py-2 font-mono text-xs text-muted">{l.cat.codigo}</td>
                  <td className="px-3 py-2">{l.cat.nome}</td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{fmtValor(l.orcado, tipo)}</td>
                  <td className="px-3 py-1.5 text-right">
                    <div className="relative">
                      <input type="text" inputMode="decimal" value={digitados[l.cat.id] ?? ""} disabled={!editavel}
                        placeholder={tipo === "custo" ? "0,00" : "0"}
                        onChange={(e) => { sujosRef.current.add(l.cat.id); setDigitados((p) => ({ ...p, [l.cat.id]: e.target.value })); }}
                        onBlur={() => salvar(l.cat.id)}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                        aria-label={`${colRealizado} — ${l.cat.nome}`}
                        className={`input !py-1.5 text-right font-mono pr-7 ${l.invalido ? "!border-red" : ""}`} />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted">
                        {salvando[l.cat.id] ? <Spinner className="w-3.5 h-3.5" /> : null}
                      </span>
                    </div>
                    {apontado[l.cat.id] > 0 && (
                      <div className="text-[11px] text-cyan mt-0.5 whitespace-nowrap" title="Horas classificadas nos lançamentos abaixo">
                        inclui {fmtValor(apontado[l.cat.id], tipo)} lançadas
                      </div>
                    )}
                  </td>
                  <Dif valor={l.dif} perc={l.perc} />
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-panel border-t-2 border-line">
                <td className="px-3 py-3" />
                <td className="px-3 py-3 font-head font-bold">Total</td>
                <td className="px-3 py-3 text-right font-mono font-bold whitespace-nowrap">{fmtValor(totalOrcado, tipo)}</td>
                <td className="px-3 py-3 text-right font-mono font-bold whitespace-nowrap pr-10">{fmtValor(totalRealizado, tipo)}</td>
                <Dif valor={total.dif} perc={total.perc} forte />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <div className="px-4 md:px-5 py-2.5 text-xs text-muted border-t border-line print:hidden">
        Digite o realizado e saia do campo (ou tecle Enter) para salvar. Diferença positiva = dentro do orçado; negativa = acima do orçado.
      </div>
    </section>
  );
}
