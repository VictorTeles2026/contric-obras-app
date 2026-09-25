"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "./supabase";

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
      try {
        const { data: s } = await supabase.auth.getSession();
        const r = await fetch("/api/cliente?resumo=1", { headers: { Authorization: `Bearer ${s.session?.access_token}` } });
        if (r.ok) { const j = await r.json(); setErroCadastro(null); setUsuario(j.cliente); return; }
      } catch { /* segue para a mensagem abaixo */ }
      setUsuario(null); setErroCadastro("Seu login não está vinculado a nenhum cadastro. Fale com o administrador."); return;
    }
    if (data.ativo === false) { setUsuario(null); setErroCadastro("Seu acesso está desabilitado. Fale com o administrador."); return; }
    setErroCadastro(null);
    setUsuario(data);
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
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (!error && data?.session) {
      ultimoAuthIdRef.current = data.session.user.id;
      setSessao(data.session);
      await buscarUsuario(data.session.user.id);
    }
    return error;
  };

  const sair = async () => {
    const eraCliente = usuario?.perfil === "cliente";
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

export function podeEditar(usuario) {
  return !!usuario && PERFIS_ACESSO_COMPLETO.includes(usuario.perfil);
}
// perfis "mão de obra" (líder, funcionário, terceiro) ficam restritos à versão mobile;
// master/gerente/coordenador/visualizador continuam com acesso ao painel desktop
// (visualizador só não edita nada, por causa de podeEditar acima)
// lista fechada (e não "todos menos a mão de obra"): cliente do portal nunca entra no painel
export const PERFIS_PAINEL = ["master", "gerente", "coordenador", "visualizador"];
export function podeAcessarDesktop(usuario) {
  return !!usuario && PERFIS_PAINEL.includes(usuario.perfil);
}
export function podeGerenciarClientes(usuario) {
  return ["master", "gerente", "coordenador"].includes(usuario?.perfil);
}
export function podeGerenciarUsuarios(usuario) {
  return usuario?.perfil === "master";
}
