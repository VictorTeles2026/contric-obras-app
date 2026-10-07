"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTabela, chamarApi } from "../../lib/dados";
import { useAuth } from "../../lib/AuthContext";
import { useToast } from "../../lib/Toast";
import { PADROES, TIPOS_RECURSO_FIXOS, aplicarConfiguracoes } from "../../lib/configuracoes";
import { EQUIPE_CAMPO } from "../../lib/constantes";
import PainelShell from "../../components/PainelShell";
import { CabecalhoPagina, Aviso, Spinner, EstadoVazio } from "../../components/ui";
import Icone from "../../components/Icone";

// seções da página (menu à esquerda)
const SECOES = [
  ["equipes", "Equipes", "Áreas usadas em etapas, usuários, recursos e filtros."],
  ["funcoes", "Funções", "Funções de usuários e recursos de mão de obra."],
  ["categorias_ocorrencia", "Categorias de ocorrência", "Tipos de ocorrência registrados no RDO e pela equipe."],
  ["tipos_recurso", "Tipos de recurso", "Agrupamento dos recursos (veículo, ferramenta...)."],
  ["unidades", "Modos de apropriação", "Unidade de custo dos recursos (hora, diária...)."],
  ["classificacoes_doc", "Classificações de documentos", "Opções ao enviar arquivos em Documentos."],
  ["categorias_orcamento", "Categorias de orçamento", "Itens de Compra (R$) e MOI (horas) da abertura do PI."],
  ["status_etapa", "Status das etapas", "Nomes e cores das barras do cronograma e da Linha do Tempo."],
  ["status_pi", "Status dos PIs", "Nomes exibidos para os status do PI."],
  ["prazos", "Prazos de alerta", "Quando as etapas e medições ficam em destaque."],
  ["feriados_extras", "Feriados adicionais", "Feriados municipais / da empresa no cálculo de dias úteis."],
  ["atalhos", "Outras configurações", "Permissões, empresas terceiras, usuários."],
];
// listas em que renomear um item também atualiza os registros que já usam o nome antigo
const PROPAGA = ["equipes", "funcoes", "categorias_ocorrencia"];

