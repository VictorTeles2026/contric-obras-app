"use client";

import { Fragment, useMemo, useState } from "react";
import { useTabela } from "../../../lib/dados";
import { hojeISO, addDias, isoLocal, dataLocal, formatarData, horaCurta } from "../../../lib/datas";
import { horasDoLancamento, fmtH } from "../../../lib/horas";
import PainelShell from "../../../components/PainelShell";
import AbasRelatorios from "../../../components/AbasRelatorios";
import { CabecalhoPagina, EstadoVazio, Esqueleto, Campo } from "../../../components/ui";
import Icone from "../../../components/Icone";

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
const csv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
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

  const clientes = [...new Set(pis.map((p) => p.cliente).filter(Boolean))].sort();
  const recursosMaoDeObra = recursos.filter((r) => r.usuario_id && (r.tipo === "mao_obra_propria" || r.tipo === "mao_obra_terceira"));

  // cada lançamento enriquecido com pessoa, recurso, empresa, PI e horas
  const linhas = useMemo(() => apontamentos
    .filter((a) => a.status !== "rejeitado")
    .map((a) => {
      const pessoa = usuarios.find((u) => u.id === a.usuario_id);
      const recurso = recursos.find((r) => r.usuario_id === a.usuario_id);
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

  const exportar = () => {
    const cab = ["Data", "Nome", "Função", "Empresa", "PI", "Cliente", "Projeto", "Início", "Fim", "Normais", "Extras", "Total", "Status"];
    const corpo = filtradas.map((l) => [
      formatarData(l.data), l.pessoa?.nome, l.pessoa?.funcao, l.nomeEmpresa, l.pi?.codigo, l.pi?.cliente, l.pi?.projeto,
      l.entrada ? horaCurta(l.entrada) : l.hora_inicio, l.saida ? horaCurta(l.saida) : l.hora_fim, num(l.normais), num(l.extras), num(l.total), l.status,
    ]);
    const texto = "﻿" + [cab, ...corpo].map((r) => r.map(csv).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `controle-horas_${de}_a_${ate}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const limpar = () => { setPiId(""); setCliente(""); setEmpresaId(""); setRecursoId(""); setStatus("todos"); };
  const filtrosAtivos = [piId, cliente, empresaId, recursoId].filter(Boolean).length + (status !== "todos" ? 1 : 0);

  return (
    <PainelShell>
      <div className="p-4 md:p-8 max-w-[1400px] mx-auto">
        <CabecalhoPagina titulo="Relatórios" subtitulo="Orçado × realizado de cada PI e controle das horas lançadas."
          acoes={<button onClick={exportar} disabled={!filtradas.length} className="btn btn-contorno"><Icone nome="download" className="w-4 h-4" /> Exportar (Excel/CSV)</button>} />
        <AbasRelatorios />

        {/* ---------- filtros ---------- */}
        <div className="cartao p-4 mb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            <Campo rotulo="De"><input type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} className="input" /></Campo>
            <Campo rotulo="Até"><input type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} className="input" /></Campo>
            <Campo rotulo="PI">
              <select value={piId} onChange={(e) => setPiId(e.target.value)} className="input">
                <option value="">Todos</option>
                {pis.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.cliente}</option>)}
              </select>
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
                <h2 className="font-head font-bold text-base text-cyan">Linha do tempo — horas {SOMAR.find(([v]) => v === somar)[1].toLowerCase()} por dia</h2>
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
                <h2 className="font-head font-bold text-base text-cyan">Lançamentos ({filtradas.length})</h2>
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
      </div>
    </PainelShell>
  );
}
