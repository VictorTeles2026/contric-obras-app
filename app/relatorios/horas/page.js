"use client";

import { Fragment, useMemo, useState } from "react";
import { useTabela } from "../../../lib/dados";
import { hojeISO, addDias, isoLocal, dataLocal, formatarData, horaCurta } from "../../../lib/datas";
import { horasDoLancamento, fmtH } from "../../../lib/horas";
import PainelShell from "../../../components/PainelShell";
import { AbasRelatorios, SeletorPi, Segmentado } from "../../../components/ui";
import { CabecalhoPagina, EstadoVazio, Esqueleto, Campo } from "../../../components/ui";
import Icone from "../../../components/Icone";
import { gerarExcelTabela } from "../../../lib/pdfRdo";

const PROPRIA = "__propria__"; // filtro "mão de obra própria" (sem empresa terceira)
const AGRUPAR = [["pessoa", "Pessoa"], ["pi", "PI"], ["cliente", "Cliente"], ["empresa", "Empresa"], ["", "Sem agrupar"]];
const SOMAR = [["total", "Total"], ["normais", "Normais"], ["extras", "Extras"]];
const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

function periodoRapido(tipo) {
  const hoje = new Date();
  const h = hojeISO();
  if (tipo === "semana") { const d = new Date(hoje); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return [isoLocal(d), h]; }
  if (tipo === "mes") return [isoLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), h];
  if (tipo === "mes_passado") return [isoLocal(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)), isoLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 0))];
  return [addDias(h, -29), h];
}
function diasEntre(de, ate) {
  const out = [];
  for (let d = de; d <= ate && out.length < 400; d = addDias(d, 1)) out.push(d);
  return out;
}
const num = (n) => (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export default function ControleHorasPage() {
  const { dados: apontamentos, carregando } = useTabela("apontamentos_horas", { order: { coluna: "data" } });
  const { dados: pis } = useTabela("pis", { order: { coluna: "codigo" } });
  const { dados: usuarios } = useTabela("usuarios");
  const { dados: recursos } = useTabela("recursos", { order: { coluna: "nome" } });
  const { dados: empresas } = useTabela("empresas_terceiras", { order: { coluna: "nome" } });

  const [de, setDe] = useState(periodoRapido("mes")[0]);
  const [ate, setAte] = useState(hojeISO());
  const [piId, setPiId] = useState("");
  const [cliente, setCliente] = useState("");
  const [empresaId, setEmpresaId] = useState("");
  const [recursoId, setRecursoId] = useState("");
  const [status, setStatus] = useState("todos"); // todos | aprovado | pendente
  const [agrupar, setAgrupar] = useState("pessoa");
  const [somar, setSomar] = useState("total");
  const [visao, setVisao] = useState("lancadas"); // lancadas | orcadas

  const clientes = [...new Set(pis.map((p) => p.cliente).filter(Boolean))].sort();
  const recursosMaoDeObra = recursos.filter((r) => r.usuario_id && (r.tipo === "mao_obra_propria" || r.tipo === "mao_obra_terceira"));

  // cada lançamento enriquecido com pessoa, recurso, empresa, PI e horas
  const linhas = useMemo(() => apontamentos
    .filter((a) => a.status !== "rejeitado")
    .map((a) => {
      // horas de recurso sem usuário (equipamento, veículo...): o "nome" é o do recurso
      const recurso = (a.recurso_id && recursos.find((r) => r.id === a.recurso_id)) || (a.usuario_id ? recursos.find((r) => r.usuario_id === a.usuario_id) : null);
      const pessoa = usuarios.find((u) => u.id === a.usuario_id) || (recurso ? { id: `r-${recurso.id}`, nome: recurso.nome, funcao: recurso.atributos?.funcao || "Recurso" } : undefined);
      const empresa = empresas.find((e) => e.id === recurso?.empresa_terceira_id);
      const pi = pis.find((p) => p.id === a.pi_id);
      const h = horasDoLancamento(a);
      return {
        ...a, pessoa, recurso, empresa, pi, ...h, total: h.normais + h.extras,
        nomeEmpresa: empresa?.nome || (recurso?.tipo === "mao_obra_terceira" || pessoa?.perfil === "terceiro" ? pessoa?.empresa_terceira || "Terceiro (sem empresa)" : "Contric (própria)"),
      };
    }), [apontamentos, usuarios, recursos, empresas, pis]);

  const filtradas = linhas.filter((l) =>
    l.data >= de && l.data <= ate &&
    (!piId || l.pi_id === piId) &&
    (!cliente || l.pi?.cliente === cliente) &&
    (!empresaId || (empresaId === PROPRIA ? !l.empresa && l.nomeEmpresa === "Contric (própria)" : l.empresa?.id === empresaId)) &&
    (!recursoId || l.recurso?.id === recursoId) &&
    (status === "todos" || l.status === status))
    .sort((a, b) => a.data.localeCompare(b.data) || (a.pessoa?.nome || "").localeCompare(b.pessoa?.nome || ""));

  const chaveGrupo = (l, g = agrupar) => g === "pi" ? l.pi?.codigo || "—" : g === "cliente" ? l.pi?.cliente || "—" : g === "empresa" ? l.nomeEmpresa : g === "pessoa" ? l.pessoa?.nome || "—" : "Todos os lançamentos";
  const detalheGrupo = (l, g = agrupar) => g === "pi" ? l.pi?.cliente : g === "pessoa" ? [l.pessoa?.funcao, l.nomeEmpresa].filter(Boolean).join(" · ") : "";
  const grupos = useMemo(() => {
    const m = new Map();
    filtradas.forEach((l) => {
      const k = chaveGrupo(l, agrupar || "pessoa");
      if (!m.has(k)) m.set(k, { chave: k, detalhe: detalheGrupo(l, agrupar || "pessoa"), itens: [] });
      m.get(k).itens.push(l);
    });
    return [...m.values()].sort((a, b) => a.chave.localeCompare(b.chave));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtradas, agrupar]);

  const dias = diasEntre(de, ate);
  const soma = (itens, campo = somar) => itens.reduce((s, l) => s + l[campo], 0);
  const totais = { total: soma(filtradas, "total"), normais: soma(filtradas, "normais"), extras: soma(filtradas, "extras") };
  const pessoasDistintas = new Set(filtradas.map((l) => l.usuario_id)).size;

  // exporta em Excel (.xlsx) com o logo da Contric — antes era CSV, que não aceita imagem
  const [exportando, setExportando] = useState(false);
  const exportar = async () => {
    setExportando(true);
    try {
      const cab = ["Data", "Nome", "Função", "Empresa", "PI", "Cliente", "Projeto", "Início", "Fim", "Normais (h)", "Extras (h)", "Total (h)", "Status"];
      const corpo = filtradas.map((l) => [
        formatarData(l.data), l.pessoa?.nome, l.pessoa?.funcao, l.nomeEmpresa, l.pi?.codigo, l.pi?.cliente, l.pi?.projeto,
        l.entrada ? horaCurta(l.entrada) : l.hora_inicio, l.saida ? horaCurta(l.saida) : l.hora_fim,
        Number(l.normais) || 0, Number(l.extras) || 0, Number(l.total) || 0, l.status,
      ]);
      const blob = await gerarExcelTabela({
        titulo: "CONTROLE DE HORAS", subtitulo: `Período de ${formatarData(de)} a ${formatarData(ate)} · ${filtradas.length} lançamento(s)`,
        cabecalho: cab, linhas: corpo, nomeAba: "Controle de horas",
        larguras: [11, 26, 18, 18, 12, 20, 24, 8, 8, 11, 10, 10, 12], formatos: { 9: "0.00", 10: "0.00", 11: "0.00" },
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `controle-horas_${de}_a_${ate}.xlsx`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { window.alert(`Não foi possível exportar: ${e.message}`); }
    setExportando(false);
  };

  const limpar = () => { setPiId(""); setCliente(""); setEmpresaId(""); setRecursoId(""); setStatus("todos"); };
  const filtrosAtivos = [piId, cliente, empresaId, recursoId].filter(Boolean).length + (status !== "todos" ? 1 : 0);

  return (
    <PainelShell>
      <div className="p-4 md:p-8 max-w-[1400px] mx-auto">
        <CabecalhoPagina titulo="Relatórios" subtitulo="Orçado × realizado de cada PI e controle das horas lançadas."
          acoes={visao === "lancadas" && <button onClick={exportar} disabled={!filtradas.length || exportando} className="btn btn-contorno"><Icone nome="download" className="w-4 h-4" /> {exportando ? "Gerando..." : "Exportar Excel"}</button>} />
        <AbasRelatorios />
        <div className="max-w-sm mb-4">
          <Segmentado valor={visao} onChange={setVisao} opcoes={[["lancadas", "Horas lançadas"], ["orcadas", "Horas orçadas"]]} />
        </div>

        {visao === "orcadas" ? <HorasOrcadas pis={pis} /> : <>
        {/* ---------- filtros ---------- */}
        <div className="cartao p-4 mb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            <Campo rotulo="De"><input type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} className="input" /></Campo>
            <Campo rotulo="Até"><input type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} className="input" /></Campo>
            <Campo rotulo="PI">
              <SeletorPi pis={pis} value={piId} onChange={(v) => setPiId(v)} vazio="Todos" className="input" />
            </Campo>
            <Campo rotulo="Cliente">
              <select value={cliente} onChange={(e) => setCliente(e.target.value)} className="input">
                <option value="">Todos</option>
                {clientes.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Empresa terceira">
              <select value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} className="input">
                <option value="">Todas</option>
                <option value={PROPRIA}>Contric (mão de obra própria)</option>
                {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}{e.ativa ? "" : " (inativa)"}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Recurso">
              <select value={recursoId} onChange={(e) => setRecursoId(e.target.value)} className="input">
                <option value="">Todos</option>
                {recursosMaoDeObra.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Situação">
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="input">
                <option value="todos">Aprovadas e pendentes</option>
                <option value="aprovado">Só aprovadas</option>
                <option value="pendente">Só pendentes</option>
              </select>
            </Campo>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="text-xs text-muted">Período rápido:</span>
            {[["semana", "Esta semana"], ["mes", "Este mês"], ["mes_passado", "Mês passado"], ["30", "Últimos 30 dias"]].map(([v, l]) => (
              <button key={v} onClick={() => { const [a, b] = periodoRapido(v); setDe(a); setAte(b); }} className="chip">{l}</button>
            ))}
            {filtrosAtivos > 0 && <button onClick={limpar} className="text-sm text-muted hover:underline ml-auto">Limpar filtros ({filtrosAtivos})</button>}
          </div>
        </div>

        {/* ---------- resumo ---------- */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          {[["Horas totais", fmtH(totais.total)], ["Normais", fmtH(totais.normais)], ["Extras", fmtH(totais.extras)], ["Lançamentos", filtradas.length], ["Pessoas", pessoasDistintas]].map(([t, v]) => (
            <div key={t} className="cartao p-3.5"><div className="text-xs text-muted">{t}</div><div className="font-head font-bold text-2xl">{v}</div></div>
          ))}
        </div>

        {/* ---------- agrupar / somar ---------- */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-sm font-semibold">Agrupar por:</span>
          {AGRUPAR.map(([v, l]) => <button key={v} onClick={() => setAgrupar(v)} className={`chip ${agrupar === v ? "chip-ativo" : ""}`}>{l}</button>)}
          <span className="w-px h-5 bg-line mx-1" />
          <span className="text-sm font-semibold">Somar:</span>
          {SOMAR.map(([v, l]) => <button key={v} onClick={() => setSomar(v)} className={`chip ${somar === v ? "chip-ativo" : ""}`}>{l}</button>)}
        </div>

        {carregando && <Esqueleto linhas={4} altura={48} />}
        {!carregando && filtradas.length === 0 && <EstadoVazio icone="relogio" titulo="Nenhum lançamento" texto="Nada encontrado com esses filtros e período." />}

        {filtradas.length > 0 && (
          <>
            {/* ---------- linha do tempo dia a dia ---------- */}
            <section className="cartao mb-6 overflow-hidden">
              <div className="px-4 py-3 border-b border-line flex flex-wrap items-center justify-between gap-2">
                <h2 className="titulo-quadro text-cyan">Linha do tempo — horas {SOMAR.find(([v]) => v === somar)[1].toLowerCase()} por dia</h2>
                <span className="text-xs text-muted">{dias.length} dia(s) · passe o mouse numa célula para ver o detalhe</span>
              </div>
              <div className="overflow-auto rolagem-linha-tempo" style={{ maxHeight: "60vh" }}>
                <table className="text-xs border-separate border-spacing-0">
                  <thead className="sticky top-0 z-20 bg-white">
                    <tr>
                      <th className="sticky left-0 z-30 bg-white px-3 py-2 text-left titulo-secao border-b border-r border-line min-w-[220px]">{AGRUPAR.find(([v]) => v === (agrupar || "pessoa"))?.[1] || "Pessoa"}</th>
                      {dias.map((d) => {
                        const dt = dataLocal(d); const fds = dt.getDay() === 0 || dt.getDay() === 6;
                        return (
                          <th key={d} className={`px-1 py-1.5 font-mono font-medium text-center border-b border-line min-w-[44px] ${fds ? "bg-panel text-muteddim" : "text-muted"} ${d === hojeISO() ? "!text-red" : ""}`}>
                            <div className="text-[10px]">{DIAS_SEMANA[dt.getDay()]}</div>
                            <div>{String(dt.getDate()).padStart(2, "0")}/{String(dt.getMonth() + 1).padStart(2, "0")}</div>
                          </th>
                        );
                      })}
                      <th className="sticky right-0 z-30 bg-white px-3 py-2 text-right titulo-secao border-b border-l border-line">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupos.map((g) => (
                      <tr key={g.chave} className="hover:bg-cyan/[0.03]">
                        <td className="sticky left-0 z-10 bg-white px-3 py-2 border-b border-r border-line/70 max-w-[260px]">
                          <div className="font-semibold text-sm truncate">{g.chave}</div>
                          {g.detalhe && <div className="text-[11px] text-muted truncate">{g.detalhe}</div>}
                        </td>
                        {dias.map((d) => {
                          const doDia = g.itens.filter((l) => l.data === d);
                          const v = soma(doDia);
                          const fds = [0, 6].includes(dataLocal(d).getDay());
                          const titulo = doDia.map((l) => `${l.pessoa?.nome} · ${l.pi?.codigo} · ${num(l.normais)}h N + ${num(l.extras)}h E`).join("\n");
                          return (
                            <td key={d} title={titulo} className={`text-center font-mono border-b border-line/50 px-1 py-2 ${fds ? "bg-panel/70" : ""}`}>
                              {v > 0 ? <span className={`inline-block min-w-[34px] rounded-md px-1 py-0.5 font-semibold ${v > 10 ? "bg-amber/15 text-[#9a5a14]" : "bg-cyan/10 text-cyan"}`}>{num(v)}</span> : <span className="text-line">·</span>}
                            </td>
                          );
                        })}
                        <td className="sticky right-0 z-10 bg-white px-3 py-2 text-right font-mono font-bold border-b border-l border-line/70">{num(soma(g.itens))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 z-20 bg-panel">
                    <tr>
                      <td className="sticky left-0 z-30 bg-panel px-3 py-2 font-head font-bold border-t-2 border-r border-line">Total do dia</td>
                      {dias.map((d) => {
                        const v = soma(filtradas.filter((l) => l.data === d));
                        return <td key={d} className="text-center font-mono font-bold border-t-2 border-line px-1 py-2">{v > 0 ? num(v) : ""}</td>;
                      })}
                      <td className="sticky right-0 z-30 bg-panel px-3 py-2 text-right font-mono font-bold border-t-2 border-l border-line">{num(soma(filtradas))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            {/* ---------- lista de lançamentos ---------- */}
            <section className="cartao overflow-hidden">
              <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-2">
                <h2 className="titulo-quadro text-cyan">Lançamentos ({filtradas.length})</h2>
                {agrupar && <span className="text-xs text-muted">agrupados por {AGRUPAR.find(([v]) => v === agrupar)[1].toLowerCase()}, com subtotal</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[1000px]">
                  <thead>
                    <tr className="bg-panel text-left">
                      {["Data", "Nome", "Função", "Empresa", "PI", "Cliente", "Início", "Fim"].map((t) => <th key={t} className="px-3 py-2.5 titulo-secao">{t}</th>)}
                      {["Normais", "Extras", "Total"].map((t) => <th key={t} className="px-3 py-2.5 titulo-secao text-right">{t}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {(agrupar ? grupos : [{ chave: "", itens: filtradas }]).map((g) => (
                      <Fragment key={g.chave || "todos"}>
                        {agrupar && (
                          <tr className="bg-cyan/5">
                            <td colSpan={8} className="px-3 py-2 font-semibold text-cyan">{g.chave}{g.detalhe ? <span className="text-muted font-normal"> · {g.detalhe}</span> : ""}</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold">{num(soma(g.itens, "normais"))}</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold">{num(soma(g.itens, "extras"))}</td>
                            <td className="px-3 py-2 text-right font-mono font-bold">{num(soma(g.itens, "total"))}</td>
                          </tr>
                        )}
                        {g.itens.map((l) => (
                          <tr key={l.id} className="border-t border-line/60 hover:bg-panel/50">
                            <td className="px-3 py-2 whitespace-nowrap">{formatarData(l.data)}</td>
                            <td className="px-3 py-2 font-medium">
                              {l.pessoa?.nome || "—"}
                              {l.status === "pendente" && <span className="selo bg-amber/10 text-amber ml-1.5">pendente</span>}
                            </td>
                            <td className="px-3 py-2 text-muted">{l.pessoa?.funcao || "—"}</td>
                            <td className="px-3 py-2 text-muted">{l.nomeEmpresa}</td>
                            <td className="px-3 py-2 font-mono text-cyan font-semibold">{l.pi?.codigo || "—"}</td>
                            <td className="px-3 py-2">{l.pi?.cliente || "—"}</td>
                            <td className="px-3 py-2 font-mono text-xs">{l.entrada ? horaCurta(l.entrada) : l.hora_inicio || "—"}</td>
                            <td className="px-3 py-2 font-mono text-xs">{l.saida ? horaCurta(l.saida) : l.entrada ? "em aberto" : l.hora_fim || "—"}</td>
                            <td className="px-3 py-2 text-right font-mono">{num(l.normais)}</td>
                            <td className="px-3 py-2 text-right font-mono">{num(l.extras)}</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold">{num(l.total)}</td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-panel border-t-2 border-line">
                      <td colSpan={8} className="px-3 py-3 font-head font-bold">Total geral</td>
                      <td className="px-3 py-3 text-right font-mono font-bold">{num(totais.normais)}</td>
                      <td className="px-3 py-3 text-right font-mono font-bold">{num(totais.extras)}</td>
                      <td className="px-3 py-3 text-right font-mono font-bold">{num(totais.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          </>
        )}
        </>}
      </div>
    </PainelShell>
  );
}

// ---------------- Horas orçadas: tipos de hora (MOI + Contric da abertura do PI) × PIs ----------------
// Orçamento não tem data, pessoa nem aprovação: valem só os filtros de PI, cliente e status do PI.
const STATUS_PI = [["ativo", "Ativos"], ["", "Todos"], ["concluido", "Concluídos"], ["pausado", "Pausados"]];
function HorasOrcadas({ pis }) {
  const { dados: categorias, carregando } = useTabela("categorias_orcamento", { order: { coluna: "ordem" } });
  const { dados: orcamentos } = useTabela("orcamento_pi_item");
  const [piId, setPiId] = useState("");
  const [cliente, setCliente] = useState("");
  const [statusPi, setStatusPi] = useState("ativo");
  const [agrupar, setAgrupar] = useState("pi"); // pi | cliente
  const [exportando, setExportando] = useState(false);

  const tipos = categorias.filter((c) => c.grupo === "moi_horas");
  const clientes = [...new Set(pis.map((p) => p.cliente).filter(Boolean))].sort();
  const pisFiltrados = pis.filter((p) => (!piId || p.id === piId) && (!cliente || p.cliente === cliente) && (!statusPi || (p.status || "ativo") === statusPi));
  // colunas: um PI cada, ou um cliente somando os PIs dele
  const colunas = agrupar === "cliente"
    ? [...new Set(pisFiltrados.map((p) => p.cliente || "—"))].sort().map((c) => ({ chave: c, titulo: c, sub: `${pisFiltrados.filter((p) => (p.cliente || "—") === c).length} PI(s)`, ids: pisFiltrados.filter((p) => (p.cliente || "—") === c).map((p) => p.id) }))
    : pisFiltrados.map((p) => ({ chave: p.id, titulo: p.codigo, sub: p.cliente || "", ids: [p.id] }));
  const valor = (catId, ids) => orcamentos.reduce((s, o) => s + (o.categoria_id === catId && ids.includes(o.pi_id) ? Number(o.valor_orcado) || 0 : 0), 0);
  const todosIds = pisFiltrados.map((p) => p.id);
  const totalCol = (ids) => tipos.reduce((s, c) => s + valor(c.id, ids), 0);
  const fmt = (v) => (v ? `${num(v)} h` : "—");

  const exportar = async () => {
    setExportando(true);
    try {
      const cab = ["Cód.", "Tipo de hora", "Total (h)", ...colunas.map((c) => (agrupar === "cliente" ? c.titulo : `${c.titulo} ${c.sub}`.trim()))];
      const corpo = [...tipos.map((c) => [c.codigo, c.nome, valor(c.id, todosIds), ...colunas.map((col) => valor(c.id, col.ids))]),
        ["", "TOTAL", totalCol(todosIds), ...colunas.map((col) => totalCol(col.ids))]];
      const formatos = Object.fromEntries(cab.slice(2).map((_, i) => [i + 2, "#,##0.##"]));
      const blob = await gerarExcelTabela({ titulo: "HORAS ORÇADAS POR TIPO DE HORA", subtitulo: `${pisFiltrados.length} PI(s) · colunas por ${agrupar === "cliente" ? "cliente" : "PI"}`,
        cabecalho: cab, linhas: corpo, nomeAba: "Horas orçadas", larguras: [8, 30, 12, ...colunas.map(() => 16)], formatos });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `horas-orcadas_${hojeISO()}.xlsx`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { window.alert(`Não foi possível exportar: ${e.message}`); }
    setExportando(false);
  };

  return (
    <>
      <div className="cartao p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Campo rotulo="PI"><SeletorPi pis={pis} value={piId} onChange={(v) => setPiId(v)} vazio="Todos" className="input" /></Campo>
          <Campo rotulo="Cliente">
            <select value={cliente} onChange={(e) => setCliente(e.target.value)} className="input">
              <option value="">Todos</option>
              {clientes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Status do PI">
            <select value={statusPi} onChange={(e) => setStatusPi(e.target.value)} className="input">
              {STATUS_PI.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Campo>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-sm font-semibold">Colunas por:</span>
        {[["pi", "PI"], ["cliente", "Cliente"]].map(([v, l]) => <button key={v} onClick={() => setAgrupar(v)} className={`chip ${agrupar === v ? "chip-ativo" : ""}`}>{l}</button>)}
        <button onClick={exportar} disabled={!colunas.length || exportando} className="btn btn-contorno btn-sm ml-auto"><Icone nome="download" className="w-4 h-4" /> {exportando ? "Gerando..." : "Exportar Excel"}</button>
      </div>

      {carregando ? <Esqueleto linhas={4} altura={48} /> : !colunas.length || !tipos.length ? (
        <EstadoVazio icone="relogio" titulo="Nada para mostrar" texto={!tipos.length ? "Nenhum tipo de hora cadastrado no orçamento." : "Nenhum PI com esses filtros."} />
      ) : (
        <section className="cartao overflow-hidden">
          <div className="px-4 py-3 border-b border-line flex flex-wrap items-center justify-between gap-2">
            <h2 className="titulo-quadro text-cyan">Horas orçadas por tipo de hora</h2>
            <span className="text-xs text-muted">{pisFiltrados.length} PI(s) · valores da abertura do PI</span>
          </div>
          <div className="overflow-auto rolagem-linha-tempo" style={{ maxHeight: "70vh" }}>
            <table className="text-sm border-separate border-spacing-0">
              <thead className="sticky top-0 z-20 bg-white">
                <tr>
                  <th className="sticky left-0 z-30 bg-white px-3 py-2 text-left titulo-secao border-b border-r border-line w-[240px] min-w-[240px] max-w-[240px]">Tipo de hora</th>
                  <th className="sticky left-[240px] z-30 bg-cyan/10 px-3 py-2 text-right titulo-secao !text-cyan border-b border-r border-line min-w-[100px]">Total</th>
                  {colunas.map((c) => (
                    <th key={c.chave} className="px-3 py-2 text-right border-b border-line min-w-[110px] align-bottom">
                      <div className="font-mono font-bold text-xs text-textmain">{c.titulo}</div>
                      {c.sub && <div className="text-[11px] font-normal text-muted truncate max-w-[140px] ml-auto">{c.sub}</div>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tipos.map((c) => (
                  <tr key={c.id} className="hover:bg-cyan/[0.03]">
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 border-b border-r border-line/70 w-[240px] min-w-[240px] max-w-[240px] truncate" title={c.nome}>
                      <span className="font-mono text-xs text-muted inline-block w-10">{c.codigo}</span>{c.nome}
                    </td>
                    <td className="sticky left-[240px] z-10 bg-white px-3 py-2 text-right font-mono font-bold border-b border-r border-line/70">{fmt(valor(c.id, todosIds))}</td>
                    {colunas.map((col) => { const v = valor(c.id, col.ids); return <td key={col.chave} className={`px-3 py-2 text-right font-mono border-b border-line/50 whitespace-nowrap ${v ? "" : "text-muteddim"}`}>{fmt(v)}</td>; })}
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 z-20 bg-panel">
                <tr>
                  <td className="sticky left-0 z-30 bg-panel px-3 py-2.5 font-head font-bold border-t-2 border-r border-line">Total</td>
                  <td className="sticky left-[240px] z-30 bg-panel px-3 py-2.5 text-right font-mono font-bold border-t-2 border-r border-line whitespace-nowrap">{fmt(totalCol(todosIds))}</td>
                  {colunas.map((col) => <td key={col.chave} className="px-3 py-2.5 text-right font-mono font-bold border-t-2 border-line whitespace-nowrap">{fmt(totalCol(col.ids))}</td>)}
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
