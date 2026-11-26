"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "./supabase";
import { horasDoLancamento } from "./horas";
import { MODELOS_CRONOGRAMA_PADRAO, etapasDoModelo } from "./constantes";

// Hook genérico: carrega uma tabela e mantém em tempo real (Supabase Realtime),
// então qualquer mudança feita em outro dispositivo aparece na hora, sem precisar
// recarregar a página nem esperar um "polling".
//
// `filtro` é um array de pares [coluna, valor] (ex: [["usuario_id", meuId]]) — não
// uma função — assim dá pra comparar com segurança entre renders.
//
// IMPORTANTE: `order` e `filtro` só entram nas dependências do useCallback/useEffect
// como STRING (orderChave/filtroChave), nunca como o objeto/array em si — chamadores
// costumam passar `{ order: { coluna: "x" } }` como literal novo a cada render, o que
// faria a referência mudar sempre e disparar um loop infinito de busca+re-render.

// Cada instância do hook precisa de um canal com nome ÚNICO. O supabase-js reaproveita
// um canal já existente quando o nome se repete, e chamar `.on()` num canal que já
// recebeu `.subscribe()` lança exceção — era isso que derrubava a tela quando a mesma
// tabela era usada duas vezes na página (ex: "pis" na tela de horas da equipe).
let contadorCanais = 0;

// Escopo de PIs do usuário logado: quando a permissão dele é "P" (só PIs em que está
// alocado), todas as listas carregadas por useTabela ficam restritas a esses PIs
// (a própria tabela "pis" e qualquer tabela com coluna pi_id). null = sem restrição.
let escopoPis = null;
export function definirEscopoPis(ids) { escopoPis = ids ? new Set(ids) : null; }
function aplicarEscopo(nomeTabela, linhas) {
  if (!escopoPis) return linhas;
  if (nomeTabela === "pis") return linhas.filter((l) => escopoPis.has(l.id));
  return linhas.filter((l) => !("pi_id" in l) || l.pi_id === null || escopoPis.has(l.pi_id));
}

// PIs sempre em ordem crescente do NÚMERO do PI (o banco ordena como texto: "100" vinha antes de "20")
export const compararPis = (a, b) => String(a.codigo || "").localeCompare(String(b.codigo || ""), "pt-BR", { numeric: true });