export default function ConfiguracoesPage() {
  const { usuario } = useAuth();
  const { avisar } = useToast();
  const { dados: linhas, erro, recarregar } = useTabela("configuracoes");
  const [secao, setSecao] = useState("equipes");
  const mapa = useMemo(() => Object.fromEntries(linhas.map((l) => [l.chave, l.valor])), [linhas]);
  const valor = (k) => (mapa[k] !== undefined ? mapa[k] : PADROES[k]);
  // reaplica nas telas abertas sempre que o banco muda
  useEffect(() => { aplicarConfiguracoes(mapa); }, [mapa]);

  if (usuario && usuario.perfil !== "master") {
    return <PainelShell><div className="p-8"><Aviso tipo="erro">Página disponível somente para o Master.</Aviso></div></PainelShell>;
  }

  const salvar = async (chave, novo, resumo) => {
    const { ok, json } = await chamarApi("/api/configuracoes", { acao: "salvar", chave, valor: novo, resumo });
    if (!ok) { avisar(json.error || "Não foi possível salvar.", "erro", 7000); return false; }
    avisar("Configuração salva — vale para todos a partir do próximo acesso.");
    recarregar();
    return true;
  };
  const restaurar = async (chave) => {
    if (!window.confirm("Voltar esta lista ao padrão original do sistema?")) return;
    const { ok, json } = await chamarApi("/api/configuracoes", { acao: "restaurar", chave });
    if (!ok) { avisar(json.error || "Não foi possível restaurar.", "erro", 7000); return; }
    avisar("Padrão restaurado."); recarregar();
  };
  const props = (k) => ({ chave: k, valor: valor(k), personalizado: mapa[k] !== undefined, onSalvar: salvar, onRestaurar: () => restaurar(k) });
  const [, titulo, descricao] = SECOES.find(([k]) => k === secao);

  return (
    <PainelShell>
      <div className="p-4 md:p-8 max-w-6xl mx-auto">
        <CabecalhoPagina titulo="Configurações" subtitulo="Ajustes estruturais do sistema — somente Master. Todas as alterações vão para a Auditoria." />
        {erro && <Aviso tipo="erro" className="mb-4">Rode o script <strong>configuracoes.sql</strong> no Supabase para poder salvar. Enquanto isso, valem os padrões.</Aviso>}
        <div className="flex flex-col md:flex-row gap-4">
          <nav className="md:w-64 shrink-0 cartao p-2 flex md:flex-col gap-0.5 overflow-x-auto">
            {SECOES.map(([k, l]) => (
              <button key={k} onClick={() => setSecao(k)}
                className={`text-left text-sm px-3 py-2 rounded-lg whitespace-nowrap flex items-center gap-2 ${secao === k ? "bg-cyan/10 text-cyan font-semibold" : "text-muted hover:bg-panel hover:text-textmain"}`}>
                <span className="flex-1">{l}</span>
                {mapa[k] !== undefined && <span className="w-1.5 h-1.5 rounded-full bg-cyan" title="Personalizado" />}
              </button>
            ))}
          </nav>
          <section className="flex-1 min-w-0 cartao p-4 md:p-5">
            <h2 className="titulo-quadro">{titulo}</h2>
            <p className="texto-apoio mb-4">{descricao}</p>
            {secao === "equipes" && <EditorLista {...props("equipes")} protegidos={[EQUIPE_CAMPO]} dicaProtegido="Usada na aba Usuários de Campo — não pode ser removida nem renomeada." />}
            {secao === "funcoes" && <EditorLista {...props("funcoes")} />}
            {secao === "categorias_ocorrencia" && <EditorLista {...props("categorias_ocorrencia")} />}
            {secao === "tipos_recurso" && <EditorPares {...props("tipos_recurso")} fixos={TIPOS_RECURSO_FIXOS} rotuloChave="Código" uso={{ tabela: "recursos", coluna: "tipo" }} />}
            {secao === "unidades" && <EditorPares {...props("unidades")} rotuloChave="Código" uso={{ tabela: "recursos", coluna: "custo_unidade" }} />}
            {secao === "classificacoes_doc" && <EditorPares {...props("classificacoes_doc")} rotuloChave="Prefixo do arquivo" prefixo fixos={["DOC", "ATA_REUNIAO"]} />}
            {secao === "categorias_orcamento" && <CategoriasOrcamento />}
            {secao === "status_etapa" && <EditorStatusEtapa {...props("status_etapa")} />}
            {secao === "status_pi" && <EditorStatusPi {...props("status_pi")} />}
            {secao === "prazos" && <EditorPrazos {...props("prazos")} />}
            {secao === "feriados_extras" && <EditorFeriados {...props("feriados_extras")} />}
            {secao === "atalhos" && <Atalhos />}
          </section>
        </div>
      </div>
    </PainelShell>
  );
}

function Rodape({ alterado, salvando, onSalvar, onDescartar, personalizado, onRestaurar, extra }) {
  return (
    <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-line">
      {extra}
      {personalizado && <button onClick={onRestaurar} className="text-sm text-muted hover:text-red hover:underline mr-auto">Restaurar padrão do sistema</button>}
      <div className="flex gap-2 ml-auto">
        {alterado && <button onClick={onDescartar} className="btn btn-fantasma">Descartar</button>}
        <button onClick={onSalvar} disabled={!alterado || salvando} className="btn btn-primario">{salvando ? <><Spinner /> Salvando...</> : "Salvar alterações"}</button>
      </div>
    </div>
  );
}

