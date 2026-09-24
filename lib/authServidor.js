import { NextResponse } from "next/server";
import { supabaseAdmin } from "./supabaseAdmin";

// Garante que quem chama a rota /api é um usuário logado, ativo e com perfil Master.
// Sem isso, qualquer pessoa na internet poderia criar/alterar usuários, porque as
// rotas usam a service_role key (que ignora RLS).
export async function exigirMaster(req) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { resposta: NextResponse.json({ error: "Servidor sem SUPABASE_SERVICE_ROLE_KEY configurada." }, { status: 500 }) };
  }
  const cabecalho = req.headers.get("authorization") || "";
  const token = cabecalho.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { resposta: NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 }) };
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    return { resposta: NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 }) };
  }

  const { data: solicitante } = await admin
    .from("usuarios")
    .select("id, nome, perfil, ativo")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  if (!solicitante || solicitante.perfil !== "master" || solicitante.ativo === false) {
    return { resposta: NextResponse.json({ error: "Somente o Master pode gerenciar usuários." }, { status: 403 }) };
  }

  return { admin, solicitante };
}

export const PERFIS_VALIDOS = ["master", "gerente", "coordenador", "lider", "funcionario", "terceiro", "visualizador"];

export async function gerarPinUnico(admin) {
  for (let i = 0; i < 10; i++) {
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    const { data } = await admin.from("usuarios").select("id").eq("pin", pin).maybeSingle();
    if (!data) return pin;
  }
  return String(Math.floor(100000 + Math.random() * 900000));
}