export function useTabela(nomeTabela, { select = "*", order = null, filtro = null } = {}) {
  const [dados, setDados] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const orderChave = order ? JSON.stringify(order) : "";
  const filtroChave = filtro ? JSON.stringify(filtro) : "";
  const requisicaoRef = useRef(0);

  const recarregar = useCallback(async () => {
    // se algum valor do filtro ainda não estiver disponível (ex: usuário carregando), espera
    if (filtro && filtro.some(([, valor]) => valor === undefined || valor === null)) return;
    const minhaRequisicao = ++requisicaoRef.current;
    // O Supabase devolve no MÁXIMO 1000 linhas por consulta. Sem paginar, tabelas que crescem
    // (horas, etapas, log, alocações) passariam a vir CORTADAS sem nenhum aviso — relatórios
    // com totais errados, etapas sumindo. Busca em páginas até acabar.
    const PAGINA = 1000, LIMITE_PAGINAS = 100;
    const montar = () => {
      let q = supabase.from(nomeTabela).select(select);
      if (filtro) filtro.forEach(([coluna, valor]) => { q = q.eq(coluna, valor); });
      if (order) q = q.order(order.coluna, { ascending: order.asc !== false });
      if (!order || order.coluna !== "id") q = q.order("id", { ascending: true }); // desempate estável entre páginas
      return q;
    };
    let data = [], error = null;
    for (let p = 0; p < LIMITE_PAGINAS; p++) {
      let r = await montar().range(p * PAGINA, (p + 1) * PAGINA - 1);
      // tabela sem coluna "id" (ou select sem ela): repete sem o desempate
      if (r.error && /\bid\b/.test(r.error.message || "") && p === 0) {
        let q = supabase.from(nomeTabela).select(select);
        if (filtro) filtro.forEach(([coluna, valor]) => { q = q.eq(coluna, valor); });
        if (order) q = q.order(order.coluna, { ascending: order.asc !== false });
        r = await q;
        if (r.error) { error = r.error; break; }
        data = r.data || []; break;
      }
      if (r.error) { error = r.error; break; }
      data = data.concat(r.data || []);
      if (!r.data || r.data.length < PAGINA) break;
      if (minhaRequisicao !== requisicaoRef.current) return;
    }
    // descarta respostas antigas que chegaram depois de uma mais nova
    if (minhaRequisicao !== requisicaoRef.current) return;
    if (error) setErro(error.message);
    else {
      setErro(null);
      const ordenarPorNumero = nomeTabela === "pis" && (!order || order.coluna === "codigo");
      const linhas = aplicarEscopo(nomeTabela, data || []);
      setDados(ordenarPorNumero ? [...linhas].sort(compararPis) : linhas);
    }
    setCarregando(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeTabela, select, orderChave, filtroChave]);

  const recarregarRef = useRef(recarregar);
  useEffect(() => { recarregarRef.current = recarregar; }, [recarregar]);

  // busca de novo sempre que a tabela, ordenação ou o filtro (por valor, não por
  // referência) mudarem de verdade
  useEffect(() => { recarregar(); }, [recarregar]);

  // assina tempo real uma vez por instância; usa sempre a versão mais atual de recarregar.
  // Rajadas de eventos (ex: reordenar 20 etapas) viram uma única recarga.
  useEffect(() => {
    let timer = null;
    const nomeCanal = `rt-${nomeTabela}-${++contadorCanais}-${Math.random().toString(36).slice(2, 8)}`;
    let canal = null;
    try {
      canal = supabase
        .channel(nomeCanal)
        .on("postgres_changes", { event: "*", schema: "public", table: nomeTabela }, () => {
          clearTimeout(timer);
          timer = setTimeout(() => recarregarRef.current(), 120);
        })
        .subscribe();
    } catch (e) {
      // tempo real é um "extra": se falhar, a tela continua funcionando com recarga manual
      console.warn("Realtime indisponível para", nomeTabela, e);
    }
    // reserva: ao voltar para a aba/app (celular dormindo, conexão caída) e quando o acesso
    // do usuário muda (permissões, alocações), busca de novo
    const aoVoltar = () => { if (document.visibilityState === "visible") { clearTimeout(timer); timer = setTimeout(() => recarregarRef.current(), 300); } };
    const aoMudarAcesso = () => recarregarRef.current();
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("sgo-acesso-mudou", aoMudarAcesso);
    return () => {
      clearTimeout(timer);
      if (canal) supabase.removeChannel(canal);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("sgo-acesso-mudou", aoMudarAcesso);
    };
  }, [nomeTabela]);

  return { dados, carregando, erro, recarregar };
}

export async function registrarLog(usuario, acao, detalhe) {
  try {
    await supabase.from("logs_auditoria").insert({
      usuario_id: usuario?.id || null,
      usuario_nome: usuario?.nome || "Desconhecido",
      acao,
      detalhe,
    });
  } catch {
    // log de auditoria nunca deve travar a ação principal
  }
}

// Envia o token do usuário logado para as rotas /api, que validam quem está chamando.
export async function chamarApi(caminho, corpo) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  let res;
  try {
    res = await fetch(caminho, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(corpo),
    });
  } catch {
    return { ok: false, json: { error: "Sem conexão com o servidor. Verifique a internet." } };
  }
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

// Grava (insert/update/upsert) tolerando colunas que o banco ainda não tem: se o Supabase
// responder "coluna não existe" (script SQL ainda não rodado), repete sem aquela coluna.
// Assim o trabalho de campo nunca trava por causa de uma função nova.
// `executar(linhas)` recebe os dados (objeto ou lista) e devolve a promise do supabase.
export async function gravarTolerante(dados, executar) {
  let atual = dados;
  const removidas = [];
  for (let tentativa = 0; tentativa < 8; tentativa++) {
    const resposta = await executar(atual);
    const msg = resposta.error?.message || "";
    const m = msg.match(/'([a-z0-9_]+)' column/i) || msg.match(/column "?([a-z0-9_]+)"? (of relation .* )?does not exist/i);
    if (!resposta.error || !m) return { ...resposta, colunasIgnoradas: removidas };
    const coluna = m[1];
    const tira = (o) => { const { [coluna]: _fora, ...resto } = o; return resto; };
    const semColuna = Array.isArray(atual) ? atual.map(tira) : tira(atual);
    if (JSON.stringify(semColuna) === JSON.stringify(atual)) return { ...resposta, colunasIgnoradas: removidas };
    removidas.push(coluna);
    atual = semColuna;
  }
  return { error: { message: "Não foi possível gravar." }, colunasIgnoradas: removidas };
}

// registra que o usuário abriu estes documentos (caminhos no bucket "documentos")
export async function marcarDocumentosLidos(usuario, caminhos) {
  if (!usuario?.id || !caminhos?.length) return { error: null };
  const linhas = caminhos.map((caminho) => ({ usuario_id: usuario.id, caminho, lido_em: new Date().toISOString() }));
  return supabase.from("documentos_lidos").upsert(linhas, { onConflict: "usuario_id,caminho" });
}