// ---- lista simples de textos (equipes, funções, categorias) ----
function EditorLista({ chave, valor, personalizado, onSalvar, onRestaurar, protegidos = [], dicaProtegido }) {
  const { avisar } = useToast();
  const inicial = () => valor.map((v) => ({ id: Math.random().toString(36).slice(2), original: v, texto: v }));
  const [itens, setItens] = useState(inicial);
  const [novo, setNovo] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { setItens(inicial()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [JSON.stringify(valor)]);

  const textos = itens.map((i) => i.texto.trim());
  const alterado = JSON.stringify(textos) !== JSON.stringify(valor);
  const repetido = textos.find((t, i) => t && textos.findIndex((x) => x.toLowerCase() === t.toLowerCase()) !== i);
  const vazio = textos.some((t) => !t);
  const mover = (i, d) => setItens((p) => { const n = [...p]; const j = i + d; if (j < 0 || j >= n.length) return p; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const adicionar = () => { const t = novo.trim(); if (!t) return; setItens((p) => [...p, { id: Math.random().toString(36).slice(2), original: null, texto: t }]); setNovo(""); };
  const ordenarAZ = () => setItens((p) => [...p].sort((a, b) => a.texto.localeCompare(b.texto, "pt-BR")));

  const salvar = async () => {
    if (repetido || vazio) return;
    setSalvando(true);
    // 1º renomeia nos registros existentes; depois grava a lista
    const renomeados = itens.filter((i) => i.original && i.texto.trim() !== i.original);
    if (PROPAGA.includes(chave)) {
      for (const r of renomeados) {
        const { ok, json } = await chamarApi("/api/configuracoes", { acao: "renomear", lista: chave, de: r.original, para: r.texto.trim() });
        if (!ok) { avisar(json.error || "Falha ao renomear.", "erro", 7000); setSalvando(false); return; }
        if (json.total) avisar(`"${r.original}" → "${r.texto.trim()}": ${json.total} registro(s) atualizado(s).`, "info", 6000);
      }
    }
    const removidos = valor.filter((v) => !itens.some((i) => i.original === v));
    await onSalvar(chave, textos, [renomeados.length && `${renomeados.length} renomeado(s)`, removidos.length && `removido(s): ${removidos.join(", ")}`, textos.length - (valor.length - removidos.length) > 0 && "novo(s) item(ns)"].filter(Boolean).join(" · "));
    setSalvando(false);
  };

  return (
    <>
      {PROPAGA.includes(chave) && <Aviso tipo="info" className="mb-3">Renomear um item também atualiza os cadastros que já usam o nome antigo. Remover um item não apaga nada: quem já usa continua com o valor, marcado como “(antiga)”.</Aviso>}
      <div className="flex flex-col gap-1.5">
        {itens.map((it, i) => {
          const travado = protegidos.includes(it.original);
          return (
            <div key={it.id} className="flex items-center gap-2">
              <div className="flex flex-col">
                <button onClick={() => mover(i, -1)} disabled={i === 0} className="text-muteddim hover:text-cyan disabled:opacity-30 leading-none px-1" aria-label="Subir">▲</button>
                <button onClick={() => mover(i, 1)} disabled={i === itens.length - 1} className="text-muteddim hover:text-cyan disabled:opacity-30 leading-none px-1" aria-label="Descer">▼</button>
              </div>
              <input value={it.texto} disabled={travado} onChange={(e) => setItens((p) => p.map((x) => (x.id === it.id ? { ...x, texto: e.target.value } : x)))}
                className={`input !py-1.5 flex-1 ${it.original && it.texto.trim() !== it.original ? "!border-amber" : ""} ${!it.original ? "!border-green" : ""}`} title={travado ? dicaProtegido : undefined} />
              {it.original && it.texto.trim() !== it.original && <span className="text-xs text-amber whitespace-nowrap">era “{it.original}”</span>}
              {travado ? <span className="text-xs text-muteddim w-8 text-center" title={dicaProtegido}>🔒</span> : (
                <button onClick={() => setItens((p) => p.filter((x) => x.id !== it.id))} className="p-2 rounded-lg text-muteddim hover:text-red hover:bg-red/5" aria-label="Remover"><Icone nome="lixo" className="w-4 h-4" /></button>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 mt-3">
        <input value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && adicionar()} placeholder="Novo item..." className="input !py-1.5 flex-1" />
        <button onClick={adicionar} disabled={!novo.trim()} className="btn btn-contorno btn-sm"><Icone nome="mais2" className="w-4 h-4" /> Adicionar</button>
        <button onClick={ordenarAZ} className="btn btn-fantasma btn-sm">Ordenar A–Z</button>
      </div>
      {(repetido || vazio) && <div className="text-sm text-red mt-2">{repetido ? `"${repetido}" está repetido.` : "Há item vazio."}</div>}
      <Rodape alterado={alterado} salvando={salvando} onSalvar={salvar} onDescartar={() => setItens(inicial())} personalizado={personalizado} onRestaurar={onRestaurar} />
    </>
  );
}

// ---- pares [código, nome] (tipos de recurso, modos de apropriação, classificações) ----
function EditorPares({ chave, valor, personalizado, onSalvar, onRestaurar, fixos = [], rotuloChave, uso, prefixo }) {
  const { dados: registros } = useTabela(uso?.tabela || "configuracoes", uso ? { select: `id,${uso.coluna}` } : {});
  const emUso = (c) => uso && registros.filter((r) => r[uso.coluna] === c).length;
  const [itens, setItens] = useState(valor.map(([c, r]) => ({ c, r, existente: true })));
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { setItens(valor.map(([c, r]) => ({ c, r, existente: true }))); }, [JSON.stringify(valor)]); // eslint-disable-line react-hooks/exhaustive-deps
  const gerarCodigo = (nome) => {
    const base = String(nome).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
    return prefixo ? base.toUpperCase() : base.toLowerCase();
  };
  const final = itens.map((i) => [i.c || gerarCodigo(i.r), i.r.trim()]);
  const alterado = JSON.stringify(final) !== JSON.stringify(valor);
  const invalido = final.some(([c, r]) => !c || !r) || new Set(final.map(([c]) => c)).size !== final.length;

  const salvar = async () => {
    if (invalido) return;
    setSalvando(true);
    await onSalvar(chave, final);
    setSalvando(false);
  };

  return (
    <>
      <table className="w-full text-sm">
        <thead><tr className="text-left border-b border-line"><th className="py-2 titulo-secao w-56">{rotuloChave}</th><th className="py-2 titulo-secao">Nome exibido</th><th className="w-10" /></tr></thead>
        <tbody>
          {itens.map((it, i) => {
            const qtd = emUso(it.c);
            const travado = fixos.includes(it.c);
            return (
              <tr key={i} className="border-b border-line/60">
                <td className="py-1.5 pr-2">
                  {it.existente ? <span className="font-mono text-xs text-muted">{it.c}</span> : (
                    <input value={it.c} onChange={(e) => setItens((p) => p.map((x, k) => (k === i ? { ...x, c: prefixo ? e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") : e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") } : x)))}
                      placeholder={gerarCodigo(it.r) || "automático"} className="input !py-1.5 font-mono !text-xs" />
                  )}
                </td>
                <td className="py-1.5 pr-2"><input value={it.r} onChange={(e) => setItens((p) => p.map((x, k) => (k === i ? { ...x, r: e.target.value } : x)))} className="input !py-1.5" /></td>
                <td className="py-1.5 text-center">
                  {travado ? <span className="text-xs text-muteddim" title="Usado por regras do sistema — só o nome pode mudar">🔒</span>
                    : qtd ? <span className="text-xs text-muteddim" title={`Em uso por ${qtd} cadastro(s) — não pode ser removido`}>{qtd}×</span>
                    : <button onClick={() => setItens((p) => p.filter((_, k) => k !== i))} className="p-2 rounded-lg text-muteddim hover:text-red hover:bg-red/5" aria-label="Remover"><Icone nome="lixo" className="w-4 h-4" /></button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button onClick={() => setItens((p) => [...p, { c: "", r: "", existente: false }])} className="btn btn-contorno btn-sm mt-3"><Icone nome="mais2" className="w-4 h-4" /> Adicionar</button>
      {prefixo && <p className="texto-apoio mt-2">O prefixo vai no início do nome do arquivo (ex: CONTRATO_20261007_PI-123.pdf) e não muda depois de criado — só o nome exibido.</p>}
      {invalido && <div className="text-sm text-red mt-2">Preencha o nome de todos os itens e não repita códigos.</div>}
      <Rodape alterado={alterado} salvando={salvando} onSalvar={salvar} onDescartar={() => setItens(valor.map(([c, r]) => ({ c, r, existente: true })))} personalizado={personalizado} onRestaurar={onRestaurar} />
    </>
  );
}

function EditorStatusEtapa({ chave, valor, personalizado, onSalvar, onRestaurar }) {
  const [v, setV] = useState(valor);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { setV(valor); }, [JSON.stringify(valor)]); // eslint-disable-line react-hooks/exhaustive-deps
  const alterado = JSON.stringify(v) !== JSON.stringify(valor);
  return (
    <>
      <div className="flex flex-col gap-2">
        {Object.entries(v).map(([k, s]) => (
          <div key={k} className="flex items-center gap-3">
            <input type="color" value={s.barra} onChange={(e) => setV((p) => ({ ...p, [k]: { ...p[k], barra: e.target.value } }))} className="w-10 h-9 rounded border border-line cursor-pointer" aria-label="Cor da barra" />
            <input value={s.rotulo} onChange={(e) => setV((p) => ({ ...p, [k]: { ...p[k], rotulo: e.target.value } }))} className="input !py-1.5 max-w-xs" />
            <span className="font-mono text-xs text-muteddim">{k}</span>
            <span className="h-3 w-24 rounded" style={{ background: s.barra }} />
          </div>
        ))}
      </div>
      <Rodape alterado={alterado} salvando={salvando} onSalvar={async () => { setSalvando(true); await onSalvar(chave, v); setSalvando(false); }}
        onDescartar={() => setV(valor)} personalizado={personalizado} onRestaurar={onRestaurar} />
    </>
  );
}

function EditorStatusPi({ chave, valor, personalizado, onSalvar, onRestaurar }) {
  const [v, setV] = useState(valor);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { setV(valor); }, [JSON.stringify(valor)]); // eslint-disable-line react-hooks/exhaustive-deps
  const alterado = JSON.stringify(v) !== JSON.stringify(valor);
  return (
    <>
      <div className="flex flex-col gap-2">
        {Object.entries(v).map(([k, r]) => (
          <div key={k} className="flex items-center gap-3">
            <input value={r} onChange={(e) => setV((p) => ({ ...p, [k]: e.target.value }))} className="input !py-1.5 max-w-xs" />
            <span className="font-mono text-xs text-muteddim">{k}</span>
          </div>
        ))}
      </div>
      <Rodape alterado={alterado} salvando={salvando} onSalvar={async () => { setSalvando(true); await onSalvar(chave, v); setSalvando(false); }}
        onDescartar={() => setV(valor)} personalizado={personalizado} onRestaurar={onRestaurar} />
    </>
  );
}

function EditorPrazos({ chave, valor, personalizado, onSalvar, onRestaurar }) {
  const [v, setV] = useState(valor);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { setV(valor); }, [JSON.stringify(valor)]); // eslint-disable-line react-hooks/exhaustive-deps
  const alterado = JSON.stringify(v) !== JSON.stringify(valor);
  const invalido = !(v.urgente >= 0) || !(v.atencao > v.urgente) || !(v.medicoes > 0);
  const campo = (k, rotulo, dica) => (
    <label className="flex flex-wrap items-center gap-3">
      <input type="number" min="0" value={v[k]} onChange={(e) => setV((p) => ({ ...p, [k]: e.target.value === "" ? "" : Number(e.target.value) }))} className="input !py-1.5 !w-24" />
      <span className="text-sm"><strong>{rotulo}</strong> <span className="texto-apoio">{dica}</span></span>
    </label>
  );
  return (
    <>
      <div className="flex flex-col gap-3">
        {campo("urgente", "dias — urgente", "Linha do Tempo: contorno vermelho quando faltam até esses dias para o fim da etapa.")}
        {campo("atencao", "dias — atenção", "Linha do Tempo: contorno laranja (deve ser maior que o urgente).")}
        {campo("medicoes", "dias — medições próximas", "Dashboard: indicador e destaque das medições que vencem dentro desse prazo.")}
      </div>
      {invalido && <div className="text-sm text-red mt-2">Confira os valores: atenção precisa ser maior que urgente, e medições maior que zero.</div>}
      <Rodape alterado={alterado && !invalido} salvando={salvando} onSalvar={async () => { setSalvando(true); await onSalvar(chave, v); setSalvando(false); }}
        onDescartar={() => setV(valor)} personalizado={personalizado} onRestaurar={onRestaurar} />
    </>
  );
}

function EditorFeriados({ chave, valor, personalizado, onSalvar, onRestaurar }) {
  const [itens, setItens] = useState(valor);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { setItens(valor); }, [JSON.stringify(valor)]); // eslint-disable-line react-hooks/exhaustive-deps
  const alterado = JSON.stringify(itens) !== JSON.stringify(valor);
  const invalido = itens.some((f) => !f.nome?.trim() || !/^(\d{4}-)?\d{2}-\d{2}$/.test(f.data || ""));
  const mudar = (i, patch) => setItens((p) => p.map((f, k) => (k === i ? { ...f, ...patch } : f)));
  return (
    <>
      <p className="texto-apoio mb-3">Os feriados nacionais e o de SP (9 de julho) já são considerados. Inclua aqui os municipais ou da empresa. Marque “todo ano” para repetir a data anualmente.</p>
      {itens.length === 0 && <div className="text-sm text-muteddim mb-2">Nenhum feriado adicional.</div>}
      <div className="flex flex-col gap-2">
        {itens.map((f, i) => {
          const anual = /^\d{2}-\d{2}$/.test(f.data || "");
          const dataCompleta = anual ? `${new Date().getFullYear()}-${f.data}` : f.data || "";
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input type="date" value={dataCompleta} onChange={(e) => mudar(i, { data: anual ? e.target.value.slice(5) : e.target.value })} className="input !py-1.5 !w-44" />
              <label className="flex items-center gap-1.5 text-sm text-muted">
                <input type="checkbox" className="accent-cyan" checked={anual} onChange={(e) => mudar(i, { data: e.target.checked ? dataCompleta.slice(5) : `${new Date().getFullYear()}-${f.data}` })} /> todo ano
              </label>
              <input value={f.nome} onChange={(e) => mudar(i, { nome: e.target.value })} placeholder="Nome do feriado" className="input !py-1.5 flex-1 min-w-[180px]" />
              <button onClick={() => setItens((p) => p.filter((_, k) => k !== i))} className="p-2 rounded-lg text-muteddim hover:text-red hover:bg-red/5" aria-label="Remover"><Icone nome="lixo" className="w-4 h-4" /></button>
            </div>
          );
        })}
      </div>
      <button onClick={() => setItens((p) => [...p, { data: "", nome: "" }])} className="btn btn-contorno btn-sm mt-3"><Icone nome="mais2" className="w-4 h-4" /> Adicionar feriado</button>
      {invalido && <div className="text-sm text-red mt-2">Preencha data e nome de todos os feriados.</div>}
      <Rodape alterado={alterado && !invalido} salvando={salvando} onSalvar={async () => { setSalvando(true); await onSalvar(chave, itens); setSalvando(false); }}
        onDescartar={() => setItens(valor)} personalizado={personalizado} onRestaurar={onRestaurar} />
    </>
  );
}

function CategoriasOrcamento() {
  const { avisar } = useToast();
  const { dados: categorias, carregando, recarregar } = useTabela("categorias_orcamento", { order: { coluna: "ordem" } });
  const [editando, setEditando] = useState(null); // categoria em edição (ou nova)
  const [salvando, setSalvando] = useState(false);
  const GRUPOS = [["compra_reais", "Compra — Produto ou Serviço (R$)"], ["moi_horas", "MOI + Contric (horas)"]];

  const salvar = async () => {
    setSalvando(true);
    const { ok, json } = await chamarApi("/api/configuracoes", { acao: "categoria_salvar", categoria: editando });
    setSalvando(false);
    if (!ok) { avisar(json.error || "Não foi possível salvar.", "erro", 7000); return; }
    avisar("Categoria salva."); setEditando(null); recarregar();
  };
  const excluir = async (c) => {
    if (!window.confirm(`Excluir a categoria ${c.codigo} — ${c.nome}?`)) return;
    const { ok, json } = await chamarApi("/api/configuracoes", { acao: "categoria_excluir", id: c.id });
    if (!ok) { avisar(json.error || "Não foi possível excluir.", "erro", 8000); return; }
    avisar("Categoria excluída."); recarregar();
  };

  return (
    <>
      <p className="texto-apoio mb-3">Categorias com valores em algum PI não podem ser excluídas — desative para que deixem de aparecer na abertura de novos PIs (os PIs que já usam continuam mostrando).</p>
      {carregando && <Spinner className="w-5 h-5 text-cyan" />}
      {GRUPOS.map(([g, l]) => (
        <div key={g} className="mb-5">
          <div className="text-sm font-semibold text-cyan mb-1.5">{l}</div>
          <table className="w-full text-sm">
            <tbody>
              {categorias.filter((c) => c.grupo === g).map((c) => (
                <tr key={c.id} className={`border-b border-line/60 ${c.ativo === false ? "opacity-50" : ""}`}>
                  <td className="py-1.5 w-20 font-mono text-xs text-muted">{c.codigo}</td>
                  <td className="py-1.5">{c.nome}{c.ativo === false && <span className="selo bg-panel text-muted ml-2">desativada</span>}</td>
                  <td className="py-1.5 w-16 text-xs text-muteddim text-right">ordem {c.ordem ?? "—"}</td>
                  <td className="py-1.5 w-24 text-right whitespace-nowrap">
                    <button onClick={() => setEditando({ ...c })} className="btn btn-fantasma btn-sm">Editar</button>
                    <button onClick={() => excluir(c)} className="p-2 rounded-lg text-muteddim hover:text-red hover:bg-red/5" aria-label="Excluir"><Icone nome="lixo" className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {!editando && <button onClick={() => setEditando({ codigo: "", nome: "", grupo: "compra_reais", ordem: "", ativo: true })} className="btn btn-contorno btn-sm"><Icone nome="mais2" className="w-4 h-4" /> Nova categoria</button>}
      {editando && (
        <div className="rounded-xl border border-cyan/30 bg-cyan/5 p-3.5 grid grid-cols-1 sm:grid-cols-[100px_1fr_220px_90px] gap-2 items-end">
          <label className="block"><span className="rotulo">Código</span><input value={editando.codigo} onChange={(e) => setEditando((p) => ({ ...p, codigo: e.target.value.toUpperCase() }))} className="input !py-1.5 font-mono" /></label>
          <label className="block"><span className="rotulo">Nome</span><input value={editando.nome} onChange={(e) => setEditando((p) => ({ ...p, nome: e.target.value }))} className="input !py-1.5" /></label>
          <label className="block"><span className="rotulo">Grupo</span>
            <select value={editando.grupo} onChange={(e) => setEditando((p) => ({ ...p, grupo: e.target.value }))} className="input !py-1.5">{GRUPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
          <label className="block"><span className="rotulo">Ordem</span><input type="number" value={editando.ordem ?? ""} onChange={(e) => setEditando((p) => ({ ...p, ordem: e.target.value }))} className="input !py-1.5" /></label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="accent-cyan w-4 h-4" checked={editando.ativo !== false} onChange={(e) => setEditando((p) => ({ ...p, ativo: e.target.checked }))} /> Ativa (aparece na abertura de PI)</label>
          <div className="flex gap-2 justify-end sm:col-span-2">
            <button onClick={() => setEditando(null)} className="btn btn-fantasma">Cancelar</button>
            <button onClick={salvar} disabled={salvando || !editando.codigo.trim() || !editando.nome.trim()} className="btn btn-primario">{salvando ? <><Spinner /> Salvando...</> : "Salvar categoria"}</button>
          </div>
        </div>
      )}
    </>
  );
}

function Atalhos() {
  const itens = [
    ["/permissoes", "chave", "Permissões", "Matriz de permissões por perfil e exceções por usuário."],
    ["/recursos?aba=empresas", "predio", "Empresas terceiras", "Cadastro das empresas usadas em terceiros e recursos."],
    ["/usuarios", "usuarios", "Usuários e acessos", "Cadastro de usuários, inclusive em lote (Usuários de Campo)."],
    ["/clientes", "obra", "Clientes", "Acessos dos clientes ao portal."],
    ["/auditoria", "auditoria", "Auditoria", "Histórico de todas as alterações, inclusive destas configurações."],
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {itens.map(([href, icone, t, d]) => (
        <Link key={href} href={href} className="flex items-start gap-3 rounded-xl border border-line p-3 hover:border-cyan/40 hover:bg-cyan/5">
          <Icone nome={icone} className="w-5 h-5 text-cyan mt-0.5" />
          <span><span className="block font-semibold text-sm">{t}</span><span className="texto-apoio">{d}</span></span>
        </Link>
      ))}
    </div>
  );
}
