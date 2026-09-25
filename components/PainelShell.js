"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuth, podeAcessarDesktop, ROTULO_PERFIL } from "../lib/AuthContext";
import { rotaInicialPara } from "../lib/rotas";
import { NAV_PAINEL } from "../lib/nav";
import { useTabela } from "../lib/dados";
import { Logo, TelaCarregando } from "./ui";
import TelaAcessoNegado from "./TelaAcessoNegado";
import Icone from "./Icone";
import SinoNotificacoes from "./SinoNotificacoes";

function usePendencias(ativo) {
  // contador de pendências no item "Aprovações" do menu
  const { dados: rdos } = useTabela("rdos", { select: "id,status", filtro: ativo ? [["status", "pendente"]] : [["status", undefined]] });
  const { dados: horas } = useTabela("apontamentos_horas", { select: "id,status", filtro: ativo ? [["status", "pendente"]] : [["status", undefined]] });
  return rdos.length + horas.length;
}

export default function PainelShell({ children }) {
  const { sessao, usuario, carregando, erroCadastro, sair } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuAberto, setMenuAberto] = useState(false);
  const liberado = !!usuario && podeAcessarDesktop(usuario);
  const pendencias = usePendencias(liberado);

  useEffect(() => {
    if (!carregando && !sessao) router.replace("/login");
  }, [carregando, sessao, router]);

  useEffect(() => {
    if (!carregando && sessao && usuario && !podeAcessarDesktop(usuario)) {
      router.replace(rotaInicialPara(usuario));
    }
  }, [carregando, sessao, usuario, router]);

  useEffect(() => { setMenuAberto(false); }, [pathname]);

  if (carregando) return <TelaCarregando />;
  if (!sessao) return null;
  if (!usuario) return <TelaAcessoNegado mensagem={erroCadastro} onSair={sair} />;
  if (!podeAcessarDesktop(usuario)) return <TelaCarregando texto="Redirecionando..." />;

  const itemMenu = (item, compacto = false) => {
    const ativo = pathname === item.href;
    return (
      <Link key={item.href} href={item.href} aria-current={ativo ? "page" : undefined}
        className={`group flex items-center gap-3 rounded-lg px-3 ${compacto ? "py-3" : "py-2"} text-sm transition-colors ${
          ativo ? "bg-white/10 text-white font-semibold" : "text-slate-300 hover:bg-white/5 hover:text-white"
        }`}>
        <Icone nome={item.icone} className={`w-[18px] h-[18px] shrink-0 ${ativo ? "text-cyan" : "text-slate-400 group-hover:text-slate-200"}`} />
        <span className="flex-1">{item.label}</span>
        {item.href === "/aprovacoes" && pendencias > 0 && (
          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-amber text-white text-[11px] font-bold flex items-center justify-center">{pendencias}</span>
        )}
      </Link>
    );
  };

  const rodapeUsuario = (
    <div className="pt-3 mt-3 border-t border-white/10 flex items-center gap-3 px-1">
      <div className="w-9 h-9 rounded-full bg-navysoft flex items-center justify-center text-xs font-bold shrink-0">
        {(usuario.nome || "?").split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-white truncate">{usuario.nome}</div>
        <div className="text-xs text-slate-400">{ROTULO_PERFIL[usuario.perfil] || usuario.perfil}</div>
      </div>
      <button onClick={sair} title="Sair" aria-label="Sair" className="p-2 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white">
        <Icone nome="sair" className="w-[18px] h-[18px]" />
      </button>
    </div>
  );

  const principais = NAV_PAINEL.filter((i) => i.principal);

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-panel">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex md:flex-col print:!hidden w-60 shrink-0 bg-navy text-white p-4 sticky top-0 h-screen">
        <div className="mb-7 px-1 flex items-center justify-between"><Logo claro /><SinoNotificacoes usuario={usuario} /></div>
        <nav className="flex flex-col gap-0.5 overflow-y-auto rolagem-fina -mx-1 px-1">
          {NAV_PAINEL.map((item) => itemMenu(item))}
        </nav>
        <div className="mt-auto">{rodapeUsuario}</div>
      </aside>

      {/* Topbar — mobile */}
      <header className="md:hidden print:hidden sticky top-0 z-30 bg-navy text-white" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="flex items-center justify-between px-4 h-14">
          <Logo tamanho="sm" claro />
          <div className="flex items-center gap-1 min-w-0">
            <div className="text-xs text-slate-300 truncate max-w-[160px]">{usuario.nome}</div>
            <SinoNotificacoes usuario={usuario} />
          </div>
        </div>
      </header>

      <main className="flex-1 min-w-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <div className="animar-pagina h-full" key={pathname}>{children}</div>
      </main>

      {/* Nav inferior — mobile: 4 atalhos + "Mais" com o restante do menu */}
      <nav className="md:hidden print:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-line" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex justify-around px-1">
          {principais.map((item) => {
            const ativo = pathname === item.href;
            return (
              <Link key={item.href} href={item.href}
                className={`relative flex-1 flex flex-col items-center gap-1 pt-2.5 pb-2 min-h-[58px] text-[11px] font-medium ${ativo ? "text-cyan" : "text-muteddim"}`}>
                <span className={`absolute top-0 h-[3px] w-8 rounded-b-full ${ativo ? "bg-cyan" : ""}`} />
                <span className="relative">
                  <Icone nome={item.icone} className="w-[22px] h-[22px]" />
                  {item.href === "/aprovacoes" && pendencias > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber text-white text-[10px] font-bold flex items-center justify-center">{pendencias}</span>
                  )}
                </span>
                {item.label}
              </Link>
            );
          })}
          <button onClick={() => setMenuAberto(true)}
            className={`flex-1 flex flex-col items-center gap-1 pt-2.5 pb-2 min-h-[58px] text-[11px] font-medium ${!principais.some((i) => i.href === pathname) ? "text-cyan" : "text-muteddim"}`}>
            <Icone nome="menu" className="w-[22px] h-[22px]" />
            Mais
          </button>
        </div>
      </nav>

      {/* Menu completo — mobile */}
      {menuAberto && (
        <div className="md:hidden fixed inset-0 z-50 animar-fade">
          <div className="absolute inset-0 bg-navy/50" onClick={() => setMenuAberto(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-navy text-white rounded-t-2xl p-4 animar-subir max-h-[85dvh] overflow-y-auto"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/20" />
            <div className="flex items-center justify-between mb-3 px-1">
              <Logo tamanho="sm" claro />
              <button onClick={() => setMenuAberto(false)} className="p-2 rounded-lg text-slate-300 hover:bg-white/10" aria-label="Fechar menu">
                <Icone nome="fechar" />
              </button>
            </div>
            <nav className="grid grid-cols-1 gap-0.5">{NAV_PAINEL.map((item) => itemMenu(item, true))}</nav>
            {rodapeUsuario}
          </div>
        </div>
      )}
    </div>
  );
}
