"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "./supabase";
import { definirEscopoPis } from "./dados";
import { emailAuthDe } from "./login";
import { resolverPermissoes, pode, valorPermissao } from "./permissoes";

// carrega a matriz do perfil + exceções do usuário; sem as tabelas (script não rodado) usa o padrão
async function carregarPermissoes(u) {
  const [{ data: doPerfil, error: e1 }, { data: excecoes }] = await Promise.all([
    supabase.from("permissoes_perfil").select("codigo, valor").eq("perfil", u.perfil),
    supabase.from("permissoes_usuario").select("codigo, valor, valido_ate").eq("usuario_id", u.id),
  ]);
  return resolverPermissoes(u.perfil, e1 ? null : doPerfil, excecoes || []);
}
// PIs em que o usuário está alocado (via recurso vinculado a ele)
async function pisAlocados(usuarioId) {
  const { data: recs } = await supabase.from("recursos").select("id").eq("usuario_id", usuarioId);
  const ids = (recs || []).map((r) => r.id);
  if (!ids.length) return [];
  const { data: alocs } = await supabase.from("alocacoes_recurso").select("pi_id").in("recurso_id", ids);
  return [...new Set((alocs || []).map((a) => a.pi_id))];
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(null);
  const [usuario, setUsuario] = useState(null); // linha da tabela `usuarios`
  // só fica false depois de saber a sessão E (se houver sessão) o cadastro do usuário —
  // antes, as telas renderizavam com usuario=null por um instante (tela em branco,
  // redirecionamento errado e "piscada" do painel desktop para quem é da obra)
  const [carregando, setCarregando] = useState(true);
  const [erroCadastro, setErroCadastro] = useState(null);
  const ultimoAuthIdRef = useRef(null);

  const buscarUsuario = useCallback(async (authUserId) => {
    if (!authUserId) { setUsuario(null); setErroCadastro(null); return; }
    const { data, error } = await supabase
      .from("usuarios")
      .select("*")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (error) { setErroCadastro("Não foi possível carregar seu cadastro. Verifique a conexão."); return; }
    if (!data) {
      // não é funcionário: pode ser um CLIENTE do portal (o servidor confirma)
      let motivo = "";
      try {
        const { data: s } = await supabase.auth.getSession();
        const r = await fetch("/api/cliente?resumo=1", { headers: { Authorization: `Bearer ${s.session?.access_token}` } });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.cliente) { setErroCadastro(null); setUsuario(j.cliente); return; }
        // mostra o motivo real (ex: servidor sem chave configurada, cliente desativado)
        if (r.status !== 403) motivo = j.error || `erro ${r.status}`;
      } catch (e) { motivo = e.message; }
      setUsuario(null);
      setErroCadastro(motivo ? `Não foi possível verificar seu acesso (${motivo}).` : "Seu login não está vinculado a nenhum cadastro ativo. Fale com a Contric.");
      return;
    }
    if (data.ativo === false) { setUsuario(null); setErroCadastro("Seu acesso está desabilitado. Fale com o administrador."); return; }
    const permissoes = await carregarPermissoes(data);
    const completo = { ...data, permissoes };
    // quem não vê todos os PIs ("P" ou "N" em pi.ver) só enxerga os PIs em que está alocado
    definirEscopoPis(valorPermissao(completo, "pi.ver") === "S" ? null : await pisAlocados(data.id));
    setErroCadastro(null);
    setUsuario(completo);
  }, []);

  useEffect(() => {
    let ativo = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!ativo) return;
      setSessao(data.session);
      if (data.session) {
        ultimoAuthIdRef.current = data.session.user.id;
        await buscarUsuario(data.session.user.id);
      }
      if (ativo) setCarregando(false);
    }).catch(() => { if (ativo) setCarregando(false); });

    const { data: listener } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setSessao(novaSessao);
      const novoId = novaSessao?.user?.id || null;
      // TOKEN_REFRESHED dispara a cada ~1h: não precisa buscar o cadastro de novo
      if (novoId === ultimoAuthIdRef.current) return;
      ultimoAuthIdRef.current = novoId;
      if (novoId) {
        // o callback do Supabase não pode ficar esperando outra chamada ao Supabase
        // (trava o cliente), então a busca roda fora dele
        setTimeout(() => { buscarUsuario(novoId); }, 0);
      } else {
        setUsuario(null);
        setErroCadastro(null);
      }
    });

    return () => { ativo = false; listener.subscription.unsubscribe(); };
  }, [buscarUsuario]);

  const entrar = async (email, senha) => {
    // aceita e-mail ou nome de usuário (ex: "joao.silva" → e-mail interno do login)
    const { data, error } = await supabase.auth.signInWithPassword({ email: emailAuthDe(email), password: senha });
    if (!error && data?.session) {
      ultimoAuthIdRef.current = data.session.user.id;
      setSessao(data.session);
      await buscarUsuario(data.session.user.id);
    }
    return error;
  };

  const sair = async (destino) => {
    const eraCliente = destino === "/acesso-clientes" || usuario?.perfil === "cliente";
    definirEscopoPis(null);
    await supabase.auth.signOut();
    ultimoAuthIdRef.current = null;
    setSessao(null);
    setUsuario(null);
    if (typeof window !== "undefined") window.location.href = eraCliente ? "/acesso-clientes" : "/login";
  };

  const recarregarUsuario = () => sessao && buscarUsuario(sessao.user.id);

  return (
    <AuthContext.Provider value={{ sessao, usuario, carregando, erroCadastro, entrar, sair, recarregarUsuario }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export const PERFIS_COM_ALOCACAO = ["lider", "funcionario", "terceiro"];
export const PERFIS_ACESSO_COMPLETO = ["master", "gerente", "coordenador"];
export const PERFIS_MAO_DE_OBRA = ["lider", "funcionario", "terceiro"];

export const ROTULO_PERFIL = {
  master: "Master", gerente: "Gerente de Obras", coordenador: "Coordenador",
  lider: "Líder Local", funcionario: "Funcionário", terceiro: "Terceiro", visualizador: "Visualizador", cliente: "Cliente",
};

// atalho histórico: "pode editar o planejamento" (cronograma/etapas)
export function podeEditar(usuario) {
  return pode(usuario, "etapa.editar");
}
export { pode };
// perfis "mão de obra" (líder, funcionário, terceiro) ficam restritos à versão mobile;
// master/gerente/coordenador/visualizador continuam com acesso ao painel desktop
// (visualizador só não edita nada, por causa de podeEditar acima)
// lista fechada (e não "todos menos a mão de obra"): cliente do portal nunca entra no painel
export const PERFIS_PAINEL = ["master", "gerente", "coordenador", "visualizador"];
export function podeAcessarDesktop(usuario) {
  return !!usuario && usuario.perfil !== "cliente" && pode(usuario, "acesso.painel");
}
export function podeGerenciarClientes(usuario) {
  return pode(usuario, "cliente.gerenciar");
}
export function podeGerenciarUsuarios(usuario) {
  return pode(usuario, "usuario.editar");
}
