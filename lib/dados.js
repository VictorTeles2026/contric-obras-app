"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "./supabase";

// Hook genérico: carrega uma tabela e mantém em tempo real (Supabase Realtime),
// então qualquer mudança feita em outro dispositivo aparece na hora, sem precisar
// recarregar a página nem esperar um "polling".
//
// `filtro` é um array de pares [coluna, valor] (ex: [["usuario_id", meuId]]) — não
// uma função — assim dá pra comparar com segurança entre renders (funções inline
// mudam de referência a cada render, o que quebraria a re-busca quando o valor do
// filtro depende de algo que carrega depois, como o usuário logado).
export function useTabela(nomeTabela, { select = "*", order = null, filtro = null } = {}) {
  const [dados, setDados] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const filtroChave = filtro ? JSON.stringify(filtro) : "";

  const recarregar = useCallback(async () => {
    // se algum valor do filtro ainda não estiver disponível (ex: usuário carregando), espera
    if (filtro && filtro.some(([, valor]) => valor === undefined)) return;
    let query = supabase.from(nomeTabela).select(select);
    if (filtro) filtro.forEach(([coluna, valor]) => { query = query.eq(coluna, valor); });
    if (order) query = query.order(order.coluna, { ascending: order.asc !== false });
    const { data, error } = await query;
    if (!error) setDados(data || []);
    setCarregando(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeTabela, select, order, filtroChave]);

  const recarregarRef = useRef(recarregar);
  useEffect(() => { recarregarRef.current = recarregar; }, [recarregar]);

  // busca de novo sempre que a tabela, ordenação ou o filtro (por valor) mudarem
  useEffect(() => { recarregar(); }, [recarregar]);

  // assina tempo real uma vez por tabela; usa sempre a versão mais atual de recarregar
  useEffect(() => {
    const canal = supabase
      .channel(`realtime:${nomeTabela}`)
      .on("postgres_changes", { event: "*", schema: "public", table: nomeTabela }, () => {
        recarregarRef.current();
      })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [nomeTabela]);

  return { dados, carregando, recarregar };
}

export async function registrarLog(usuario, acao, detalhe) {
  await supabase.from("logs_auditoria").insert({
    usuario_id: usuario?.id || null,
    usuario_nome: usuario?.nome || "Desconhecido",
    acao,
    detalhe,
  });
}
