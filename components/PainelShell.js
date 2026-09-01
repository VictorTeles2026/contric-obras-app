"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "../lib/AuthContext";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/cronograma", label: "Cronograma" },
  { href: "/linha-do-tempo", label: "Linha do Tempo" },
  { href: "/recursos", label: "Recursos" },
  { href: "/utilizacao-recursos", label: "Utilização" },
  { href: "/rdo", label: "RDO" },
  { href: "/aprovacoes", label: "Aprovações" },
  { href: "/historico", label: "Histórico" },
  { href: "/auditoria", label: "Auditoria" },
  { href: "/usuarios", label: "Usuários" },
];

export default function PainelShell({ children }) {
  const { sessao, usuario, carregando, sair } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!carregando && !sessao) router.replace("/login");
  }, [carregando, sessao, router]);

  if (carregando) {
    return <div className="min-h-screen flex items-center justify-center text-muted text-sm">Carregando...</div>;
  }
  if (!sessao) return null;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-white">
      {/* Sidebar — desktop */}
      <div className="hidden md:flex md:flex-col w-56 shrink-0 bg-navy text-white p-4">
        <div className="flex items-center gap-2 mb-6 px-1">
          <div className="w-7 h-7 rounded-lg bg-cyan flex items-center justify-center font-bold font-head text-sm">C</div>
          <span className="font-head font-bold text-[15px]">Contric</span>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`px-3 py-2 rounded-lg text-[13px] ${
                pathname === item.href ? "bg-navysoft font-semibold" : "text-slate-300 hover:bg-navysoft/60"
              }`}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="mt-auto pt-4 border-t border-white/10">
          <div className="text-[11px] text-slate-300">{usuario?.nome}</div>
          <div className="text-[10px] text-slate-400 mb-2">{usuario?.perfil}</div>
          <button onClick={sair} className="text-[11px] text-slate-300 underline">
            Sair
          </button>
        </div>
      </div>

      {/* Topbar — mobile */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-line">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-cyan flex items-center justify-center text-white font-bold text-xs">C</div>
          <span className="font-head font-bold text-sm">Contric</span>
        </div>
        <button onClick={sair} className="text-xs text-muted underline">
          Sair
        </button>
      </div>

      <main className="flex-1 min-w-0 pb-16 md:pb-0">{children}</main>

      {/* Nav inferior — mobile */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-line flex justify-around py-2">
        {NAV.slice(0, 5).map((item) => (
          <a
            key={item.href}
            href={item.href}
            className={`text-[10px] flex flex-col items-center gap-0.5 px-2 ${
              pathname === item.href ? "text-cyan font-semibold" : "text-muteddim"
            }`}
          >
            {item.label}
          </a>
        ))}
      </div>
    </div>
  );
}
