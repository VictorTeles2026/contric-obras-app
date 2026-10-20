"use client";

import { supabase } from "./supabase";
import { chamarApi } from "./dados";

// pede ao servidor para enviar os e-mails da fila (agrupa várias notificações seguidas num só pedido)
let timerDespacho = null;
function despacharEmails() {
  clearTimeout(timerDespacho);
  timerDespacho = setTimeout(() => { chamarApi("/api/alertas", { acao: "despachar" }).catch(() => {}); }, 1500);
}

// Avisa um usuário: aparece no sininho e, conforme as preferências dele, também por e-mail.
// tipo: "decisoes" | "aprovacoes" | "prazos" (Configurações → Alertas). Nunca trava a ação principal.
export async function notificar(usuarioId, titulo, mensagem, link = null, tipo = "decisoes") {
  if (!usuarioId) return;
  try {
    let { error } = await supabase.from("notificacoes").insert({ usuario_id: usuarioId, titulo, mensagem, link, tipo });
    // banco ainda sem a coluna "tipo" (script alertas-email.sql): grava sem ela
    if (error && /tipo/.test(error.message)) ({ error } = await supabase.from("notificacoes").insert({ usuario_id: usuarioId, titulo, mensagem, link }));
    if (!error) despacharEmails();
  } catch {
    // tabela ainda não criada (script documentos-notificacoes.sql) — segue sem avisar
  }
}

// avisa os clientes do portal com acesso ao PI (ata, rdo, ocorrencia, linha_tempo, documento)
export function avisarClientes(dados) {
  return chamarApi("/api/alertas", { acao: "cliente", ...dados }).catch(() => {});
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
