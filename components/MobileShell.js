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
    return <div className="min-h-screen flex items-center justify-center text-muted text-sm">Carregando...</div>;
  }
  if (!sessao) return null;

  return (
    <div className="min-h-screen bg-panel flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-navy text-white shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-cyan flex items-center justify-center font-bold text-xs">C</div>
          <div>
            <div className="font-head font-bold text-sm leading-none">{usuario?.nome}</div>
            <div className="text-[10px] text-slate-300 leading-none mt-0.5">{usuario?.funcao || usuario?.perfil}</div>
          </div>
        </div>
        <button onClick={sair} className="text-[11px] text-slate-300 underline">Sair</button>
      </div>

      <main className="flex-1 pb-16 overflow-auto">{children}</main>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-line flex justify-around py-2 max-w-md mx-auto md:max-w-none">
        {nav.map((item) => (
          <a key={item.href} href={item.href}
            className={`text-[10px] flex flex-col items-center gap-0.5 px-3 py-1 ${pathname === item.href ? "text-cyan font-semibold" : "text-muteddim"}`}>
            <span className="text-base leading-none">{item.icone}</span>
            {item.label}
          </a>
        ))}
      </div>
    </div>
  );
}
