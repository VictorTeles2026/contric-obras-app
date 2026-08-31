"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabase";

// Hook genérico: carrega uma tabela e mantém em tempo real (Supabase Realtime),
// então qualquer mudança feita em outro dispositivo aparece na hora, sem precisar
// recarregar a página nem esperar um "polling".
export function useTabela(nomeTabela, { select = "*", order = null, filtro = null } = {}) {
  const [dados, setDados] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    let query = supabase.from(nomeTabela).select(select);
    if (filtro) query = filtro(query);
    if (order) query = query.order(order.coluna, { ascending: order.asc !== false });
    const { data, error } = await query;
    if (!error) setDados(data || []);
    setCarregando(false);
  }, [nomeTabela, select, order, filtro]);

  useEffect(() => {
    recarregar();
    const canal = supabase
      .channel(`realtime:${nomeTabela}`)
      .on("postgres_changes", { event: "*", schema: "public", table: nomeTabela }, () => {
        recarregar();
      })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
