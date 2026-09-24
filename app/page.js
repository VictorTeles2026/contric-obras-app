"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/AuthContext";
import { rotaInicialPara } from "../lib/rotas";
import { TelaCarregando } from "../components/ui";
import TelaAcessoNegado from "../components/TelaAcessoNegado";

export default function Home() {
  const { sessao, usuario, carregando, erroCadastro, sair } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (carregando) return;
    if (!sessao) { router.replace("/login"); return; }
    if (usuario) router.replace(rotaInicialPara(usuario));
  }, [carregando, sessao, usuario, router]);

  // antes retornava null sempre — se o login não tivesse cadastro, a tela ficava branca
  if (!carregando && sessao && !usuario) return <TelaAcessoNegado mensagem={erroCadastro} onSair={sair} />;
  return <TelaCarregando />;
}
