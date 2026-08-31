import { createClient } from "@supabase/supabase-js";

// ATENÇÃO: este cliente usa a service_role key (acesso total, ignora RLS).
// Só pode ser importado em código que roda no SERVIDOR (rotas /api/*),
// nunca em componentes "use client". A chave nunca é enviada ao navegador
// porque não tem o prefixo NEXT_PUBLIC_.
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
