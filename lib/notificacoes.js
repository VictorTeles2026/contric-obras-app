"use client";

import { supabase } from "./supabase";

// Avisa um usuário (aparece no sininho do app). Nunca trava a ação principal.
export async function notificar(usuarioId, titulo, mensagem, link = null) {
  if (!usuarioId) return;
  try {
    await supabase.from("notificacoes").insert({ usuario_id: usuarioId, titulo, mensagem, link });
  } catch {
    // tabela ainda não criada (script documentos-notificacoes.sql) — segue sem avisar
  }
}

// Lista legível do que mudou entre dois objetos: [["Data", "23/09 → 24/09"], ...]
export function descreverMudancas(campos, antes, depois) {
  return campos
    .filter(({ chave, formatar }) => {
      const f = formatar || ((v) => (v === null || v === undefined || v === "" ? "—" : String(v)));
      return f(antes?.[chave]) !== f(depois?.[chave]);
    })
    .map(({ chave, rotulo, formatar }) => {
      const f = formatar || ((v) => (v === null || v === undefined || v === "" ? "—" : String(v)));
      return `${rotulo}: ${f(antes?.[chave])} → ${f(depois?.[chave])}`;
    });
}
