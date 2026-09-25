"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "./supabase";

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
    let query = supabase.from(nomeTabela).select(select);
    if (filtro) filtro.forEach(([coluna, valor]) => { query = query.eq(coluna, valor); });
    if (order) query = query.order(order.coluna, { ascending: order.asc !== false });
    const { data, error } = await query;
    // descarta respostas antigas que chegaram depois de uma mais nova
    if (minhaRequisicao !== requisicaoRef.current) return;
    if (error) setErro(error.message);
    else { setErro(null); setDados(data || []); }
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
    return () => {
      clearTimeout(timer);
      if (canal) supabase.removeChannel(canal);
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