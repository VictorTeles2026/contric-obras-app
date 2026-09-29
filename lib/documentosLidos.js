"use client";

import { supabase } from "./supabase";

// registra que o usuário abriu estes documentos (caminhos no bucket "documentos")
export async function marcarDocumentosLidos(usuario, caminhos) {
  if (!usuario?.id || !caminhos?.length) return { error: null };
  const linhas = caminhos.map((caminho) => ({ usuario_id: usuario.id, caminho, lido_em: new Date().toISOString() }));
  return supabase.from("documentos_lidos").upsert(linhas, { onConflict: "usuario_id,caminho" });
}
