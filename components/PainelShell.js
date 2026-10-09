"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuth, podeAcessarDesktop, ROTULO_PERFIL } from "../lib/AuthContext";
import { rotaInicialPara } from "../lib/nav";
import { navPermitida, navAgrupada, itemDaRota, itemAtivo, itemPermitido, primeiraRotaPainel } from "../lib/nav";
import { useTabela } from "../lib/dados";
import { Logo, TelaCarregando, TelaAcessoNegado, BotaoTema } from "./ui";
import Icone from "./Icone";
import SinoNotificacoes from "./SinoNotificacoes";
import AlterarSenha from "./AlterarSenha";

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
  const [trocandoSenha, setTrocandoSenha] = useState(false);
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

  // "?aba=..." da URL: diferencia itens que abrem abas da mesma página (Recursos × Utilização × Empresas).
  // Atualiza ao trocar de página, ao clicar no menu e quando a página troca de aba sozinha.
  const [busca, setBusca] = useState("");
  useEffect(() => {
    const ler = () => setBusca(window.location.search);
    ler();
    window.addEventListener("aba-mudou", ler);
    window.addEventListener("popstate", ler);
    return () => { window.removeEventListener("aba-mudou", ler); window.removeEventListener("popstate", ler); };
  }, [pathname]);

  // página que o usuário não tem permissão de ver: vai para a primeira que ele pode
  const itemAtual = itemDaRota(pathname || "", busca);
  const paginaNegada = !!usuario && podeAcessarDesktop(usuario) && itemAtual && !itemPermitido(usuario, itemAtual);
  useEffect(() => {
    if (paginaNegada) router.replace(primeiraRotaPainel(usuario));
  }, [paginaNegada, usuario, router]);

  if (carregando) return <TelaCarregando />;
  if (!sessao) return null;
  if (!usuario) return <TelaAcessoNegado mensagem={erroCadastro} onSair={sair} />;
  if (!podeAcessarDesktop(usuario) || paginaNegada) return <TelaCarregando texto="Redirecionando..." />;

  // ---- visual "Clean SaaS": menu claro, em grupos, item ativo em cartão ----
  const itemMenu = (item, compacto = false) => {
    const ativo = itemAtivo(item, pathname, busca);
    return (
      <Link key={item.href} href={item.href} aria-current={ativo ? "page" : undefined}
        onClick={() => setTimeout(() => setBusca(window.location.search), 0)}
        className={`group flex items-center gap-2.5 rounded-lg px-2.5 ${compacto ? "py-3" : "py-[7px]"} text-[13.5px] transition-colors ${
          ativo ? "bg-superficie text-textmain font-semibold shadow-[0_1px_2px_rgba(15,42,68,0.08)] ring-1 ring-line" : "text-muted hover:bg-superficie/70 hover:text-textmain"
        }`}>
        <Icone nome={item.icone} className={`w-[17px] h-[17px] shrink-0 ${ativo ? "text-cyan" : "text-muteddim group-hover:text-muted"}`} />
        <span className="flex-1 truncate">{item.label}</span>
        {item.href === "/aprovacoes" && pendencias > 0 && (
          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-amber/15 text-amber text-[11px] font-semibold flex items-center justify-center tabular-nums">{pendencias}</span>
        )}
      </Link>
    );
  };

  const rodapeUsuario = (
    <div className="pt-3 mt-3 border-t border-line flex items-center gap-2 px-1">
      <div className="w-8 h-8 rounded-full bg-navy text-white flex items-center justify-center text-[11px] font-semibold shrink-0">
        {(usuario.nome || "?").split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-textmain truncate">{usuario.nome}</div>
        <div className="text-[11px] text-muteddim">{ROTULO_PERFIL[usuario.perfil] || usuario.perfil}</div>
      </div>
      <BotaoTema />
      <button onClick={() => setTrocandoSenha(true)} title="Alterar minha senha" aria-label="Alterar minha senha" className="p-2 rounded-lg text-muted hover:bg-panel hover:text-textmain">
        <Icone nome="chave" className="w-[17px] h-[17px]" />
      </button>
      <button onClick={sair} title="Sair" aria-label="Sair" className="p-2 rounded-lg text-muted hover:bg-panel hover:text-textmain">
        <Icone nome="sair" className="w-[17px] h-[17px]" />
      </button>
    </div>
  );

  // menu conforme a matriz de permissões do usuário
  const navVisivel = navPermitida(usuario);
  const principais = navVisivel.filter((i) => i.principal);
  // ---- menu sempre aberto, em todos os níveis (mais fácil de aprender) ----
  // topo: Dashboard e Aprovações · meio: Obras, Campo, Análise, Cadastros (títulos fixos,
  // itens sempre visíveis) · rodapé: Auditoria e Administração
  const noTopo = (i) => i.href === "/dashboard" || i.href === "/aprovacoes" || i.href === "/pi";
  const noRodape = (i) => i.href === "/auditoria" || i.grupo === "Administração";
  const topo = navVisivel.filter(noTopo);
  const rodape = navVisivel.filter(noRodape);
  const secoes = navAgrupada(navVisivel.filter((i) => !noTopo(i) && !noRodape(i)));
  const menuAgrupado = (compacto) => (
    <>
      <div className="flex flex-col gap-px">{topo.map((item) => itemMenu(item, compacto))}</div>
      {secoes.map(([grupo, itens]) => (
        <div key={grupo} className="flex flex-col gap-px mt-4">
          <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muteddim">{grupo}</div>
          {itens.map((item) => itemMenu(item, compacto))}
        </div>
      ))}
    </>
  );
  const menuRodape = (compacto) => rodape.length > 0 && (
    <div className="flex flex-col gap-px pt-3 mt-3 border-t border-line">{rodape.map((item) => itemMenu(item, compacto))}</div>
  );

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-panel">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex md:flex-col print:!hidden w-60 shrink-0 bg-panel border-r border-line px-3 py-4 sticky top-0 h-screen">
        <div className="mb-5 px-1 flex items-center justify-between"><Logo tamanho="md" adaptavel /><SinoNotificacoes usuario={usuario} escuro={false} /></div>
        <nav className="flex flex-col overflow-y-auto rolagem-fina -mx-1 px-1">
          {menuAgrupado(false)}
        </nav>
        <div className="mt-auto">{menuRodape(false)}{rodapeUsuario}</div>
      </aside>

      {/* Topbar — mobile */}
      <header className="md:hidden print:hidden sticky top-0 z-30 bg-superficie/95 backdrop-blur border-b border-line" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="flex items-center justify-between px-4 h-14">
          <Logo tamanho="sm" adaptavel />
          <div className="flex items-center gap-1 min-w-0">
            <div className="text-xs text-muted truncate max-w-[140px]">{usuario.nome}</div>
            <BotaoTema />
            <SinoNotificacoes usuario={usuario} escuro={false} />
          </div>
        </div>
      </header>

      <main className="flex-1 min-w-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <div className="animar-pagina h-full" key={pathname}>{children}</div>
      </main>

      {/* Nav inferior — mobile: atalhos principais + "Mais" com o restante do menu */}
      <nav className="md:hidden print:hidden fixed bottom-0 left-0 right-0 z-30 bg-superficie/95 backdrop-blur border-t border-line" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex justify-around px-1">
          {principais.map((item) => {
            const ativo = itemAtivo(item, pathname, busca);
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
            className={`flex-1 flex flex-col items-center gap-1 pt-2.5 pb-2 min-h-[58px] text-[11px] font-medium ${!principais.some((i) => itemAtivo(i, pathname, busca)) ? "text-cyan" : "text-muteddim"}`}>
            <Icone nome="menu" className="w-[22px] h-[22px]" />
            Mais
          </button>
        </div>
      </nav>

      {trocandoSenha && <AlterarSenha onFechar={() => setTrocandoSenha(false)} />}

      {/* Menu completo — mobile */}
      {menuAberto && (
        <div className="md:hidden fixed inset-0 z-50 animar-fade">
          <div className="absolute inset-0 bg-navy/40" onClick={() => setMenuAberto(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-panel rounded-t-2xl p-4 animar-subir max-h-[85dvh] overflow-y-auto"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
            <div className="flex items-center justify-between mb-3 px-1">
              <Logo tamanho="sm" adaptavel />
              <button onClick={() => setMenuAberto(false)} className="p-2 rounded-lg text-muted hover:bg-superficie" aria-label="Fechar menu">
                <Icone nome="fechar" />
              </button>
            </div>
            <nav className="grid grid-cols-1">{menuAgrupado(true)}</nav>
            {menuRodape(true)}
            {rodapeUsuario}
          </div>
        </div>
      )}
    </div>
  );
}