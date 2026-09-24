"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "./supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(null);
  const [usuario, setUsuario] = useState(null); // linha da tabela `usuarios`
  const [carregando, setCarregando] = useState(true);

  const buscarUsuario = useCallback(async (authUserId) => {
    if (!authUserId) { setUsuario(null); return; }
    const { data, error } = await supabase
      .from("usuarios")
      .select("*")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (!error) setUsuario(data);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session);
      if (data.session) buscarUsuario(data.session.user.id);
      setCarregando(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setSessao(novaSessao);
      if (novaSessao) buscarUsuario(novaSessao.user.id);
      else setUsuario(null);
    });

    return () => listener.subscription.unsubscribe();
  }, [buscarUsuario]);

  const entrar = async (email, senha) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    return error;
  };

  const sair = async () => {
    await supabase.auth.signOut();
  };

  const recarregarUsuario = () => sessao && buscarUsuario(sessao.user.id);

  return (
    <AuthContext.Provider value={{ sessao, usuario, carregando, entrar, sair, recarregarUsuario }}>
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

export function podeEditar(usuario) {
  return !!usuario && PERFIS_ACESSO_COMPLETO.includes(usuario.perfil);
}
// perfis "mão de obra" (líder, funcionário, terceiro) ficam restritos à versão mobile;
// master/gerente/coordenador/visualizador continuam com acesso ao painel desktop
// (visualizador só não edita nada, por causa de podeEditar acima)
export function podeAcessarDesktop(usuario) {
  return !!usuario && !PERFIS_MAO_DE_OBRA.includes(usuario.perfil);
}
export function podeGerenciarUsuarios(usuario) {
  return usuario?.perfil === "master";
}
