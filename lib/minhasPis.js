"use client";

import { useMemo } from "react";
import { useTabela } from "./dados";

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
    return pis
      .filter((p) => idsPis.has(p.id) && p.status !== "cancelado" && p.status !== "concluido")
      .sort((a, b) => (a.codigo || "").localeCompare(b.codigo || ""));
  }, [recursos, alocacoes, pis, usuario?.id]);

  return { meusPis, todosPis: pis, carregando: c1 || c2 || c3 };
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
