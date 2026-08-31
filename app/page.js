"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/AuthContext";

export default function Home() {
  const { sessao, carregando } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (carregando) return;
    router.replace(sessao ? "/dashboard" : "/login");
  }, [carregando, sessao, router]);

  return null;
}
