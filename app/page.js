"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/AuthContext";
import { rotaInicialPara } from "../lib/rotas";

export default function Home() {
  const { sessao, usuario, carregando } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (carregando) return;
    if (!sessao) { router.replace("/login"); return; }
    if (usuario) router.replace(rotaInicialPara(usuario));
  }, [carregando, sessao, usuario, router]);

  return null;
}