// ---------------- obras do usuário (antes em lib/minhasPis.js) ----------------
// PIs em que o usuário está alocado (via recurso vinculado a ele).
// Antes ficava exportado de app/lider/page.js — páginas do Next só devem exportar o
// componente da página, então isso agora mora aqui.
export function useMinhasPis(usuario) {
  const { dados: recursos, carregando: c1 } = useTabela("recursos");
  const { dados: alocacoes, carregando: c2 } = useTabela("alocacoes_recurso");
  const { dados: pis, carregando: c3 } = useTabela("pis");

  const meusPis = useMemo(() => {
    const meusRecursos = recursos.filter((r) => r.usuario_id === usuario?.id).map((r) => r.id);
    if (meusRecursos.length === 0) return [];
    const idsPis = new Set(alocacoes.filter((a) => meusRecursos.includes(a.recurso_id)).map((a) => a.pi_id));
    // contrato: alocado no PI Pai = disponível em todas as obras (filhos). Horas e RDO são sempre
    // nas obras, então o PI Pai (que só consolida) sai da lista.
    const ehPai = (id) => pis.some((p) => p.pi_pai_id === id);
    pis.forEach((p) => { if (p.pi_pai_id && idsPis.has(p.pi_pai_id)) idsPis.add(p.id); });
    return pis
      .filter((p) => idsPis.has(p.id) && !ehPai(p.id) && p.status !== "cancelado" && p.status !== "concluido")
      .sort((a, b) => (a.codigo || "").localeCompare(b.codigo || ""));
  }, [recursos, alocacoes, pis, usuario?.id]);

  return { meusPis, todosPis: pis, carregando: c1 || c2 || c3 };
}

// ---------------- financeiro do PI (orçado × realizado por grupo) ----------------
// grupo: "compra_reais" | "moi_horas". Horas realizadas = ajuste manual (valor_realizado) +
// horas classificadas nos lançamentos (não reprovados) — mesma regra do Relatório.
// ids: contrato (PI Pai) → os PIs das obras; o resultado é a SOMA de todas as obras
export function useFinanceiroPi(pi, ids = null) {
  const varios = Array.isArray(ids) && ids.length > 0;
  const conjunto = useMemo(() => new Set(varios ? ids : []), [varios ? ids.join(",") : ""]); // eslint-disable-line react-hooks/exhaustive-deps
  const { dados: itensBrutos, carregando } = useTabela("orcamento_pi_item", { filtro: varios ? null : [["pi_id", pi?.id]] });
  const { dados: categorias } = useTabela("categorias_orcamento", { order: { coluna: "ordem" } });
  const { dados: apontBrutos } = useTabela("apontamentos_horas", { filtro: varios ? null : [["pi_id", pi?.id]] });
  const itens = useMemo(() => {
    if (!varios) return itensBrutos;
    const m = {};
    itensBrutos.filter((i) => conjunto.has(i.pi_id)).forEach((i) => {
      const a = (m[i.categoria_id] ||= { categoria_id: i.categoria_id, valor_orcado: 0, valor_realizado: null });
      a.valor_orcado += Number(i.valor_orcado) || 0;
      if (i.valor_realizado != null) a.valor_realizado = (a.valor_realizado || 0) + (Number(i.valor_realizado) || 0);
    });
    return Object.values(m);
  }, [itensBrutos, conjunto, varios]);
  const apontamentos = useMemo(() => (varios ? apontBrutos.filter((l) => conjunto.has(l.pi_id)) : apontBrutos), [apontBrutos, conjunto, varios]);
  const apontado = useMemo(() => {
    const a = {};
    apontamentos.filter((l) => l.status !== "rejeitado").forEach((l) => {
      const h = horasDoLancamento(l);
      if (l.categoria_normal_id) a[l.categoria_normal_id] = (a[l.categoria_normal_id] || 0) + h.normais;
      if (l.categoria_extra_id) a[l.categoria_extra_id] = (a[l.categoria_extra_id] || 0) + h.extras;
    });
    return a;
  }, [apontamentos]);
  const grupo = (g) => categorias.filter((c) => c.grupo === g).map((c) => {
    const base = itens.find((i) => i.categoria_id === c.id);
    const ap = g === "moi_horas" ? apontado[c.id] || 0 : 0;
    const it = base || ap ? { valor_orcado: base?.valor_orcado, valor_realizado: base?.valor_realizado == null && !ap ? null : (Number(base?.valor_realizado) || 0) + ap } : null;
    return { c, it };
  }).filter(({ it }) => it && (Number(it.valor_orcado) || Number(it.valor_realizado)));
  const soma = (l, campo) => l.reduce((s, { it }) => s + Number(it[campo] || 0), 0);
  return { grupo, soma, carregando };
}
// % consumido = realizado ÷ orçado do grupo (null sem orçado)
export function consumo(fin, g) {
  const l = fin.grupo(g), orc = fin.soma(l, "valor_orcado");
  return orc ? Math.round((fin.soma(l, "valor_realizado") / orc) * 100) : null;
}

