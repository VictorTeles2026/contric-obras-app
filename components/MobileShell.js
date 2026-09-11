"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "../lib/AuthContext";

export default function MobileShell({ children, nav }) {
  const { sessao, usuario, carregando, sair } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!carregando && !sessao) router.replace("/login");
  }, [carregando, sessao, router]);

  if (carregando) {
    return <div className="min-h-screen flex items-center justify-center text-muted text-base">Carregando...</div>;
  }
  if (!sessao) return null;

  return (
    <div className="min-h-screen bg-panel flex flex-col">
      <div className="flex items-center justify-between px-4 py-3.5 bg-navy text-white shrink-0" style={{ paddingTop: "max(0.875rem, env(safe-area-inset-top))" }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-cyan flex items-center justify-center font-bold text-base shrink-0">C</div>
          <div className="min-w-0">
            <div className="font-head font-bold text-base leading-tight truncate">{usuario?.nome}</div>
            <div className="text-xs text-slate-300 leading-tight mt-0.5 capitalize">{usuario?.funcao || usuario?.perfil}</div>
          </div>
        </div>
        <button onClick={sair} className="text-sm text-slate-200 underline shrink-0 py-1 pl-3">Sair</button>
      </div>

      <main className="flex-1 overflow-auto" style={{ paddingBottom: "calc(5.25rem + env(safe-area-inset-bottom))" }}>
        {children}
      </main>

      <div
        className="fixed bottom-0 left-0 right-0 bg-white border-t border-line flex justify-around"
        style={{ paddingTop: 8, paddingBottom: "calc(8px + env(safe-area-inset-bottom))" }}
      >
        {nav.map((item) => (
          <a key={item.href} href={item.href}
            className={`text-[11px] flex flex-col items-center gap-1 px-2 py-1 min-w-[56px] ${pathname === item.href ? "text-cyan font-semibold" : "text-muteddim"}`}>
            <span className="text-xl leading-none">{item.icone}</span>
            {item.label}
          </a>
        ))}
      </div>
    </div>
  );
}
