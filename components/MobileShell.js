"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuth, podeAcessarDesktop, ROTULO_PERFIL } from "../lib/AuthContext";
import { rotaInicialPara } from "../lib/rotas";
import { TelaCarregando } from "./ui";
import TelaAcessoNegado from "./TelaAcessoNegado";
import Icone from "./Icone";
import SinoNotificacoes from "./SinoNotificacoes";

function iniciais(nome) {
  return (nome || "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

// `perfis`: perfis que podem usar esta área. Perfis do painel (master, gerente...)
// também podem abrir para conferir, mas quem é da obra é levado à sua própria área.
export default function MobileShell({ children, nav, perfis, titulo }) {
  const { sessao, usuario, carregando, erroCadastro, sair } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [confirmarSaida, setConfirmarSaida] = useState(false);

  const permitido = !usuario || !perfis || perfis.includes(usuario.perfil) || podeAcessarDesktop(usuario);

  useEffect(() => {
    if (carregando) return;
    if (!sessao) { router.replace("/login"); return; }
    if (usuario && !permitido) router.replace(rotaInicialPara(usuario));
  }, [carregando, sessao, usuario, permitido, router]);

  if (carregando) return <TelaCarregando />;
  if (!sessao) return null;
  if (!usuario) return <TelaAcessoNegado mensagem={erroCadastro} onSair={sair} />;
  if (!permitido) return <TelaCarregando texto="Redirecionando..." />;

  return (
    <div className="min-h-[100dvh] bg-panel flex flex-col">
      <header
        className="sticky top-0 z-30 bg-navy text-white shrink-0 shadow-[0_2px_12px_rgba(14,27,61,0.18)]"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex items-center justify-between gap-3 px-4 h-16 max-w-2xl mx-auto">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan to-[#0a6a86] flex items-center justify-center font-head font-bold text-sm shrink-0 ring-2 ring-white/15">
              {iniciais(usuario.nome)}
            </div>
            <div className="min-w-0">
              <div className="font-head font-bold text-[15px] leading-tight truncate">{titulo || usuario.nome}</div>
              <div className="text-xs text-slate-300 leading-tight mt-0.5 truncate">
                {titulo ? usuario.nome : (usuario.funcao || ROTULO_PERFIL[usuario.perfil] || usuario.perfil)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <SinoNotificacoes usuario={usuario} />
            {podeAcessarDesktop(usuario) && (
              <Link href="/dashboard" className="text-sm font-semibold text-slate-200 px-3 py-2.5 rounded-lg hover:bg-white/10">Painel</Link>
            )}
            {confirmarSaida ? (
              <div className="flex items-center gap-1 animar-fade">
                <button onClick={sair} className="text-xs font-semibold bg-red text-white px-3 py-2 rounded-lg">Sair</button>
                <button onClick={() => setConfirmarSaida(false)} className="text-xs text-slate-300 px-2 py-2">Não</button>
              </div>
            ) : (
              <button onClick={() => setConfirmarSaida(true)} className="p-2.5 rounded-lg text-slate-200 hover:bg-white/10 active:bg-white/15" aria-label="Sair">
                <Icone nome="sair" className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto" style={{ paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}>
        <div key={pathname} className="animar-pagina">{children}</div>
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-line"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Navegação principal"
      >
        <div className="flex justify-around max-w-2xl mx-auto px-1">
          {nav.map((item) => {
            const ativo = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} aria-current={ativo ? "page" : undefined}
                className={`relative flex-1 flex flex-col items-center gap-1 pt-2.5 pb-2 min-h-[60px] text-[11px] font-medium transition-colors ${ativo ? "text-cyan" : "text-muteddim active:text-muted"}`}>
                <span className={`absolute top-0 h-[3px] w-8 rounded-b-full transition-all ${ativo ? "bg-cyan" : "bg-transparent"}`} />
                <span className={`flex items-center justify-center w-12 h-7 rounded-full transition-colors ${ativo ? "bg-cyan/10" : ""}`}>
                  <Icone nome={item.icone} className="w-[22px] h-[22px]" strokeWidth={ativo ? 2.1 : 1.8} />
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