// ---------------- modelos de cronograma ----------------
// lista de modelos = prontos do sistema + os salvos pelos usuários (Configurações → "modelos_cronograma")
export function useModelosCronograma() {
  const { dados, recarregar } = useTabela("configuracoes", { filtro: [["chave", "modelos_cronograma"]] });
  const proprios = Array.isArray(dados[0]?.valor) ? dados[0].valor : [];
  return { modelos: [...proprios.map((m) => ({ ...m, proprio: true })), ...MODELOS_CRONOGRAMA_PADRAO], proprios, recarregar };
}
// cria as etapas do modelo no PI (depois das macro-etapas que já existirem).
// dependencias = true: cada etapa de trabalho passa a depender da anterior (sequência).
export async function aplicarModeloNoPi(piId, modelo, inicioIso, { dependencias = false } = {}) {
  const linhas = etapasDoModelo(modelo, inicioIso);
  const { data: existentes } = await supabase.from("etapas").select("ordem").eq("pi_id", piId).is("parent_etapa_id", null);
  const base = (existentes || []).length ? Math.max(...existentes.map((e) => e.ordem ?? 0)) + 1 : 0;
  const ids = {};
  const novaLinha = (l, pai) => ({ pi_id: piId, parent_etapa_id: pai, tipo: "campo", nome: l.nome, ordem: pai ? l.ordem : base + l.ordem,
    data_prevista_inicio: l.inicio, data_prevista_fim: l.fim, status: "nao_iniciada", percentual: 0 });
  const macros = linhas.filter((l) => !l.paiRef);
  const { data: criadasM, error: e1 } = await supabase.from("etapas").insert(macros.map((l) => novaLinha(l, null))).select("id");
  if (e1) return { erro: e1.message };
  macros.forEach((l, i) => { ids[l.ref] = criadasM[i].id; });
  const subs = linhas.filter((l) => l.paiRef);
  if (subs.length) {
    const { data: criadasS, error: e2 } = await supabase.from("etapas").insert(subs.map((l) => novaLinha(l, ids[l.paiRef]))).select("id");
    if (e2) return { erro: e2.message };
    subs.forEach((l, i) => { ids[l.ref] = criadasS[i].id; });
  }
  if (dependencias) {
    // etapas de trabalho em ordem (macro sem sub conta como etapa de trabalho)
    const trabalho = linhas.filter((l) => l.paiRef || !linhas.some((s) => s.paiRef === l.ref));
    const deps = trabalho.slice(1).map((l, i) => ({ etapa_id: ids[l.ref], depende_de_etapa_id: ids[trabalho[i].ref] }));
    if (deps.length) await supabase.from("etapa_dependencias").insert(deps);
  }
  return { criadas: Object.keys(ids).length };
}

export function agruparPorCliente(pis) {
  const grupos = {};
  pis.forEach((pi) => {
    const chave = pi.cliente || "Sem cliente";
    (grupos[chave] = grupos[chave] || []).push(pi);
  });
  return Object.entries(grupos).sort(([a], [b]) => a.localeCompare(b));
}

// Localiza uma obra pelo texto digitado ou lido no QR Code.
// Prioriza correspondência exata; só aceita correspondência parcial se for única.
export function encontrarPiPorCodigo(pis, texto) {
  const termo = String(texto || "").trim().toLowerCase();
  if (!termo) return null;
  const normalizar = (s) => String(s || "").toLowerCase().replace(/[\s_-]/g, "");
  const exato = pis.find((p) => (p.codigo || "").toLowerCase() === termo) || pis.find((p) => normalizar(p.codigo) === normalizar(termo));
  if (exato) return exato;
  // QR pode conter um link com o id ou o código da obra
  const porId = pis.find((p) => termo.includes(String(p.id).toLowerCase()));
  if (porId) return porId;
  const parciais = pis.filter((p) => normalizar(p.codigo).includes(normalizar(termo)));
  return parciais.length === 1 ? parciais[0] : null;
}
